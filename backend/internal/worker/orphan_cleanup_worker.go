package worker

import (
	"context"
	"log"
	"time"

	"storage-gateway/internal/rclone"
	"storage-gateway/internal/repository"
)

// OrphanCleanupWorker periodically reconciles DB metadata with actual remote state
type OrphanCleanupWorker struct {
	fileRepo     *repository.FileRepository
	accountRepo  *repository.StorageAccountRepository
	rcloneClient *rclone.Client
	interval     time.Duration
}

// NewOrphanCleanupWorker creates a new orphan cleanup worker
func NewOrphanCleanupWorker(fileRepo *repository.FileRepository, accountRepo *repository.StorageAccountRepository, rcloneClient *rclone.Client, interval time.Duration) *OrphanCleanupWorker {
	return &OrphanCleanupWorker{
		fileRepo:     fileRepo,
		accountRepo:  accountRepo,
		rcloneClient: rcloneClient,
		interval:     interval,
	}
}

// Start begins the orphan cleanup worker loop
func (w *OrphanCleanupWorker) Start(ctx context.Context) {
	ticker := time.NewTicker(w.interval)
	defer ticker.Stop()

	log.Printf("Orphan cleanup worker started (interval: %v)", w.interval)

	for {
		select {
		case <-ctx.Done():
			log.Println("Orphan cleanup worker stopped")
			return
		case <-ticker.C:
			w.cleanupOrphans(ctx)
		}
	}
}

func (w *OrphanCleanupWorker) cleanupOrphans(ctx context.Context) {
	// Get all file locations
	locations, err := w.fileRepo.GetAllLocations(ctx)
	if err != nil {
		log.Printf("Orphan cleanup: failed to get locations: %v", err)
		return
	}

	if len(locations) == 0 {
		return
	}

	log.Printf("Orphan cleanup: checking %d file locations", len(locations))

	orphans := 0
	for _, loc := range locations {
		// Get the storage account
		account, err := w.accountRepo.GetByID(ctx, loc.AccountID)
		if err != nil {
			log.Printf("Orphan cleanup: failed to get account %s: %v", loc.AccountID, err)
			continue
		}

		// Check if file exists in remote
		exists, err := w.rcloneClient.FileExists(ctx, account.RcloneRemoteName, loc.RemotePath)
		if err != nil {
			log.Printf("Orphan cleanup: failed to check %s:%s: %v", account.RcloneRemoteName, loc.RemotePath, err)
			continue
		}

		if !exists {
			// File doesn't exist in remote - orphaned metadata
			log.Printf("Orphan cleanup: found orphan - file %s, location %s:%s", loc.FileID, account.RcloneRemoteName, loc.RemotePath)
			
			// Delete the orphaned location
			if err := w.fileRepo.DeleteLocation(ctx, loc.ID); err != nil {
				log.Printf("Orphan cleanup: failed to delete location %s: %v", loc.ID, err)
				continue
			}

			orphans++
		}
	}

	if orphans > 0 {
		log.Printf("Orphan cleanup: cleaned up %d orphaned locations", orphans)
	}
}
