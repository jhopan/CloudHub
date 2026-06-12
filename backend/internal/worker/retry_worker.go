package worker

import (
	"context"
	"fmt"
	"log"
	"math"
	"time"

	"storage-gateway/internal/model"
	"storage-gateway/internal/repository"
)

// RetryWorker handles retrying failed transfers
type RetryWorker struct {
	transferLogRepo *repository.TransferLogRepository
	interval        time.Duration
}

// NewRetryWorker creates a new retry worker
func NewRetryWorker(transferLogRepo *repository.TransferLogRepository, interval time.Duration) *RetryWorker {
	return &RetryWorker{
		transferLogRepo: transferLogRepo,
		interval:        interval,
	}
}

// Start begins the retry worker loop
func (w *RetryWorker) Start(ctx context.Context) {
	ticker := time.NewTicker(w.interval)
	defer ticker.Stop()

	log.Println("Retry worker started")

	for {
		select {
		case <-ctx.Done():
			log.Println("Retry worker stopped")
			return
		case <-ticker.C:
			w.processRetries(ctx)
		}
	}
}

func (w *RetryWorker) processRetries(ctx context.Context) {
	// Get failed transfers that can be retried
	failedLogs, err := w.transferLogRepo.GetFailedWithRetries(ctx)
	if err != nil {
		log.Printf("Retry worker: failed to get failed logs: %v", err)
		return
	}

	if len(failedLogs) == 0 {
		return
	}

	log.Printf("Retry worker: found %d failed transfers to retry", len(failedLogs))

	for _, transferLog := range failedLogs {
		// Check if enough time has passed (exponential backoff)
		if !w.shouldRetry(transferLog) {
			continue
		}

		log.Printf("Retry worker: retrying transfer %s (attempt %d/%d)", 
			transferLog.ID.String(), transferLog.RetryCount+1, transferLog.MaxRetries)

		// Increment retry count
		if err := w.transferLogRepo.IncrementRetry(ctx, transferLog.ID); err != nil {
			log.Printf("Retry worker: failed to increment retry: %v", err)
			continue
		}

		// TODO: Implement actual retry logic based on operation type
		// For now, just mark as failed again to test the retry mechanism
		// In production, you'd re-execute the upload/download/delete operation
		errMsg := fmt.Sprintf("Retry %d: operation not yet implemented", transferLog.RetryCount+1)
		w.transferLogRepo.UpdateStatus(ctx, transferLog.ID, model.StatusFailed, 0, &errMsg)
	}
}

// shouldRetry checks if enough time has passed for exponential backoff
func (w *RetryWorker) shouldRetry(transferLog *model.TransferLog) bool {
	if transferLog.CompletedAt == nil {
		return false
	}

	// Exponential backoff: 2^retry_count * 30 seconds
	backoffSeconds := math.Pow(2, float64(transferLog.RetryCount)) * 30
	backoffDuration := time.Duration(backoffSeconds) * time.Second

	timeSinceFailure := time.Since(*transferLog.CompletedAt)
	return timeSinceFailure >= backoffDuration
}
