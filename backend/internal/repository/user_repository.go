package repository

import (
	"context"
	"fmt"

	"storage-gateway/internal/crypto"
	"storage-gateway/internal/model"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type UserRepository struct {
	db *pgxpool.Pool
}

func NewUserRepository(db *pgxpool.Pool) *UserRepository {
	return &UserRepository{db: db}
}

func (r *UserRepository) Create(ctx context.Context, user *model.User) error {
	query := `
		INSERT INTO users (email, password_hash, display_name, role)
		VALUES ($1, $2, $3, $4)
		RETURNING id, created_at, updated_at
	`

	err := r.db.QueryRow(
		ctx,
		query,
		user.Email,
		user.PasswordHash,
		user.DisplayName,
		user.Role,
	).Scan(&user.ID, &user.CreatedAt, &user.UpdatedAt)

	if err != nil {
		return fmt.Errorf("failed to create user: %w", err)
	}

	return nil
}

func (r *UserRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.User, error) {
	user := &model.User{}

	query := `
		SELECT id, email, password_hash, display_name, role, COALESCE(scheduler_mode, 'largest_free'),
		       COALESCE(encryption_enabled, false), encryption_salt, COALESCE(encryption_passphrase_hash, ''),
		       created_at, updated_at
		FROM users
		WHERE id = $1
	`

	err := r.db.QueryRow(ctx, query, id).Scan(
		&user.ID,
		&user.Email,
		&user.PasswordHash,
		&user.DisplayName,
		&user.Role,
		&user.SchedulerMode,
		&user.EncryptionEnabled,
		&user.EncryptionSalt,
		&user.EncryptionPassphraseHash,
		&user.CreatedAt,
		&user.UpdatedAt,
	)

	if err != nil {
		return nil, fmt.Errorf("failed to get user: %w", err)
	}

	return user, nil
}

func (r *UserRepository) GetByEmail(ctx context.Context, email string) (*model.User, error) {
	user := &model.User{}

	query := `
		SELECT id, email, password_hash, display_name, role, COALESCE(scheduler_mode, 'largest_free'),
		       COALESCE(encryption_enabled, false), encryption_salt, COALESCE(encryption_passphrase_hash, ''),
		       created_at, updated_at
		FROM users
		WHERE email = $1
	`

	err := r.db.QueryRow(ctx, query, email).Scan(
		&user.ID,
		&user.Email,
		&user.PasswordHash,
		&user.DisplayName,
		&user.Role,
		&user.SchedulerMode,
		&user.EncryptionEnabled,
		&user.EncryptionSalt,
		&user.EncryptionPassphraseHash,
		&user.CreatedAt,
		&user.UpdatedAt,
	)

	if err != nil {
		return nil, fmt.Errorf("failed to get user by email: %w", err)
	}

	return user, nil
}

func (r *UserRepository) Update(ctx context.Context, user *model.User) error {
	query := `
		UPDATE users
		SET email = $1, display_name = $2, role = $3, updated_at = NOW()
		WHERE id = $4
	`

	_, err := r.db.Exec(ctx, query, user.Email, user.DisplayName, user.Role, user.ID)
	if err != nil {
		return fmt.Errorf("failed to update user: %w", err)
	}

	return nil
}

func (r *UserRepository) Delete(ctx context.Context, id uuid.UUID) error {
	query := `DELETE FROM users WHERE id = $1`

	_, err := r.db.Exec(ctx, query, id)
	if err != nil {
		return fmt.Errorf("failed to delete user: %w", err)
	}

	return nil
}

// GetSchedulerMode returns the scheduler mode for a user
func (r *UserRepository) GetSchedulerMode(ctx context.Context, userID uuid.UUID) (string, error) {
	var mode string
	query := `SELECT COALESCE(scheduler_mode, 'largest_free') FROM users WHERE id = $1`

	err := r.db.QueryRow(ctx, query, userID).Scan(&mode)
	if err != nil {
		return "largest_free", fmt.Errorf("failed to get scheduler mode: %w", err)
	}

	return mode, nil
}

// SetSchedulerMode updates the scheduler mode for a user
func (r *UserRepository) SetSchedulerMode(ctx context.Context, userID uuid.UUID, mode string) error {
	query := `UPDATE users SET scheduler_mode = $1, updated_at = NOW() WHERE id = $2`

	_, err := r.db.Exec(ctx, query, mode, userID)
	if err != nil {
		return fmt.Errorf("failed to set scheduler mode: %w", err)
	}

	return nil
}

// SetEncryptionPassphrase generates a salt, stores it along with a hashed passphrase for verification
func (r *UserRepository) SetEncryptionPassphrase(ctx context.Context, userID uuid.UUID, passphrase string) error {
	// Generate encryption salt (for file encryption key derivation)
	salt, err := crypto.GenerateSalt()
	if err != nil {
		return fmt.Errorf("failed to generate salt: %w", err)
	}

	// Hash passphrase for verification
	hash, err := crypto.HashPassphrase(passphrase)
	if err != nil {
		return fmt.Errorf("failed to hash passphrase: %w", err)
	}

	query := `
		UPDATE users
		SET encryption_enabled = true,
		    encryption_salt = $1,
		    encryption_passphrase_hash = $2,
		    updated_at = NOW()
		WHERE id = $3
	`

	_, err = r.db.Exec(ctx, query, salt, hash, userID)
	if err != nil {
		return fmt.Errorf("failed to set encryption passphrase: %w", err)
	}

	return nil
}

// GetEncryptionSalt returns the encryption salt for a user (for key derivation)
func (r *UserRepository) GetEncryptionSalt(ctx context.Context, userID uuid.UUID) ([]byte, error) {
	var salt []byte
	query := `SELECT encryption_salt FROM users WHERE id = $1 AND encryption_enabled = true`

	err := r.db.QueryRow(ctx, query, userID).Scan(&salt)
	if err != nil {
		return nil, fmt.Errorf("failed to get encryption salt: %w", err)
	}

	return salt, nil
}

// GetEncryptionPassphraseHash returns the stored passphrase hash for verification
func (r *UserRepository) GetEncryptionPassphraseHash(ctx context.Context, userID uuid.UUID) (string, error) {
	var hash string
	query := `SELECT COALESCE(encryption_passphrase_hash, '') FROM users WHERE id = $1 AND encryption_enabled = true`

	err := r.db.QueryRow(ctx, query, userID).Scan(&hash)
	if err != nil {
		return "", fmt.Errorf("failed to get encryption passphrase hash: %w", err)
	}

	return hash, nil
}

// SetEncryptionEnabled toggles encryption on/off for a user
func (r *UserRepository) SetEncryptionEnabled(ctx context.Context, userID uuid.UUID, enabled bool) error {
	query := `UPDATE users SET encryption_enabled = $1, updated_at = NOW() WHERE id = $2`

	_, err := r.db.Exec(ctx, query, enabled, userID)
	if err != nil {
		return fmt.Errorf("failed to set encryption enabled: %w", err)
	}

	return nil
}

// IsEncryptionEnabled checks if encryption is enabled for a user
func (r *UserRepository) IsEncryptionEnabled(ctx context.Context, userID uuid.UUID) (bool, error) {
	var enabled bool
	query := `SELECT COALESCE(encryption_enabled, false) FROM users WHERE id = $1`

	err := r.db.QueryRow(ctx, query, userID).Scan(&enabled)
	if err != nil {
		return false, fmt.Errorf("failed to check encryption enabled: %w", err)
	}

	return enabled, nil
}
