package dto

type CreateStorageAccountRequest struct {
	ProviderID  string            `json:"provider_id" validate:"required,uuid"`
	Name        string            `json:"name" validate:"required,min=1,max=100"`
	Credentials map[string]string `json:"credentials" validate:"required"`
}

type UpdateStorageAccountRequest struct {
	Name        string            `json:"name" validate:"omitempty,min=1,max=100"`
	Credentials map[string]string `json:"credentials" validate:"omitempty"`
}

type RenameStorageAccountRequest struct {
	Label string `json:"label" validate:"required,min=1,max=100"`
}

type AccountCountResponse struct {
	Count      int    `json:"count"`
	NextLabel  string `json:"next_label"`
}

type ProviderResponse struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	Type         string `json:"type"`
	DisplayName  string `json:"display_name"`
	IconURL      string `json:"icon_url"`
	AuthType     string `json:"auth_type"`
	ConfigSchema string `json:"config_schema"`
	IsActive     bool   `json:"is_active"`
}

type ProviderWithStatsResponse struct {
	ProviderResponse
	AccountCount   int   `json:"account_count"`
	TotalCapacity  int64 `json:"total_capacity"`
	TotalUsed      int64 `json:"total_used"`
	TotalAvailable int64 `json:"total_available"`
}

type StorageAccountResponse struct {
	ID               string  `json:"id"`
	UserID           string  `json:"user_id"`
	ProviderID       string  `json:"provider_id"`
	ProviderName     string  `json:"provider_name"`
	ProviderType     string  `json:"provider_type"`
	ProviderIconURL  string  `json:"provider_icon_url"`
	Label            string  `json:"label"`
	EngineType       string  `json:"engine_type"`
	RcloneRemoteName string  `json:"rclone_remote_name"`
	CapacityBytes    int64   `json:"capacity_bytes"`
	UsedBytes        int64   `json:"used_bytes"`
	AvailableBytes   int64   `json:"available_bytes"`
	HealthStatus     string  `json:"health_status"`
	IsActive         bool    `json:"is_active"`
	CostPerGBMonth   float64 `json:"cost_per_gb_month"`
	LastHealthCheck  string  `json:"last_health_check,omitempty"`
	LastCapacitySync string  `json:"last_capacity_sync,omitempty"`
	CreatedAt        string  `json:"created_at"`
	UpdatedAt        string  `json:"updated_at"`
}

type StoragePoolResponse struct {
	TotalCapacity  int64 `json:"total_capacity"`
	TotalUsed      int64 `json:"total_used"`
	TotalAvailable int64 `json:"total_available"`
	AccountCount   int   `json:"account_count"`
	ProviderCount  int   `json:"provider_count"`
}
