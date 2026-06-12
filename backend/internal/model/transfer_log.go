package model

import (
	"time"

	"github.com/google/uuid"
)

// TransferLog represents a file transfer operation
type TransferLog struct {
	ID             uuid.UUID  `db:"id" json:"id"`
	FileID         *uuid.UUID `db:"file_id" json:"file_id"`
	UserID         uuid.UUID  `db:"user_id" json:"user_id"`
	AccountID      *uuid.UUID `db:"account_id" json:"account_id"`
	Operation      string     `db:"operation" json:"operation"`
	Status         string     `db:"status" json:"status"`
	BytesTransferred int64    `db:"bytes_transferred" json:"bytes_transferred"`
	ErrorMessage   *string    `db:"error_message" json:"error_message"`
	RetryCount     int        `db:"retry_count" json:"retry_count"`
	MaxRetries     int        `db:"max_retries" json:"max_retries"`
	StartedAt      *time.Time `db:"started_at" json:"started_at"`
	CompletedAt    *time.Time `db:"completed_at" json:"completed_at"`
	CreatedAt      time.Time  `db:"created_at" json:"created_at"`
}

// TransferOperation constants
const (
	OpUpload   = "upload"
	OpDownload = "download"
	OpDelete   = "delete"
	OpMove     = "move"
)

// TransferStatus constants
const (
	StatusPending    = "pending"
	StatusInProgress = "in_progress"
	StatusCompleted  = "completed"
	StatusFailed     = "failed"
	StatusRetrying   = "retrying"
)
