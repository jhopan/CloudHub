package handlers

import (
	"encoding/json"
	"net/http"
	"os/exec"
	"runtime"
	"strconv"
	"strings"
	"time"

	"storage-gateway/internal/api/apiutil"
	"storage-gateway/internal/repository"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// startTime tracks when the server was started for uptime calculation
var startTime = time.Now()

// AdminHandler handles admin-only API endpoints
type AdminHandler struct {
	userRepo     *repository.UserRepository
	accountRepo  *repository.StorageAccountRepository
	providerRepo *repository.ProviderRepository
	transferRepo *repository.TransferLogRepository
	fileRepo     *repository.FileRepository
	db           *pgxpool.Pool
}

// NewAdminHandler creates a new AdminHandler
func NewAdminHandler(
	userRepo *repository.UserRepository,
	accountRepo *repository.StorageAccountRepository,
	providerRepo *repository.ProviderRepository,
	transferRepo *repository.TransferLogRepository,
	fileRepo *repository.FileRepository,
	db *pgxpool.Pool,
) *AdminHandler {
	return &AdminHandler{
		userRepo:     userRepo,
		accountRepo:  accountRepo,
		providerRepo: providerRepo,
		transferRepo: transferRepo,
		fileRepo:     fileRepo,
		db:           db,
	}
}

// Dashboard returns aggregated dashboard statistics
func (h *AdminHandler) Dashboard(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	totalUsers, err := h.userRepo.CountAll(ctx)
	if err != nil {
		apiutil.InternalError(w, "Failed to count users")
		return
	}

	totalAccounts, totalCapacity, totalUsed, activeAccounts, unhealthyAccounts, err := h.accountRepo.CountAll(ctx)
	if err != nil {
		apiutil.InternalError(w, "Failed to count accounts")
		return
	}

	totalFiles, err := h.fileRepo.CountAll(ctx)
	if err != nil {
		apiutil.InternalError(w, "Failed to count files")
		return
	}

	transfersToday, err := h.transferRepo.CountToday(ctx)
	if err != nil {
		apiutil.InternalError(w, "Failed to count transfers")
		return
	}

	apiutil.RespondJSON(w, http.StatusOK, map[string]interface{}{
		"total_users":           totalUsers,
		"total_accounts":        totalAccounts,
		"total_storage_bytes":   totalCapacity,
		"used_storage_bytes":    totalUsed,
		"total_files":           totalFiles,
		"total_transfers_today": transfersToday,
		"active_accounts":       activeAccounts,
		"unhealthy_accounts":    unhealthyAccounts,
	})
}

// ListUsers returns a paginated list of all users
func (h *AdminHandler) ListUsers(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	if page < 1 {
		page = 1
	}
	perPage, _ := strconv.Atoi(r.URL.Query().Get("per_page"))
	if perPage < 1 || perPage > 100 {
		perPage = 20
	}

	users, total, err := h.userRepo.GetAll(ctx, page, perPage)
	if err != nil {
		apiutil.InternalError(w, "Failed to list users")
		return
	}

	// Get accounts count per user
	accountsCountMap, err := h.userRepo.GetAccountsCountByUser(ctx)
	if err != nil {
		apiutil.InternalError(w, "Failed to get accounts count")
		return
	}

	type UserResponse struct {
		ID                string    `json:"id"`
		Email             string    `json:"email"`
		DisplayName       string    `json:"display_name"`
		Role              string    `json:"role"`
		CreatedAt         time.Time `json:"created_at"`
		EncryptionEnabled bool      `json:"encryption_enabled"`
		SchedulerMode     string    `json:"scheduler_mode"`
		AccountsCount     int       `json:"accounts_count"`
	}

	var userResponses []UserResponse
	for _, u := range users {
		ur := UserResponse{
			ID:                u.ID.String(),
			Email:             u.Email,
			DisplayName:       u.DisplayName,
			Role:              u.Role,
			CreatedAt:         u.CreatedAt,
			EncryptionEnabled: u.EncryptionEnabled,
			SchedulerMode:     u.SchedulerMode,
			AccountsCount:     accountsCountMap[u.ID.String()],
		}
		userResponses = append(userResponses, ur)
	}

	if userResponses == nil {
		userResponses = []UserResponse{}
	}

	apiutil.RespondJSON(w, http.StatusOK, map[string]interface{}{
		"users":    userResponses,
		"total":    total,
		"page":     page,
		"per_page": perPage,
	})
}

// UpdateUser updates a user's role
func (h *AdminHandler) UpdateUser(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	userIDStr := chi.URLParam(r, "id")
	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		apiutil.BadRequest(w, "Invalid user ID")
		return
	}

	var body struct {
		Role string `json:"role"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		apiutil.BadRequest(w, "Invalid request body")
		return
	}

	if body.Role != "admin" && body.Role != "user" {
		apiutil.BadRequest(w, "Role must be 'admin' or 'user'")
		return
	}

	// Prevent admin from demoting themselves
	currentUserID, _ := ctx.Value("user_id").(string)
	if currentUserID == userID.String() && body.Role != "admin" {
		apiutil.BadRequest(w, "Cannot demote yourself from admin")
		return
	}

	// Check user exists
	existingUser, err := h.userRepo.GetByID(ctx, userID)
	if err != nil {
		apiutil.NotFound(w, "User not found")
		return
	}

	if err := h.userRepo.UpdateRole(ctx, userID, body.Role); err != nil {
		apiutil.InternalError(w, "Failed to update user role")
		return
	}

	apiutil.RespondJSON(w, http.StatusOK, map[string]interface{}{
		"message": "User role updated",
		"user_id": existingUser.ID.String(),
		"role":    body.Role,
	})
}

// DeleteUser deletes a user and all their data
func (h *AdminHandler) DeleteUser(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	userIDStr := chi.URLParam(r, "id")
	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		apiutil.BadRequest(w, "Invalid user ID")
		return
	}

	// Prevent admin from deleting themselves
	currentUserID, _ := ctx.Value("user_id").(string)
	if currentUserID == userID.String() {
		apiutil.BadRequest(w, "Cannot delete yourself")
		return
	}

	// Check user exists
	existingUser, err := h.userRepo.GetByID(ctx, userID)
	if err != nil {
		apiutil.NotFound(w, "User not found")
		return
	}

	if err := h.userRepo.DeleteCascade(ctx, userID); err != nil {
		apiutil.InternalError(w, "Failed to delete user")
		return
	}

	apiutil.RespondJSON(w, http.StatusOK, map[string]interface{}{
		"message": "User and all associated data deleted",
		"user_id": existingUser.ID.String(),
		"email":   existingUser.Email,
	})
}

// ListProviders returns all providers with aggregated stats
func (h *AdminHandler) ListProviders(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	providerStats, err := h.providerRepo.GetAdminStats(ctx)
	if err != nil {
		apiutil.InternalError(w, "Failed to get provider stats")
		return
	}

	if providerStats == nil {
		providerStats = []*repository.AdminProviderStats{}
	}

	apiutil.RespondJSON(w, http.StatusOK, map[string]interface{}{
		"providers": providerStats,
	})
}

// StorageStats returns detailed storage statistics
func (h *AdminHandler) StorageStats(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	totalAccounts, totalCapacity, totalUsed, _, _, err := h.accountRepo.CountAll(ctx)
	if err != nil {
		apiutil.InternalError(w, "Failed to get storage stats")
		return
	}
	_ = totalAccounts

	totalFree := totalCapacity - totalUsed
	if totalFree < 0 {
		totalFree = 0
	}

	// By provider
	providerStats, err := h.providerRepo.GetAdminStats(ctx)
	if err != nil {
		apiutil.InternalError(w, "Failed to get provider stats")
		return
	}

	type ProviderBreakdown struct {
		Name       string  `json:"name"`
		Total      int64   `json:"total"`
		Used       int64   `json:"used"`
		Free       int64   `json:"free"`
		Percentage float64 `json:"percentage"`
	}

	var byProvider []ProviderBreakdown
	for _, ps := range providerStats {
		free := ps.TotalCapacityBytes - ps.TotalUsedBytes
		if free < 0 {
			free = 0
		}
		pct := float64(0)
		if ps.TotalCapacityBytes > 0 {
			pct = float64(ps.TotalUsedBytes) / float64(ps.TotalCapacityBytes) * 100
		}
		byProvider = append(byProvider, ProviderBreakdown{
			Name:       ps.DisplayName,
			Total:      ps.TotalCapacityBytes,
			Used:       ps.TotalUsedBytes,
			Free:       free,
			Percentage: pct,
		})
	}
	if byProvider == nil {
		byProvider = []ProviderBreakdown{}
	}

	// By account
	allAccounts, err := h.accountRepo.GetAllWithOwnerAndProvider(ctx)
	if err != nil {
		apiutil.InternalError(w, "Failed to get account details")
		return
	}

	type AccountBreakdown struct {
		Label       string `json:"label"`
		Provider    string `json:"provider"`
		Total       int64  `json:"total"`
		Used        int64  `json:"used"`
		Free        int64  `json:"free"`
		Health      string `json:"health"`
		OwnerEmail  string `json:"owner_email"`
	}

	var byAccount []AccountBreakdown
	for _, acc := range allAccounts {
		free := acc.CapacityBytes - acc.UsedBytes
		if free < 0 {
			free = 0
		}
		byAccount = append(byAccount, AccountBreakdown{
			Label:      acc.Label,
			Provider:   acc.ProviderDisplayName,
			Total:      acc.CapacityBytes,
			Used:       acc.UsedBytes,
			Free:       free,
			Health:     acc.HealthStatus,
			OwnerEmail: acc.OwnerEmail,
		})
	}
	if byAccount == nil {
		byAccount = []AccountBreakdown{}
	}

	apiutil.RespondJSON(w, http.StatusOK, map[string]interface{}{
		"total_capacity": totalCapacity,
		"total_used":     totalUsed,
		"total_free":     totalFree,
		"by_provider":    byProvider,
		"by_account":     byAccount,
	})
}

// Transfers returns recent transfer logs
func (h *AdminHandler) Transfers(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	if page < 1 {
		page = 1
	}
	perPage, _ := strconv.Atoi(r.URL.Query().Get("per_page"))
	if perPage < 1 || perPage > 100 {
		perPage = 20
	}

	logs, total, err := h.transferRepo.GetAllPaginated(ctx, page, perPage)
	if err != nil {
		apiutil.InternalError(w, "Failed to get transfer logs")
		return
	}

	// Build a map of user emails
	userEmailMap := make(map[string]string)
	for _, log := range logs {
		uid := log.UserID.String()
		if _, ok := userEmailMap[uid]; !ok {
			user, err := h.userRepo.GetByID(ctx, log.UserID)
			if err == nil {
				userEmailMap[uid] = user.Email
			} else {
				userEmailMap[uid] = "unknown"
			}
		}
	}

	type TransferResponse struct {
		ID        string    `json:"id"`
		UserEmail string    `json:"user_email"`
		Type      string    `json:"type"`
		Status    string    `json:"status"`
		FileName  string    `json:"file_name"`
		Size      int64     `json:"size"`
		CreatedAt time.Time `json:"created_at"`
		Error     *string   `json:"error"`
	}

	var transfers []TransferResponse
	for _, log := range logs {
		tr := TransferResponse{
			ID:        log.ID.String(),
			UserEmail: userEmailMap[log.UserID.String()],
			Type:      log.Operation,
			Status:    log.Status,
			FileName:  "", // file name not directly available in transfer log
			Size:      log.BytesTransferred,
			CreatedAt: log.CreatedAt,
			Error:     log.ErrorMessage,
		}
		transfers = append(transfers, tr)
	}
	if transfers == nil {
		transfers = []TransferResponse{}
	}

	apiutil.RespondJSON(w, http.StatusOK, map[string]interface{}{
		"transfers": transfers,
		"total":     total,
		"page":      page,
		"per_page":  perPage,
	})
}

// System returns system information
func (h *AdminHandler) System(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	// Get database size
	var dbSize int64
	err := h.db.QueryRow(ctx, "SELECT pg_database_size(current_database())").Scan(&dbSize)
	if err != nil {
		dbSize = 0
	}

	// Get rclone version
	rcloneVersion := "unknown"
	out, err := exec.Command("rclone", "version").Output()
	if err == nil {
		lines := strings.Split(string(out), "\n")
		if len(lines) > 0 {
			rcloneVersion = strings.TrimPrefix(lines[0], "rclone ")
			rcloneVersion = strings.TrimSpace(rcloneVersion)
		}
	}

	uptime := time.Since(startTime).Seconds()

	apiutil.RespondJSON(w, http.StatusOK, map[string]interface{}{
		"version":           "1.0.0",
		"uptime_seconds":    int64(uptime),
		"go_version":        runtime.Version(),
		"rclone_version":    rcloneVersion,
		"database_size_bytes": dbSize,
	})
}
