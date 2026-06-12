package errors

import (
	"encoding/json"
	"fmt"
	"net/http"
)

// APIError represents a standardized API error response
type APIError struct {
	Code    int    `json:"code"`
	Status  string `json:"status"`
	Message string `json:"message"`
	Details string `json:"details,omitempty"`
}

func (e *APIError) Error() string {
	return fmt.Sprintf("[%d] %s: %s", e.Code, e.Status, e.Message)
}

// WriteError writes a standardized error response
func WriteError(w http.ResponseWriter, code int, message string, details ...string) {
	err := &APIError{
		Code:    code,
		Status:  http.StatusText(code),
		Message: message,
	}
	if len(details) > 0 {
		err.Details = details[0]
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(err)
}

// Common error constructors
func BadRequest(message string, details ...string) *APIError {
	e := &APIError{Code: http.StatusBadRequest, Status: "Bad Request", Message: message}
	if len(details) > 0 {
		e.Details = details[0]
	}
	return e
}

func Unauthorized(message string, details ...string) *APIError {
	e := &APIError{Code: http.StatusUnauthorized, Status: "Unauthorized", Message: message}
	if len(details) > 0 {
		e.Details = details[0]
	}
	return e
}

func Forbidden(message string, details ...string) *APIError {
	e := &APIError{Code: http.StatusForbidden, Status: "Forbidden", Message: message}
	if len(details) > 0 {
		e.Details = details[0]
	}
	return e
}

func NotFound(message string, details ...string) *APIError {
	e := &APIError{Code: http.StatusNotFound, Status: "Not Found", Message: message}
	if len(details) > 0 {
		e.Details = details[0]
	}
	return e
}

func Conflict(message string, details ...string) *APIError {
	e := &APIError{Code: http.StatusConflict, Status: "Conflict", Message: message}
	if len(details) > 0 {
		e.Details = details[0]
	}
	return e
}

func InternalServerError(message string, details ...string) *APIError {
	e := &APIError{Code: http.StatusInternalServerError, Status: "Internal Server Error", Message: message}
	if len(details) > 0 {
		e.Details = details[0]
	}
	return e
}

func TooManyRequests(message string, details ...string) *APIError {
	e := &APIError{Code: http.StatusTooManyRequests, Status: "Too Many Requests", Message: message}
	if len(details) > 0 {
		e.Details = details[0]
	}
	return e
}
