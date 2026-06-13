package worker

import (
	"context"
	"log"
	"time"

	"storage-gateway/internal/model"
	"storage-gateway/internal/rclone"
	"storage-gateway/internal/repository"
)

// HealthCheckWorker periodically checks storage account health
type HealthCheckWorker struct {
	accountRepo  *repository.StorageAccountRepository
	rcloneClient *rclone.Client
	interval     time.Duration
}

// NewHealthCheckWorker creates a new health check worker
func NewHealthCheckWorker(accountRepo *repository.StorageAccountRepository, rcloneClient *rclone.Client, interval time.Duration) *HealthCheckWorker {
	return &HealthCheckWorker{
		accountRepo:  accountRepo,
		rcloneClient: rcloneClient,
		interval:     interval,
	}
}

// Start begins the health check worker loop
func (w *HealthCheckWorker) Start(ctx context.Context) {
	// Run initial health check immediately on startup
	log.Println("Health check worker: running initial check...")
	w.checkHealth(ctx)

	ticker := time.NewTicker(w.interval)
	defer ticker.Stop()

	log.Println("Health check worker started (interval: " + w.interval.String() + ")")

	for {
		select {
		case <-ctx.Done():
			log.Println("Health check worker stopped")
			return
		case <-ticker.C:
			w.checkHealth(ctx)
		}
	}
}

func (w *HealthCheckWorker) checkHealth(ctx context.Context) {
	accounts, err := w.accountRepo.GetAll(ctx)
	if err != nil {
		log.Printf("Health check: failed to get accounts: %v", err)
		return
	}

	if len(accounts) == 0 {
		return
	}

	for _, account := range accounts {
		if !account.IsActive {
			continue
		}

		// Check health using rclone about
		aboutInfo, err := w.rcloneClient.About(ctx, account.RcloneRemoteName)

		now := time.Now()
		var newStatus string
		if err != nil {
			newStatus = "unhealthy"
		} else {
			newStatus = model.HealthStatusHealthy
			// Always update capacity info from rclone about
			if aboutInfo != nil && aboutInfo.Total > 0 {
				account.CapacityBytes = aboutInfo.Total
				account.UsedBytes = aboutInfo.Used
			}
		}

		// Only log and update DB when status CHANGES
		statusChanged := account.HealthStatus != newStatus
		if statusChanged {
			log.Printf("Health check: %s status changed: %s → %s", account.Label, account.HealthStatus, newStatus)
			account.HealthStatus = newStatus
		}
		account.LastHealthCheck = &now

		// Update health + capacity in DB
		if err := w.accountRepo.UpdateHealth(ctx, account); err != nil {
			log.Printf("Health check: failed to update account %s: %v", account.ID, err)
		}
	}
}
