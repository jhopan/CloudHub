package config

import (
	"fmt"

	"github.com/spf13/viper"
)

type Config struct {
	// Server
	Port        int    `mapstructure:"port"`
	Environment string `mapstructure:"environment"`

	// Database
	DatabaseURL string `mapstructure:"database_url"`

	// Redis
	RedisAddr     string `mapstructure:"redis_addr"`
	RedisPassword string `mapstructure:"redis_password"`
	RedisDB       int    `mapstructure:"redis_db"`

	// JWT
	JWTSecret          string `mapstructure:"jwt_secret"`
	JWTAccessTokenTTL  int    `mapstructure:"jwt_access_token_ttl"`
	JWTRefreshTokenTTL int    `mapstructure:"jwt_refresh_token_ttl"`

	// Encryption
	EncryptionKey string `mapstructure:"encryption_key"`

	// rclone
	RclonePath       string `mapstructure:"rclone_path"`
	RcloneConfigPath string `mapstructure:"rclone_config_path"`

	// App URLs (for VPS/headless deployment)
	AppBaseURL        string `mapstructure:"app_base_url"`
	OAuthRedirectHost string `mapstructure:"oauth_redirect_host"`

	// Upload
	MaxUploadSize     int64 `mapstructure:"max_upload_size"`
	UploadConcurrency int   `mapstructure:"upload_concurrency"`

	// Google OAuth
	GoogleOAuthClientID     string `mapstructure:"google_oauth_client_id"`
	GoogleOAuthClientSecret string `mapstructure:"google_oauth_client_secret"`
	GoogleOAuthRedirectURI  string `mapstructure:"google_oauth_redirect_uri"`

	// Workers
	WorkerCapacityRefreshInterval int `mapstructure:"worker_capacity_refresh_interval"`
	WorkerHealthCheckInterval     int `mapstructure:"worker_health_check_interval"`
	WorkerRetryTransferInterval   int `mapstructure:"worker_retry_transfer_interval"`
	WorkerOrphanCleanupInterval   int `mapstructure:"worker_orphan_cleanup_interval"`
}

func Load() (*Config, error) {
	viper.SetConfigName("config")
	viper.SetConfigType("yaml")
	viper.AddConfigPath(".")
	viper.AddConfigPath("./config")

	// Set defaults
	viper.SetDefault("port", 8080)
	viper.SetDefault("environment", "development")
	viper.SetDefault("redis_db", 0)
	viper.SetDefault("jwt_access_token_ttl", 900)  // 15 minutes
	viper.SetDefault("jwt_refresh_token_ttl", 604800) // 7 days
	viper.SetDefault("rclone_path", "rclone")
	viper.SetDefault("rclone_config_path", "/etc/rclone/rclone.conf")
	viper.SetDefault("app_base_url", "http://localhost:3000")
	viper.SetDefault("oauth_redirect_host", "127.0.0.1")
	viper.SetDefault("max_upload_size", 10737418240) // 10 GB
	viper.SetDefault("upload_concurrency", 10)
	viper.SetDefault("worker_capacity_refresh_interval", 900) // 15 min
	viper.SetDefault("worker_health_check_interval", 300)     // 5 min
	viper.SetDefault("worker_retry_transfer_interval", 600)   // 10 min
	viper.SetDefault("worker_orphan_cleanup_interval", 3600)  // 1 hour

	// Read from environment
	viper.AutomaticEnv()

	// Try to read config file (optional)
	if err := viper.ReadInConfig(); err != nil {
		// Config file is optional, use environment variables
		if _, ok := err.(viper.ConfigFileNotFoundError); !ok {
			return nil, fmt.Errorf("error reading config file: %w", err)
		}
	}

	var cfg Config
	if err := viper.Unmarshal(&cfg); err != nil {
		return nil, fmt.Errorf("error unmarshaling config: %w", err)
	}

	// Validate required fields
	if cfg.DatabaseURL == "" {
		return nil, fmt.Errorf("database_url is required")
	}
	if cfg.JWTSecret == "" {
		return nil, fmt.Errorf("jwt_secret is required")
	}
	if cfg.EncryptionKey == "" {
		return nil, fmt.Errorf("encryption_key is required")
	}
	if len(cfg.EncryptionKey) != 32 {
		return nil, fmt.Errorf("encryption_key must be exactly 32 characters")
	}

	return &cfg, nil
}
