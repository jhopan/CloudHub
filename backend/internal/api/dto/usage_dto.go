package dto

type UsageStatsResponse struct {
	Providers []ProviderUsageStats `json:"providers"`
	Summary   UsageSummary         `json:"summary"`
}

type ProviderUsageStats struct {
	ProviderID    string             `json:"provider_id"`
	ProviderName  string             `json:"provider_name"`
	ProviderType  string             `json:"provider_type"`
	IconURL       string             `json:"icon_url"`
	AccountCount  int                `json:"account_count"`
	TotalCapacity int64              `json:"total_capacity"`
	TotalUsed     int64              `json:"total_used"`
	TotalFree     int64              `json:"total_free"`
	UsagePercent  float64            `json:"usage_percent"`
	Accounts      []AccountUsageStats `json:"accounts"`
}

type AccountUsageStats struct {
	AccountID        string  `json:"account_id"`
	Label            string  `json:"label"`
	RemoteName       string  `json:"remote_name"`
	HealthStatus     string  `json:"health_status"`
	Capacity         int64   `json:"capacity"`
	Used             int64   `json:"used"`
	Free             int64   `json:"free"`
	UsagePercent     float64 `json:"usage_percent"`
	LastHealthCheck  *string `json:"last_health_check,omitempty"`
	LastCapacitySync *string `json:"last_capacity_sync,omitempty"`
	CostPerGBMonth   float64 `json:"cost_per_gb_month"`
}

type UsageSummary struct {
	TotalProviders   int     `json:"total_providers"`
	TotalAccounts    int     `json:"total_accounts"`
	TotalCapacity    int64   `json:"total_capacity"`
	TotalUsed        int64   `json:"total_used"`
	TotalFree        int64   `json:"total_free"`
	OverallUsage     float64 `json:"overall_usage_percent"`
	HealthyAccounts  int     `json:"healthy_accounts"`
	UnhealthyAccounts int    `json:"unhealthy_accounts"`
}
