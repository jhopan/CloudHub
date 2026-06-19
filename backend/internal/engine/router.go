package engine

import (
	"context"
	"fmt"
	"log"
	"sync"

	"github.com/google/uuid"

	"storage-gateway/internal/rclone"
)

// ─── AccountEngineConfig ────────────────────────────────────────────────────

// AccountEngineConfig holds the configuration needed to create an engine
// for a specific storage account.
type AccountEngineConfig struct {
	AccountID      uuid.UUID
	EngineType     string // "rclone" or "direct_api"
	RcloneRemote   string // rclone remote name (for rclone engine)
	ProviderType   string // "gdrive", "onedrive", "dropbox", etc.
	CredentialsJSON []byte // encrypted credentials (for direct API)
}

// ─── Router ─────────────────────────────────────────────────────────────────

// Router manages engine instances and routes operations to the correct engine
// based on the account's engine type.
type Router struct {
	mu          sync.RWMutex
	rcloneClient *rclone.Client
	engines     map[uuid.UUID]StorageEngine // accountID → engine
}

// NewRouter creates a new Engine Router.
func NewRouter(rcloneClient *rclone.Client) *Router {
	return &Router{
		rcloneClient: rcloneClient,
		engines:      make(map[uuid.UUID]StorageEngine),
	}
}

// RegisterEngine registers a StorageEngine for a specific account.
func (r *Router) RegisterEngine(accountID uuid.UUID, engine StorageEngine) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.engines[accountID] = engine
	log.Printf("[engine-router] registered %s engine for account %s", engine.Name(), accountID)
}

// UnregisterEngine removes an engine for a specific account.
func (r *Router) UnregisterEngine(accountID uuid.UUID) {
	r.mu.Lock()
	defer r.mu.Unlock()
	delete(r.engines, accountID)
	log.Printf("[engine-router] unregistered engine for account %s", accountID)
}

// GetEngine returns the StorageEngine for a given account.
// If no engine is registered, it creates one based on the config.
func (r *Router) GetEngine(config AccountEngineConfig) (StorageEngine, error) {
	r.mu.RLock()
	if eng, ok := r.engines[config.AccountID]; ok {
		r.mu.RUnlock()
		return eng, nil
	}
	r.mu.RUnlock()

	// Create engine based on type
	eng, err := r.createEngine(config)
	if err != nil {
		return nil, err
	}

	// Cache it
	r.RegisterEngine(config.AccountID, eng)
	return eng, nil
}

// GetEngineByAccount is a convenience method that takes just the account ID
// and looks up the engine. Returns error if not found.
func (r *Router) GetEngineByAccount(accountID uuid.UUID) (StorageEngine, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	eng, ok := r.engines[accountID]
	if !ok {
		return nil, fmt.Errorf("no engine registered for account %s", accountID)
	}
	return eng, nil
}

// createEngine creates a new engine based on the config.
func (r *Router) createEngine(config AccountEngineConfig) (StorageEngine, error) {
	switch config.EngineType {
	case EngineTypeRclone, "":
		// Default to rclone for backward compatibility
		if config.RcloneRemote == "" {
			return nil, fmt.Errorf("rclone remote name required for rclone engine")
		}
		return NewRcloneAdapter(r.rcloneClient, config.RcloneRemote), nil

	case EngineTypeDirectAPI:
		// Phase 2+ will add direct API adapters here
		// For now, return an error indicating it's not yet implemented
		return nil, fmt.Errorf("direct_api engine for provider %q is not yet implemented (coming in Phase 2+)", config.ProviderType)

	default:
		return nil, fmt.Errorf("unknown engine type: %s", config.EngineType)
	}
}

// RegisterFromAccounts bulk-registers engines from a list of account configs.
// Useful at startup to pre-cache all existing accounts.
func (r *Router) RegisterFromAccounts(configs []AccountEngineConfig) {
	for _, cfg := range configs {
		eng, err := r.createEngine(cfg)
		if err != nil {
			log.Printf("[engine-router] warning: failed to create engine for account %s: %v", cfg.AccountID, err)
			continue
		}
		r.RegisterEngine(cfg.AccountID, eng)
	}
}

// ListEngines returns all registered engines (for debugging/admin).
func (r *Router) ListEngines() map[uuid.UUID]string {
	r.mu.RLock()
	defer r.mu.RUnlock()
	result := make(map[uuid.UUID]string)
	for id, eng := range r.engines {
		result[id] = eng.Name()
	}
	return result
}

// ─── Context Helper ─────────────────────────────────────────────────────────

type contextKey string

const engineContextKey contextKey = "storage_engine"

// WithEngine attaches a StorageEngine to the context.
func WithEngine(ctx context.Context, eng StorageEngine) context.Context {
	return context.WithValue(ctx, engineContextKey, eng)
}

// EngineFromContext retrieves the StorageEngine from context.
func EngineFromContext(ctx context.Context) (StorageEngine, bool) {
	eng, ok := ctx.Value(engineContextKey).(StorageEngine)
	return eng, ok
}
