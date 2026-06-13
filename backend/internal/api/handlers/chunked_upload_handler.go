package handlers

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"storage-gateway/internal/api/apiutil"
	appcrypto "storage-gateway/internal/crypto"
	"storage-gateway/internal/model"
	"storage-gateway/internal/rclone"
	"storage-gateway/internal/repository"
	"storage-gateway/internal/scheduler"

	"github.com/google/uuid"
)

// ChunkedUploadHandler handles resumable chunked file uploads.
// Non-encrypted uploads use a zero-storage streaming approach:
// chunks are piped directly into an rclone rcat process via stdin.
// Encrypted uploads fall back to a temp-file approach (merge → encrypt → upload).
type ChunkedUploadHandler struct {
	accountRepo  *repository.StorageAccountRepository
	userRepo     *repository.UserRepository
	rcloneClient *rclone.Client
	fileRepo     *repository.FileRepository
	uploads      map[string]*UploadSession
	mu           sync.RWMutex
	tempDir      string // only used for encrypted uploads
}

// UploadSession represents an in-progress chunked upload.
// When UseStreaming is true, data flows directly through Cmd/StdinPipe.
// When UseStreaming is false (encrypted fallback), chunks go to tempDir.
type UploadSession struct {
	ID                   string
	UserID               uuid.UUID
	AccountID            uuid.UUID
	AccountLabel         string
	RemoteName           string
	FileName             string
	RemotePath           string
	TotalSize            int64
	TotalChunks          int
	ChunkSize            int64
	EncryptionPassphrase string

	// Streaming mode fields (UseStreaming == true)
	UseStreaming   bool
	Cmd            *exec.Cmd       // rclone rcat process
	StdinPipe      io.WriteCloser  // stdin pipe to rclone
	stderrBuf      *bytes.Buffer   // captures rclone stderr for error reporting
	sessionMu      sync.Mutex      // serialises writes to stdin pipe
	ChunksReceived int             // sequential chunk counter (streaming)
	BytesReceived  int64           // total bytes piped so far
	processDone    chan struct{}    // closed when rclone process exits
	processErr     error           // set when rclone process exits with error

	// Encrypted fallback fields (UseStreaming == false)
	ReceivedChunks map[int]bool

	CreatedAt time.Time
	UpdatedAt time.Time
}

func NewChunkedUploadHandler(accountRepo *repository.StorageAccountRepository, userRepo *repository.UserRepository, rcloneClient *rclone.Client, fileRepo *repository.FileRepository) *ChunkedUploadHandler {
	tempDir := filepath.Join(os.TempDir(), "storage-gateway-uploads")
	os.MkdirAll(tempDir, 0755)

	h := &ChunkedUploadHandler{
		accountRepo:  accountRepo,
		userRepo:     userRepo,
		rcloneClient: rcloneClient,
		fileRepo:     fileRepo,
		uploads:      make(map[string]*UploadSession),
		tempDir:      tempDir,
	}

	// Cleanup stale sessions every 10 minutes
	go h.cleanupStaleSessions()

	return h
}

// cleanupStaleSessions kills streaming processes and removes temp files for
// sessions that have been idle for more than 30 minutes.
func (h *ChunkedUploadHandler) cleanupStaleSessions() {
	ticker := time.NewTicker(10 * time.Minute)
	defer ticker.Stop()
	for range ticker.C {
		h.mu.Lock()
		for id, session := range h.uploads {
			if time.Since(session.UpdatedAt) > 30*time.Minute {
				if session.UseStreaming {
					// Kill the rclone process
					if session.Cmd != nil && session.Cmd.Process != nil {
						session.Cmd.Process.Kill()
					}
					if session.StdinPipe != nil {
						session.StdinPipe.Close()
					}
					log.Printf("cleaned up stale streaming upload session %s (%s)", id, session.FileName)
				} else {
					// Remove temp files for encrypted fallback
					sessionDir := filepath.Join(h.tempDir, id)
					os.RemoveAll(sessionDir)
					log.Printf("cleaned up stale encrypted upload session %s (%s)", id, session.FileName)
				}
				delete(h.uploads, id)
			}
		}
		h.mu.Unlock()
	}
}

// startRcloneRcat launches an rclone rcat process that streams stdin to the remote.
func (h *ChunkedUploadHandler) startRcloneRcat(remoteName, remotePath string) (*exec.Cmd, io.WriteCloser, *bytes.Buffer, error) {
	dest := fmt.Sprintf("%s:%s", remoteName, remotePath)
	cmd := exec.Command(h.rcloneClient.GetRclonePath(), "rcat", dest)
	if configPath := h.rcloneClient.GetConfigPath(); configPath != "" {
		cmd.Env = append(os.Environ(), fmt.Sprintf("RCLONE_CONFIG=%s", configPath))
	}

	stdin, err := cmd.StdinPipe()
	if err != nil {
		return nil, nil, nil, fmt.Errorf("failed to create stdin pipe: %w", err)
	}

	stderrBuf := &bytes.Buffer{}
	cmd.Stderr = stderrBuf

	if err := cmd.Start(); err != nil {
		stdin.Close()
		return nil, nil, nil, fmt.Errorf("failed to start rclone rcat: %w", err)
	}

	return cmd, stdin, stderrBuf, nil
}

// InitUpload initiates a new chunked upload session.
// POST /api/v1/vfs/upload/init
// Body: { "account_id": "xxx", "path": "/folder", "filename": "file.zip", "total_size": 1048576, "chunk_size": 1048576, "encryption_passphrase": "optional" }
func (h *ChunkedUploadHandler) InitUpload(w http.ResponseWriter, r *http.Request) {
	userID, err := getUserID(r)
	if err != nil {
		apiutil.Unauthorized(w, "authentication required")
		return
	}

	var req struct {
		AccountID            string `json:"account_id"`
		Path                 string `json:"path"`
		FileName             string `json:"filename"`
		TotalSize            int64  `json:"total_size"`
		ChunkSize            int64  `json:"chunk_size"`
		EncryptionPassphrase string `json:"encryption_passphrase"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		apiutil.BadRequest(w, "invalid request body")
		return
	}

	if req.AccountID == "" || req.FileName == "" || req.TotalSize <= 0 {
		apiutil.BadRequest(w, "account_id, filename, and total_size are required")
		return
	}

	if req.ChunkSize <= 0 {
		req.ChunkSize = 10 * 1024 * 1024 // 10MB default
	}

	accountID, err := uuid.Parse(req.AccountID)
	if err != nil {
		apiutil.BadRequest(w, "invalid account_id")
		return
	}

	account, err := h.accountRepo.GetByID(r.Context(), accountID)
	if err != nil {
		apiutil.NotFound(w, "account not found")
		return
	}

	if account.UserID != userID {
		apiutil.Forbidden(w, "access denied")
		return
	}

	// If encryption passphrase provided, verify encryption is enabled and passphrase is correct
	useStreaming := true
	if req.EncryptionPassphrase != "" {
		encEnabled, _ := h.userRepo.IsEncryptionEnabled(r.Context(), userID)
		if !encEnabled {
			apiutil.BadRequest(w, "encryption is not enabled for this user")
			return
		}
		// Verify passphrase
		storedHash, err := h.userRepo.GetEncryptionPassphraseHash(r.Context(), userID)
		if err != nil || storedHash == "" {
			apiutil.BadRequest(w, "encryption passphrase not configured")
			return
		}
		valid, err := appcrypto.VerifyPassphrase(req.EncryptionPassphrase, storedHash)
		if err != nil || !valid {
			apiutil.BadRequest(w, "invalid encryption passphrase")
			return
		}
		// Encrypted uploads use temp-file fallback
		useStreaming = false
	}

	totalChunks := int((req.TotalSize + req.ChunkSize - 1) / req.ChunkSize)
	uploadID := uuid.New().String()

	remotePath := req.Path
	if !strings.HasSuffix(remotePath, "/") {
		remotePath += "/"
	}
	remotePath += req.FileName

	session := &UploadSession{
		ID:                   uploadID,
		UserID:               userID,
		AccountID:            accountID,
		AccountLabel:         account.Label,
		RemoteName:           account.RcloneRemoteName,
		FileName:             req.FileName,
		RemotePath:           remotePath,
		TotalSize:            req.TotalSize,
		TotalChunks:          totalChunks,
		ChunkSize:            req.ChunkSize,
		EncryptionPassphrase: req.EncryptionPassphrase,
		UseStreaming:         useStreaming,
		CreatedAt:            time.Now(),
		UpdatedAt:            time.Now(),
	}

	if useStreaming {
		// Start rclone rcat process for streaming upload
		cmd, stdinPipe, stderrBuf, err := h.startRcloneRcat(account.RcloneRemoteName, remotePath)
		if err != nil {
			apiutil.InternalError(w, "failed to start streaming upload: "+err.Error())
			return
		}
		session.Cmd = cmd
		session.StdinPipe = stdinPipe
		session.stderrBuf = stderrBuf
		session.processDone = make(chan struct{})

		// Monitor rclone process in background
		go func() {
			defer close(session.processDone)
			session.processErr = cmd.Wait()
		}()
	} else {
		// Encrypted fallback: create temp directory for chunks
		session.ReceivedChunks = make(map[int]bool)
		sessionDir := filepath.Join(h.tempDir, uploadID)
		os.MkdirAll(sessionDir, 0755)
	}

	h.mu.Lock()
	h.uploads[uploadID] = session
	h.mu.Unlock()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"upload_id":    uploadID,
		"total_chunks": totalChunks,
		"chunk_size":   req.ChunkSize,
		"encrypted":    req.EncryptionPassphrase != "",
	})
}

// UploadChunk uploads a single chunk.
// PUT /api/v1/vfs/upload/{upload_id}/chunk/{chunk_number}
func (h *ChunkedUploadHandler) UploadChunk(w http.ResponseWriter, r *http.Request) {
	uploadID := r.PathValue("upload_id")
	chunkNumStr := r.PathValue("chunk_number")

	h.mu.RLock()
	session, exists := h.uploads[uploadID]
	h.mu.RUnlock()

	if !exists {
		apiutil.NotFound(w, "upload session not found")
		return
	}

	var chunkNum int
	fmt.Sscanf(chunkNumStr, "%d", &chunkNum)

	if chunkNum < 0 || chunkNum >= session.TotalChunks {
		apiutil.BadRequest(w, fmt.Sprintf("invalid chunk number: must be 0-%d", session.TotalChunks-1))
		return
	}

	if session.UseStreaming {
		h.uploadChunkStreaming(w, r, session, chunkNum)
	} else {
		h.uploadChunkEncrypted(w, r, session, chunkNum)
	}
}

// uploadChunkStreaming pipes chunk data directly into the rclone stdin.
func (h *ChunkedUploadHandler) uploadChunkStreaming(w http.ResponseWriter, r *http.Request, session *UploadSession, chunkNum int) {
	// Check if rclone process has already failed
	select {
	case <-session.processDone:
		log.Printf("rclone process died for upload %s (chunk %d): %v, stderr: %s",
			session.ID, chunkNum, session.processErr, session.stderrBuf.String())
		h.mu.RLock()
		received := session.ChunksReceived
		h.mu.RUnlock()
		apiutil.RespondJSON(w, http.StatusServiceUnavailable, map[string]interface{}{
			"error":            "upload_process_died",
			"message":          "Upload process interrupted. Please restart.",
			"chunks_accepted":  received,
			"needs_restart":    true,
		})
		return
	default:
	}

	// Serialise writes to the stdin pipe
	session.sessionMu.Lock()
	defer session.sessionMu.Unlock()

	written, err := io.Copy(session.StdinPipe, r.Body)
	if err != nil {
		// Check if the process died
		select {
		case <-session.processDone:
			log.Printf("rclone process died during write for upload %s (chunk %d): %v, stderr: %s",
				session.ID, chunkNum, session.processErr, session.stderrBuf.String())
			h.mu.RLock()
			received := session.ChunksReceived
			h.mu.RUnlock()
			apiutil.RespondJSON(w, http.StatusServiceUnavailable, map[string]interface{}{
				"error":            "upload_process_died",
				"message":          "Upload process interrupted during chunk transfer. Please restart.",
				"chunks_accepted":  received,
				"needs_restart":    true,
			})
		default:
			apiutil.InternalError(w, "failed to write chunk to stream: "+err.Error())
		}
		return
	}

	h.mu.Lock()
	session.ChunksReceived++
	session.BytesReceived += written
	session.UpdatedAt = time.Now()
	received := session.ChunksReceived
	total := session.TotalChunks
	h.mu.Unlock()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"chunk_number":    chunkNum,
		"chunk_size":      written,
		"received_chunks": received,
		"total_chunks":    total,
		"progress":        float64(received) / float64(total) * 100,
	})
}

// uploadChunkEncrypted saves chunk to disk (temp-file fallback for encrypted uploads).
func (h *ChunkedUploadHandler) uploadChunkEncrypted(w http.ResponseWriter, r *http.Request, session *UploadSession, chunkNum int) {
	chunkPath := filepath.Join(h.tempDir, session.ID, fmt.Sprintf("chunk_%06d", chunkNum))
	f, err := os.Create(chunkPath)
	if err != nil {
		apiutil.InternalError(w, "failed to create chunk file: "+err.Error())
		return
	}
	defer f.Close()

	written, err := io.Copy(f, r.Body)
	if err != nil {
		apiutil.InternalError(w, "failed to save chunk: "+err.Error())
		return
	}

	h.mu.Lock()
	session.ReceivedChunks[chunkNum] = true
	session.UpdatedAt = time.Now()
	received := len(session.ReceivedChunks)
	total := session.TotalChunks
	h.mu.Unlock()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"chunk_number":    chunkNum,
		"chunk_size":      written,
		"received_chunks": received,
		"total_chunks":    total,
		"progress":        float64(received) / float64(total) * 100,
	})
}

// GetUploadStatus returns the status of an upload session.
// GET /api/v1/vfs/upload/{upload_id}/status
func (h *ChunkedUploadHandler) GetUploadStatus(w http.ResponseWriter, r *http.Request) {
	uploadID := r.PathValue("upload_id")

	h.mu.RLock()
	session, exists := h.uploads[uploadID]
	h.mu.RUnlock()

	if !exists {
		apiutil.NotFound(w, "upload session not found")
		return
	}

	if session.UseStreaming {
		h.mu.RLock()
		received := session.ChunksReceived
		total := session.TotalChunks
		h.mu.RUnlock()

		// In streaming mode, chunks arrive sequentially so missing = trailing
		missingChunks := []int{}
		for i := received; i < total; i++ {
			missingChunks = append(missingChunks, i)
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"upload_id":       uploadID,
			"filename":        session.FileName,
			"total_chunks":    total,
			"received_chunks": received,
			"missing_chunks":  missingChunks,
			"progress":        float64(received) / float64(total) * 100,
			"complete":        received == total,
		})
	} else {
		h.mu.RLock()
		receivedChunks := make([]int, 0, len(session.ReceivedChunks))
		for k := range session.ReceivedChunks {
			receivedChunks = append(receivedChunks, k)
		}
		h.mu.RUnlock()

		sort.Ints(receivedChunks)

		missingChunks := []int{}
		receivedSet := make(map[int]bool)
		for _, c := range receivedChunks {
			receivedSet[c] = true
		}
		for i := 0; i < session.TotalChunks; i++ {
			if !receivedSet[i] {
				missingChunks = append(missingChunks, i)
			}
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"upload_id":       uploadID,
			"filename":        session.FileName,
			"total_chunks":    session.TotalChunks,
			"received_chunks": len(receivedChunks),
			"missing_chunks":  missingChunks,
			"progress":        float64(len(receivedChunks)) / float64(session.TotalChunks) * 100,
			"complete":        len(receivedChunks) == session.TotalChunks,
		})
	}
}

// FinalizeUpload completes the upload.
// For streaming: closes the stdin pipe and waits for rclone to finish.
// For encrypted: merges chunks, encrypts, and uploads.
// POST /api/v1/vfs/upload/{upload_id}/finalize
func (h *ChunkedUploadHandler) FinalizeUpload(w http.ResponseWriter, r *http.Request) {
	uploadID := r.PathValue("upload_id")

	h.mu.RLock()
	session, exists := h.uploads[uploadID]
	h.mu.RUnlock()

	if !exists {
		apiutil.NotFound(w, "upload session not found")
		return
	}

	if session.UseStreaming {
		h.finalizeStreaming(w, r, session)
	} else {
		h.finalizeEncrypted(w, r, session)
	}
}

// finalizeStreaming closes the rclone stdin pipe and waits for the upload to complete.
func (h *ChunkedUploadHandler) finalizeStreaming(w http.ResponseWriter, r *http.Request, session *UploadSession) {
	// Verify all chunks received
	h.mu.RLock()
	received := session.ChunksReceived
	h.mu.RUnlock()

	if received != session.TotalChunks {
		apiutil.BadRequest(w, fmt.Sprintf("not all chunks received: %d/%d", received, session.TotalChunks))
		return
	}

	// Close stdin pipe to signal EOF to rclone
	if err := session.StdinPipe.Close(); err != nil {
		log.Printf("WARNING: error closing stdin pipe: %v", err)
	}

	// Wait for rclone process to finish (with timeout)
	select {
	case <-session.processDone:
		// Process finished
	case <-time.After(5 * time.Minute):
		// Timeout — kill the process
		if session.Cmd != nil && session.Cmd.Process != nil {
			session.Cmd.Process.Kill()
		}
		apiutil.InternalError(w, "rclone upload timed out")
		return
	}

	// Check if rclone exited with error
	if session.processErr != nil {
		stderrStr := session.stderrBuf.String()
		apiutil.InternalError(w, fmt.Sprintf("upload to remote failed: %v, stderr: %s", session.processErr, stderrStr))
		return
	}

	// Remove session from map
	h.mu.Lock()
	delete(h.uploads, session.ID)
	h.mu.Unlock()

	// Track file in metadata (best-effort)
	h.trackFileMetadata(r, session)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"message":     "upload complete",
		"filename":    session.FileName,
		"remote_path": session.RemotePath,
		"size":        session.TotalSize,
	})
}

// finalizeEncrypted merges temp chunk files, encrypts, and uploads to remote.
func (h *ChunkedUploadHandler) finalizeEncrypted(w http.ResponseWriter, r *http.Request, session *UploadSession) {
	// Check all chunks received
	if len(session.ReceivedChunks) != session.TotalChunks {
		apiutil.BadRequest(w, fmt.Sprintf("not all chunks received: %d/%d", len(session.ReceivedChunks), session.TotalChunks))
		return
	}

	// Combine chunks into single file
	combinedPath := filepath.Join(h.tempDir, session.ID, "combined_"+session.FileName)
	combined, err := os.Create(combinedPath)
	if err != nil {
		apiutil.InternalError(w, "failed to create combined file: "+err.Error())
		return
	}

	for i := 0; i < session.TotalChunks; i++ {
		chunkPath := filepath.Join(h.tempDir, session.ID, fmt.Sprintf("chunk_%06d", i))
		chunk, err := os.Open(chunkPath)
		if err != nil {
			combined.Close()
			apiutil.InternalError(w, fmt.Sprintf("failed to open chunk %d: %s", i, err.Error()))
			return
		}
		io.Copy(combined, chunk)
		chunk.Close()
	}
	combined.Close()

	// Open combined file and optionally encrypt
	combinedFile, err := os.Open(combinedPath)
	if err != nil {
		apiutil.InternalError(w, "failed to open combined file: "+err.Error())
		return
	}
	defer combinedFile.Close()

	var uploadReader io.Reader = combinedFile

	if session.EncryptionPassphrase != "" {
		// Generate salt for file encryption
		salt, err := appcrypto.GenerateSalt()
		if err != nil {
			apiutil.InternalError(w, "failed to generate encryption salt: "+err.Error())
			return
		}

		encryptor, err := appcrypto.NewFileEncryptor(session.EncryptionPassphrase, salt)
		if err != nil {
			apiutil.InternalError(w, "failed to create encryptor: "+err.Error())
			return
		}

		encryptedReader, err := encryptor.EncryptStream(combinedFile)
		if err != nil {
			apiutil.InternalError(w, "failed to encrypt file: "+err.Error())
			return
		}
		uploadReader = encryptedReader
	}

	err = h.rcloneClient.CopyStream(r.Context(), uploadReader, session.RemoteName, session.RemotePath)
	if err != nil {
		apiutil.InternalError(w, "upload to remote failed: "+err.Error())
		return
	}

	// Cleanup temp files
	sessionDir := filepath.Join(h.tempDir, session.ID)
	os.RemoveAll(sessionDir)

	h.mu.Lock()
	delete(h.uploads, session.ID)
	h.mu.Unlock()

	// Track file in metadata
	h.trackFileMetadata(r, session)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"message":     "upload complete",
		"filename":    session.FileName,
		"remote_path": session.RemotePath,
		"size":        session.TotalSize,
	})
}

// trackFileMetadata saves file record and file location to the database (best-effort).
func (h *ChunkedUploadHandler) trackFileMetadata(r *http.Request, session *UploadSession) {
	virtualPath := "/" + session.AccountLabel + session.RemotePath
	isEncrypted := session.EncryptionPassphrase != ""

	fileRecord := &model.File{
		ID:          uuid.New(),
		UserID:      session.UserID,
		Name:        session.FileName,
		VirtualPath: virtualPath,
		Size:        session.TotalSize,
		IsDirectory: false,
		IsEncrypted: isEncrypted,
	}
	if err := h.fileRepo.Upsert(r.Context(), fileRecord); err != nil {
		log.Printf("WARNING: failed to track file in metadata: %v", err)
	} else {
		loc := &model.FileLocation{
			ID:          uuid.New(),
			FileID:      fileRecord.ID,
			AccountID:   session.AccountID,
			RemotePath:  session.RemotePath,
			ChunkIndex:  0,
			ChunkSize:   session.TotalSize,
			IsEncrypted: isEncrypted,
		}
		if err := h.fileRepo.AddLocation(r.Context(), loc); err != nil {
			log.Printf("WARNING: failed to track file location: %v", err)
		}
	}
}

// RestartUpload restarts a streaming upload whose rclone process has died.
// It kills the old process (if still alive), deletes the incomplete remote file,
// starts a fresh rclone rcat, and resets the chunk counters so the frontend can
// re-upload all chunks from the beginning.
// POST /api/v1/vfs/upload/{upload_id}/restart
func (h *ChunkedUploadHandler) RestartUpload(w http.ResponseWriter, r *http.Request) {
	uploadID := r.PathValue("upload_id")

	h.mu.Lock()
	session, exists := h.uploads[uploadID]
	h.mu.Unlock()

	if !exists {
		apiutil.NotFound(w, "upload session not found")
		return
	}

	if !session.UseStreaming {
		apiutil.BadRequest(w, "restart is only supported for streaming uploads")
		return
	}

	// 1. Kill old rclone process if still alive
	if session.StdinPipe != nil {
		session.StdinPipe.Close()
	}
	if session.Cmd != nil && session.Cmd.Process != nil {
		session.Cmd.Process.Kill()
	}

	// 2. Wait for old process to exit (with short timeout)
	if session.processDone != nil {
		select {
		case <-session.processDone:
			// process exited
		case <-time.After(5 * time.Second):
			log.Printf("WARNING: timed out waiting for old rclone process to exit during restart of upload %s", uploadID)
		}
	}

	// 3. Delete the incomplete file from cloud storage (best-effort)
	if err := h.rcloneClient.Delete(r.Context(), session.RemoteName, session.RemotePath); err != nil {
		log.Printf("WARNING: failed to delete incomplete file %s:%s during restart: %v",
			session.RemoteName, session.RemotePath, err)
	}

	// 4. Start a fresh rclone rcat process
	cmd, stdinPipe, stderrBuf, err := h.startRcloneRcat(session.RemoteName, session.RemotePath)
	if err != nil {
		// Clean up session on failure
		h.mu.Lock()
		delete(h.uploads, uploadID)
		h.mu.Unlock()
		apiutil.InternalError(w, "failed to restart streaming upload: "+err.Error())
		return
	}

	// 5. Update session with new process, reset counters
	h.mu.Lock()
	session.Cmd = cmd
	session.StdinPipe = stdinPipe
	session.stderrBuf = stderrBuf
	session.ChunksReceived = 0
	session.BytesReceived = 0
	session.processDone = make(chan struct{})
	session.processErr = nil
	session.UpdatedAt = time.Now()
	// Reset the per-session mutex (old one may be locked if goroutine died mid-write)
	session.sessionMu = sync.Mutex{}
	h.mu.Unlock()

	// 6. Monitor new rclone process in background
	go func() {
		defer close(session.processDone)
		session.processErr = cmd.Wait()
	}()

	log.Printf("restarted streaming upload %s (%s) — new rclone rcat process started", uploadID, session.FileName)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":         true,
		"upload_id":       uploadID,
		"chunks_accepted": 0,
		"total_chunks":    session.TotalChunks,
		"message":         "upload restarted — re-upload all chunks from beginning",
	})
}

// CancelUpload cancels an upload session.
// For streaming: kills the rclone process.
// For encrypted: removes temp files.
// DELETE /api/v1/vfs/upload/{upload_id}
func (h *ChunkedUploadHandler) CancelUpload(w http.ResponseWriter, r *http.Request) {
	uploadID := r.PathValue("upload_id")

	h.mu.Lock()
	session, exists := h.uploads[uploadID]
	if exists {
		delete(h.uploads, uploadID)
	}
	h.mu.Unlock()

	if !exists {
		apiutil.NotFound(w, "upload session not found")
		return
	}

	if session.UseStreaming {
		// Kill the rclone process
		if session.StdinPipe != nil {
			session.StdinPipe.Close()
		}
		if session.Cmd != nil && session.Cmd.Process != nil {
			session.Cmd.Process.Kill()
		}
	} else {
		// Remove temp files
		sessionDir := filepath.Join(h.tempDir, uploadID)
		os.RemoveAll(sessionDir)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"message": "upload cancelled"})
}

// AutoInitUpload initiates a chunked upload with automatic account selection via scheduler.
// POST /api/v1/vfs/upload/auto-init
// Body: { "filename": "photo.jpg", "total_size": 5242880, "path": "/Documents/", "chunk_size": 1048576 }
func (h *ChunkedUploadHandler) AutoInitUpload(w http.ResponseWriter, r *http.Request) {
	userID, err := getUserID(r)
	if err != nil {
		apiutil.Unauthorized(w, "authentication required")
		return
	}

	var req struct {
		FileName  string `json:"filename"`
		TotalSize int64  `json:"total_size"`
		Path      string `json:"path"`
		ChunkSize int64  `json:"chunk_size"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		apiutil.BadRequest(w, "invalid request body")
		return
	}

	if req.FileName == "" || req.TotalSize <= 0 {
		apiutil.BadRequest(w, "filename and total_size are required")
		return
	}

	if req.ChunkSize <= 0 {
		req.ChunkSize = 10 * 1024 * 1024 // 10MB default
	}

	// 1. Get user's scheduler_mode from DB
	mode, err := h.userRepo.GetSchedulerMode(r.Context(), userID)
	if err != nil {
		apiutil.InternalError(w, "failed to retrieve scheduler mode")
		return
	}

	// 2. Get all active accounts for the user
	accounts, err := h.accountRepo.GetByUserID(r.Context(), userID)
	if err != nil {
		apiutil.InternalError(w, "failed to retrieve storage accounts")
		return
	}

	// Convert to []*model.StorageAccount and filter active only
	var activeAccounts []*model.StorageAccount
	for _, acc := range accounts {
		if acc.IsActive {
			activeAccounts = append(activeAccounts, &acc.StorageAccount)
		}
	}

	if len(activeAccounts) == 0 {
		apiutil.BadRequest(w, "no active storage accounts found; add one first")
		return
	}

	// 3. Use scheduler to pick the best account
	sched := scheduler.NewSchedulerFromString(mode)
	selected, err := sched.SelectAccount(activeAccounts, req.TotalSize)
	if err != nil {
		apiutil.BadRequest(w, "scheduler could not find a suitable account: "+err.Error())
		return
	}

	// 4. Proceed with streaming upload init
	totalChunks := int((req.TotalSize + req.ChunkSize - 1) / req.ChunkSize)
	uploadID := uuid.New().String()

	remotePath := req.Path
	if !strings.HasSuffix(remotePath, "/") {
		remotePath += "/"
	}
	remotePath += req.FileName

	session := &UploadSession{
		ID:           uploadID,
		UserID:       userID,
		AccountID:    selected.ID,
		AccountLabel: selected.Label,
		RemoteName:   selected.RcloneRemoteName,
		FileName:     req.FileName,
		RemotePath:   remotePath,
		TotalSize:    req.TotalSize,
		TotalChunks:  totalChunks,
		ChunkSize:    req.ChunkSize,
		UseStreaming: true, // auto-init always uses streaming (no encryption option)
		CreatedAt:    time.Now(),
		UpdatedAt:    time.Now(),
	}

	// Start rclone rcat process
	cmd, stdinPipe, stderrBuf, err := h.startRcloneRcat(selected.RcloneRemoteName, remotePath)
	if err != nil {
		apiutil.InternalError(w, "failed to start streaming upload: "+err.Error())
		return
	}
	session.Cmd = cmd
	session.StdinPipe = stdinPipe
	session.stderrBuf = stderrBuf
	session.processDone = make(chan struct{})

	// Monitor rclone process in background
	go func() {
		defer close(session.processDone)
		session.processErr = cmd.Wait()
	}()

	h.mu.Lock()
	h.uploads[uploadID] = session
	h.mu.Unlock()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"upload_id":     uploadID,
		"account_id":    selected.ID.String(),
		"account_label": selected.Label,
		"total_chunks":  totalChunks,
		"chunk_size":    req.ChunkSize,
		"strategy_used": string(sched.GetStrategy()),
	})
}
