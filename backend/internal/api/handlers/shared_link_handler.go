package handlers

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"storage-gateway/internal/api/apiutil"
	"storage-gateway/internal/model"
	"storage-gateway/internal/rclone"
	"storage-gateway/internal/repository"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

// SharedLinkHandler handles shared link operations
type SharedLinkHandler struct {
	sharedLinkRepo *repository.SharedLinkRepository
	accountRepo    *repository.StorageAccountRepository
	rcloneClient   *rclone.Client
	appBaseURL     string
}

func NewSharedLinkHandler(
	sharedLinkRepo *repository.SharedLinkRepository,
	accountRepo *repository.StorageAccountRepository,
	rcloneClient *rclone.Client,
	appBaseURL string,
) *SharedLinkHandler {
	return &SharedLinkHandler{
		sharedLinkRepo: sharedLinkRepo,
		accountRepo:    accountRepo,
		rcloneClient:   rcloneClient,
		appBaseURL:     appBaseURL,
	}
}

// generateToken generates a random 32-character hex token
func generateToken() (string, error) {
	bytes := make([]byte, 16)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return hex.EncodeToString(bytes), nil
}

// CreateSharedLink creates a new shared link
// POST /api/v1/shared-links
func (h *SharedLinkHandler) CreateSharedLink(w http.ResponseWriter, r *http.Request) {
	userID, err := getUserID(r)
	if err != nil {
		apiutil.Unauthorized(w, "authentication required")
		return
	}

	var req struct {
		FileName       string `json:"file_name"`
		AccountID      string `json:"account_id"`
		RemotePath     string `json:"remote_path"`
		MaxDownloads   int    `json:"max_downloads"`
		ExpiresInHours int    `json:"expires_in_hours"`
		FileSize       int64  `json:"file_size"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		apiutil.BadRequest(w, "invalid request body")
		return
	}

	if req.FileName == "" || req.RemotePath == "" {
		apiutil.BadRequest(w, "file_name and remote_path are required")
		return
	}

	// Verify account belongs to user if provided
	var accountIDPtr *string
	if req.AccountID != "" {
		accountUUID, err := uuid.Parse(req.AccountID)
		if err != nil {
			apiutil.BadRequest(w, "invalid account_id")
			return
		}

		account, err := h.accountRepo.GetByID(r.Context(), accountUUID)
		if err != nil {
			apiutil.NotFound(w, "account not found")
			return
		}

		if account.UserID != userID {
			apiutil.Forbidden(w, "access denied to this account")
			return
		}

		accountIDStr := req.AccountID
		accountIDPtr = &accountIDStr
	}

	// Check if file is encrypted
	if strings.HasSuffix(req.FileName, ".enc") {
		apiutil.Forbidden(w, "cannot share encrypted files without passphrase")
		return
	}

	// Generate token
	token, err := generateToken()
	if err != nil {
		apiutil.InternalError(w, "failed to generate token")
		return
	}

	// Calculate expiry
	var expiresAt *time.Time
	if req.ExpiresInHours > 0 {
		exp := time.Now().Add(time.Duration(req.ExpiresInHours) * time.Hour)
		expiresAt = &exp
	}

	link := &model.SharedLink{
		UserID:       userID.String(),
		Token:        token,
		FileName:     req.FileName,
		FileSize:     req.FileSize,
		AccountID:    accountIDPtr,
		RemotePath:   req.RemotePath,
		MaxDownloads: req.MaxDownloads,
		IsActive:     true,
		ExpiresAt:    expiresAt,
	}

	if err := h.sharedLinkRepo.Create(r.Context(), link); err != nil {
		apiutil.InternalError(w, "failed to create shared link: "+err.Error())
		return
	}

	// Build share URL
	shareURL := fmt.Sprintf("%s/s/%s", h.appBaseURL, link.Token)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"id":            link.ID,
		"token":         link.Token,
		"share_url":     shareURL,
		"file_name":     link.FileName,
		"expires_at":    link.ExpiresAt,
		"max_downloads": link.MaxDownloads,
	})
}

// ListSharedLinks lists all shared links for the authenticated user
// GET /api/v1/shared-links
func (h *SharedLinkHandler) ListSharedLinks(w http.ResponseWriter, r *http.Request) {
	userID, err := getUserID(r)
	if err != nil {
		apiutil.Unauthorized(w, "authentication required")
		return
	}

	links, err := h.sharedLinkRepo.GetByUserID(r.Context(), userID.String())
	if err != nil {
		apiutil.InternalError(w, "failed to list shared links: "+err.Error())
		return
	}

	if links == nil {
		links = []*model.SharedLink{}
	}

	// Add share_url to each link
	type LinkWithUrl struct {
		*model.SharedLink
		ShareURL string `json:"share_url"`
	}

	result := make([]LinkWithUrl, len(links))
	for i, link := range links {
		result[i] = LinkWithUrl{
			SharedLink: link,
			ShareURL:   fmt.Sprintf("%s/s/%s", h.appBaseURL, link.Token),
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

// DeleteSharedLink deletes/revokes a shared link
// DELETE /api/v1/shared-links/{id}
func (h *SharedLinkHandler) DeleteSharedLink(w http.ResponseWriter, r *http.Request) {
	userID, err := getUserID(r)
	if err != nil {
		apiutil.Unauthorized(w, "authentication required")
		return
	}

	linkID := chi.URLParam(r, "id")
	if linkID == "" {
		apiutil.BadRequest(w, "link id is required")
		return
	}

	// Verify link belongs to user by getting all user's links
	links, err := h.sharedLinkRepo.GetByUserID(r.Context(), userID.String())
	if err != nil {
		apiutil.InternalError(w, "failed to verify link ownership")
		return
	}

	found := false
	for _, link := range links {
		if link.ID == linkID {
			found = true
			break
		}
	}

	if !found {
		apiutil.NotFound(w, "shared link not found")
		return
	}

	if err := h.sharedLinkRepo.Delete(r.Context(), linkID); err != nil {
		apiutil.InternalError(w, "failed to delete shared link: "+err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"message": "shared link deleted"})
}

// DownloadSharedFile handles public download of a shared file
// GET /api/v1/public/share/{token}
func (h *SharedLinkHandler) DownloadSharedFile(w http.ResponseWriter, r *http.Request) {
	token := chi.URLParam(r, "token")
	if token == "" {
		apiutil.BadRequest(w, "token is required")
		return
	}

	// Get the shared link
	link, err := h.sharedLinkRepo.GetByToken(r.Context(), token)
	if err != nil {
		apiutil.NotFound(w, "shared link not found")
		return
	}

	// Validate link
	if !link.IsActive {
		apiutil.Forbidden(w, "this link has been revoked")
		return
	}

	if link.ExpiresAt != nil && time.Now().After(*link.ExpiresAt) {
		apiutil.Forbidden(w, "this link has expired")
		return
	}

	if link.MaxDownloads > 0 && link.DownloadCount >= link.MaxDownloads {
		apiutil.Forbidden(w, "download limit reached")
		return
	}

	// Get the storage account
	if link.AccountID == nil || *link.AccountID == "" {
		apiutil.InternalError(w, "no storage account associated with this link")
		return
	}

	accountUUID, err := uuid.Parse(*link.AccountID)
	if err != nil {
		apiutil.InternalError(w, "invalid account reference")
		return
	}

	account, err := h.accountRepo.GetByID(r.Context(), accountUUID)
	if err != nil {
		apiutil.InternalError(w, "storage account not found")
		return
	}

	// Stream file from rclone
	reader, err := h.rcloneClient.CatStream(r.Context(), account.RcloneRemoteName, link.RemotePath)
	if err != nil {
		apiutil.InternalError(w, "download failed: "+err.Error())
		return
	}
	defer reader.Close()

	// Increment download count
	if err := h.sharedLinkRepo.IncrementDownloadCount(r.Context(), link.ID); err != nil {
		// Log but don't fail the download
		fmt.Printf("WARNING: failed to increment download count: %v\n", err)
	}

	// Set headers for download
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, link.FileName))
	w.Header().Set("Content-Type", "application/octet-stream")

	// Stream file to response
	io.Copy(w, reader)
}
