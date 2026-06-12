package handlers

import (
	"net/http"

	"storage-gateway/internal/api/apiutil"
	"storage-gateway/internal/service"
)

type UsageHandler struct {
	usageService *service.UsageService
}

func NewUsageHandler(usageService *service.UsageService) *UsageHandler {
	return &UsageHandler{usageService: usageService}
}

func (h *UsageHandler) GetUsageStats(w http.ResponseWriter, r *http.Request) {
	userID, err := getUserID(r)
	if err != nil {
		apiutil.Unauthorized(w, "authentication required")
		return
	}

	stats, err := h.usageService.GetUsageStats(r.Context(), userID)
	if err != nil {
		apiutil.InternalError(w, err.Error())
		return
	}

	apiutil.RespondJSON(w, http.StatusOK, stats)
}
