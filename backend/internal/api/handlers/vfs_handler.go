package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"path"
	"strings"
	"sync"
	"time"

	"storage-gateway/internal/api/apiutil"
	appcrypto "storage-gateway/internal/crypto"
	"storage-gateway/internal/model"
	"storage-gateway/internal/rclone"
	"storage-gateway/internal/repository"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
)

// VFSHandler handles global virtual filesystem operations
// Aggregates files from all storage accounts into a single virtual view
type VFSHandler struct {
	accountRepo     *repository.StorageAccountRepository
	rcloneClient    *rclone.Client
	fileRepo        *repository.FileRepository
	userRepo        *repository.UserRepository
	transferLogRepo *repository.TransferLogRepository
	redis           *redis.Client
}

func NewVFSHandler(accountRepo *repository.StorageAccountRepository, rcloneClient *rclone.Client, fileRepo *repository.FileRepository, userRepo *repository.UserRepository, transferLogRepo *repository.TransferLogRepository, redis *redis.Client) *VFSHandler {
	return &VFSHandler{
		accountRepo:     accountRepo,
		rcloneClient:    rcloneClient,
		fileRepo:        fileRepo,
		userRepo:        userRepo,
		transferLogRepo: transferLogRepo,
		redis:           redis,
	}
}

// VFSFile represents a file/folder in the virtual filesystem
type VFSFile struct {
	Name          string `json:"name"`
	Path          string `json:"path"`
	Type          string `json:"type"` // "file" or "folder"
	Size          int64  `json:"size"`
	Modified      string `json:"modified"`
	MimeType      string `json:"mime_type,omitempty"`
	AccountID     string `json:"account_id"`
	AccountLabel  string `json:"account_label"`
	ProviderType  string `json:"provider_type"`
	ProviderIcon  string `json:"provider_icon,omitempty"`
	RemotePath    string `json:"remote_path"` // actual path on the remote
}

// vfsCacheKey builds the Redis cache key for a VFS list response.
func vfsCacheKey(userID uuid.UUID, path string) string {
	return fmt.Sprintf("vfs:list:%s:%s", userID.String(), path)
}

// invalidateVFSCache removes the cached VFS listing for a given user and path.
// It also invalidates the root "/" listing since subfolder changes affect it.
func (h *VFSHandler) invalidateVFSCache(ctx context.Context, userID uuid.UUID, vfsPath string) {
	if h.redis == nil {
		return
	}
	// Always invalidate the specific path
	h.redis.Del(ctx, vfsCacheKey(userID, vfsPath))
	// Also invalidate root if the changed path is not already root
	if vfsPath != "/" {
		h.redis.Del(ctx, vfsCacheKey(userID, "/"))
	}
}

// List lists files in the virtual filesystem
// GET /api/v1/vfs/list?path=/
// Path structure:
//   /                           -> aggregate ALL files from ALL accounts (flat list)
//   /AccountLabel/              -> list root of that account
//   /AccountLabel/subfolder/    -> list subfolder of that account
func (h *VFSHandler) List(w http.ResponseWriter, r *http.Request) {
	userID, err := getUserID(r)
	if err != nil {
		apiutil.Unauthorized(w, "authentication required")
		return
	}

	vfsPath := r.URL.Query().Get("path")
	if vfsPath == "" {
		vfsPath = "/"
	}

	// --- Redis cache: check for HIT ---
	if h.redis != nil {
		cacheKey := vfsCacheKey(userID, vfsPath)
		cached, err := h.redis.Get(r.Context(), cacheKey).Result()
		if err == nil && cached != "" {
			w.Header().Set("Content-Type", "application/json")
			w.Header().Set("X-Cache", "HIT")
			w.Write([]byte(cached))
			return
		}
	}

	// Get all active accounts for this user
	accounts, err := h.accountRepo.GetByUserID(r.Context(), userID)
	if err != nil {
		apiutil.InternalError(w, "failed to get accounts: "+err.Error())
		return
	}

	if len(accounts) == 0 {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode([]VFSFile{})
		return
	}

	// Parse VFS path
	parts := strings.Split(strings.Trim(vfsPath, "/"), "/")

	// Root level: aggregate ALL files from ALL accounts into a flat list
	if vfsPath == "/" || (len(parts) == 1 && parts[0] == "") {
		type accountResult struct {
			files []VFSFile
			err   error
		}

		// Collect active accounts
		var activeAccounts []*model.StorageAccountWithProvider
		for _, acc := range accounts {
			if acc.IsActive {
				activeAccounts = append(activeAccounts, acc)
			}
		}

		if len(activeAccounts) == 0 {
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode([]VFSFile{})
			return
		}

		// Fetch files from all accounts concurrently
		results := make([]accountResult, len(activeAccounts))
		var wg sync.WaitGroup

		for i, acc := range activeAccounts {
			wg.Add(1)
			go func(idx int, account *model.StorageAccountWithProvider) {
				defer wg.Done()

				remoteFiles, err := h.rcloneClient.Lsjson(r.Context(), account.RcloneRemoteName, "/")
				if err != nil {
					log.Printf("WARNING: failed to list root of account %q (%s): %v", account.Label, account.RcloneRemoteName, err)
					results[idx] = accountResult{err: err}
					return
				}

				var vfsFiles []VFSFile
				for _, f := range remoteFiles {
					fileType := "file"
					if f.IsDir {
						fileType = "folder"
					}

					// Build VFS path that includes account label prefix
					var vfsFilePath string
					if f.IsDir {
						vfsFilePath = "/" + account.Label + "/" + strings.TrimSuffix(f.Path, "/") + "/"
					} else {
						vfsFilePath = "/" + account.Label + "/" + f.Path
					}

					vfsFiles = append(vfsFiles, VFSFile{
						Name:         f.Name,
						Path:         vfsFilePath,
						Type:         fileType,
						Size:         f.Size,
						Modified:     f.ModTime.Format("2006-01-02T15:04:05Z"),
						MimeType:     f.MimeType,
						AccountID:    account.ID.String(),
						AccountLabel: account.Label,
						ProviderType: account.ProviderType,
						ProviderIcon: account.ProviderIconURL,
						RemotePath:   f.Path,
					})
				}
				results[idx] = accountResult{files: vfsFiles}
			}(i, acc)
		}

		wg.Wait()

		// Flatten all results into a single list
		var allFiles []VFSFile
		for _, res := range results {
			if res.err != nil {
				// Skip accounts that failed, already logged above
				continue
			}
			allFiles = append(allFiles, res.files...)
		}

		if allFiles == nil {
			allFiles = []VFSFile{}
		}

		// Marshal once, cache in Redis, then write response
		jsonData, err := json.Marshal(allFiles)
		if err != nil {
			apiutil.InternalError(w, "failed to marshal response")
			return
		}
		if h.redis != nil {
			cacheKey := vfsCacheKey(userID, vfsPath)
			h.redis.Set(r.Context(), cacheKey, string(jsonData), 60*time.Second)
		}
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("X-Cache", "MISS")
		w.Write(jsonData)
		return
	}

	// Find the account by label (first part of path)
	accountLabel := parts[0]
	var targetAccount *struct {
		AccountID    uuid.UUID
		RemoteName   string
		Label        string
		ProviderType string
		ProviderIcon string
	}

	for _, acc := range accounts {
		if acc.Label == accountLabel && acc.IsActive {
			targetAccount = &struct {
				AccountID    uuid.UUID
				RemoteName   string
				Label        string
				ProviderType string
				ProviderIcon string
			}{
				AccountID:    acc.ID,
				RemoteName:   acc.RcloneRemoteName,
				Label:        acc.Label,
				ProviderType: acc.ProviderType,
				ProviderIcon: acc.ProviderIconURL,
			}
			break
		}
	}

	if targetAccount == nil {
		apiutil.NotFound(w, fmt.Sprintf("account '%s' not found", accountLabel))
		return
	}

	// Build remote path from remaining parts
	remotePath := "/"
	if len(parts) > 1 {
		remotePath = "/" + strings.Join(parts[1:], "/")
	}

	// List files from rclone
	files, err := h.rcloneClient.Lsjson(r.Context(), targetAccount.RemoteName, remotePath)
	if err != nil {
		apiutil.InternalError(w, "failed to list files: "+err.Error())
		return
	}

	var vfsFiles []VFSFile
	for _, f := range files {
		fileType := "file"
		if f.IsDir {
			fileType = "folder"
		}

		// Build VFS path
		var vfsFilePath string
		if f.IsDir {
			vfsFilePath = "/" + accountLabel + strings.TrimSuffix(f.Path, "/") + "/"
		} else {
			vfsFilePath = "/" + accountLabel + "/" + f.Path
		}

		vfsFiles = append(vfsFiles, VFSFile{
			Name:         f.Name,
			Path:         vfsFilePath,
			Type:         fileType,
			Size:         f.Size,
			Modified:     f.ModTime.Format("2006-01-02T15:04:05Z"),
			MimeType:     f.MimeType,
			AccountID:    targetAccount.AccountID.String(),
			AccountLabel: targetAccount.Label,
			ProviderType: targetAccount.ProviderType,
			ProviderIcon: targetAccount.ProviderIcon,
			RemotePath:   f.Path,
		})
	}

	if vfsFiles == nil {
		vfsFiles = []VFSFile{}
	}

	// Marshal once, cache in Redis, then write response
	jsonData, err := json.Marshal(vfsFiles)
	if err != nil {
		apiutil.InternalError(w, "failed to marshal response")
		return
	}
	if h.redis != nil {
		cacheKey := vfsCacheKey(userID, vfsPath)
		h.redis.Set(r.Context(), cacheKey, string(jsonData), 60*time.Second)
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("X-Cache", "MISS")
	w.Write(jsonData)
}

// logTransfer creates a transfer log entry for a VFS operation (best-effort).
func (h *VFSHandler) logTransfer(r *http.Request, userID uuid.UUID, accountID uuid.UUID, operation string, status string, bytesTransferred int64, startedAt time.Time, errMsg string, fileName string) {
	tl := &model.TransferLog{
		ID:               uuid.New(),
		UserID:           userID,
		AccountID:        &accountID,
		Operation:        operation,
		Status:           status,
		BytesTransferred: bytesTransferred,
		FileName:         fileName,
		StartedAt:        &startedAt,
	}
	if err := h.transferLogRepo.Create(r.Context(), tl); err != nil {
		log.Printf("WARNING: failed to create transfer log for %s: %v", operation, err)
		return
	}
	var errPtr *string
	if errMsg != "" {
		errPtr = &errMsg
	}
	if err := h.transferLogRepo.UpdateStatus(r.Context(), tl.ID, status, bytesTransferred, errPtr); err != nil {
		log.Printf("WARNING: failed to update transfer log status: %v", err)
	}
}

// Download streams a file from the virtual filesystem
// GET /api/v1/vfs/download?account_id=xxx&path=/file.txt
func (h *VFSHandler) Download(w http.ResponseWriter, r *http.Request) {
	startTime := time.Now()

	userID, err := getUserID(r)
	if err != nil {
		apiutil.Unauthorized(w, "authentication required")
		return
	}

	accountIDStr := r.URL.Query().Get("account_id")
	filePath := r.URL.Query().Get("path")

	if accountIDStr == "" || filePath == "" {
		apiutil.BadRequest(w, "account_id and path are required")
		return
	}

	accountID, err := uuid.Parse(accountIDStr)
	if err != nil {
		apiutil.BadRequest(w, "invalid account_id")
		return
	}

	// Verify account belongs to user
	account, err := h.accountRepo.GetByID(r.Context(), accountID)
	if err != nil {
		apiutil.NotFound(w, "account not found")
		return
	}

	if account.UserID != userID {
		apiutil.Forbidden(w, "access denied")
		return
	}

	// Extract filename from path for logging
	fileName := path.Base(filePath)

	// Strip account label prefix from VFS path to get actual remote path
	// VFS path: "/Google Drive Account/fntest.txt" -> rclone path: "/fntest.txt"
	remotePath := filePath
	accountPrefix := "/" + account.Label
	if strings.HasPrefix(remotePath, accountPrefix+"/") {
		remotePath = remotePath[len(accountPrefix):]
	} else if remotePath == accountPrefix {
		remotePath = "/"
	}

	// Stream file from rclone
	reader, err := h.rcloneClient.CatStream(r.Context(), account.RcloneRemoteName, remotePath)
	if err != nil {
		h.logTransfer(r, userID, accountID, model.OpDownload, model.StatusFailed, 0, startTime, "download failed: "+err.Error(), fileName)
		apiutil.InternalError(w, "download failed: "+err.Error())
		return
	}
	defer reader.Close()

	// Set headers for download
	filename := filePath
	if idx := strings.LastIndex(filePath, "/"); idx >= 0 {
		filename = filePath[idx+1:]
	}

	// Check if file is encrypted (.enc extension)
	isEncrypted := strings.HasSuffix(filename, ".enc")
	if isEncrypted {
		// Strip .enc from download filename
		filename = strings.TrimSuffix(filename, ".enc")
	}

	// If encrypted, decrypt before streaming
	if isEncrypted {
		passphrase := r.URL.Query().Get("passphrase")
		if passphrase == "" {
			passphrase = r.Header.Get("X-Encryption-Passphrase")
		}
		if passphrase == "" {
			apiutil.BadRequest(w, "passphrase required for encrypted file (use ?passphrase=xxx or X-Encryption-Passphrase header)")
			return
		}

		// Get user's encryption salt
		salt, err := h.userRepo.GetEncryptionSalt(r.Context(), userID)
		if err != nil || salt == nil {
			apiutil.InternalError(w, "encryption salt not found")
			return
		}

		// Create decryptor
		enc, err := appcrypto.NewFileEncryptor(passphrase, salt)
		if err != nil {
			apiutil.InternalError(w, "failed to create decryptor: "+err.Error())
			return
		}

		// Decrypt stream
		decReader, err := enc.DecryptStream(reader)
		if err != nil {
			h.logTransfer(r, userID, accountID, model.OpDownload, model.StatusFailed, 0, startTime, "decryption failed: "+err.Error(), fileName)
			apiutil.InternalError(w, "decryption failed (wrong passphrase?): "+err.Error())
			return
		}

		w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filename))
		w.Header().Set("Content-Type", "application/octet-stream")
		written, _ := io.Copy(w, decReader)
		h.logTransfer(r, userID, accountID, model.OpDownload, model.StatusCompleted, written, startTime, "", fileName)
		return
	}

	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filename))
	w.Header().Set("Content-Type", "application/octet-stream")

	// Support Range requests for resumable download
	written, _ := io.Copy(w, reader)
	h.logTransfer(r, userID, accountID, model.OpDownload, model.StatusCompleted, written, startTime, "", fileName)
}

// Mkdir creates a folder in the virtual filesystem
// POST /api/v1/vfs/mkdir
// Body: { "account_id": "xxx", "path": "/new-folder" }
func (h *VFSHandler) Mkdir(w http.ResponseWriter, r *http.Request) {
	userID, err := getUserID(r)
	if err != nil {
		apiutil.Unauthorized(w, "authentication required")
		return
	}

	var req struct {
		AccountID string `json:"account_id"`
		Path      string `json:"path"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		apiutil.BadRequest(w, "invalid request body")
		return
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

	if err := h.rcloneClient.Mkdir(r.Context(), account.RcloneRemoteName, req.Path); err != nil {
		apiutil.InternalError(w, "mkdir failed: "+err.Error())
		return
	}

	// Invalidate VFS list cache for the affected path and root
	virtualPath := "/" + account.Label + req.Path
	if !strings.HasSuffix(virtualPath, "/") {
		virtualPath += "/"
	}
	h.invalidateVFSCache(r.Context(), userID, virtualPath)

	// Track directory in metadata (best-effort)
	dirName := req.Path
	if idx := strings.LastIndex(strings.TrimSuffix(req.Path, "/"), "/"); idx >= 0 {
		dirName = req.Path[idx+1:]
	}
	dirName = strings.TrimSuffix(dirName, "/")
	if dirName == "" {
		dirName = req.Path
	}
	dirRecord := &model.File{
		ID:          uuid.New(),
		UserID:      userID,
		Name:        dirName,
		VirtualPath: virtualPath,
		IsDirectory: true,
	}
	if err := h.fileRepo.Upsert(r.Context(), dirRecord); err != nil {
		log.Printf("WARNING: failed to track directory in metadata: %v", err)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"message": "folder created"})
}

// Delete removes a file/folder from the virtual filesystem
// DELETE /api/v1/vfs/delete?account_id=xxx&path=/file.txt
func (h *VFSHandler) Delete(w http.ResponseWriter, r *http.Request) {
	startTime := time.Now()

	userID, err := getUserID(r)
	if err != nil {
		apiutil.Unauthorized(w, "authentication required")
		return
	}

	accountIDStr := r.URL.Query().Get("account_id")
	filePath := r.URL.Query().Get("path")

	if accountIDStr == "" || filePath == "" {
		apiutil.BadRequest(w, "account_id and path are required")
		return
	}

	accountID, err := uuid.Parse(accountIDStr)
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

	// Extract filename from path for logging
	fileName := path.Base(filePath)

	// Strip account label prefix from VFS path to get actual remote path
	remotePath := filePath
	accountPrefix := "/" + account.Label
	if strings.HasPrefix(remotePath, accountPrefix+"/") {
		remotePath = remotePath[len(accountPrefix):]
	} else if remotePath == accountPrefix {
		remotePath = "/"
	}

	if err := h.rcloneClient.Delete(r.Context(), account.RcloneRemoteName, remotePath); err != nil {
		h.logTransfer(r, userID, accountID, model.OpDelete, model.StatusFailed, 0, startTime, "delete failed: "+err.Error(), fileName)
		apiutil.InternalError(w, "delete failed: "+err.Error())
		return
	}

	// Invalidate VFS list cache for the affected path and root
	virtualPath := "/" + account.Label + filePath
	h.invalidateVFSCache(r.Context(), userID, virtualPath)

	// Clean up metadata (best-effort)
	if file, err := h.fileRepo.GetByVirtualPath(r.Context(), userID, virtualPath); err == nil {
		if locErr := h.fileRepo.DeleteLocations(r.Context(), file.ID); locErr != nil {
			log.Printf("WARNING: failed to delete file locations: %v", locErr)
		}
	}
	if delErr := h.fileRepo.DeleteByVirtualPath(r.Context(), userID, virtualPath); delErr != nil {
		log.Printf("WARNING: failed to delete file metadata: %v", delErr)
	}

	// Log successful delete transfer
	h.logTransfer(r, userID, accountID, model.OpDelete, model.StatusCompleted, 0, startTime, "", fileName)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"message": "deleted"})
}

// Sync synchronizes file metadata from remote storage accounts
// POST /api/v1/vfs/sync
// Body (optional): { "account_id": "xxx" }
func (h *VFSHandler) Sync(w http.ResponseWriter, r *http.Request) {
	userID, err := getUserID(r)
	if err != nil {
		apiutil.Unauthorized(w, "authentication required")
		return
	}

	// Optional account_id parameter from query or body
	accountIDStr := r.URL.Query().Get("account_id")

	// Also check request body for account_id
	if accountIDStr == "" {
		var req struct {
			AccountID string `json:"account_id"`
		}
		if r.Body != nil && r.ContentLength > 0 {
			json.NewDecoder(r.Body).Decode(&req)
			accountIDStr = req.AccountID
		}
	}

	type accountInfo struct {
		ID             uuid.UUID
		Label          string
		RcloneRemoteName string
		UserID         uuid.UUID
	}

	var accounts []accountInfo

	if accountIDStr != "" {
		accountID, err := uuid.Parse(accountIDStr)
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
		accounts = append(accounts, accountInfo{
			ID:               account.ID,
			Label:            account.Label,
			RcloneRemoteName: account.RcloneRemoteName,
			UserID:           account.UserID,
		})
	} else {
		allAccounts, err := h.accountRepo.GetByUserID(r.Context(), userID)
		if err != nil {
			apiutil.InternalError(w, "failed to get accounts: "+err.Error())
			return
		}
		for _, acc := range allAccounts {
			if !acc.IsActive {
				continue
			}
			accounts = append(accounts, accountInfo{
				ID:               acc.ID,
				Label:            acc.Label,
				RcloneRemoteName: acc.RcloneRemoteName,
				UserID:           acc.UserID,
			})
		}
	}

	if len(accounts) == 0 {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"message":      "sync complete",
			"files_synced": 0,
		})
		return
	}

	totalSynced := 0
	var syncErrors []string

	for _, acc := range accounts {
		files, err := h.rcloneClient.LsjsonRecursive(r.Context(), acc.RcloneRemoteName, "/")
		if err != nil {
			syncErrors = append(syncErrors, fmt.Sprintf("account %s: %v", acc.Label, err))
			continue
		}

		for _, f := range files {
			if f.IsDir {
				continue
			}

			// Build virtual path: /AccountLabel/remote/path
			virtualPath := "/" + acc.Label + "/" + f.Path

			fileRecord := &model.File{
				ID:          uuid.New(),
				UserID:      userID,
				Name:        f.Name,
				VirtualPath: virtualPath,
				Size:        f.Size,
				MimeType:    f.MimeType,
				IsDirectory: false,
			}

			if err := h.fileRepo.Upsert(r.Context(), fileRecord); err != nil {
				log.Printf("WARNING: failed to upsert file %s: %v", virtualPath, err)
				continue
			}

			// Build remote path with leading /
			remotePath := "/" + f.Path

			// Delete existing locations for this file and re-add
			h.fileRepo.DeleteLocations(r.Context(), fileRecord.ID)

			loc := &model.FileLocation{
				ID:         uuid.New(),
				FileID:     fileRecord.ID,
				AccountID:  acc.ID,
				RemotePath: remotePath,
				ChunkIndex: 0,
				ChunkSize:  f.Size,
			}
			if err := h.fileRepo.AddLocation(r.Context(), loc); err != nil {
				log.Printf("WARNING: failed to add location for %s: %v", virtualPath, err)
				continue
			}

			totalSynced++
		}
	}

	// Invalidate VFS list cache — sync changes all cached listings
	h.invalidateVFSCache(r.Context(), userID, "/")

	response := map[string]interface{}{
		"message":      "sync complete",
		"files_synced": totalSynced,
	}
	if len(syncErrors) > 0 {
		response["errors"] = syncErrors
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}
