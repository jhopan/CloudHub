package engine

import (
	"context"
	"fmt"
	"io"
	"strings"
	"testing"
	"time"
)

// ─── Compile-time interface compliance check ────────────────────────────────

// This ensures RcloneAdapter implements StorageEngine at compile time.
var _ StorageEngine = (*RcloneAdapter)(nil)
// MockEngine also implements StorageEngine for testing.
var _ StorageEngine = (*MockEngine)(nil)

// ─── MockEngine for testing ─────────────────────────────────────────────────

// MockEngine is a test double that implements StorageEngine.
type MockEngine struct {
	name           string
	uploadErr      error
	downloadData   string
	downloadErr    error
	listFiles      []StorageFileInfo
	listErr        error
	aboutQuota     *StorageQuota
	aboutErr       error
	deleteErr      error
	mkdirErr       error
	renameErr      error
	moveErr        error
	testResult     *TestResult
	testErr        error
	fileExists     bool
	fileExistsErr  error

	// Track calls for assertions
	uploadCalled   bool
	uploadReq      *UploadRequest
	deletePath     string
	mkdirPath      string
	renameOld      string
	renameNew      string
	moveSrc        string
	moveDest       string
}

func NewMockEngine(name string) *MockEngine {
	return &MockEngine{name: name}
}

func (m *MockEngine) Name() string { return m.name }

func (m *MockEngine) Upload(ctx context.Context, req UploadRequest) error {
	m.uploadCalled = true
	m.uploadReq = &req
	return m.uploadErr
}

func (m *MockEngine) Download(ctx context.Context, remotePath string) (*DownloadResult, error) {
	if m.downloadErr != nil {
		return nil, m.downloadErr
	}
	return &DownloadResult{
		Stream:   io.NopCloser(strings.NewReader(m.downloadData)),
		MimeType: "text/plain",
		Size:     int64(len(m.downloadData)),
	}, nil
}

func (m *MockEngine) List(ctx context.Context, path string) ([]StorageFileInfo, error) {
	return m.listFiles, m.listErr
}

func (m *MockEngine) ListRecursive(ctx context.Context, path string) ([]StorageFileInfo, error) {
	return m.listFiles, m.listErr
}

func (m *MockEngine) About(ctx context.Context) (*StorageQuota, error) {
	return m.aboutQuota, m.aboutErr
}

func (m *MockEngine) Delete(ctx context.Context, remotePath string) error {
	m.deletePath = remotePath
	return m.deleteErr
}

func (m *MockEngine) Mkdir(ctx context.Context, remotePath string) error {
	m.mkdirPath = remotePath
	return m.mkdirErr
}

func (m *MockEngine) Rename(ctx context.Context, oldPath, newPath string) error {
	m.renameOld = oldPath
	m.renameNew = newPath
	return m.renameErr
}

func (m *MockEngine) Move(ctx context.Context, srcPath, destPath string) error {
	m.moveSrc = srcPath
	m.moveDest = destPath
	return m.moveErr
}

func (m *MockEngine) TestConnection(ctx context.Context) (*TestResult, error) {
	return m.testResult, m.testErr
}

func (m *MockEngine) FileExists(ctx context.Context, remotePath string) (bool, error) {
	return m.fileExists, m.fileExistsErr
}

// ─── Test: Interface Compliance ─────────────────────────────────────────────

func TestStorageEngineInterface(t *testing.T) {
	t.Run("MockEngine implements StorageEngine", func(t *testing.T) {
		var eng StorageEngine = NewMockEngine("mock")
		if eng.Name() != "mock" {
			t.Errorf("expected name 'mock', got %q", eng.Name())
		}
	})
}

// ─── Test: MockEngine Upload ────────────────────────────────────────────────

func TestMockEngineUpload(t *testing.T) {
	t.Run("successful upload", func(t *testing.T) {
		eng := NewMockEngine("test")
		ctx := context.Background()

		req := UploadRequest{
			Reader:     strings.NewReader("hello world"),
			RemotePath: "/test.txt",
			FileName:   "test.txt",
			MimeType:   "text/plain",
			Size:       11,
		}

		err := eng.Upload(ctx, req)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !eng.uploadCalled {
			t.Fatal("Upload was not called")
		}
		if eng.uploadReq.FileName != "test.txt" {
			t.Errorf("expected filename 'test.txt', got %q", eng.uploadReq.FileName)
		}
	})

	t.Run("upload error", func(t *testing.T) {
		eng := NewMockEngine("test")
		eng.uploadErr = fmt.Errorf("disk full")
		ctx := context.Background()

		err := eng.Upload(ctx, UploadRequest{
			Reader:     strings.NewReader("data"),
			RemotePath: "/fail.txt",
			FileName:   "fail.txt",
		})
		if err == nil {
			t.Fatal("expected error, got nil")
		}
		if err.Error() != "disk full" {
			t.Errorf("expected 'disk full', got %q", err.Error())
		}
	})
}

// ─── Test: MockEngine Download ──────────────────────────────────────────────

func TestMockEngineDownload(t *testing.T) {
	t.Run("successful download", func(t *testing.T) {
		eng := NewMockEngine("test")
		eng.downloadData = "file content here"
		ctx := context.Background()

		result, err := eng.Download(ctx, "/test.txt")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		defer result.Stream.Close()

		data, _ := io.ReadAll(result.Stream)
		if string(data) != "file content here" {
			t.Errorf("expected 'file content here', got %q", string(data))
		}
		if result.Size != 17 {
			t.Errorf("expected size 17, got %d", result.Size)
		}
	})

	t.Run("download error", func(t *testing.T) {
		eng := NewMockEngine("test")
		eng.downloadErr = fmt.Errorf("file not found")
		ctx := context.Background()

		_, err := eng.Download(ctx, "/missing.txt")
		if err == nil {
			t.Fatal("expected error, got nil")
		}
	})
}

// ─── Test: MockEngine List ──────────────────────────────────────────────────

func TestMockEngineList(t *testing.T) {
	t.Run("list files", func(t *testing.T) {
		eng := NewMockEngine("test")
		eng.listFiles = []StorageFileInfo{
			{Name: "file1.txt", Size: 100, IsDir: false, Path: "/file1.txt"},
			{Name: "folder", Size: 0, IsDir: true, Path: "/folder"},
			{Name: "file2.pdf", Size: 5000, IsDir: false, Path: "/file2.pdf"},
		}
		ctx := context.Background()

		files, err := eng.List(ctx, "/")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(files) != 3 {
			t.Fatalf("expected 3 files, got %d", len(files))
		}
		if files[0].Name != "file1.txt" {
			t.Errorf("expected 'file1.txt', got %q", files[0].Name)
		}
		if !files[1].IsDir {
			t.Error("expected folder to be a directory")
		}
		if files[2].Size != 5000 {
			t.Errorf("expected size 5000, got %d", files[2].Size)
		}
	})
}

// ─── Test: MockEngine About ─────────────────────────────────────────────────

func TestMockEngineAbout(t *testing.T) {
	t.Run("get quota", func(t *testing.T) {
		eng := NewMockEngine("test")
		eng.aboutQuota = &StorageQuota{
			TotalBytes: 16106127360, // 15 GB
			UsedBytes:  12246718,    // ~12 MB
			FreeBytes:  16093880642,
		}
		ctx := context.Background()

		quota, err := eng.About(ctx)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if quota.TotalBytes != 16106127360 {
			t.Errorf("expected 16106127360 total, got %d", quota.TotalBytes)
		}
		if quota.UsedBytes != 12246718 {
			t.Errorf("expected 12246718 used, got %d", quota.UsedBytes)
		}
	})
}

// ─── Test: MockEngine Delete ────────────────────────────────────────────────

func TestMockEngineDelete(t *testing.T) {
	t.Run("successful delete", func(t *testing.T) {
		eng := NewMockEngine("test")
		ctx := context.Background()

		err := eng.Delete(ctx, "/old-file.txt")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if eng.deletePath != "/old-file.txt" {
			t.Errorf("expected path '/old-file.txt', got %q", eng.deletePath)
		}
	})
}

// ─── Test: MockEngine Mkdir ─────────────────────────────────────────────────

func TestMockEngineMkdir(t *testing.T) {
	t.Run("create directory", func(t *testing.T) {
		eng := NewMockEngine("test")
		ctx := context.Background()

		err := eng.Mkdir(ctx, "/new-folder")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if eng.mkdirPath != "/new-folder" {
			t.Errorf("expected path '/new-folder', got %q", eng.mkdirPath)
		}
	})
}

// ─── Test: MockEngine Rename ────────────────────────────────────────────────

func TestMockEngineRename(t *testing.T) {
	t.Run("rename file", func(t *testing.T) {
		eng := NewMockEngine("test")
		ctx := context.Background()

		err := eng.Rename(ctx, "/old.txt", "/new.txt")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if eng.renameOld != "/old.txt" {
			t.Errorf("expected old '/old.txt', got %q", eng.renameOld)
		}
		if eng.renameNew != "/new.txt" {
			t.Errorf("expected new '/new.txt', got %q", eng.renameNew)
		}
	})
}

// ─── Test: MockEngine Move ──────────────────────────────────────────────────

func TestMockEngineMove(t *testing.T) {
	t.Run("move file", func(t *testing.T) {
		eng := NewMockEngine("test")
		ctx := context.Background()

		err := eng.Move(ctx, "/src/file.txt", "/dest/file.txt")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if eng.moveSrc != "/src/file.txt" {
			t.Errorf("expected src '/src/file.txt', got %q", eng.moveSrc)
		}
		if eng.moveDest != "/dest/file.txt" {
			t.Errorf("expected dest '/dest/file.txt', got %q", eng.moveDest)
		}
	})
}

// ─── Test: MockEngine TestConnection ────────────────────────────────────────

func TestMockEngineTestConnection(t *testing.T) {
	t.Run("successful connection", func(t *testing.T) {
		eng := NewMockEngine("test")
		eng.testResult = &TestResult{
			Success:      true,
			Message:      "Connection successful",
			ResponseTime: 150 * time.Millisecond,
			TotalBytes:   16106127360,
			FreeBytes:    16093880642,
		}
		ctx := context.Background()

		result, err := eng.TestConnection(ctx)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !result.Success {
			t.Error("expected success")
		}
		if result.TotalBytes != 16106127360 {
			t.Errorf("expected total 16106127360, got %d", result.TotalBytes)
		}
	})

	t.Run("failed connection", func(t *testing.T) {
		eng := NewMockEngine("test")
		eng.testResult = &TestResult{
			Success: false,
			Message: "Connection refused",
		}
		ctx := context.Background()

		result, err := eng.TestConnection(ctx)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if result.Success {
			t.Error("expected failure")
		}
	})
}

// ─── Test: MockEngine FileExists ────────────────────────────────────────────

func TestMockEngineFileExists(t *testing.T) {
	t.Run("file exists", func(t *testing.T) {
		eng := NewMockEngine("test")
		eng.fileExists = true
		ctx := context.Background()

		exists, err := eng.FileExists(ctx, "/test.txt")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !exists {
			t.Error("expected file to exist")
		}
	})

	t.Run("file not exists", func(t *testing.T) {
		eng := NewMockEngine("test")
		eng.fileExists = false
		ctx := context.Background()

		exists, err := eng.FileExists(ctx, "/missing.txt")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if exists {
			t.Error("expected file to not exist")
		}
	})
}
