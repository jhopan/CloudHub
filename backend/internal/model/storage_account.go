package model

import (
	"time"

	"github.com/google/uuid"
)

const (
	HealthStatusHealthy   = "healthy"
	HealthStatusUnhealthy = "unhealthy"
)

type StorageAccount struct {
	ID               uuid.UUID  `db:"id" json:"id"`
	UserID           uuid.UUID  `db:"user_id" json:"user_id"`
	ProviderID       uuid.UUID  `db:"provider_id" json:"provider_id"`
	Label            string     `db:"label" json:"label"`
	Credentials      []byte     `db:"credentials" json:"-"`
	EngineType       string     `db:"engine_type" json:"engine_type"`
	RcloneRemoteName string     `db:"rclone_remote_name" json:"rclone_remote_name"`
	CapacityBytes    int64      `db:"capacity_bytes" json:"capacity_bytes"`
	UsedBytes        int64      `db:"used_bytes" json:"used_bytes"`
	HealthStatus     string     `db:"health_status" json:"health_status"`
	LastHealthCheck  *time.Time `db:"last_health_check" json:"last_health_check"`
	LastCapacitySync *time.Time `db:"last_capacity_sync" json:"last_capacity_sync"`
	CostPerGBMonth   float64    `db:"cost_per_gb_month" json:"cost_per_gb_month"`
	IsActive         bool       `db:"is_active" json:"is_active"`
	CreatedAt        time.Time  `db:"created_at" json:"created_at"`
	UpdatedAt        time.Time  `db:"updated_at" json:"updated_at"`
}

type StorageAccountWithProvider struct {
	StorageAccount
	ProviderDisplayName string `db:"provider_display_name" json:"provider_display_name"`
	ProviderType        string `db:"provider_type" json:"provider_type"`
	ProviderIconURL     string `db:"provider_icon_url" json:"provider_icon_url"`
}

// AvailableBytes is calculated from capacity - used
func (sa *StorageAccount) AvailableBytes() int64 {
	available := sa.CapacityBytes - sa.UsedBytes
	if available < 0 {
		return 0
	}
	return available
}
