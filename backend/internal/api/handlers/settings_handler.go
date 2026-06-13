package handlers

import (
	"encoding/json"
	"net/http"

	"storage-gateway/internal/api/apiutil"
	"storage-gateway/internal/crypto"
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

	encryptionEnabled, _ := h.userRepo.IsEncryptionEnabled(r.Context(), userID)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"scheduler_mode":      mode,
		"valid_strategies":    scheduler.ValidStrategies(),
		"encryption_enabled":  encryptionEnabled,
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

// UpdateEncryptionSettings enables or disables file encryption
// PUT /api/v1/settings/encryption
// Body: { "enabled": bool, "passphrase": string }
func (h *SettingsHandler) UpdateEncryptionSettings(w http.ResponseWriter, r *http.Request) {
	userID, err := getUserID(r)
	if err != nil {
		apiutil.Unauthorized(w, "authentication required")
		return
	}

	var req struct {
		Enabled    bool   `json:"enabled"`
		Passphrase string `json:"passphrase"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		apiutil.BadRequest(w, "invalid request body")
		return
	}

	if req.Enabled {
		// Enabling encryption: passphrase is required
		if len(req.Passphrase) < 8 {
			apiutil.BadRequest(w, "passphrase must be at least 8 characters")
			return
		}

		// Store passphrase hash and salt
		if err := h.userRepo.SetEncryptionPassphrase(r.Context(), userID, req.Passphrase); err != nil {
			apiutil.InternalError(w, "failed to enable encryption: "+err.Error())
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"message":            "encryption enabled",
			"encryption_enabled": true,
			"warning":            "Remember your passphrase! Lost passphrase means lost encrypted files.",
		})
		return
	}

	// Disabling encryption: just toggle the flag
	if err := h.userRepo.SetEncryptionEnabled(r.Context(), userID, false); err != nil {
		apiutil.InternalError(w, "failed to disable encryption")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"message":            "encryption disabled",
		"encryption_enabled": false,
		"note":               "Files already uploaded with encryption will remain encrypted in cloud storage.",
	})
}

// VerifyEncryptionPassphrase verifies the user's encryption passphrase
// POST /api/v1/settings/encryption/verify
// Body: { "passphrase": string }
func (h *SettingsHandler) VerifyEncryptionPassphrase(w http.ResponseWriter, r *http.Request) {
	userID, err := getUserID(r)
	if err != nil {
		apiutil.Unauthorized(w, "authentication required")
		return
	}

	var req struct {
		Passphrase string `json:"passphrase"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		apiutil.BadRequest(w, "invalid request body")
		return
	}

	if req.Passphrase == "" {
		apiutil.BadRequest(w, "passphrase is required")
		return
	}

	// Get stored hash
	storedHash, err := h.userRepo.GetEncryptionPassphraseHash(r.Context(), userID)
	if err != nil {
		apiutil.InternalError(w, "failed to verify passphrase")
		return
	}

	if storedHash == "" {
		apiutil.BadRequest(w, "encryption is not configured")
		return
	}

	// Verify passphrase
	valid, err := crypto.VerifyPassphrase(req.Passphrase, storedHash)
	if err != nil {
		apiutil.InternalError(w, "passphrase verification failed")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"valid": valid,
	})
}
