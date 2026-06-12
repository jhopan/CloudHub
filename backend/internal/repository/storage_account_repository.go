package repository

import (
	"context"
	"fmt"

	"storage-gateway/internal/model"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type StorageAccountRepository struct {
	db *pgxpool.Pool
}

func NewStorageAccountRepository(db *pgxpool.Pool) *StorageAccountRepository {
	return &StorageAccountRepository{db: db}
}

func (r *StorageAccountRepository) Create(ctx context.Context, account *model.StorageAccount) error {
	query := `
		INSERT INTO storage_accounts (user_id, provider_id, label, credentials, rclone_remote_name, capacity_bytes, used_bytes, health_status, cost_per_gb_month, is_active)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		RETURNING id, created_at, updated_at
	`

	err := r.db.QueryRow(ctx, query,
		account.UserID,
		account.ProviderID,
		account.Label,
		account.Credentials,
		account.RcloneRemoteName,
		account.CapacityBytes,
		account.UsedBytes,
		account.HealthStatus,
		account.CostPerGBMonth,
		account.IsActive,
	).Scan(&account.ID, &account.CreatedAt, &account.UpdatedAt)

	if err != nil {
		return fmt.Errorf("failed to create storage account: %w", err)
	}

	return nil
}

func (r *StorageAccountRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.StorageAccount, error) {
	account := &model.StorageAccount{}

	query := `
		SELECT id, user_id, provider_id, label, credentials, rclone_remote_name,
		       capacity_bytes, used_bytes, health_status, last_health_check, last_capacity_sync,
		       cost_per_gb_month, is_active, created_at, updated_at
		FROM storage_accounts
		WHERE id = $1
	`

	err := r.db.QueryRow(ctx, query, id).Scan(
		&account.ID,
		&account.UserID,
		&account.ProviderID,
		&account.Label,
		&account.Credentials,
		&account.RcloneRemoteName,
		&account.CapacityBytes,
		&account.UsedBytes,
		&account.HealthStatus,
		&account.LastHealthCheck,
		&account.LastCapacitySync,
		&account.CostPerGBMonth,
		&account.IsActive,
		&account.CreatedAt,
		&account.UpdatedAt,
	)

	if err != nil {
		return nil, fmt.Errorf("failed to get storage account: %w", err)
	}

	return account, nil
}

func (r *StorageAccountRepository) GetByUserID(ctx context.Context, userID uuid.UUID) ([]*model.StorageAccountWithProvider, error) {
	query := `
		SELECT 
			sa.id, sa.user_id, sa.provider_id, sa.label, sa.credentials, sa.rclone_remote_name,
			sa.capacity_bytes, sa.used_bytes, sa.health_status,
			sa.last_health_check, sa.last_capacity_sync, sa.cost_per_gb_month, sa.is_active,
			sa.created_at, sa.updated_at,
			p.display_name as provider_display_name, p.type as provider_type, COALESCE(p.icon_url, '') as provider_icon_url
		FROM storage_accounts sa
		JOIN providers p ON p.id = sa.provider_id
		WHERE sa.user_id = $1
		ORDER BY p.display_name, sa.label
	`

	rows, err := r.db.Query(ctx, query, userID)
	if err != nil {
		return nil, fmt.Errorf("failed to query storage accounts: %w", err)
	}
	defer rows.Close()

	var accounts []*model.StorageAccountWithProvider
	for rows.Next() {
		acc := &model.StorageAccountWithProvider{}
		err := rows.Scan(
			&acc.ID, &acc.UserID, &acc.ProviderID, &acc.Label, &acc.Credentials, &acc.RcloneRemoteName,
			&acc.CapacityBytes, &acc.UsedBytes, &acc.HealthStatus,
			&acc.LastHealthCheck, &acc.LastCapacitySync, &acc.CostPerGBMonth, &acc.IsActive,
			&acc.CreatedAt, &acc.UpdatedAt,
			&acc.ProviderDisplayName, &acc.ProviderType, &acc.ProviderIconURL,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan storage account: %w", err)
		}
		accounts = append(accounts, acc)
	}

	return accounts, nil
}

func (r *StorageAccountRepository) Update(ctx context.Context, account *model.StorageAccount) error {
	query := `
		UPDATE storage_accounts
		SET label = $1, credentials = $2, capacity_bytes = $3, used_bytes = $4,
		    health_status = $5, cost_per_gb_month = $6, is_active = $7, updated_at = NOW()
		WHERE id = $8
	`

	_, err := r.db.Exec(ctx, query,
		account.Label,
		account.Credentials,
		account.CapacityBytes,
		account.UsedBytes,
		account.HealthStatus,
		account.CostPerGBMonth,
		account.IsActive,
		account.ID,
	)

	if err != nil {
		return fmt.Errorf("failed to update storage account: %w", err)
	}

	return nil
}

// UpdateHealth only updates health-related fields without touching credentials
func (r *StorageAccountRepository) UpdateHealth(ctx context.Context, account *model.StorageAccount) error {
	query := `
		UPDATE storage_accounts
		SET capacity_bytes = $1, used_bytes = $2, health_status = $3,
		    last_health_check = $4, updated_at = NOW()
		WHERE id = $5
	`

	_, err := r.db.Exec(ctx, query,
		account.CapacityBytes,
		account.UsedBytes,
		account.HealthStatus,
		account.LastHealthCheck,
		account.ID,
	)

	if err != nil {
		return fmt.Errorf("failed to update health status: %w", err)
	}

	return nil
}

func (r *StorageAccountRepository) Delete(ctx context.Context, id uuid.UUID) error {
	query := `DELETE FROM storage_accounts WHERE id = $1`

	_, err := r.db.Exec(ctx, query, id)
	if err != nil {
		return fmt.Errorf("failed to delete storage account: %w", err)
	}

	return nil
}

func (r *StorageAccountRepository) GetTotalCapacity(ctx context.Context, userID uuid.UUID) (totalCapacity, totalUsed int64, err error) {
	query := `
		SELECT 
			COALESCE(SUM(capacity_bytes), 0),
			COALESCE(SUM(used_bytes), 0)
		FROM storage_accounts
		WHERE user_id = $1 AND is_active = true
	`

	err = r.db.QueryRow(ctx, query, userID).Scan(&totalCapacity, &totalUsed)
	if err != nil {
		return 0, 0, fmt.Errorf("failed to get total capacity: %w", err)
	}

	return totalCapacity, totalUsed, nil
}

// GetAll returns all storage accounts
func (r *StorageAccountRepository) GetAll(ctx context.Context) ([]*model.StorageAccount, error) {
	query := `
		SELECT id, user_id, provider_id, label, rclone_remote_name, capacity_bytes, used_bytes,
		       health_status, last_health_check, last_capacity_sync, cost_per_gb_month,
		       is_active, created_at, updated_at
		FROM storage_accounts
		ORDER BY created_at
	`
	rows, err := r.db.Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("failed to get all accounts: %w", err)
	}
	defer rows.Close()

	var accounts []*model.StorageAccount
	for rows.Next() {
		var acc model.StorageAccount
		if err := rows.Scan(&acc.ID, &acc.UserID, &acc.ProviderID, &acc.Label, &acc.RcloneRemoteName,
			&acc.CapacityBytes, &acc.UsedBytes, &acc.HealthStatus, &acc.LastHealthCheck, &acc.LastCapacitySync,
			&acc.CostPerGBMonth, &acc.IsActive, &acc.CreatedAt, &acc.UpdatedAt); err != nil {
			return nil, err
		}
		accounts = append(accounts, &acc)
	}
	return accounts, nil
}
