package model

import (
	"time"
)

// SharedLink represents a shareable link to a file
type SharedLink struct {
	ID            string     `db:"id" json:"id"`
	UserID        string     `db:"user_id" json:"user_id"`
	Token         string     `db:"token" json:"token"`
	FileName      string     `db:"file_name" json:"file_name"`
	FileSize      int64      `db:"file_size" json:"file_size"`
	AccountID     *string    `db:"account_id" json:"account_id"`
	RemotePath    string     `db:"remote_path" json:"remote_path"`
	MaxDownloads  int        `db:"max_downloads" json:"max_downloads"`
	DownloadCount int        `db:"download_count" json:"download_count"`
	ExpiresAt     *time.Time `db:"expires_at" json:"expires_at"`
	IsActive      bool       `db:"is_active" json:"is_active"`
	CreatedAt     time.Time  `db:"created_at" json:"created_at"`
}
