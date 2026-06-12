package apiutil

import (
	"encoding/json"
	"net/http"
)

// ErrorResponse represents a consistent error response
type ErrorResponse struct {
	Error   string `json:"error"`
	Message string `json:"message,omitempty"`
	Code    int    `json:"code"`
}

// SuccessResponse represents a consistent success response
type SuccessResponse struct {
	Message string      `json:"message"`
	Data    interface{} `json:"data,omitempty"`
}

// RespondJSON writes a JSON response with the given status code
func RespondJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if data != nil {
		json.NewEncoder(w).Encode(data)
	}
}

// RespondError writes a consistent error response
func RespondError(w http.ResponseWriter, status int, message string) {
	RespondJSON(w, status, ErrorResponse{
		Error:   http.StatusText(status),
		Message: message,
		Code:    status,
	})
}

// RespondSuccess writes a consistent success response
func RespondSuccess(w http.ResponseWriter, status int, message string, data interface{}) {
	RespondJSON(w, status, SuccessResponse{
		Message: message,
		Data:    data,
	})
}

// Common error helpers
func BadRequest(w http.ResponseWriter, message string) {
	RespondError(w, http.StatusBadRequest, message)
}

func Unauthorized(w http.ResponseWriter, message string) {
	RespondError(w, http.StatusUnauthorized, message)
}

func Forbidden(w http.ResponseWriter, message string) {
	RespondError(w, http.StatusForbidden, message)
}

func NotFound(w http.ResponseWriter, message string) {
	RespondError(w, http.StatusNotFound, message)
}

func InternalError(w http.ResponseWriter, message string) {
	RespondError(w, http.StatusInternalServerError, message)
}

func Conflict(w http.ResponseWriter, message string) {
	RespondError(w, http.StatusConflict, message)
}
