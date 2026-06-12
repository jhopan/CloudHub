package service

import (
	"context"
	"fmt"

	"storage-gateway/internal/api/dto"
	"storage-gateway/internal/repository"

	"github.com/google/uuid"
)

type UsageService struct {
	providerRepo *repository.ProviderRepository
	accountRepo  *repository.StorageAccountRepository
}

func NewUsageService(providerRepo *repository.ProviderRepository, accountRepo *repository.StorageAccountRepository) *UsageService {
	return &UsageService{
		providerRepo: providerRepo,
		accountRepo:  accountRepo,
	}
}

func (s *UsageService) GetUsageStats(ctx context.Context, userID uuid.UUID) (*dto.UsageStatsResponse, error) {
	// Get all providers
	providers, err := s.providerRepo.GetAll(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to get providers: %w", err)
	}

	// Get all storage accounts
	accounts, err := s.accountRepo.GetByUserID(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("failed to get accounts: %w", err)
	}

	// Build provider stats
	var providerStats []dto.ProviderUsageStats
	var totalCapacity, totalUsed int64
	var totalAccounts, healthyAccounts, unhealthyAccounts int

	for _, provider := range providers {
		var provCapacity, provUsed int64
		var provAccounts []dto.AccountUsageStats
		var provAccountCount int

		for _, acc := range accounts {
			if acc.ProviderID == provider.ID {
				provAccountCount++
				totalAccounts++

				free := acc.CapacityBytes - acc.UsedBytes
				if free < 0 {
					free = 0
				}

				usagePercent := float64(0)
				if acc.CapacityBytes > 0 {
					usagePercent = float64(acc.UsedBytes) / float64(acc.CapacityBytes) * 100
				}

				// Health status tracking
				if acc.HealthStatus == "healthy" || acc.HealthStatus == "" {
					healthyAccounts++
				} else {
					unhealthyAccounts++
				}

				var lastHealthCheck, lastCapacitySync *string
				if acc.LastHealthCheck != nil {
					s := acc.LastHealthCheck.Format("2006-01-02T15:04:05Z07:00")
					lastHealthCheck = &s
				}
				if acc.LastCapacitySync != nil {
					s := acc.LastCapacitySync.Format("2006-01-02T15:04:05Z07:00")
					lastCapacitySync = &s
				}

				accountStat := dto.AccountUsageStats{
					AccountID:        acc.ID.String(),
					Label:            acc.Label,
					RemoteName:       acc.RcloneRemoteName,
					HealthStatus:     acc.HealthStatus,
					Capacity:         acc.CapacityBytes,
					Used:             acc.UsedBytes,
					Free:             free,
					UsagePercent:     usagePercent,
					LastHealthCheck:  lastHealthCheck,
					LastCapacitySync: lastCapacitySync,
					CostPerGBMonth:   acc.CostPerGBMonth,
				}

				provAccounts = append(provAccounts, accountStat)
				provCapacity += acc.CapacityBytes
				provUsed += acc.UsedBytes
			}
		}

		provFree := provCapacity - provUsed
		if provFree < 0 {
			provFree = 0
		}

		provUsagePercent := float64(0)
		if provCapacity > 0 {
			provUsagePercent = float64(provUsed) / float64(provCapacity) * 100
		}

		if provAccounts == nil {
			provAccounts = make([]dto.AccountUsageStats, 0)
		}

		providerStats = append(providerStats, dto.ProviderUsageStats{
			ProviderID:    provider.ID.String(),
			ProviderName:  provider.Name,
			ProviderType:  provider.Type,
			IconURL:       provider.IconURL,
			AccountCount:  provAccountCount,
			TotalCapacity: provCapacity,
			TotalUsed:     provUsed,
			TotalFree:     provFree,
			UsagePercent:  provUsagePercent,
			Accounts:      provAccounts,
		})

		totalCapacity += provCapacity
		totalUsed += provUsed
	}

	totalFree := totalCapacity - totalUsed
	if totalFree < 0 {
		totalFree = 0
	}

	overallUsage := float64(0)
	if totalCapacity > 0 {
		overallUsage = float64(totalUsed) / float64(totalCapacity) * 100
	}

	if providerStats == nil {
		providerStats = make([]dto.ProviderUsageStats, 0)
	}

	return &dto.UsageStatsResponse{
		Providers: providerStats,
		Summary: dto.UsageSummary{
			TotalProviders:    len(providers),
			TotalAccounts:     totalAccounts,
			TotalCapacity:     totalCapacity,
			TotalUsed:         totalUsed,
			TotalFree:         totalFree,
			OverallUsage:      overallUsage,
			HealthyAccounts:   healthyAccounts,
			UnhealthyAccounts: unhealthyAccounts,
		},
	}, nil
}
