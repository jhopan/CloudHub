package engine

import (
	"context"
	"fmt"
	"time"

	"storage-gateway/internal/rclone"
)

// ─── RcloneAdapter ──────────────────────────────────────────────────────────

// RcloneAdapter wraps the existing rclone.Client to implement StorageEngine.
type RcloneAdapter struct {
	client     *rclone.Client
	remoteName string // e.g., "gdrive_887c11ec_1781857353"
}

// NewRcloneAdapter creates a new rclone-based StorageEngine adapter.
func NewRcloneAdapter(client *rclone.Client, remoteName string) *RcloneAdapter {
	return &RcloneAdapter{
		client:     client,
		remoteName: remoteName,
	}
}

func (a *RcloneAdapter) Name() string {
	return EngineTypeRclone
}

func (a *RcloneAdapter) Upload(ctx context.Context, req UploadRequest) error {
	return a.client.CopyStream(ctx, req.Reader, a.remoteName, req.RemotePath)
}

func (a *RcloneAdapter) Download(ctx context.Context, remotePath string) (*DownloadResult, error) {
	stream, err := a.client.CatStream(ctx, a.remoteName, remotePath)
	if err != nil {
		return nil, fmt.Errorf("rclone download: %w", err)
	}
	return &DownloadResult{
		Stream: stream,
	}, nil
}

func (a *RcloneAdapter) List(ctx context.Context, path string) ([]StorageFileInfo, error) {
	files, err := a.client.Lsjson(ctx, a.remoteName, path)
	if err != nil {
		return nil, fmt.Errorf("rclone list: %w", err)
	}
	return convertFileInfos(files), nil
}

func (a *RcloneAdapter) ListRecursive(ctx context.Context, path string) ([]StorageFileInfo, error) {
	files, err := a.client.LsjsonRecursive(ctx, a.remoteName, path)
	if err != nil {
		return nil, fmt.Errorf("rclone list recursive: %w", err)
	}
	return convertFileInfos(files), nil
}

func (a *RcloneAdapter) About(ctx context.Context) (*StorageQuota, error) {
	info, err := a.client.About(ctx, a.remoteName)
	if err != nil {
		return nil, fmt.Errorf("rclone about: %w", err)
	}
	return &StorageQuota{
		TotalBytes: info.Total,
		UsedBytes:  info.Used,
		FreeBytes:  info.Free,
	}, nil
}

func (a *RcloneAdapter) Delete(ctx context.Context, remotePath string) error {
	return a.client.Delete(ctx, a.remoteName, remotePath)
}

func (a *RcloneAdapter) Mkdir(ctx context.Context, remotePath string) error {
	return a.client.Mkdir(ctx, a.remoteName, remotePath)
}

func (a *RcloneAdapter) Rename(ctx context.Context, oldPath, newPath string) error {
	// rclone doesn't have a native rename; use move
	return a.client.Copy(ctx, a.remoteName+":"+oldPath, a.remoteName, newPath)
}

func (a *RcloneAdapter) Move(ctx context.Context, srcPath, destPath string) error {
	// rclone move via copy + delete
	if err := a.client.Copy(ctx, a.remoteName+":"+srcPath, a.remoteName, destPath); err != nil {
		return err
	}
	return a.client.Delete(ctx, a.remoteName, srcPath)
}

func (a *RcloneAdapter) TestConnection(ctx context.Context) (*TestResult, error) {
	start := time.Now()
	err := a.client.HealthCheck(ctx, a.remoteName)
	elapsed := time.Since(start)

	if err != nil {
		return &TestResult{
			Success:      false,
			Message:      fmt.Sprintf("Connection failed: %v", err),
			ResponseTime: elapsed,
		}, nil
	}

	// Get quota info
	quota, quotaErr := a.About(ctx)
	result := &TestResult{
		Success:      true,
		Message:      "Connection successful",
		ResponseTime: elapsed,
	}
	if quotaErr == nil && quota != nil {
		result.TotalBytes = quota.TotalBytes
		result.UsedBytes = quota.UsedBytes
		result.FreeBytes = quota.FreeBytes
	}

	return result, nil
}

func (a *RcloneAdapter) FileExists(ctx context.Context, remotePath string) (bool, error) {
	return a.client.FileExists(ctx, a.remoteName, remotePath)
}

// ─── Helpers ────────────────────────────────────────────────────────────────

func convertFileInfos(files []rclone.FileInfo) []StorageFileInfo {
	result := make([]StorageFileInfo, len(files))
	for i, f := range files {
		result[i] = StorageFileInfo{
			Path:     f.Path,
			Name:     f.Name,
			Size:     f.Size,
			MimeType: f.MimeType,
			ModTime:  f.ModTime,
			IsDir:    f.IsDir,
		}
	}
	return result
}
