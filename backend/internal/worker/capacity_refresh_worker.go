package worker

import (
	"context"
	"log"
	"time"

	"storage-gateway/internal/rclone"
	"storage-gateway/internal/repository"
)

// CapacityRefreshWorker periodically refreshes storage account capacity using rclone about
type CapacityRefreshWorker struct {
	accountRepo  *repository.StorageAccountRepository
	rcloneClient *rclone.Client
	interval     time.Duration
}

// NewCapacityRefreshWorker creates a new capacity refresh worker
func NewCapacityRefreshWorker(accountRepo *repository.StorageAccountRepository, rcloneClient *rclone.Client, interval time.Duration) *CapacityRefreshWorker {
	return &CapacityRefreshWorker{
		accountRepo:  accountRepo,
		rcloneClient: rcloneClient,
		interval:     interval,
	}
}

// Start begins the capacity refresh worker loop
func (w *CapacityRefreshWorker) Start(ctx context.Context) {
	ticker := time.NewTicker(w.interval)
	defer ticker.Stop()

	log.Printf("Capacity refresh worker started (interval: %v)", w.interval)

	for {
		select {
		case <-ctx.Done():
			log.Println("Capacity refresh worker stopped")
			return
		case <-ticker.C:
			w.refreshCapacities(ctx)
		}
	}
}

func (w *CapacityRefreshWorker) refreshCapacities(ctx context.Context) {
	accounts, err := w.accountRepo.GetAll(ctx)
	if err != nil {
		log.Printf("Capacity refresh: failed to get accounts: %v", err)
		return
	}

	if len(accounts) == 0 {
		return
	}

	log.Printf("Capacity refresh: updating %d storage accounts", len(accounts))

	for _, account := range accounts {
		if !account.IsActive {
			continue
		}

		// Get capacity info from rclone
		about, err := w.rcloneClient.About(ctx, account.RcloneRemoteName)
		if err != nil {
			log.Printf("Capacity refresh: failed to get about for %s: %v", account.RcloneRemoteName, err)
			continue
		}

		// Update account with new capacity data
		now := time.Now()
		account.CapacityBytes = about.Total
		account.UsedBytes = about.Used
		account.LastCapacitySync = &now
		account.HealthStatus = "healthy"
		account.LastHealthCheck = &now

		if err := w.accountRepo.UpdateHealth(ctx, account); err != nil {
			log.Printf("Capacity refresh: failed to update account %s: %v", account.ID, err)
			continue
		}

		log.Printf("Capacity refresh: %s - Total: %d, Used: %d, Free: %d",
			account.RcloneRemoteName, about.Total, about.Used, about.Free)
	}
}
