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

// GetAll returns a paginated list of all users
func (r *UserRepository) GetAll(ctx context.Context, page, perPage int) ([]*model.User, int, error) {
	// Get total count
	var total int
	countQuery := `SELECT COUNT(*) FROM users`
	if err := r.db.QueryRow(ctx, countQuery).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("failed to count users: %w", err)
	}

	offset := (page - 1) * perPage
	query := `
		SELECT id, email, password_hash, display_name, role, COALESCE(scheduler_mode, 'largest_free'),
		       COALESCE(encryption_enabled, false), encryption_salt, COALESCE(encryption_passphrase_hash, ''),
		       created_at, updated_at
		FROM users
		ORDER BY created_at ASC
		LIMIT $1 OFFSET $2
	`

	rows, err := r.db.Query(ctx, query, perPage, offset)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to query users: %w", err)
	}
	defer rows.Close()

	var users []*model.User
	for rows.Next() {
		user := &model.User{}
		if err := rows.Scan(
			&user.ID, &user.Email, &user.PasswordHash, &user.DisplayName, &user.Role,
			&user.SchedulerMode, &user.EncryptionEnabled, &user.EncryptionSalt,
			&user.EncryptionPassphraseHash, &user.CreatedAt, &user.UpdatedAt,
		); err != nil {
			return nil, 0, fmt.Errorf("failed to scan user: %w", err)
		}
		users = append(users, user)
	}

	return users, total, nil
}

// UpdateRole updates a user's role
func (r *UserRepository) UpdateRole(ctx context.Context, userID uuid.UUID, role string) error {
	query := `UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2`
	_, err := r.db.Exec(ctx, query, role, userID)
	if err != nil {
		return fmt.Errorf("failed to update user role: %w", err)
	}
	return nil
}

// CountAll returns the total number of users
func (r *UserRepository) CountAll(ctx context.Context) (int, error) {
	var count int
	query := `SELECT COUNT(*) FROM users`
	err := r.db.QueryRow(ctx, query).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("failed to count users: %w", err)
	}
	return count, nil
}

// DeleteCascade deletes a user and all associated data
func (r *UserRepository) DeleteCascade(ctx context.Context, userID uuid.UUID) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	// Delete file locations for user's files
	_, err = tx.Exec(ctx, `DELETE FROM file_locations WHERE file_id IN (SELECT id FROM files WHERE user_id = $1)`, userID)
	if err != nil {
		return fmt.Errorf("failed to delete file locations: %w", err)
	}

	// Delete user's files
	_, err = tx.Exec(ctx, `DELETE FROM files WHERE user_id = $1`, userID)
	if err != nil {
		return fmt.Errorf("failed to delete files: %w", err)
	}

	// Delete user's transfer logs
	_, err = tx.Exec(ctx, `DELETE FROM transfer_logs WHERE user_id = $1`, userID)
	if err != nil {
		return fmt.Errorf("failed to delete transfer logs: %w", err)
	}

	// Delete user's storage accounts
	_, err = tx.Exec(ctx, `DELETE FROM storage_accounts WHERE user_id = $1`, userID)
	if err != nil {
		return fmt.Errorf("failed to delete storage accounts: %w", err)
	}

	// Delete the user
	_, err = tx.Exec(ctx, `DELETE FROM users WHERE id = $1`, userID)
	if err != nil {
		return fmt.Errorf("failed to delete user: %w", err)
	}

	return tx.Commit(ctx)
}

// GetAccountsCountByUser returns the number of storage accounts for each user
func (r *UserRepository) GetAccountsCountByUser(ctx context.Context) (map[string]int, error) {
	query := `SELECT user_id, COUNT(*) FROM storage_accounts GROUP BY user_id`
	rows, err := r.db.Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("failed to get accounts count: %w", err)
	}
	defer rows.Close()

	counts := make(map[string]int)
	for rows.Next() {
		var userID uuid.UUID
		var count int
		if err := rows.Scan(&userID, &count); err != nil {
			return nil, err
		}
		counts[userID.String()] = count
	}
	return counts, nil
}
