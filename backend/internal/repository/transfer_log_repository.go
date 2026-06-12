package repository

import (
	"context"
	"fmt"
	"time"

	"storage-gateway/internal/model"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type TransferLogRepository struct {
	db *pgxpool.Pool
}

func NewTransferLogRepository(db *pgxpool.Pool) *TransferLogRepository {
	return &TransferLogRepository{db: db}
}

func (r *TransferLogRepository) Create(ctx context.Context, log *model.TransferLog) error {
	query := `
		INSERT INTO transfer_logs (id, file_id, user_id, account_id, operation, status, bytes_transferred, retry_count, max_retries, started_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		RETURNING created_at
	`
	return r.db.QueryRow(ctx, query,
		log.ID, log.FileID, log.UserID, log.AccountID, log.Operation, log.Status,
		log.BytesTransferred, log.RetryCount, log.MaxRetries, log.StartedAt,
	).Scan(&log.CreatedAt)
}

func (r *TransferLogRepository) UpdateStatus(ctx context.Context, id uuid.UUID, status string, bytesTransferred int64, errorMessage *string) error {
	now := time.Now()
	query := `
		UPDATE transfer_logs
		SET status = $1, bytes_transferred = $2, error_message = $3, completed_at = $4
		WHERE id = $5
	`
	_, err := r.db.Exec(ctx, query, status, bytesTransferred, errorMessage, &now, id)
	return err
}

func (r *TransferLogRepository) IncrementRetry(ctx context.Context, id uuid.UUID) error {
	query := `
		UPDATE transfer_logs
		SET retry_count = retry_count + 1, status = $1
		WHERE id = $2
	`
	_, err := r.db.Exec(ctx, query, model.StatusRetrying, id)
	return err
}

func (r *TransferLogRepository) GetByUserID(ctx context.Context, userID uuid.UUID, limit, offset int) ([]*model.TransferLog, error) {
	query := `
		SELECT id, file_id, user_id, account_id, operation, status, bytes_transferred,
		       error_message, retry_count, max_retries, started_at, completed_at, created_at
		FROM transfer_logs
		WHERE user_id = $1
		ORDER BY created_at DESC
		LIMIT $2 OFFSET $3
	`
	rows, err := r.db.Query(ctx, query, userID, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("failed to get transfer logs: %w", err)
	}
	defer rows.Close()

	var logs []*model.TransferLog
	for rows.Next() {
		log := &model.TransferLog{}
		if err := rows.Scan(&log.ID, &log.FileID, &log.UserID, &log.AccountID,
			&log.Operation, &log.Status, &log.BytesTransferred, &log.ErrorMessage,
			&log.RetryCount, &log.MaxRetries, &log.StartedAt, &log.CompletedAt, &log.CreatedAt); err != nil {
			return nil, err
		}
		logs = append(logs, log)
	}
	return logs, nil
}

func (r *TransferLogRepository) GetFailedWithRetries(ctx context.Context) ([]*model.TransferLog, error) {
	query := `
		SELECT id, file_id, user_id, account_id, operation, status, bytes_transferred,
		       error_message, retry_count, max_retries, started_at, completed_at, created_at
		FROM transfer_logs
		WHERE status = $1 AND retry_count < max_retries
		ORDER BY created_at ASC
		LIMIT 10
	`
	rows, err := r.db.Query(ctx, query, model.StatusFailed)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var logs []*model.TransferLog
	for rows.Next() {
		log := &model.TransferLog{}
		if err := rows.Scan(&log.ID, &log.FileID, &log.UserID, &log.AccountID,
			&log.Operation, &log.Status, &log.BytesTransferred, &log.ErrorMessage,
			&log.RetryCount, &log.MaxRetries, &log.StartedAt, &log.CompletedAt, &log.CreatedAt); err != nil {
			return nil, err
		}
		logs = append(logs, log)
	}
	return logs, nil
}

func (r *TransferLogRepository) CountByUser(ctx context.Context, userID uuid.UUID) (int, error) {
	var count int
	query := `SELECT COUNT(*) FROM transfer_logs WHERE user_id = $1`
	err := r.db.QueryRow(ctx, query, userID).Scan(&count)
	return count, err
}
