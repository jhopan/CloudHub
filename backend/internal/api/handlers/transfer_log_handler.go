package handlers

import (
	"net/http"
	"strconv"

	"storage-gateway/internal/api/apiutil"
	"storage-gateway/internal/service"
)

type TransferLogHandler struct {
	transferService *service.TransferService
}

func NewTransferLogHandler(transferService *service.TransferService) *TransferLogHandler {
	return &TransferLogHandler{transferService: transferService}
}

func (h *TransferLogHandler) GetTransferLogs(w http.ResponseWriter, r *http.Request) {
	userID, err := getUserID(r)
	if err != nil {
		apiutil.Unauthorized(w, "authentication required")
		return
	}

	// Parse query parameters
	limit := 50
	offset := 0

	if l := r.URL.Query().Get("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil && parsed > 0 && parsed <= 100 {
			limit = parsed
		}
	}

	if o := r.URL.Query().Get("offset"); o != "" {
		if parsed, err := strconv.Atoi(o); err == nil && parsed >= 0 {
			offset = parsed
		}
	}

	logs, err := h.transferService.GetTransferLogs(r.Context(), userID, limit, offset)
	if err != nil {
		apiutil.InternalError(w, err.Error())
		return
	}

	apiutil.RespondJSON(w, http.StatusOK, logs)
}
