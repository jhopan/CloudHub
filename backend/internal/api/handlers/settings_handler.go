package handlers

import (
	"encoding/json"
	"net/http"

	"storage-gateway/internal/api/apiutil"
	"storage-gateway/internal/repository"
	"storage-gateway/internal/scheduler"
)

// SettingsHandler handles user settings endpoints
type SettingsHandler struct {
	userRepo *repository.UserRepository
}

// NewSettingsHandler creates a new settings handler
func NewSettingsHandler(userRepo *repository.UserRepository) *SettingsHandler {
	return &SettingsHandler{userRepo: userRepo}
}

// GetSettings returns the current user's settings
// GET /api/v1/settings
func (h *SettingsHandler) GetSettings(w http.ResponseWriter, r *http.Request) {
	userID, err := getUserID(r)
	if err != nil {
		apiutil.Unauthorized(w, "authentication required")
		return
	}

	mode, err := h.userRepo.GetSchedulerMode(r.Context(), userID)
	if err != nil {
		apiutil.InternalError(w, "failed to retrieve settings")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"scheduler_mode":   mode,
		"valid_strategies": scheduler.ValidStrategies(),
	})
}

// UpdateSettings updates the current user's settings
// PUT /api/v1/settings
func (h *SettingsHandler) UpdateSettings(w http.ResponseWriter, r *http.Request) {
	userID, err := getUserID(r)
	if err != nil {
		apiutil.Unauthorized(w, "authentication required")
		return
	}

	var req struct {
		SchedulerMode string `json:"scheduler_mode"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		apiutil.BadRequest(w, "invalid request body")
		return
	}

	if req.SchedulerMode == "" {
		apiutil.BadRequest(w, "scheduler_mode is required")
		return
	}

	if !scheduler.IsValidStrategy(req.SchedulerMode) {
		apiutil.BadRequest(w, "invalid scheduler_mode; valid options: "+
			"largest_free, round_robin, balanced, cheapest")
		return
	}

	if err := h.userRepo.SetSchedulerMode(r.Context(), userID, req.SchedulerMode); err != nil {
		apiutil.InternalError(w, "failed to update settings")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"message":        "settings updated",
		"scheduler_mode": req.SchedulerMode,
	})
}
