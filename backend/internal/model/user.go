package model

import (
	"time"

	"github.com/google/uuid"
)

type User struct {
	ID                       uuid.UUID `db:"id" json:"id"`
	Email                    string    `db:"email" json:"email"`
	PasswordHash             string    `db:"password_hash" json:"-"`
	DisplayName              string    `db:"display_name" json:"display_name"`
	Role                     string    `db:"role" json:"role"`
	SchedulerMode            string    `db:"scheduler_mode" json:"scheduler_mode"`
	EncryptionEnabled        bool      `db:"encryption_enabled" json:"encryption_enabled"`
	EncryptionSalt           []byte    `db:"encryption_salt" json:"-"`
	EncryptionPassphraseHash string    `db:"encryption_passphrase_hash" json:"-"`
	CreatedAt                time.Time `db:"created_at" json:"created_at"`
	UpdatedAt                time.Time `db:"updated_at" json:"updated_at"`
}

const (
	RoleUser  = "user"
	RoleAdmin = "admin"
)
