package handlers

import (
	"encoding/json"
	"io"
	"net/http"
	"path"
	"strings"

	"storage-gateway/internal/api/apiutil"
	"storage-gateway/internal/rclone"
	"storage-gateway/internal/repository"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

type AccountFileHandler struct {
	accountRepo  *repository.StorageAccountRepository
	rcloneClient *rclone.Client
}

func NewAccountFileHandler(accountRepo *repository.StorageAccountRepository, rcloneClient *rclone.Client) *AccountFileHandler {
	return &AccountFileHandler{
		accountRepo:  accountRepo,
		rcloneClient: rcloneClient,
	}
}

// ListFiles lists files in a storage account using rclone lsjson
func (h *AccountFileHandler) ListFiles(w http.ResponseWriter, r *http.Request) {
	userID, err := getUserID(r)
	if err != nil {
		apiutil.Unauthorized(w, "authentication required")
		return
	}

	accountID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		apiutil.BadRequest(w, "invalid account ID")
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

	remotePath := r.URL.Query().Get("path")
	if remotePath == "" {
		remotePath = "/"
	}

	files, err := h.rcloneClient.Lsjson(r.Context(), account.RcloneRemoteName, remotePath)
	if err != nil {
		apiutil.InternalError(w, "failed to list files: "+err.Error())
		return
	}

	apiutil.RespondJSON(w, http.StatusOK, map[string]interface{}{
		"path":  remotePath,
		"items": files,
	})
}

// UploadFile uploads a file to a storage account
func (h *AccountFileHandler) UploadFile(w http.ResponseWriter, r *http.Request) {
	userID, err := getUserID(r)
	if err != nil {
		apiutil.Unauthorized(w, "authentication required")
		return
	}

	accountID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		apiutil.BadRequest(w, "invalid account ID")
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

	// Parse multipart form (max 100MB)
	if err := r.ParseMultipartForm(100 << 20); err != nil {
		apiutil.BadRequest(w, "file too large or invalid form (max 100MB)")
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		apiutil.BadRequest(w, "missing file field")
		return
	}
	defer file.Close()

	// Get target path from query
	targetPath := r.URL.Query().Get("path")
	if targetPath == "" {
		targetPath = "/"
	}

	// Build full remote path
	remotePath := path.Join(targetPath, header.Filename)

	// Upload using rclone rcat
	if err := h.rcloneClient.CopyStream(r.Context(), file, account.RcloneRemoteName, remotePath); err != nil {
		apiutil.InternalError(w, "upload failed: "+err.Error())
		return
	}

	apiutil.RespondJSON(w, http.StatusCreated, map[string]interface{}{
		"success": true,
		"message": "file uploaded successfully",
		"path":    remotePath,
		"size":    header.Size,
	})
}

// DownloadFile downloads a file from a storage account
func (h *AccountFileHandler) DownloadFile(w http.ResponseWriter, r *http.Request) {
	userID, err := getUserID(r)
	if err != nil {
		apiutil.Unauthorized(w, "authentication required")
		return
	}

	accountID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		apiutil.BadRequest(w, "invalid account ID")
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

	remotePath := r.URL.Query().Get("path")
	if remotePath == "" {
		apiutil.BadRequest(w, "path parameter is required")
		return
	}

	// Stream file content
	reader, err := h.rcloneClient.CatStream(r.Context(), account.RcloneRemoteName, remotePath)
	if err != nil {
		if strings.Contains(err.Error(), "not found") {
			apiutil.NotFound(w, "file not found")
			return
		}
		apiutil.InternalError(w, "download failed: "+err.Error())
		return
	}
	defer reader.Close()

	// Set headers
	filename := path.Base(remotePath)
	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Content-Disposition", `attachment; filename="`+filename+`"`)

	io.Copy(w, reader)
}

// DeleteFile deletes a file or folder from a storage account
func (h *AccountFileHandler) DeleteFile(w http.ResponseWriter, r *http.Request) {
	userID, err := getUserID(r)
	if err != nil {
		apiutil.Unauthorized(w, "authentication required")
		return
	}

	accountID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		apiutil.BadRequest(w, "invalid account ID")
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

	remotePath := r.URL.Query().Get("path")
	if remotePath == "" {
		apiutil.BadRequest(w, "path parameter is required")
		return
	}

	if err := h.rcloneClient.Delete(r.Context(), account.RcloneRemoteName, remotePath); err != nil {
		apiutil.InternalError(w, "delete failed: "+err.Error())
		return
	}

	apiutil.RespondJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"message": "deleted successfully",
	})
}

// CreateFolder creates a folder in a storage account
func (h *AccountFileHandler) CreateFolder(w http.ResponseWriter, r *http.Request) {
	userID, err := getUserID(r)
	if err != nil {
		apiutil.Unauthorized(w, "authentication required")
		return
	}

	accountID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		apiutil.BadRequest(w, "invalid account ID")
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

	var req struct {
		Path string `json:"path"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		apiutil.BadRequest(w, "invalid request body")
		return
	}

	if req.Path == "" {
		apiutil.BadRequest(w, "path is required")
		return
	}

	if err := h.rcloneClient.Mkdir(r.Context(), account.RcloneRemoteName, req.Path); err != nil {
		apiutil.InternalError(w, "create folder failed: "+err.Error())
		return
	}

	apiutil.RespondJSON(w, http.StatusCreated, map[string]interface{}{
		"success": true,
		"message": "folder created successfully",
		"path":    req.Path,
	})
}
