package model

import (
	"time"

	"github.com/google/uuid"
)

type Provider struct {
	ID           uuid.UUID `db:"id" json:"id"`
	Name         string    `db:"name" json:"name"`
	Type         string    `db:"type" json:"type"`
	DisplayName  string    `db:"display_name" json:"display_name"`
	IconURL      string    `db:"icon_url" json:"icon_url"`
	AuthType     string    `db:"auth_type" json:"auth_type"`
	ConfigSchema string    `db:"config_schema" json:"config_schema"`
	IsActive     bool      `db:"is_active" json:"is_active"`
	CreatedAt    time.Time `db:"created_at" json:"created_at"`
}

type ProviderWithStats struct {
	Provider
	AccountCount   int   `json:"account_count"`
	TotalCapacity  int64 `json:"total_capacity"`
	TotalUsed      int64 `json:"total_used"`
	TotalAvailable int64 `json:"total_available"`
}
