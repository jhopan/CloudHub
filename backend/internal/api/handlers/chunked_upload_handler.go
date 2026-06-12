package handlers

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"storage-gateway/internal/api/apiutil"
	"storage-gateway/internal/rclone"
	"storage-gateway/internal/repository"

	"github.com/google/uuid"
)

// ChunkedUploadHandler handles resumable chunked file uploads
type ChunkedUploadHandler struct {
	accountRepo  *repository.StorageAccountRepository
	rcloneClient *rclone.Client
	uploads      map[string]*UploadSession
	mu           sync.RWMutex
	tempDir      string
}

type UploadSession struct {
	ID           string
	UserID       uuid.UUID
	AccountID    uuid.UUID
	RemoteName   string
	FileName     string
	RemotePath   string
	TotalSize    int64
	TotalChunks  int
	ChunkSize    int64
	ReceivedChunks map[int]bool
	CreatedAt    time.Time
	UpdatedAt    time.Time
}

func NewChunkedUploadHandler(accountRepo *repository.StorageAccountRepository, rcloneClient *rclone.Client) *ChunkedUploadHandler {
	tempDir := filepath.Join(os.TempDir(), "storage-gateway-uploads")
	os.MkdirAll(tempDir, 0755)

	h := &ChunkedUploadHandler{
		accountRepo:  accountRepo,
		rcloneClient: rcloneClient,
		uploads:      make(map[string]*UploadSession),
		tempDir:      tempDir,
	}

	// Cleanup stale sessions every 30 minutes
	go h.cleanupStaleSessions()

	return h
}

func (h *ChunkedUploadHandler) cleanupStaleSessions() {
	ticker := time.NewTicker(30 * time.Minute)
	defer ticker.Stop()
	for range ticker.C {
		h.mu.Lock()
		for id, session := range h.uploads {
			if time.Since(session.UpdatedAt) > 2*time.Hour {
				// Remove temp files
				sessionDir := filepath.Join(h.tempDir, id)
				os.RemoveAll(sessionDir)
				delete(h.uploads, id)
			}
		}
		h.mu.Unlock()
	}
}

// InitUpload initiates a new chunked upload session
// POST /api/v1/vfs/upload/init
// Body: { "account_id": "xxx", "path": "/folder", "filename": "file.zip", "total_size": 1048576, "chunk_size": 5242880 }
func (h *ChunkedUploadHandler) InitUpload(w http.ResponseWriter, r *http.Request) {
	userID, err := getUserID(r)
	if err != nil {
		apiutil.Unauthorized(w, "authentication required")
		return
	}

	var req struct {
		AccountID string `json:"account_id"`
		Path      string `json:"path"`
		FileName  string `json:"filename"`
		TotalSize int64  `json:"total_size"`
		ChunkSize int64  `json:"chunk_size"` // default 5MB
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
		req.ChunkSize = 5 * 1024 * 1024 // 5MB default
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

	totalChunks := int((req.TotalSize + req.ChunkSize - 1) / req.ChunkSize)
	uploadID := uuid.New().String()

	remotePath := req.Path
	if !strings.HasSuffix(remotePath, "/") {
		remotePath += "/"
	}
	remotePath += req.FileName

	session := &UploadSession{
		ID:             uploadID,
		UserID:         userID,
		AccountID:      accountID,
		RemoteName:     account.RcloneRemoteName,
		FileName:       req.FileName,
		RemotePath:     remotePath,
		TotalSize:      req.TotalSize,
		TotalChunks:    totalChunks,
		ChunkSize:      req.ChunkSize,
		ReceivedChunks: make(map[int]bool),
		CreatedAt:      time.Now(),
		UpdatedAt:      time.Now(),
	}

	// Create temp directory for chunks
	sessionDir := filepath.Join(h.tempDir, uploadID)
	os.MkdirAll(sessionDir, 0755)

	h.mu.Lock()
	h.uploads[uploadID] = session
	h.mu.Unlock()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"upload_id":    uploadID,
		"total_chunks": totalChunks,
		"chunk_size":   req.ChunkSize,
	})
}

// UploadChunk uploads a single chunk
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

	// Save chunk to temp file
	chunkPath := filepath.Join(h.tempDir, uploadID, fmt.Sprintf("chunk_%06d", chunkNum))
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

// GetUploadStatus returns the status of an upload session
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

	h.mu.RLock()
	receivedChunks := make([]int, 0, len(session.ReceivedChunks))
	for k := range session.ReceivedChunks {
		receivedChunks = append(receivedChunks, k)
	}
	h.mu.RUnlock()

	sort.Ints(receivedChunks)

	// Find missing chunks
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

// FinalizeUpload combines all chunks and uploads to remote storage
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

	// Check all chunks received
	if len(session.ReceivedChunks) != session.TotalChunks {
		apiutil.BadRequest(w, fmt.Sprintf("not all chunks received: %d/%d", len(session.ReceivedChunks), session.TotalChunks))
		return
	}

	// Combine chunks into single file
	combinedPath := filepath.Join(h.tempDir, uploadID, "combined_"+session.FileName)
	combined, err := os.Create(combinedPath)
	if err != nil {
		apiutil.InternalError(w, "failed to create combined file: "+err.Error())
		return
	}

	for i := 0; i < session.TotalChunks; i++ {
		chunkPath := filepath.Join(h.tempDir, uploadID, fmt.Sprintf("chunk_%06d", i))
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

	// Upload combined file to rclone
	combinedFile, err := os.Open(combinedPath)
	if err != nil {
		apiutil.InternalError(w, "failed to open combined file: "+err.Error())
		return
	}
	defer combinedFile.Close()

	err = h.rcloneClient.CopyStream(r.Context(), combinedFile, session.RemoteName, session.RemotePath)
	if err != nil {
		apiutil.InternalError(w, "upload to remote failed: "+err.Error())
		return
	}

	// Cleanup temp files
	sessionDir := filepath.Join(h.tempDir, uploadID)
	os.RemoveAll(sessionDir)

	h.mu.Lock()
	delete(h.uploads, uploadID)
	h.mu.Unlock()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"message":     "upload complete",
		"filename":    session.FileName,
		"remote_path": session.RemotePath,
		"size":        session.TotalSize,
	})
}

// CancelUpload cancels an upload session and cleans up temp files
// DELETE /api/v1/vfs/upload/{upload_id}
func (h *ChunkedUploadHandler) CancelUpload(w http.ResponseWriter, r *http.Request) {
	uploadID := r.PathValue("upload_id")

	h.mu.Lock()
	_, exists := h.uploads[uploadID]
	if exists {
		delete(h.uploads, uploadID)
	}
	h.mu.Unlock()

	if !exists {
		apiutil.NotFound(w, "upload session not found")
		return
	}

	// Cleanup
	sessionDir := filepath.Join(h.tempDir, uploadID)
	os.RemoveAll(sessionDir)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"message": "upload cancelled"})
}
