package model

import (
	"time"

	"github.com/google/uuid"
)

// File represents a virtual file in the storage gateway
type File struct {
	ID          uuid.UUID  `db:"id" json:"id"`
	UserID      uuid.UUID  `db:"user_id" json:"user_id"`
	Name        string     `db:"name" json:"name"`
	VirtualPath string     `db:"virtual_path" json:"virtual_path"`
	Size        int64      `db:"size" json:"size"`
	Checksum    string     `db:"checksum" json:"checksum"`
	MimeType    string     `db:"mime_type" json:"mime_type"`
	ParentID    *uuid.UUID `db:"parent_id" json:"parent_id"`
	IsDirectory bool       `db:"is_directory" json:"is_directory"`
	IsEncrypted bool       `db:"is_encrypted" json:"is_encrypted"`
	CreatedAt   time.Time  `db:"created_at" json:"created_at"`
	UpdatedAt   time.Time  `db:"updated_at" json:"updated_at"`
}

// FileLocation represents where a file is physically stored
type FileLocation struct {
	ID          uuid.UUID `db:"id" json:"id"`
	FileID      uuid.UUID `db:"file_id" json:"file_id"`
	AccountID   uuid.UUID `db:"account_id" json:"account_id"`
	RemotePath  string    `db:"remote_path" json:"remote_path"`
	ChunkIndex  int       `db:"chunk_index" json:"chunk_index"`
	ChunkSize   int64     `db:"chunk_size" json:"chunk_size"`
	Checksum    string    `db:"checksum" json:"checksum"`
	IsEncrypted bool      `db:"is_encrypted" json:"is_encrypted"`
	CreatedAt   time.Time `db:"created_at" json:"created_at"`
}
