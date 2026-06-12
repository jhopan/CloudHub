package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"mime"
	"path/filepath"
	"strings"
	"time"

	"storage-gateway/internal/api/dto"
	"storage-gateway/internal/crypto"
	"storage-gateway/internal/model"
	"storage-gateway/internal/rclone"
	"storage-gateway/internal/repository"
	"storage-gateway/internal/scheduler"

	"github.com/google/uuid"
)

type FileService struct {
	fileRepo        *repository.FileRepository
	accountRepo     *repository.StorageAccountRepository
	scheduler       *scheduler.Scheduler
	rcloneClient    *rclone.Client
	encryptor       *crypto.Encryptor
	transferService *TransferService
}

func NewFileService(
	fileRepo *repository.FileRepository,
	accountRepo *repository.StorageAccountRepository,
	sched *scheduler.Scheduler,
	rcloneClient *rclone.Client,
	encryptor *crypto.Encryptor,
	transferService *TransferService,
) *FileService {
	return &FileService{
		fileRepo:        fileRepo,
		accountRepo:     accountRepo,
		scheduler:       sched,
		rcloneClient:    rcloneClient,
		encryptor:       encryptor,
		transferService: transferService,
	}
}

// Upload stores a file in the best storage account
func (s *FileService) Upload(ctx context.Context, userID uuid.UUID, filename string, reader io.Reader, parentID *uuid.UUID) (*dto.FileResponse, error) {
	// Read file into memory
	data, err := io.ReadAll(reader)
	if err != nil {
		return nil, fmt.Errorf("failed to read file: %w", err)
	}

	fileSize := int64(len(data))

	// Calculate checksum
	hash := sha256.Sum256(data)
	checksum := hex.EncodeToString(hash[:])

	// Detect MIME type
	mimeType := mime.TypeByExtension(filepath.Ext(filename))
	if mimeType == "" {
		mimeType = "application/octet-stream"
	}

	// Build virtual path
	virtualPath := "/" + filename
	if parentID != nil {
		parentFile, err := s.fileRepo.GetByID(ctx, *parentID)
		if err != nil {
			return nil, fmt.Errorf("parent folder not found: %w", err)
		}
		virtualPath = parentFile.VirtualPath + "/" + filename
	}

	// Get user's storage accounts
	accounts, err := s.accountRepo.GetByUserID(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("failed to get storage accounts: %w", err)
	}

	if len(accounts) == 0 {
		return nil, fmt.Errorf("no storage accounts configured")
	}

	// Convert to model.StorageAccount for scheduler
	var modelAccounts []*model.StorageAccount
	for _, acc := range accounts {
		if acc.IsActive {
			modelAccounts = append(modelAccounts, &acc.StorageAccount)
		}
	}

	// Select best account using scheduler
	selectedAccount, err := s.scheduler.SelectAccount(modelAccounts, fileSize)
	if err != nil {
		return nil, fmt.Errorf("scheduler error: %w", err)
	}

	// Build remote path
	remotePath := fmt.Sprintf("/cloudhub/%s/%s", userID.String()[:8], filename)

	// Get rclone remote name
	remoteName := selectedAccount.RcloneRemoteName

	// Upload via rclone
	// Log transfer start
	transferLog, err := s.transferService.LogTransfer(ctx, userID, nil, &selectedAccount.ID, model.OpUpload, fileSize)
	if err != nil {
		return nil, fmt.Errorf("failed to log transfer: %w", err)
	}

	err = s.rcloneClient.CopyStream(ctx, strings.NewReader(string(data)), remoteName, remotePath)
	if err != nil {
		s.transferService.FailTransfer(ctx, transferLog.ID, err.Error())
		return nil, fmt.Errorf("upload failed: %w", err)
	}

	// Create file metadata
	fileID := uuid.New()
	file := &model.File{
		ID:          fileID,
		UserID:      userID,
		Name:        filename,
		VirtualPath: virtualPath,
		Size:        fileSize,
		Checksum:    checksum,
		MimeType:    mimeType,
		ParentID:    parentID,
		IsDirectory: false,
	}

	if err := s.fileRepo.Create(ctx, file); err != nil {
		return nil, fmt.Errorf("failed to save metadata: %w", err)
	}

	// Save file location
	loc := &model.FileLocation{
		ID:         uuid.New(),
		FileID:     fileID,
		AccountID:  selectedAccount.ID,
		RemotePath: remotePath,
		ChunkIndex: 0,
		ChunkSize:  fileSize,
		Checksum:   checksum,
	}

	if err := s.fileRepo.AddLocation(ctx, loc); err != nil {
		return nil, fmt.Errorf("failed to save location: %w", err)
	}

	// Update account usage
	selectedAccount.UsedBytes += fileSize
	if err := s.accountRepo.Update(ctx, selectedAccount); err != nil {
		fmt.Printf("Warning: failed to update account usage: %v\n", err)
	}

	// Log transfer completion
	s.transferService.CompleteTransfer(ctx, transferLog.ID, fileSize)

	return s.fileToResponse(file, 1), nil
}

// Download retrieves a file from storage
func (s *FileService) Download(ctx context.Context, userID, fileID uuid.UUID) (io.ReadCloser, *model.File, error) {
	file, err := s.fileRepo.GetByID(ctx, fileID)
	if err != nil {
		return nil, nil, err
	}

	if file.UserID != userID {
		return nil, nil, fmt.Errorf("unauthorized")
	}

	locations, err := s.fileRepo.GetLocations(ctx, fileID)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to get locations: %w", err)
	}

	if len(locations) == 0 {
		return nil, nil, fmt.Errorf("file has no storage location")
	}

	// Get the storage account for the first location
	account, err := s.accountRepo.GetByID(ctx, locations[0].AccountID)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to get account: %w", err)
	}

	// Log transfer start
	transferLog, err := s.transferService.LogTransfer(ctx, userID, &fileID, &account.ID, model.OpDownload, file.Size)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to log transfer: %w", err)
	}

	// Download via rclone
	reader, err := s.rcloneClient.CatStream(ctx, account.RcloneRemoteName, locations[0].RemotePath)
	if err != nil {
		s.transferService.FailTransfer(ctx, transferLog.ID, err.Error())
		return nil, nil, fmt.Errorf("download failed: %w", err)
	}

	// Wrap with checksum verification
	verifiedReader := NewChecksumReader(reader, file.Checksum, file.Name)

	// Log transfer completion (note: actual bytes transferred will be updated when stream is consumed)
	s.transferService.CompleteTransfer(ctx, transferLog.ID, file.Size)

	return verifiedReader, file, nil
}

// ListFiles returns files in a directory
func (s *FileService) ListFiles(ctx context.Context, userID uuid.UUID, parentID *uuid.UUID) ([]*dto.FileResponse, error) {
	files, err := s.fileRepo.ListByUser(ctx, userID, parentID)
	if err != nil {
		return nil, err
	}

	var response []*dto.FileResponse
	for _, f := range files {
		locs, _ := s.fileRepo.GetLocations(ctx, f.ID)
		response = append(response, s.fileToResponse(f, len(locs)))
	}

	if response == nil {
		response = make([]*dto.FileResponse, 0)
	}

	return response, nil
}

// SearchFiles searches for files by name
func (s *FileService) SearchFiles(ctx context.Context, userID uuid.UUID, query string) ([]*dto.FileResponse, error) {
	files, err := s.fileRepo.Search(ctx, userID, query)
	if err != nil {
		return nil, err
	}

	var response []*dto.FileResponse
	for _, f := range files {
		locs, _ := s.fileRepo.GetLocations(ctx, f.ID)
		response = append(response, s.fileToResponse(f, len(locs)))
	}

	if response == nil {
		response = make([]*dto.FileResponse, 0)
	}

	return response, nil
}

// CreateFolder creates a virtual folder
func (s *FileService) CreateFolder(ctx context.Context, userID uuid.UUID, name string, parentID *uuid.UUID) (*dto.FileResponse, error) {
	// Build virtual path
	virtualPath := "/" + name
	if parentID != nil {
		parentFile, err := s.fileRepo.GetByID(ctx, *parentID)
		if err != nil {
			return nil, fmt.Errorf("parent folder not found: %w", err)
		}
		virtualPath = parentFile.VirtualPath + "/" + name
	}

	file := &model.File{
		ID:          uuid.New(),
		UserID:      userID,
		Name:        name,
		VirtualPath: virtualPath,
		IsDirectory: true,
		ParentID:    parentID,
		MimeType:    "folder",
	}

	if err := s.fileRepo.Create(ctx, file); err != nil {
		return nil, err
	}

	return s.fileToResponse(file, 0), nil
}

// Rename renames a file or folder
func (s *FileService) Rename(ctx context.Context, userID, fileID uuid.UUID, newName string) (*dto.FileResponse, error) {
	file, err := s.fileRepo.GetByID(ctx, fileID)
	if err != nil {
		return nil, err
	}

	if file.UserID != userID {
		return nil, fmt.Errorf("unauthorized")
	}

	file.Name = newName
	// Update virtual path
	oldPath := file.VirtualPath
	dir := filepath.Dir(oldPath)
	file.VirtualPath = dir + "/" + newName

	if err := s.fileRepo.Update(ctx, file); err != nil {
		return nil, err
	}

	locs, _ := s.fileRepo.GetLocations(ctx, file.ID)
	return s.fileToResponse(file, len(locs)), nil
}

// DeleteFile deletes a file from storage and metadata
func (s *FileService) DeleteFile(ctx context.Context, userID, fileID uuid.UUID) error {
	file, err := s.fileRepo.GetByID(ctx, fileID)
	if err != nil {
		return err
	}

	if file.UserID != userID {
		return fmt.Errorf("unauthorized")
	}

	// Delete physical files
	if !file.IsDirectory {
		locations, err := s.fileRepo.GetLocations(ctx, fileID)
		if err == nil {
			for _, loc := range locations {
				account, err := s.accountRepo.GetByID(ctx, loc.AccountID)
				if err == nil {
					// Log transfer start
					transferLog, _ := s.transferService.LogTransfer(ctx, userID, &fileID, &account.ID, model.OpDelete, loc.ChunkSize)

					// Delete from remote
					err = s.rcloneClient.Delete(ctx, account.RcloneRemoteName, loc.RemotePath)
					if err != nil {
						s.transferService.FailTransfer(ctx, transferLog.ID, err.Error())
					} else {
						s.transferService.CompleteTransfer(ctx, transferLog.ID, loc.ChunkSize)
					}

					// Update account usage
					account.UsedBytes -= loc.ChunkSize
					if account.UsedBytes < 0 {
						account.UsedBytes = 0
					}
					s.accountRepo.Update(ctx, account)
				}
			}
		}
		s.fileRepo.DeleteLocations(ctx, fileID)
	}

	// Delete metadata
	return s.fileRepo.Delete(ctx, fileID)
}

// GetFile returns file metadata
func (s *FileService) GetFile(ctx context.Context, userID, fileID uuid.UUID) (*dto.FileResponse, error) {
	file, err := s.fileRepo.GetByID(ctx, fileID)
	if err != nil {
		return nil, err
	}

	if file.UserID != userID {
		return nil, fmt.Errorf("unauthorized")
	}

	locs, _ := s.fileRepo.GetLocations(ctx, file.ID)
	return s.fileToResponse(file, len(locs)), nil
}

func (s *FileService) fileToResponse(f *model.File, locCount int) *dto.FileResponse {
	resp := &dto.FileResponse{
		ID:            f.ID.String(),
		UserID:        f.UserID.String(),
		Name:          f.Name,
		VirtualPath:   f.VirtualPath,
		Size:          f.Size,
		Checksum:      f.Checksum,
		MimeType:      f.MimeType,
		IsDirectory:   f.IsDirectory,
		LocationCount: locCount,
		CreatedAt:     f.CreatedAt.Format(time.RFC3339),
		UpdatedAt:     f.UpdatedAt.Format(time.RFC3339),
	}

	if f.ParentID != nil {
		resp.ParentID = f.ParentID.String()
	}

	return resp
}
