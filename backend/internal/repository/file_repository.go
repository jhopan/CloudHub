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
		INSERT INTO files (id, user_id, name, virtual_path, size, checksum, mime_type, parent_id, is_directory)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		RETURNING created_at, updated_at
	`
	return r.db.QueryRow(ctx, query,
		file.ID, file.UserID, file.Name, file.VirtualPath, file.Size, file.Checksum, file.MimeType, file.ParentID, file.IsDirectory,
	).Scan(&file.CreatedAt, &file.UpdatedAt)
}

func (r *FileRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.File, error) {
	file := &model.File{}
	query := `
		SELECT id, user_id, name, virtual_path, size, checksum, mime_type, parent_id, is_directory, created_at, updated_at
		FROM files WHERE id = $1
	`
	err := r.db.QueryRow(ctx, query, id).Scan(
		&file.ID, &file.UserID, &file.Name, &file.VirtualPath, &file.Size, &file.Checksum,
		&file.MimeType, &file.ParentID, &file.IsDirectory, &file.CreatedAt, &file.UpdatedAt,
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
		INSERT INTO file_locations (id, file_id, account_id, remote_path, chunk_index, chunk_size, checksum)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING created_at
	`
	return r.db.QueryRow(ctx, query,
		loc.ID, loc.FileID, loc.AccountID, loc.RemotePath, loc.ChunkIndex, loc.ChunkSize, loc.Checksum,
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
