package engine

import (
	"context"
	"testing"

	"github.com/google/uuid"
)

// ─── Test: Router Register & Get ────────────────────────────────────────────

func TestRouterRegisterAndGet(t *testing.T) {
	t.Run("register and retrieve engine", func(t *testing.T) {
		router := NewRouter(nil) // nil rclone client for unit tests
		accountID := uuid.New()
		mock := NewMockEngine("rclone")

		router.RegisterEngine(accountID, mock)

		eng, err := router.GetEngineByAccount(accountID)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if eng.Name() != "rclone" {
			t.Errorf("expected engine name 'rclone', got %q", eng.Name())
		}
	})

	t.Run("get unregistered engine returns error", func(t *testing.T) {
		router := NewRouter(nil)
		_, err := router.GetEngineByAccount(uuid.New())
		if err == nil {
			t.Fatal("expected error for unregistered account")
		}
	})
}

// ─── Test: Router Unregister ────────────────────────────────────────────────

func TestRouterUnregister(t *testing.T) {
	t.Run("unregister removes engine", func(t *testing.T) {
		router := NewRouter(nil)
		accountID := uuid.New()
		mock := NewMockEngine("rclone")

		router.RegisterEngine(accountID, mock)
		router.UnregisterEngine(accountID)

		_, err := router.GetEngineByAccount(accountID)
		if err == nil {
			t.Fatal("expected error after unregister")
		}
	})
}

// ─── Test: Router GetEngine with Config ─────────────────────────────────────

func TestRouterGetEngineWithConfig(t *testing.T) {
	t.Run("returns cached engine if registered", func(t *testing.T) {
		router := NewRouter(nil)
		accountID := uuid.New()
		mock := NewMockEngine("cached-engine")
		router.RegisterEngine(accountID, mock)

		eng, err := router.GetEngine(AccountEngineConfig{
			AccountID:  accountID,
			EngineType: EngineTypeRclone,
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if eng.Name() != "cached-engine" {
			t.Errorf("expected 'cached-engine', got %q", eng.Name())
		}
	})

	t.Run("direct_api returns not implemented error", func(t *testing.T) {
		router := NewRouter(nil)

		_, err := router.GetEngine(AccountEngineConfig{
			AccountID:    uuid.New(),
			EngineType:   EngineTypeDirectAPI,
			ProviderType: "gdrive",
		})
		if err == nil {
			t.Fatal("expected error for unimplemented direct_api")
		}
	})

	t.Run("unknown engine type returns error", func(t *testing.T) {
		router := NewRouter(nil)

		_, err := router.GetEngine(AccountEngineConfig{
			AccountID:  uuid.New(),
			EngineType: "unknown_engine",
		})
		if err == nil {
			t.Fatal("expected error for unknown engine type")
		}
	})

	t.Run("rclone without remote name returns error", func(t *testing.T) {
		router := NewRouter(nil)

		_, err := router.GetEngine(AccountEngineConfig{
			AccountID:    uuid.New(),
			EngineType:   EngineTypeRclone,
			RcloneRemote: "", // empty
		})
		if err == nil {
			t.Fatal("expected error for empty rclone remote")
		}
	})
}

// ─── Test: Router ListEngines ───────────────────────────────────────────────

func TestRouterListEngines(t *testing.T) {
	t.Run("list all registered engines", func(t *testing.T) {
		router := NewRouter(nil)
		id1 := uuid.New()
		id2 := uuid.New()

		router.RegisterEngine(id1, NewMockEngine("rclone"))
		router.RegisterEngine(id2, NewMockEngine("direct_api"))

		engines := router.ListEngines()
		if len(engines) != 2 {
			t.Fatalf("expected 2 engines, got %d", len(engines))
		}
		if engines[id1] != "rclone" {
			t.Errorf("expected 'rclone' for id1, got %q", engines[id1])
		}
		if engines[id2] != "direct_api" {
			t.Errorf("expected 'direct_api' for id2, got %q", engines[id2])
		}
	})
}

// ─── Test: Context Helpers ──────────────────────────────────────────────────

func TestContextHelpers(t *testing.T) {
	t.Run("WithEngine and EngineFromContext", func(t *testing.T) {
		mock := NewMockEngine("ctx-engine")
		ctx := WithEngine(context.Background(), mock)

		eng, ok := EngineFromContext(ctx)
		if !ok {
			t.Fatal("engine not found in context")
		}
		if eng.Name() != "ctx-engine" {
			t.Errorf("expected 'ctx-engine', got %q", eng.Name())
		}
	})

	t.Run("EngineFromContext without engine", func(t *testing.T) {
		_, ok := EngineFromContext(context.Background())
		if ok {
			t.Fatal("expected no engine in empty context")
		}
	})
}

// ─── Test: StorageFileInfo ──────────────────────────────────────────────────

func TestStorageFileInfo(t *testing.T) {
	t.Run("file info fields", func(t *testing.T) {
		fi := StorageFileInfo{
			Path:     "/docs/readme.md",
			Name:     "readme.md",
			Size:     1024,
			MimeType: "text/markdown",
			IsDir:    false,
		}
		if fi.Path != "/docs/readme.md" {
			t.Errorf("unexpected path: %s", fi.Path)
		}
		if fi.IsDir {
			t.Error("expected IsDir=false")
		}
	})
}

// ─── Test: StorageQuota ─────────────────────────────────────────────────────

func TestStorageQuota(t *testing.T) {
	t.Run("quota calculation", func(t *testing.T) {
		q := StorageQuota{
			TotalBytes: 16106127360,
			UsedBytes:  12246718,
			FreeBytes:  16093880642,
		}
		if q.TotalBytes-q.UsedBytes != q.FreeBytes {
			t.Error("quota math doesn't add up")
		}
	})
}
