package service

import (
	"context"
	"fmt"
	"io"
	"path/filepath"
	"strings"
	"time"

	"cloudhub/internal/domain/entity"
	"cloudhub/internal/domain/repository"
	"cloudhub/internal/pkg/rclone"
)

// FileItem represents a file or folder in cloud storage.
type FileItem struct {
	Name     string `json:"name"`
	Type     string `json:"type"` // "file" or "folder"
	Size     int64  `json:"size"`
	MimeType string `json:"mime_type,omitempty"`
	Modified string `json:"modified"`
	Path     string `json:"path"`
}

// FileListResponse is returned by ListFiles.
type FileListResponse struct {
	Items []FileItem `json:"items"`
}

// FileService handles file operations against cloud storage accounts.
type FileService struct {
	accountRepo repository.StorageAccountRepository
	rclone      *rclone.Client
}

// NewFileService creates a new FileService.
func NewFileService(
	accountRepo repository.StorageAccountRepository,
	rcloneClient *rclone.Client,
) *FileService {
	return &FileService{
		accountRepo: accountRepo,
		rclone:      rcloneClient,
	}
}

// resolveRemote validates that the account belongs to the user and returns
// the rclone remote name (e.g. "mydrive:") needed for rclone commands.
func (s *FileService) resolveRemote(ctx context.Context, userID, accountID string) (string, error) {
	account, err := s.accountRepo.FindByID(ctx, accountID)
	if err != nil {
		return "", fmt.Errorf("storage account not found: %w", err)
	}
	if account.UserID != userID {
		return "", fmt.Errorf("access denied: account does not belong to user")
	}
	return account.RcloneRemoteName, nil
}

// normalizePath ensures the path starts with "/" and has no trailing slash
// (except for root "/").
func normalizePath(p string) string {
	if p == "" {
		return "/"
	}
	p = filepath.Clean(p)
	p = strings.ReplaceAll(p, "\\", "/")
	if !strings.HasPrefix(p, "/") {
		p = "/" + p
	}
	return p
}

// remotePath joins the rclone remote name with the user-facing path.
// e.g. remote="mydrive:", path="/photos/cat.jpg" => "mydrive:photos/cat.jpg"
func remotePath(remote, path string) string {
	trimmed := strings.TrimPrefix(path, "/")
	if trimmed == "" {
		return remote
	}
	return remote + trimmed
}

// ListFiles lists files and folders at the given path using rclone lsjson.
func (s *FileService) ListFiles(ctx context.Context, userID, accountID, path string) (*FileListResponse, error) {
	remote, err := s.resolveRemote(ctx, userID, accountID)
	if err != nil {
		return nil, err
	}

	path = normalizePath(path)
	target := remotePath(remote, path)

	entries, err := s.rclone.Lsjson(ctx, target)
	if err != nil {
		return nil, fmt.Errorf("failed to list files: %w", err)
	}

	items := make([]FileItem, 0, len(entries))
	for _, e := range entries {
		itemType := "file"
		if e.IsDir {
			itemType = "folder"
		}

		modified := ""
		if !e.ModTime.IsZero() {
			modified = e.ModTime.Format(time.RFC3339)
		}

		itemPath := "/" + e.Path
		if path != "/" {
			itemPath = strings.TrimSuffix(path, "/") + "/" + e.Name
		}

		items = append(items, FileItem{
			Name:     e.Name,
			Type:     itemType,
			Size:     e.Size,
			MimeType: e.MimeType,
			Modified: modified,
			Path:     itemPath,
		})
	}

	return &FileListResponse{Items: items}, nil
}

// UploadFile uploads a file to the specified path using rclone CopyStream.
func (s *FileService) UploadFile(ctx context.Context, userID, accountID, path string, reader io.Reader, filename string) error {
	remote, err := s.resolveRemote(ctx, userID, accountID)
	if err != nil {
		return err
	}

	path = normalizePath(path)
	dest := remotePath(remote, strings.TrimSuffix(path, "/")) + "/" + filename

	if err := s.rclone.CopyStream(ctx, reader, dest); err != nil {
		return fmt.Errorf("failed to upload file: %w", err)
	}
	return nil
}

// DownloadFile streams the contents of a file using rclone CatStream.
// It returns an io.ReadCloser that the caller must close.
func (s *FileService) DownloadFile(ctx context.Context, userID, accountID, path string) (io.ReadCloser, error) {
	remote, err := s.resolveRemote(ctx, userID, accountID)
	if err != nil {
		return nil, err
	}

	path = normalizePath(path)
	target := remotePath(remote, path)

	stream, err := s.rclone.CatStream(ctx, target)
	if err != nil {
		return nil, fmt.Errorf("failed to download file: %w", err)
	}
	return stream, nil
}

// DeleteFile deletes a file or folder using rclone Delete.
func (s *FileService) DeleteFile(ctx context.Context, userID, accountID, path string) error {
	remote, err := s.resolveRemote(ctx, userID, accountID)
	if err != nil {
		return err
	}

	path = normalizePath(path)
	target := remotePath(remote, path)

	if err := s.rclone.Delete(ctx, target); err != nil {
		return fmt.Errorf("failed to delete file: %w", err)
	}
	return nil
}

// CreateFolder creates a directory at the given path using rclone Mkdir.
func (s *FileService) CreateFolder(ctx context.Context, userID, accountID, path string) error {
	remote, err := s.resolveRemote(ctx, userID, accountID)
	if err != nil {
		return err
	}

	path = normalizePath(path)
	target := remotePath(remote, path)

	if err := s.rclone.Mkdir(ctx, target); err != nil {
		return fmt.Errorf("failed to create folder: %w", err)
	}
	return nil
}
