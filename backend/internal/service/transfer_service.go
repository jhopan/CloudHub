package service

import (
	"context"
	"fmt"
	"time"

	"storage-gateway/internal/api/dto"
	"storage-gateway/internal/model"
	"storage-gateway/internal/repository"

	"github.com/google/uuid"
)

type TransferService struct {
	transferLogRepo *repository.TransferLogRepository
}

func NewTransferService(transferLogRepo *repository.TransferLogRepository) *TransferService {
	return &TransferService{transferLogRepo: transferLogRepo}
}

// LogTransfer creates a new transfer log entry
func (s *TransferService) LogTransfer(ctx context.Context, userID uuid.UUID, fileID *uuid.UUID, accountID *uuid.UUID, operation string, bytes int64) (*model.TransferLog, error) {
	now := time.Now()
	log := &model.TransferLog{
		ID:               uuid.New(),
		FileID:           fileID,
		UserID:           userID,
		AccountID:        accountID,
		Operation:        operation,
		Status:           model.StatusInProgress,
		BytesTransferred: 0,
		RetryCount:       0,
		MaxRetries:       3,
		StartedAt:        &now,
	}

	if err := s.transferLogRepo.Create(ctx, log); err != nil {
		return nil, fmt.Errorf("failed to create transfer log: %w", err)
	}

	return log, nil
}

// CompleteTransfer marks a transfer as completed
func (s *TransferService) CompleteTransfer(ctx context.Context, logID uuid.UUID, bytesTransferred int64) error {
	return s.transferLogRepo.UpdateStatus(ctx, logID, model.StatusCompleted, bytesTransferred, nil)
}

// FailTransfer marks a transfer as failed
func (s *TransferService) FailTransfer(ctx context.Context, logID uuid.UUID, errorMessage string) error {
	return s.transferLogRepo.UpdateStatus(ctx, logID, model.StatusFailed, 0, &errorMessage)
}

// GetTransferLogs retrieves transfer logs for a user
func (s *TransferService) GetTransferLogs(ctx context.Context, userID uuid.UUID, limit, offset int) (*dto.TransferLogListResponse, error) {
	logs, err := s.transferLogRepo.GetByUserID(ctx, userID, limit, offset)
	if err != nil {
		return nil, err
	}

	total, err := s.transferLogRepo.CountByUser(ctx, userID)
	if err != nil {
		return nil, err
	}

	var response []*dto.TransferLogResponse
	for _, log := range logs {
		response = append(response, s.toResponse(log))
	}

	if response == nil {
		response = make([]*dto.TransferLogResponse, 0)
	}

	return &dto.TransferLogListResponse{
		Logs:  response,
		Total: total,
	}, nil
}

func (s *TransferService) toResponse(log *model.TransferLog) *dto.TransferLogResponse {
	resp := &dto.TransferLogResponse{
		ID:               log.ID.String(),
		UserID:           log.UserID.String(),
		Operation:        log.Operation,
		Status:           log.Status,
		BytesTransferred: log.BytesTransferred,
		FileName:         log.FileName,
		ErrorMessage:     log.ErrorMessage,
		RetryCount:       log.RetryCount,
		MaxRetries:       log.MaxRetries,
		CreatedAt:        log.CreatedAt.Format(time.RFC3339),
	}

	if log.FileID != nil {
		fileID := log.FileID.String()
		resp.FileID = &fileID
	}

	if log.AccountID != nil {
		accountID := log.AccountID.String()
		resp.AccountID = &accountID
	}

	if log.StartedAt != nil {
		startedAt := log.StartedAt.Format(time.RFC3339)
		resp.StartedAt = &startedAt
	}

	if log.CompletedAt != nil {
		completedAt := log.CompletedAt.Format(time.RFC3339)
		resp.CompletedAt = &completedAt
	}

	return resp
}
