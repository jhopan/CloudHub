package handlers

import (
	"encoding/json"
	"net/http"

	"storage-gateway/internal/api/apiutil"
	"storage-gateway/internal/service"

	"github.com/google/uuid"
)

type OAuthHandler struct {
	rcloneOAuth *service.RcloneOAuthService
}

func NewOAuthHandler(rcloneOAuth *service.RcloneOAuthService) *OAuthHandler {
	return &OAuthHandler{rcloneOAuth: rcloneOAuth}
}

// InitiateOAuth starts the rclone authorize flow and returns the auth URL
func (h *OAuthHandler) InitiateOAuth(w http.ResponseWriter, r *http.Request) {
	userIDStr := r.Context().Value("user_id")
	if userIDStr == nil {
		apiutil.RespondError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	userID, ok := userIDStr.(string)
	if !ok {
		apiutil.RespondError(w, http.StatusBadRequest, "invalid user ID")
		return
	}

	userUUID, err := uuid.Parse(userID)
	if err != nil {
		apiutil.RespondError(w, http.StatusBadRequest, "invalid user ID format")
		return
	}

	providerType := r.URL.Query().Get("provider")
	if providerType == "" {
		providerType = "gdrive"
	}

	label := r.URL.Query().Get("label")
	if label == "" {
		label = "My Account"
	}

	result, err := h.rcloneOAuth.StartAuth(r.Context(), userUUID, providerType, label)
	if err != nil {
		apiutil.RespondError(w, http.StatusInternalServerError, "failed to start auth: "+err.Error())
		return
	}

	apiutil.RespondJSON(w, http.StatusOK, result)
}

// CheckOAuthStatus polls the auth session status
func (h *OAuthHandler) CheckOAuthStatus(w http.ResponseWriter, r *http.Request) {
	sessionID := r.URL.Query().Get("session_id")
	if sessionID == "" {
		apiutil.RespondError(w, http.StatusBadRequest, "missing session_id")
		return
	}

	result, err := h.rcloneOAuth.CheckStatus(r.Context(), sessionID)
	if err != nil {
		apiutil.RespondError(w, http.StatusNotFound, err.Error())
		return
	}

	apiutil.RespondJSON(w, http.StatusOK, result)
}

// SubmitCallback handles manually pasted callback URLs
func (h *OAuthHandler) SubmitCallback(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		apiutil.RespondError(w, http.StatusMethodNotAllowed, "POST required")
		return
	}

	var req struct {
		SessionID   string `json:"session_id"`
		CallbackURL string `json:"callback_url"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		apiutil.RespondError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.SessionID == "" || req.CallbackURL == "" {
		apiutil.RespondError(w, http.StatusBadRequest, "session_id and callback_url are required")
		return
	}

	result, err := h.rcloneOAuth.SubmitCallbackURL(r.Context(), req.SessionID, req.CallbackURL)
	if err != nil {
		apiutil.RespondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	apiutil.RespondJSON(w, http.StatusOK, result)
}
