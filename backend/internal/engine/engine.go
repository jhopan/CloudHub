package engine

import (
	"context"
	"io"
	"time"
)

// ─── Engine Type Constants ──────────────────────────────────────────────────

const (
	EngineTypeRclone    = "rclone"
	EngineTypeDirectAPI = "direct_api"
)

// ─── Shared Types ───────────────────────────────────────────────────────────

// StorageFileInfo represents a file or directory in any storage provider.
type StorageFileInfo struct {
	Path     string    `json:"path"`
	Name     string    `json:"name"`
	Size     int64     `json:"size"`
	MimeType string    `json:"mime_type"`
	ModTime  time.Time `json:"mod_time"`
	IsDir    bool      `json:"is_dir"`
}

// StorageQuota represents capacity information from any provider.
type StorageQuota struct {
	TotalBytes int64 `json:"total_bytes"`
	UsedBytes  int64 `json:"used_bytes"`
	FreeBytes  int64 `json:"free_bytes"`
}

// UploadRequest contains parameters for uploading a file.
type UploadRequest struct {
	Reader     io.Reader
	RemotePath string
	FileName   string
	MimeType   string
	Size       int64
}

// DownloadResult contains a stream for downloading a file.
type DownloadResult struct {
	Stream   io.ReadCloser
	MimeType string
	Size     int64
}

// TestResult contains the result of a connection test.
type TestResult struct {
	Success        bool          `json:"success"`
	Message        string        `json:"message"`
	ResponseTime   time.Duration `json:"response_time_ms"`
	TotalBytes     int64         `json:"total_bytes"`
	UsedBytes      int64         `json:"used_bytes"`
	FreeBytes      int64         `json:"free_bytes"`
}

// ─── StorageEngine Interface ────────────────────────────────────────────────

// StorageEngine defines the contract that all storage engines must implement.
// Both rclone and direct API adapters implement this interface.
type StorageEngine interface {
	// Name returns the engine identifier (e.g., "rclone", "direct_api")
	Name() string

	// Upload uploads a file from a reader to the remote storage.
	Upload(ctx context.Context, req UploadRequest) error

	// Download returns a stream for downloading a file from remote storage.
	Download(ctx context.Context, remotePath string) (*DownloadResult, error)

	// List returns files and directories at the given path.
	List(ctx context.Context, path string) ([]StorageFileInfo, error)

	// ListRecursive returns all files and directories recursively.
	ListRecursive(ctx context.Context, path string) ([]StorageFileInfo, error)

	// About returns storage quota information.
	About(ctx context.Context) (*StorageQuota, error)

	// Delete removes a file or directory at the given path.
	Delete(ctx context.Context, remotePath string) error

	// Mkdir creates a directory at the given path.
	Mkdir(ctx context.Context, remotePath string) error

	// Rename renames a file or directory.
	Rename(ctx context.Context, oldPath, newPath string) error

	// Move moves a file or directory from src to dest.
	Move(ctx context.Context, srcPath, destPath string) error

	// TestConnection tests the connection and returns quota info.
	TestConnection(ctx context.Context) (*TestResult, error)

	// FileExists checks if a file exists at the given path.
	FileExists(ctx context.Context, remotePath string) (bool, error)
}
