package api

import (
	"net/http"
	"path/filepath"
	"time"

	"storage-gateway/internal/api/handlers"
	"storage-gateway/internal/api/middleware"
	"storage-gateway/internal/config"
	"storage-gateway/internal/crypto"
	"storage-gateway/internal/rclone"
	"storage-gateway/internal/repository"
	"storage-gateway/internal/scheduler"
	"storage-gateway/internal/service"
	"storage-gateway/internal/util"

	"github.com/go-chi/chi/v5"
	chimiddleware "github.com/go-chi/chi/v5/middleware"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

func NewRouter(db *pgxpool.Pool, redis *redis.Client, cfg *config.Config) *chi.Mux {
	r := chi.NewRouter()

	// Global middleware
	r.Use(chimiddleware.Logger)
	r.Use(chimiddleware.Recoverer)
	r.Use(chimiddleware.RequestID)
	r.Use(chimiddleware.RealIP)
	r.Use(middleware.CORS())

	// Initialize JWT manager
	jwtManager := util.NewJWTManager(
		cfg.JWTSecret,
		time.Duration(cfg.JWTAccessTokenTTL)*time.Second,
		time.Duration(cfg.JWTRefreshTokenTTL)*time.Second,
	)

	// Initialize encryptor
	encryptor, err := crypto.NewEncryptor(cfg.EncryptionKey)
	if err != nil {
		panic("failed to initialize encryptor: " + err.Error())
	}

	// Initialize rclone client with absolute path
	absConfigPath, _ := filepath.Abs("rclone.conf")
	rcloneClient := rclone.NewClient("rclone", absConfigPath)

	// Initialize scheduler (default: largest_free)
	sched := scheduler.NewScheduler(scheduler.StrategyLargestFree)

	// Initialize repositories
	userRepo := repository.NewUserRepository(db)
	providerRepo := repository.NewProviderRepository(db)
	accountRepo := repository.NewStorageAccountRepository(db)
	fileRepo := repository.NewFileRepository(db)
	transferLogRepo := repository.NewTransferLogRepository(db)

	// Initialize services
	authService := service.NewAuthService(userRepo, jwtManager)
	providerService := service.NewProviderService(providerRepo, accountRepo, encryptor, rcloneClient)
	transferService := service.NewTransferService(transferLogRepo)
	usageService := service.NewUsageService(providerRepo, accountRepo)
	fileService := service.NewFileService(fileRepo, accountRepo, sched, rcloneClient, encryptor, transferService)

	// rclone OAuth service (always available - uses rclone authorize)
	rcloneOAuthService := service.NewRcloneOAuthService(rcloneClient, cfg.RclonePath, accountRepo, providerRepo)

	// Initialize handlers
	authHandler := handlers.NewAuthHandler(authService)
	providerHandler := handlers.NewProviderHandler(providerService)
	fileHandler := handlers.NewFileHandler(fileService)
	transferLogHandler := handlers.NewTransferLogHandler(transferService)
	usageHandler := handlers.NewUsageHandler(usageService)
	oauthHandler := handlers.NewOAuthHandler(rcloneOAuthService)
	accountFileHandler := handlers.NewAccountFileHandler(accountRepo, rcloneClient)
	vfsHandler := handlers.NewVFSHandler(accountRepo, rcloneClient, fileRepo)
	chunkedUploadHandler := handlers.NewChunkedUploadHandler(accountRepo, userRepo, rcloneClient, fileRepo)
	settingsHandler := handlers.NewSettingsHandler(userRepo)

	// Health check
	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))
	})

	// API v1 routes
	r.Route("/api/v1", func(r chi.Router) {
		// Auth routes (public)
		r.Post("/auth/register", authHandler.Register)
		r.Post("/auth/login", authHandler.Login)
		r.Post("/auth/refresh", authHandler.RefreshToken)

		// Protected routes
		r.Group(func(r chi.Router) {
			r.Use(middleware.Auth(jwtManager))
			r.Use(middleware.RateLimitPerUser(redis))

			// User profile
			r.Get("/auth/me", authHandler.GetProfile)

			// Providers
			r.Get("/providers", providerHandler.GetProviders)
			r.Get("/providers/{id}", providerHandler.GetProviderByID)

			// Storage Accounts
			r.Post("/storage-accounts", providerHandler.CreateStorageAccount)
			r.Get("/storage-accounts", providerHandler.GetStorageAccounts)
			r.Put("/storage-accounts/{accountID}", providerHandler.UpdateStorageAccount)
			r.Delete("/storage-accounts/{accountID}", providerHandler.DeleteStorageAccount)
			r.Post("/storage-accounts/{accountID}/test", providerHandler.TestStorageAccountConnection)

			// Account File Browser
			r.Get("/storage-accounts/{id}/files", accountFileHandler.ListFiles)
			r.Post("/storage-accounts/{id}/files/upload", accountFileHandler.UploadFile)
			r.Get("/storage-accounts/{id}/files/download", accountFileHandler.DownloadFile)
			r.Delete("/storage-accounts/{id}/files", accountFileHandler.DeleteFile)
			r.Post("/storage-accounts/{id}/files/mkdir", accountFileHandler.CreateFolder)

			// Virtual Filesystem (global)
			r.Get("/vfs/list", vfsHandler.List)
			r.Get("/vfs/download", vfsHandler.Download)
			r.Post("/vfs/mkdir", vfsHandler.Mkdir)
			r.Delete("/vfs/delete", vfsHandler.Delete)
			r.Post("/vfs/sync", vfsHandler.Sync)

			// Chunked Upload (resumable)
			r.Post("/vfs/upload/init", chunkedUploadHandler.InitUpload)
			r.Post("/vfs/upload/auto-init", chunkedUploadHandler.AutoInitUpload)
			r.Put("/vfs/upload/{upload_id}/chunk/{chunk_number}", chunkedUploadHandler.UploadChunk)
			r.Get("/vfs/upload/{upload_id}/status", chunkedUploadHandler.GetUploadStatus)
			r.Post("/vfs/upload/{upload_id}/finalize", chunkedUploadHandler.FinalizeUpload)
			r.Delete("/vfs/upload/{upload_id}", chunkedUploadHandler.CancelUpload)

			// Settings
			r.Get("/settings", settingsHandler.GetSettings)
			r.Put("/settings", settingsHandler.UpdateSettings)

			// Storage Pool
			r.Get("/storage-pool", providerHandler.GetStoragePool)

			// Usage Stats
			r.Get("/usage", usageHandler.GetUsageStats)

			// Files
			r.Post("/files/upload", fileHandler.Upload)
			r.Get("/files", fileHandler.ListFiles)
			r.Get("/files/search", fileHandler.SearchFiles)
			r.Post("/files/folder", fileHandler.CreateFolder)
			r.Get("/files/{fileID}", fileHandler.GetFile)
			r.Get("/files/{fileID}/download", fileHandler.Download)
			r.Put("/files/{fileID}/rename", fileHandler.RenameFile)
			r.Delete("/files/{fileID}", fileHandler.DeleteFile)

			// Transfer Logs
			r.Get("/transfer-logs", transferLogHandler.GetTransferLogs)

			// Google OAuth (protected - user must be logged in)
			r.Get("/oauth/google/initiate", oauthHandler.InitiateOAuth)
			r.Get("/oauth/status", oauthHandler.CheckOAuthStatus)
			r.Post("/oauth/callback", oauthHandler.SubmitCallback)
			})

			// Admin routes
		r.Group(func(r chi.Router) {
			r.Use(middleware.Auth(jwtManager))
			r.Use(middleware.RequireRole("admin"))

			// TODO: Add admin routes in future phases
		})
	})

	return r
}
