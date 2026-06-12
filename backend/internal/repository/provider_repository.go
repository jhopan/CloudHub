package repository

import (
	"context"
	"fmt"

	"storage-gateway/internal/model"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type ProviderRepository struct {
	db *pgxpool.Pool
}

func NewProviderRepository(db *pgxpool.Pool) *ProviderRepository {
	return &ProviderRepository{db: db}
}

func (r *ProviderRepository) GetAll(ctx context.Context) ([]*model.Provider, error) {
	query := `
		SELECT id, name, type, display_name, COALESCE(icon_url, '') as icon_url, auth_type, config_schema, is_active, created_at
		FROM providers
		WHERE is_active = true
		ORDER BY display_name
	`

	rows, err := r.db.Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("failed to query providers: %w", err)
	}
	defer rows.Close()

	var providers []*model.Provider
	for rows.Next() {
		p := &model.Provider{}
		if err := rows.Scan(
			&p.ID,
			&p.Name,
			&p.Type,
			&p.DisplayName,
			&p.IconURL,
			&p.AuthType,
			&p.ConfigSchema,
			&p.IsActive,
			&p.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("failed to scan provider: %w", err)
		}
		providers = append(providers, p)
	}

	return providers, nil
}

func (r *ProviderRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.Provider, error) {
	p := &model.Provider{}

	query := `
		SELECT id, name, type, display_name, COALESCE(icon_url, '') as icon_url, auth_type, config_schema, is_active, created_at
		FROM providers
		WHERE id = $1
	`

	err := r.db.QueryRow(ctx, query, id).Scan(
		&p.ID,
		&p.Name,
		&p.Type,
		&p.DisplayName,
		&p.IconURL,
		&p.AuthType,
		&p.ConfigSchema,
		&p.IsActive,
		&p.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to get provider: %w", err)
	}

	return p, nil
}

func (r *ProviderRepository) GetByName(ctx context.Context, name string) (*model.Provider, error) {
	p := &model.Provider{}

	query := `
		SELECT id, name, type, display_name, COALESCE(icon_url, '') as icon_url, auth_type, config_schema, is_active, created_at
		FROM providers
		WHERE name = $1
	`

	err := r.db.QueryRow(ctx, query, name).Scan(
		&p.ID,
		&p.Name,
		&p.Type,
		&p.DisplayName,
		&p.IconURL,
		&p.AuthType,
		&p.ConfigSchema,
		&p.IsActive,
		&p.CreatedAt,
	)

	if err != nil {
		return nil, err
	}

	return p, nil
}

func (r *ProviderRepository) GetByType(ctx context.Context, providerType string) (*model.Provider, error) {
	p := &model.Provider{}

	query := `
		SELECT id, name, type, display_name, COALESCE(icon_url, '') as icon_url, auth_type, config_schema, is_active, created_at
		FROM providers
		WHERE type = $1
	`

	err := r.db.QueryRow(ctx, query, providerType).Scan(
		&p.ID,
		&p.Name,
		&p.Type,
		&p.DisplayName,
		&p.IconURL,
		&p.AuthType,
		&p.ConfigSchema,
		&p.IsActive,
		&p.CreatedAt,
	)

	if err != nil {
		return nil, err
	}

	return p, nil
}

func (r *ProviderRepository) GetWithStats(ctx context.Context, userID uuid.UUID) ([]*model.ProviderWithStats, error) {
	query := `
		SELECT 
			p.id, p.name, p.type, p.display_name, COALESCE(p.icon_url, '') as icon_url, p.auth_type, p.config_schema, p.is_active, p.created_at,
			COUNT(sa.id) as account_count,
			COALESCE(SUM(sa.capacity_bytes), 0) as total_capacity,
			COALESCE(SUM(sa.used_bytes), 0) as total_used,
			COALESCE(SUM(sa.capacity_bytes - sa.used_bytes), 0) as total_available
		FROM providers p
		LEFT JOIN storage_accounts sa ON sa.provider_id = p.id AND sa.user_id = $1
		WHERE p.is_active = true
		GROUP BY p.id, p.name, p.type, p.display_name, p.icon_url, p.auth_type, p.config_schema, p.is_active, p.created_at
		ORDER BY p.display_name
	`

	rows, err := r.db.Query(ctx, query, userID)
	if err != nil {
		return nil, fmt.Errorf("failed to query providers with stats: %w", err)
	}
	defer rows.Close()

	var results []*model.ProviderWithStats
	for rows.Next() {
		pw := &model.ProviderWithStats{}
		if err := rows.Scan(
			&pw.ID,
			&pw.Name,
			&pw.Type,
			&pw.DisplayName,
			&pw.IconURL,
			&pw.AuthType,
			&pw.ConfigSchema,
			&pw.IsActive,
			&pw.CreatedAt,
			&pw.AccountCount,
			&pw.TotalCapacity,
			&pw.TotalUsed,
			&pw.TotalAvailable,
		); err != nil {
			return nil, fmt.Errorf("failed to scan provider with stats: %w", err)
		}
		results = append(results, pw)
	}

	return results, nil
}
