package repository

import (
	"context"
	"fmt"

	"storage-gateway/internal/model"

	"github.com/jackc/pgx/v5/pgxpool"
)

type SharedLinkRepository struct {
	db *pgxpool.Pool
}

func NewSharedLinkRepository(db *pgxpool.Pool) *SharedLinkRepository {
	return &SharedLinkRepository{db: db}
}

func (r *SharedLinkRepository) Create(ctx context.Context, link *model.SharedLink) error {
	query := `
		INSERT INTO shared_links (user_id, token, file_name, file_size, account_id, remote_path, max_downloads, expires_at, is_active)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		RETURNING id, download_count, created_at
	`

	err := r.db.QueryRow(ctx, query,
		link.UserID,
		link.Token,
		link.FileName,
		link.FileSize,
		link.AccountID,
		link.RemotePath,
		link.MaxDownloads,
		link.ExpiresAt,
		link.IsActive,
	).Scan(&link.ID, &link.DownloadCount, &link.CreatedAt)

	if err != nil {
		return fmt.Errorf("failed to create shared link: %w", err)
	}

	return nil
}

func (r *SharedLinkRepository) GetByToken(ctx context.Context, token string) (*model.SharedLink, error) {
	link := &model.SharedLink{}

	query := `
		SELECT id, user_id, token, file_name, file_size, account_id, remote_path,
		       max_downloads, download_count, expires_at, is_active, created_at
		FROM shared_links
		WHERE token = $1
	`

	err := r.db.QueryRow(ctx, query, token).Scan(
		&link.ID,
		&link.UserID,
		&link.Token,
		&link.FileName,
		&link.FileSize,
		&link.AccountID,
		&link.RemotePath,
		&link.MaxDownloads,
		&link.DownloadCount,
		&link.ExpiresAt,
		&link.IsActive,
		&link.CreatedAt,
	)

	if err != nil {
		return nil, fmt.Errorf("failed to get shared link: %w", err)
	}

	return link, nil
}

func (r *SharedLinkRepository) GetByUserID(ctx context.Context, userID string) ([]*model.SharedLink, error) {
	query := `
		SELECT id, user_id, token, file_name, file_size, account_id, remote_path,
		       max_downloads, download_count, expires_at, is_active, created_at
		FROM shared_links
		WHERE user_id = $1
		ORDER BY created_at DESC
	`

	rows, err := r.db.Query(ctx, query, userID)
	if err != nil {
		return nil, fmt.Errorf("failed to query shared links: %w", err)
	}
	defer rows.Close()

	var links []*model.SharedLink
	for rows.Next() {
		link := &model.SharedLink{}
		err := rows.Scan(
			&link.ID,
			&link.UserID,
			&link.Token,
			&link.FileName,
			&link.FileSize,
			&link.AccountID,
			&link.RemotePath,
			&link.MaxDownloads,
			&link.DownloadCount,
			&link.ExpiresAt,
			&link.IsActive,
			&link.CreatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan shared link: %w", err)
		}
		links = append(links, link)
	}

	return links, nil
}

func (r *SharedLinkRepository) IncrementDownloadCount(ctx context.Context, id string) error {
	query := `UPDATE shared_links SET download_count = download_count + 1 WHERE id = $1`

	_, err := r.db.Exec(ctx, query, id)
	if err != nil {
		return fmt.Errorf("failed to increment download count: %w", err)
	}

	return nil
}

func (r *SharedLinkRepository) Deactivate(ctx context.Context, id string) error {
	query := `UPDATE shared_links SET is_active = false WHERE id = $1`

	_, err := r.db.Exec(ctx, query, id)
	if err != nil {
		return fmt.Errorf("failed to deactivate shared link: %w", err)
	}

	return nil
}

func (r *SharedLinkRepository) Delete(ctx context.Context, id string) error {
	query := `DELETE FROM shared_links WHERE id = $1`

	_, err := r.db.Exec(ctx, query, id)
	if err != nil {
		return fmt.Errorf("failed to delete shared link: %w", err)
	}

	return nil
}

func (r *SharedLinkRepository) CleanupExpired(ctx context.Context) (int, error) {
	query := `
		DELETE FROM shared_links
		WHERE expires_at IS NOT NULL AND expires_at < NOW()
	`

	result, err := r.db.Exec(ctx, query)
	if err != nil {
		return 0, fmt.Errorf("failed to cleanup expired links: %w", err)
	}

	return int(result.RowsAffected()), nil
}
