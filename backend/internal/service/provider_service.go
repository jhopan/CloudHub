package service

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"storage-gateway/internal/api/dto"
	"storage-gateway/internal/crypto"
	"storage-gateway/internal/model"
	"storage-gateway/internal/rclone"
	"storage-gateway/internal/repository"

	"github.com/google/uuid"
)

type ProviderService struct {
	providerRepo *repository.ProviderRepository
	accountRepo  *repository.StorageAccountRepository
	encryptor    *crypto.Encryptor
	rcloneClient *rclone.Client
}

func NewProviderService(
	providerRepo *repository.ProviderRepository,
	accountRepo *repository.StorageAccountRepository,
	encryptor *crypto.Encryptor,
	rcloneClient *rclone.Client,
) *ProviderService {
	return &ProviderService{
		providerRepo: providerRepo,
		accountRepo:  accountRepo,
		encryptor:    encryptor,
		rcloneClient: rcloneClient,
	}
}

func (s *ProviderService) GetProviders(ctx context.Context) ([]*dto.ProviderResponse, error) {
	providers, err := s.providerRepo.GetAll(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to get providers: %w", err)
	}

	var response []*dto.ProviderResponse
	for _, p := range providers {
		response = append(response, &dto.ProviderResponse{
			ID:           p.ID.String(),
			Name:         p.Name,
			Type:         p.Type,
			DisplayName:  p.DisplayName,
			IconURL:      p.IconURL,
			AuthType:     p.AuthType,
			ConfigSchema: p.ConfigSchema,
			IsActive:     p.IsActive,
		})
	}

	return response, nil
}

func (s *ProviderService) GetProviderByID(ctx context.Context, id uuid.UUID) (*dto.ProviderResponse, error) {
	provider, err := s.providerRepo.GetByID(ctx, id)
	if err != nil {
		return nil, fmt.Errorf("failed to get provider: %w", err)
	}

	return &dto.ProviderResponse{
		ID:           provider.ID.String(),
		Name:         provider.Name,
		Type:         provider.Type,
		DisplayName:  provider.DisplayName,
		IconURL:      provider.IconURL,
		AuthType:     provider.AuthType,
		ConfigSchema: provider.ConfigSchema,
		IsActive:     provider.IsActive,
	}, nil
}

func (s *ProviderService) GetProvidersWithStats(ctx context.Context, userID uuid.UUID) ([]*dto.ProviderWithStatsResponse, error) {
	providers, err := s.providerRepo.GetWithStats(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("failed to get providers with stats: %w", err)
	}

	var response []*dto.ProviderWithStatsResponse
	for _, p := range providers {
		response = append(response, &dto.ProviderWithStatsResponse{
			ProviderResponse: dto.ProviderResponse{
				ID:           p.ID.String(),
				Name:         p.Name,
				Type:         p.Type,
				DisplayName:  p.DisplayName,
				IconURL:      p.IconURL,
				AuthType:     p.AuthType,
				ConfigSchema: p.ConfigSchema,
				IsActive:     p.IsActive,
			},
			AccountCount:   p.AccountCount,
			TotalCapacity:  p.TotalCapacity,
			TotalUsed:      p.TotalUsed,
			TotalAvailable: p.TotalAvailable,
		})
	}

	return response, nil
}

func (s *ProviderService) CreateStorageAccount(ctx context.Context, userID uuid.UUID, req *dto.CreateStorageAccountRequest) (*dto.StorageAccountResponse, error) {
	providerID, err := uuid.Parse(req.ProviderID)
	if err != nil {
		return nil, fmt.Errorf("invalid provider ID: %w", err)
	}

	// Verify provider exists
	provider, err := s.providerRepo.GetByID(ctx, providerID)
	if err != nil {
		return nil, fmt.Errorf("provider not found: %w", err)
	}

	// Encrypt credentials
	credentialsJSON, err := json.Marshal(req.Credentials)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal credentials: %w", err)
	}

	encryptedCredentials, err := s.encryptor.Encrypt(string(credentialsJSON))
	if err != nil {
		return nil, fmt.Errorf("failed to encrypt credentials: %w", err)
	}

	// Generate rclone remote name
	rcloneRemoteName := fmt.Sprintf("%s_%s_%s", provider.Name, userID.String()[:8], req.Name)

	// Create storage account
	account := &model.StorageAccount{
		UserID:           userID,
		ProviderID:       providerID,
		Label:            req.Name,
		Credentials:      []byte(encryptedCredentials),
		RcloneRemoteName: rcloneRemoteName,
		CapacityBytes:    0,
		UsedBytes:        0,
		HealthStatus:     "unknown",
		CostPerGBMonth:   0,
		IsActive:         true,
	}

	// Create rclone remote configuration based on provider type
	rcloneParams := make(map[string]string)
	switch provider.Type {
	case "gdrive":
		rcloneParams["client_id"] = req.Credentials["client_id"]
		rcloneParams["client_secret"] = req.Credentials["client_secret"]
		rcloneParams["scope"] = "drive"
		if refreshToken, ok := req.Credentials["refresh_token"]; ok && refreshToken != "" {
			// Build token JSON for rclone
			tokenJSON := fmt.Sprintf(`{"access_token":"","token_type":"Bearer","refresh_token":"%s","expiry":"0001-01-01T00:00:00Z"}`, refreshToken)
			rcloneParams["token"] = tokenJSON
		}
		if serviceAccountFile, ok := req.Credentials["service_account_file"]; ok && serviceAccountFile != "" {
			rcloneParams["service_account_file"] = serviceAccountFile
		}
		if err := s.rcloneClient.ConfigCreate(ctx, rcloneRemoteName, "drive", rcloneParams); err != nil {
			return nil, fmt.Errorf("failed to create rclone remote for Google Drive: %w", err)
		}

	case "mega":
		rcloneParams["user"] = req.Credentials["email"]
		rcloneParams["pass"] = req.Credentials["password"]
		if err := s.rcloneClient.ConfigCreate(ctx, rcloneRemoteName, "mega", rcloneParams); err != nil {
			return nil, fmt.Errorf("failed to create rclone remote for Mega: %w", err)
		}

	case "onedrive":
		rcloneParams["client_id"] = req.Credentials["client_id"]
		rcloneParams["client_secret"] = req.Credentials["client_secret"]
		rcloneParams["drive_type"] = "personal"
		if refreshToken, ok := req.Credentials["refresh_token"]; ok && refreshToken != "" {
			tokenJSON := fmt.Sprintf(`{"access_token":"","token_type":"Bearer","refresh_token":"%s","expiry":"0001-01-01T00:00:00Z"}`, refreshToken)
			rcloneParams["token"] = tokenJSON
		}
		if err := s.rcloneClient.ConfigCreate(ctx, rcloneRemoteName, "onedrive", rcloneParams); err != nil {
			return nil, fmt.Errorf("failed to create rclone remote for OneDrive: %w", err)
		}

	case "dropbox":
		rcloneParams["client_id"] = req.Credentials["client_id"]
		rcloneParams["client_secret"] = req.Credentials["client_secret"]
		if refreshToken, ok := req.Credentials["refresh_token"]; ok && refreshToken != "" {
			tokenJSON := fmt.Sprintf(`{"access_token":"","token_type":"Bearer","refresh_token":"%s","expiry":"0001-01-01T00:00:00Z"}`, refreshToken)
			rcloneParams["token"] = tokenJSON
		}
		if err := s.rcloneClient.ConfigCreate(ctx, rcloneRemoteName, "dropbox", rcloneParams); err != nil {
			return nil, fmt.Errorf("failed to create rclone remote for Dropbox: %w", err)
		}

	case "r2":
		rcloneParams["provider"] = "Cloudflare"
		rcloneParams["access_key_id"] = req.Credentials["access_key"]
		rcloneParams["secret_access_key"] = req.Credentials["secret_key"]
		rcloneParams["endpoint"] = fmt.Sprintf("https://%s.r2.cloudflarestorage.com", req.Credentials["account_id"])
		rcloneParams["no_check_bucket"] = "true"
		if err := s.rcloneClient.ConfigCreate(ctx, rcloneRemoteName, "s3", rcloneParams); err != nil {
			return nil, fmt.Errorf("failed to create rclone remote for Cloudflare R2: %w", err)
		}

	case "s3":
		rcloneParams["provider"] = "AWS"
		rcloneParams["access_key_id"] = req.Credentials["access_key"]
		rcloneParams["secret_access_key"] = req.Credentials["secret_key"]
		rcloneParams["region"] = req.Credentials["region"]
		if endpoint, ok := req.Credentials["endpoint"]; ok && endpoint != "" {
			rcloneParams["provider"] = "Other"
			rcloneParams["endpoint"] = endpoint
		}
		if err := s.rcloneClient.ConfigCreate(ctx, rcloneRemoteName, "s3", rcloneParams); err != nil {
			return nil, fmt.Errorf("failed to create rclone remote for S3: %w", err)
		}

	case "b2":
		rcloneParams["account"] = req.Credentials["key_id"]
		rcloneParams["key"] = req.Credentials["application_key"]
		if err := s.rcloneClient.ConfigCreate(ctx, rcloneRemoteName, "b2", rcloneParams); err != nil {
			return nil, fmt.Errorf("failed to create rclone remote for Backblaze B2: %w", err)
		}

	case "webdav":
		rcloneParams["url"] = req.Credentials["url"]
		rcloneParams["vendor"] = "other"
		rcloneParams["user"] = req.Credentials["username"]
		rcloneParams["pass"] = req.Credentials["password"]
		if err := s.rcloneClient.ConfigCreate(ctx, rcloneRemoteName, "webdav", rcloneParams); err != nil {
			return nil, fmt.Errorf("failed to create rclone remote for WebDAV: %w", err)
		}

	default:
		return nil, fmt.Errorf("unsupported provider type: %s", provider.Type)
	}

	if err := s.accountRepo.Create(ctx, account); err != nil {
		return nil, fmt.Errorf("failed to create storage account: %w", err)
	}

	return &dto.StorageAccountResponse{
		ID:              account.ID.String(),
		UserID:          account.UserID.String(),
		ProviderID:      account.ProviderID.String(),
		ProviderName:    provider.DisplayName,
		ProviderType:    provider.Type,
		ProviderIconURL: provider.IconURL,
		Label:           account.Label,
		EngineType:      account.EngineType,
		RcloneRemoteName: account.RcloneRemoteName,
		CapacityBytes:   account.CapacityBytes,
		UsedBytes:       account.UsedBytes,
		AvailableBytes:  account.AvailableBytes(),
		HealthStatus:    account.HealthStatus,
		IsActive:        account.IsActive,
		CreatedAt:       account.CreatedAt.Format("2006-01-02T15:04:05Z"),
		UpdatedAt:       account.UpdatedAt.Format("2006-01-02T15:04:05Z"),
	}, nil
}

func (s *ProviderService) GetStorageAccounts(ctx context.Context, userID uuid.UUID) ([]*dto.StorageAccountResponse, error) {
	accounts, err := s.accountRepo.GetByUserID(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("failed to get storage accounts: %w", err)
	}

	var response []*dto.StorageAccountResponse
	for _, acc := range accounts {
		resp := &dto.StorageAccountResponse{
			ID:               acc.ID.String(),
			UserID:           acc.UserID.String(),
			ProviderID:       acc.ProviderID.String(),
			ProviderName:     acc.ProviderDisplayName,
			ProviderType:     acc.ProviderType,
			ProviderIconURL:  acc.ProviderIconURL,
			Label:            acc.Label,
			EngineType:       acc.EngineType,
			RcloneRemoteName: acc.RcloneRemoteName,
			CapacityBytes:    acc.CapacityBytes,
			UsedBytes:        acc.UsedBytes,
			AvailableBytes:   acc.AvailableBytes(),
			HealthStatus:     acc.HealthStatus,
			IsActive:         acc.IsActive,
			CreatedAt:        acc.CreatedAt.Format("2006-01-02T15:04:05Z"),
			UpdatedAt:        acc.UpdatedAt.Format("2006-01-02T15:04:05Z"),
		}

		if acc.LastHealthCheck != nil {
			resp.LastHealthCheck = acc.LastHealthCheck.Format("2006-01-02T15:04:05Z")
		}
		if acc.LastCapacitySync != nil {
			resp.LastCapacitySync = acc.LastCapacitySync.Format("2006-01-02T15:04:05Z")
		}

		response = append(response, resp)
	}

	return response, nil
}

func (s *ProviderService) UpdateStorageAccount(ctx context.Context, userID, accountID uuid.UUID, req *dto.UpdateStorageAccountRequest) (*dto.StorageAccountResponse, error) {
	account, err := s.accountRepo.GetByID(ctx, accountID)
	if err != nil {
		return nil, fmt.Errorf("storage account not found: %w", err)
	}

	if account.UserID != userID {
		return nil, fmt.Errorf("unauthorized: account does not belong to user")
	}

	if req.Name != "" {
		account.Label = req.Name
	}

	if req.Credentials != nil {
		credentialsJSON, err := json.Marshal(req.Credentials)
		if err != nil {
			return nil, fmt.Errorf("failed to marshal credentials: %w", err)
		}

		encryptedCredentials, err := s.encryptor.Encrypt(string(credentialsJSON))
		if err != nil {
			return nil, fmt.Errorf("failed to encrypt credentials: %w", err)
		}

		account.Credentials = []byte(encryptedCredentials)
	}

	if err := s.accountRepo.Update(ctx, account); err != nil {
		return nil, fmt.Errorf("failed to update storage account: %w", err)
	}

	provider, err := s.providerRepo.GetByID(ctx, account.ProviderID)
	if err != nil {
		return nil, fmt.Errorf("failed to get provider: %w", err)
	}

	return &dto.StorageAccountResponse{
		ID:               account.ID.String(),
		UserID:           account.UserID.String(),
		ProviderID:       account.ProviderID.String(),
		ProviderName:     provider.DisplayName,
		ProviderType:     provider.Type,
		ProviderIconURL:  provider.IconURL,
		Label:            account.Label,
		EngineType:       account.EngineType,
		RcloneRemoteName: account.RcloneRemoteName,
		CapacityBytes:    account.CapacityBytes,
		UsedBytes:        account.UsedBytes,
		AvailableBytes:   account.AvailableBytes(),
		HealthStatus:     account.HealthStatus,
		IsActive:         account.IsActive,
		CreatedAt:        account.CreatedAt.Format("2006-01-02T15:04:05Z"),
		UpdatedAt:        account.UpdatedAt.Format("2006-01-02T15:04:05Z"),
	}, nil
}

func (s *ProviderService) DeleteStorageAccount(ctx context.Context, userID, accountID uuid.UUID) error {
	account, err := s.accountRepo.GetByID(ctx, accountID)
	if err != nil {
		return fmt.Errorf("storage account not found: %w", err)
	}

	if account.UserID != userID {
		return fmt.Errorf("unauthorized: account does not belong to user")
	}

	if err := s.accountRepo.Delete(ctx, accountID); err != nil {
		return fmt.Errorf("failed to delete storage account: %w", err)
	}

	return nil
}

// RenameStorageAccount updates only the label (display name) of a storage account
func (s *ProviderService) RenameStorageAccount(ctx context.Context, userID, accountID uuid.UUID, label string) (*dto.StorageAccountResponse, error) {
	account, err := s.accountRepo.GetByID(ctx, accountID)
	if err != nil {
		return nil, fmt.Errorf("storage account not found: %w", err)
	}

	if account.UserID != userID {
		return nil, fmt.Errorf("unauthorized: account does not belong to user")
	}

	if label == "" {
		return nil, fmt.Errorf("label cannot be empty")
	}

	if err := s.accountRepo.UpdateLabel(ctx, accountID, label); err != nil {
		return nil, fmt.Errorf("failed to rename account: %w", err)
	}

	account.Label = label

	provider, err := s.providerRepo.GetByID(ctx, account.ProviderID)
	if err != nil {
		return nil, fmt.Errorf("failed to get provider: %w", err)
	}

	return &dto.StorageAccountResponse{
		ID:               account.ID.String(),
		UserID:           account.UserID.String(),
		ProviderID:       account.ProviderID.String(),
		ProviderName:     provider.DisplayName,
		ProviderType:     provider.Type,
		ProviderIconURL:  provider.IconURL,
		Label:            account.Label,
		EngineType:       account.EngineType,
		RcloneRemoteName: account.RcloneRemoteName,
		CapacityBytes:    account.CapacityBytes,
		UsedBytes:        account.UsedBytes,
		AvailableBytes:   account.AvailableBytes(),
		HealthStatus:     account.HealthStatus,
		IsActive:         account.IsActive,
		CreatedAt:        account.CreatedAt.Format("2006-01-02T15:04:05Z"),
		UpdatedAt:        account.UpdatedAt.Format("2006-01-02T15:04:05Z"),
	}, nil
}

// GetAccountCountForProvider returns the number of accounts a user has for a specific provider type
func (s *ProviderService) GetAccountCountForProvider(ctx context.Context, userID uuid.UUID, providerType string) (int, error) {
	count, err := s.accountRepo.CountByUserAndProvider(ctx, userID, providerType)
	if err != nil {
		return 0, fmt.Errorf("failed to get account count: %w", err)
	}
	return count, nil
}

func (s *ProviderService) GetStoragePool(ctx context.Context, userID uuid.UUID) (*dto.StoragePoolResponse, error) {
	totalCapacity, totalUsed, err := s.accountRepo.GetTotalCapacity(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("failed to get total capacity: %w", err)
	}

	accounts, err := s.accountRepo.GetByUserID(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("failed to get accounts: %w", err)
	}

	providerMap := make(map[uuid.UUID]bool)
	for _, acc := range accounts {
		providerMap[acc.ProviderID] = true
	}

	return &dto.StoragePoolResponse{
		TotalCapacity:  totalCapacity,
		TotalUsed:      totalUsed,
		TotalAvailable: totalCapacity - totalUsed,
		AccountCount:   len(accounts),
		ProviderCount:  len(providerMap),
	}, nil
}

// TestConnectionResult contains the result of a connection test
type TestConnectionResult struct {
	Success        bool   `json:"success"`
	Message        string `json:"message"`
	TotalSpace     int64  `json:"total_space,omitempty"`
	UsedSpace      int64  `json:"used_space,omitempty"`
	FreeSpace      int64  `json:"free_space,omitempty"`
	ResponseTimeMs int64  `json:"response_time_ms"`
}

// TestConnection tests if a storage account connection is working
func (s *ProviderService) TestConnection(ctx context.Context, userID, accountID uuid.UUID) (*TestConnectionResult, error) {
	account, err := s.accountRepo.GetByID(ctx, accountID)
	if err != nil {
		return nil, fmt.Errorf("storage account not found: %w", err)
	}

	if account.UserID != userID {
		return nil, fmt.Errorf("unauthorized: account does not belong to user")
	}

	// Use rclone about to test connection and get storage info
	remoteName := account.RcloneRemoteName
	if remoteName == "" {
		return nil, fmt.Errorf("rclone remote name not configured")
	}

	// Measure response time
	start := time.Now()
	result, err := s.rcloneClient.About(ctx, remoteName)
	elapsed := time.Since(start).Milliseconds()

	if err != nil {
		return &TestConnectionResult{
			Success:        false,
			Message:        fmt.Sprintf("Connection failed: %s", err.Error()),
			ResponseTimeMs: elapsed,
		}, nil
	}

	// Update account with latest capacity info
	if result.Total > 0 {
		account.CapacityBytes = result.Total
		account.UsedBytes = result.Used
		account.HealthStatus = "healthy"
		s.accountRepo.Update(ctx, account)
	}

	return &TestConnectionResult{
		Success:        true,
		Message:        "Connection successful",
		TotalSpace:     result.Total,
		UsedSpace:      result.Used,
		FreeSpace:      result.Free,
		ResponseTimeMs: elapsed,
	}, nil
}
