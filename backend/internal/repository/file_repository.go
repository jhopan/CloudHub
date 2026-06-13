package repository

import (
	"context"
	"fmt"

	"storage-gateway/internal/model"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type FileRepository struct {
	db *pgxpool.Pool
}

func NewFileRepository(db *pgxpool.Pool) *FileRepository {
	return &FileRepository{db: db}
}

func (r *FileRepository) Create(ctx context.Context, file *model.File) error {
	query := `
		INSERT INTO files (id, user_id, name, virtual_path, size, checksum, mime_type, parent_id, is_directory, is_encrypted)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		RETURNING created_at, updated_at
	`
	return r.db.QueryRow(ctx, query,
		file.ID, file.UserID, file.Name, file.VirtualPath, file.Size, file.Checksum, file.MimeType, file.ParentID, file.IsDirectory, file.IsEncrypted,
	).Scan(&file.CreatedAt, &file.UpdatedAt)
}

func (r *FileRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.File, error) {
	file := &model.File{}
	query := `
		SELECT id, user_id, name, virtual_path, size, checksum, mime_type, parent_id, is_directory, COALESCE(is_encrypted, false), created_at, updated_at
		FROM files WHERE id = $1
	`
	err := r.db.QueryRow(ctx, query, id).Scan(
		&file.ID, &file.UserID, &file.Name, &file.VirtualPath, &file.Size, &file.Checksum,
		&file.MimeType, &file.ParentID, &file.IsDirectory, &file.IsEncrypted, &file.CreatedAt, &file.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("file not found: %w", err)
	}
	return file, nil
}

func (r *FileRepository) ListByUser(ctx context.Context, userID uuid.UUID, parentID *uuid.UUID) ([]*model.File, error) {
	var query string
	var args []interface{}

	if parentID == nil {
		query = `
			SELECT id, user_id, name, virtual_path, size, checksum, mime_type, parent_id, is_directory, created_at, updated_at
			FROM files WHERE user_id = $1 AND parent_id IS NULL
			ORDER BY is_directory DESC, name ASC
		`
		args = []interface{}{userID}
	} else {
		query = `
			SELECT id, user_id, name, virtual_path, size, checksum, mime_type, parent_id, is_directory, created_at, updated_at
			FROM files WHERE user_id = $1 AND parent_id = $2
			ORDER BY is_directory DESC, name ASC
		`
		args = []interface{}{userID, *parentID}
	}

	rows, err := r.db.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("failed to list files: %w", err)
	}
	defer rows.Close()

	var files []*model.File
	for rows.Next() {
		f := &model.File{}
		if err := rows.Scan(&f.ID, &f.UserID, &f.Name, &f.VirtualPath, &f.Size, &f.Checksum,
			&f.MimeType, &f.ParentID, &f.IsDirectory, &f.CreatedAt, &f.UpdatedAt); err != nil {
			return nil, err
		}
		files = append(files, f)
	}
	return files, nil
}

func (r *FileRepository) Search(ctx context.Context, userID uuid.UUID, query string) ([]*model.File, error) {
	sql := `
		SELECT id, user_id, name, virtual_path, size, checksum, mime_type, parent_id, is_directory, created_at, updated_at
		FROM files WHERE user_id = $1 AND name ILIKE $2
		ORDER BY is_directory DESC, name ASC
		LIMIT 100
	`
	rows, err := r.db.Query(ctx, sql, userID, "%"+query+"%")
	if err != nil {
		return nil, fmt.Errorf("failed to search files: %w", err)
	}
	defer rows.Close()

	var files []*model.File
	for rows.Next() {
		f := &model.File{}
		if err := rows.Scan(&f.ID, &f.UserID, &f.Name, &f.VirtualPath, &f.Size, &f.Checksum,
			&f.MimeType, &f.ParentID, &f.IsDirectory, &f.CreatedAt, &f.UpdatedAt); err != nil {
			return nil, err
		}
		files = append(files, f)
	}
	return files, nil
}

func (r *FileRepository) Update(ctx context.Context, file *model.File) error {
	query := `UPDATE files SET name = $1, virtual_path = $2, updated_at = NOW() WHERE id = $3`
	_, err := r.db.Exec(ctx, query, file.Name, file.VirtualPath, file.ID)
	return err
}

func (r *FileRepository) Delete(ctx context.Context, id uuid.UUID) error {
	_, err := r.db.Exec(ctx, `DELETE FROM files WHERE id = $1`, id)
	return err
}

// Location methods
func (r *FileRepository) AddLocation(ctx context.Context, loc *model.FileLocation) error {
	query := `
		INSERT INTO file_locations (id, file_id, account_id, remote_path, chunk_index, chunk_size, checksum, is_encrypted)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		RETURNING created_at
	`
	return r.db.QueryRow(ctx, query,
		loc.ID, loc.FileID, loc.AccountID, loc.RemotePath, loc.ChunkIndex, loc.ChunkSize, loc.Checksum, loc.IsEncrypted,
	).Scan(&loc.CreatedAt)
}

func (r *FileRepository) GetLocations(ctx context.Context, fileID uuid.UUID) ([]*model.FileLocation, error) {
	query := `
		SELECT id, file_id, account_id, remote_path, chunk_index, chunk_size, checksum, created_at
		FROM file_locations WHERE file_id = $1
	`
	rows, err := r.db.Query(ctx, query, fileID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var locs []*model.FileLocation
	for rows.Next() {
		l := &model.FileLocation{}
		if err := rows.Scan(&l.ID, &l.FileID, &l.AccountID, &l.RemotePath,
			&l.ChunkIndex, &l.ChunkSize, &l.Checksum, &l.CreatedAt); err != nil {
			return nil, err
		}
		locs = append(locs, l)
	}
	return locs, nil
}

func (r *FileRepository) DeleteLocations(ctx context.Context, fileID uuid.UUID) error {
	_, err := r.db.Exec(ctx, `DELETE FROM file_locations WHERE file_id = $1`, fileID)
	return err
}

// DeleteLocation deletes a single file location by ID
func (r *FileRepository) DeleteLocation(ctx context.Context, id uuid.UUID) error {
	_, err := r.db.Exec(ctx, `DELETE FROM file_locations WHERE id = $1`, id)
	return err
}

// GetFilesWithoutLocations returns non-directory files that have no file_locations
func (r *FileRepository) GetFilesWithoutLocations(ctx context.Context) ([]*model.File, error) {
	query := `
		SELECT f.id, f.user_id, f.name, f.virtual_path, f.size, f.checksum,
		       f.mime_type, f.parent_id, f.is_directory, f.created_at, f.updated_at
		FROM files f
		LEFT JOIN file_locations fl ON f.id = fl.file_id
		WHERE f.is_directory = false AND fl.id IS NULL
	`
	rows, err := r.db.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var files []*model.File
	for rows.Next() {
		var f model.File
		if err := rows.Scan(&f.ID, &f.UserID, &f.Name, &f.VirtualPath, &f.Size, &f.Checksum,
			&f.MimeType, &f.ParentID, &f.IsDirectory, &f.CreatedAt, &f.UpdatedAt); err != nil {
			return nil, err
		}
		files = append(files, &f)
	}
	return files, nil
}

// GetOrphanLocations returns file_locations that reference non-existent files
func (r *FileRepository) GetOrphanLocations(ctx context.Context) ([]*model.FileLocation, error) {
	query := `
		SELECT fl.id, fl.file_id, fl.account_id, fl.remote_path, fl.chunk_index, fl.chunk_size, fl.checksum
		FROM file_locations fl
		LEFT JOIN files f ON fl.file_id = f.id
		WHERE f.id IS NULL
	`
	rows, err := r.db.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var locs []*model.FileLocation
	for rows.Next() {
		var loc model.FileLocation
		if err := rows.Scan(&loc.ID, &loc.FileID, &loc.AccountID, &loc.RemotePath,
			&loc.ChunkIndex, &loc.ChunkSize, &loc.Checksum); err != nil {
			return nil, err
		}
		locs = append(locs, &loc)
	}
	return locs, nil
}

// GetAllLocations returns all file locations across all files
func (r *FileRepository) GetAllLocations(ctx context.Context) ([]*model.FileLocation, error) {
	query := `SELECT id, file_id, account_id, remote_path, chunk_index, chunk_size, checksum FROM file_locations ORDER BY created_at`
	rows, err := r.db.Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("failed to get all locations: %w", err)
	}
	defer rows.Close()

	var locations []*model.FileLocation
	for rows.Next() {
		var loc model.FileLocation
		if err := rows.Scan(&loc.ID, &loc.FileID, &loc.AccountID, &loc.RemotePath,
			&loc.ChunkIndex, &loc.ChunkSize, &loc.Checksum); err != nil {
			return nil, err
		}
		locations = append(locations, &loc)
	}
	return locations, nil
}

// GetByVirtualPath finds a file by user_id and virtual_path
func (r *FileRepository) GetByVirtualPath(ctx context.Context, userID uuid.UUID, virtualPath string) (*model.File, error) {
	file := &model.File{}
	query := `
		SELECT id, user_id, name, virtual_path, size, checksum, mime_type, parent_id, is_directory, created_at, updated_at
		FROM files WHERE user_id = $1 AND virtual_path = $2
	`
	err := r.db.QueryRow(ctx, query, userID, virtualPath).Scan(
		&file.ID, &file.UserID, &file.Name, &file.VirtualPath, &file.Size, &file.Checksum,
		&file.MimeType, &file.ParentID, &file.IsDirectory, &file.CreatedAt, &file.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return file, nil
}

// ListByPathPrefix lists files under a virtual path prefix for a user
func (r *FileRepository) ListByPathPrefix(ctx context.Context, userID uuid.UUID, pathPrefix string) ([]*model.File, error) {
	query := `
		SELECT f.id, f.user_id, f.name, f.virtual_path, f.size, f.checksum, f.mime_type, 
		       f.parent_id, f.is_directory, f.created_at, f.updated_at
		FROM files f
		WHERE f.user_id = $1 AND f.virtual_path LIKE $2
		ORDER BY f.is_directory DESC, f.name ASC
		LIMIT 1000
	`
	rows, err := r.db.Query(ctx, query, userID, pathPrefix+"%")
	if err != nil {
		return nil, fmt.Errorf("failed to list by path: %w", err)
	}
	defer rows.Close()

	var files []*model.File
	for rows.Next() {
		f := &model.File{}
		if err := rows.Scan(&f.ID, &f.UserID, &f.Name, &f.VirtualPath, &f.Size, &f.Checksum,
			&f.MimeType, &f.ParentID, &f.IsDirectory, &f.CreatedAt, &f.UpdatedAt); err != nil {
			return nil, err
		}
		files = append(files, f)
	}
	return files, nil
}

// GetFileStats returns aggregate stats for a user's files
func (r *FileRepository) GetFileStats(ctx context.Context, userID uuid.UUID) (totalFiles int64, totalSize int64, err error) {
	query := `
		SELECT COALESCE(COUNT(*), 0), COALESCE(SUM(size), 0)
		FROM files WHERE user_id = $1 AND is_directory = false
	`
	err = r.db.QueryRow(ctx, query, userID).Scan(&totalFiles, &totalSize)
	return
}

// GetLocationsByAccount returns all file locations for a specific account
func (r *FileRepository) GetLocationsByAccount(ctx context.Context, accountID uuid.UUID) ([]*model.FileLocation, error) {
	query := `
		SELECT id, file_id, account_id, remote_path, chunk_index, chunk_size, checksum, created_at
		FROM file_locations WHERE account_id = $1
		ORDER BY created_at
	`
	rows, err := r.db.Query(ctx, query, accountID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var locs []*model.FileLocation
	for rows.Next() {
		l := &model.FileLocation{}
		if err := rows.Scan(&l.ID, &l.FileID, &l.AccountID, &l.RemotePath,
			&l.ChunkIndex, &l.ChunkSize, &l.Checksum, &l.CreatedAt); err != nil {
			return nil, err
		}
		locs = append(locs, l)
	}
	return locs, nil
}

// GetLocationByAccountAndPath finds a file location by account and remote path
func (r *FileRepository) GetLocationByAccountAndPath(ctx context.Context, accountID uuid.UUID, remotePath string) (*model.FileLocation, error) {
	loc := &model.FileLocation{}
	query := `
		SELECT id, file_id, account_id, remote_path, chunk_index, chunk_size, checksum, created_at
		FROM file_locations WHERE account_id = $1 AND remote_path = $2
	`
	err := r.db.QueryRow(ctx, query, accountID, remotePath).Scan(
		&loc.ID, &loc.FileID, &loc.AccountID, &loc.RemotePath,
		&loc.ChunkIndex, &loc.ChunkSize, &loc.Checksum, &loc.CreatedAt,
	)
	if err != nil {
		return nil, err
	}
	return loc, nil
}

// Upsert creates or updates a file based on user_id + virtual_path unique constraint
func (r *FileRepository) Upsert(ctx context.Context, file *model.File) error {
	query := `
		INSERT INTO files (id, user_id, name, virtual_path, size, checksum, mime_type, parent_id, is_directory, is_encrypted)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		ON CONFLICT (user_id, virtual_path) DO UPDATE SET
			name = EXCLUDED.name,
			size = EXCLUDED.size,
			checksum = EXCLUDED.checksum,
			mime_type = EXCLUDED.mime_type,
			is_encrypted = EXCLUDED.is_encrypted,
			updated_at = NOW()
		RETURNING id, created_at, updated_at
	`
	return r.db.QueryRow(ctx, query,
		file.ID, file.UserID, file.Name, file.VirtualPath, file.Size, file.Checksum, file.MimeType, file.ParentID, file.IsDirectory, file.IsEncrypted,
	).Scan(&file.ID, &file.CreatedAt, &file.UpdatedAt)
}

// DeleteByVirtualPath deletes a file by user_id and virtual_path
func (r *FileRepository) DeleteByVirtualPath(ctx context.Context, userID uuid.UUID, virtualPath string) error {
	_, err := r.db.Exec(ctx, `DELETE FROM files WHERE user_id = $1 AND virtual_path = $2`, userID, virtualPath)
	return err
}
