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
	ticker := time.NewTicker(w.interval)
	defer ticker.Stop()

	log.Println("Health check worker started")

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

	log.Printf("Health check: checking %d storage accounts", len(accounts))

	for _, account := range accounts {
		if !account.IsActive {
			continue
		}

		// Check health using rclone about
		aboutInfo, err := w.rcloneClient.About(ctx, account.RcloneRemoteName)
		
		now := time.Now()
		if err != nil {
			log.Printf("Health check: %s (%s) UNHEALTHY: %v", account.Label, account.RcloneRemoteName, err)
			account.HealthStatus = "unhealthy"
		} else {
			log.Printf("Health check: %s (%s) HEALTHY", account.Label, account.RcloneRemoteName)
			account.HealthStatus = model.HealthStatusHealthy
			// Update capacity info from rclone about
			if aboutInfo != nil && aboutInfo.Total > 0 {
				account.CapacityBytes = aboutInfo.Total
				account.UsedBytes = aboutInfo.Used
			}
		}
		account.LastHealthCheck = &now

		// Use UpdateHealth to avoid overwriting credentials
		if err := w.accountRepo.UpdateHealth(ctx, account); err != nil {
			log.Printf("Health check: failed to update account %s: %v", account.ID, err)
		}
	}
}
