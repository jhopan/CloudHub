package worker

import (
	"context"
	"log"
	"storage-gateway/internal/config"
	"storage-gateway/internal/rclone"
	"storage-gateway/internal/repository"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

type Runner struct {
	db     *pgxpool.Pool
	redis  *redis.Client
	cfg    *config.Config
	ctx    context.Context
	cancel context.CancelFunc
	wg     sync.WaitGroup
}

func NewRunner(db *pgxpool.Pool, redis *redis.Client, cfg *config.Config) *Runner {
	ctx, cancel := context.WithCancel(context.Background())
	return &Runner{
		db:     db,
		redis:  redis,
		cfg:    cfg,
		ctx:    ctx,
		cancel: cancel,
	}
}

func (r *Runner) Start() {
	log.Println("Starting background workers...")

	// Start Retry Worker
	transferLogRepo := repository.NewTransferLogRepository(r.db)
	retryWorker := NewRetryWorker(transferLogRepo, 30*time.Second)
	r.wg.Add(1)
	go func() {
		defer r.wg.Done()
		retryWorker.Start(r.ctx)
	}()

	// Start Health Check Worker
	accountRepo := repository.NewStorageAccountRepository(r.db)
	rcloneClient := rclone.NewClient("rclone", "")
	healthCheckWorker := NewHealthCheckWorker(accountRepo, rcloneClient, 5*time.Minute)
	r.wg.Add(1)
	go func() {
		defer r.wg.Done()
		healthCheckWorker.Start(r.ctx)
	}()

	// Start Capacity Refresh Worker
	capacityWorker := NewCapacityRefreshWorker(accountRepo, rcloneClient, 15*time.Minute)
	r.wg.Add(1)
	go func() {
		defer r.wg.Done()
		capacityWorker.Start(r.ctx)
	}()

	// Start Orphan Cleanup Worker
	fileRepo := repository.NewFileRepository(r.db)
	orphanWorker := NewOrphanCleanupWorker(fileRepo, accountRepo, rcloneClient, 1*time.Hour)
	r.wg.Add(1)
	go func() {
		defer r.wg.Done()
		orphanWorker.Start(r.ctx)
	}()

	log.Println("✓ All workers started")
}

func (r *Runner) Stop() {
	log.Println("Stopping background workers...")
	r.cancel()
	r.wg.Wait()
	log.Println("✓ All workers stopped")
}
