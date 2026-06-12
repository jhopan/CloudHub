package dto

type TransferLogResponse struct {
	ID               string  `json:"id"`
	FileID           *string `json:"file_id,omitempty"`
	UserID           string  `json:"user_id"`
	AccountID        *string `json:"account_id,omitempty"`
	Operation        string  `json:"operation"`
	Status           string  `json:"status"`
	BytesTransferred int64   `json:"bytes_transferred"`
	ErrorMessage     *string `json:"error_message,omitempty"`
	RetryCount       int     `json:"retry_count"`
	MaxRetries       int     `json:"max_retries"`
	StartedAt        *string `json:"started_at,omitempty"`
	CompletedAt      *string `json:"completed_at,omitempty"`
	CreatedAt        string  `json:"created_at"`
}

type TransferLogListResponse struct {
	Logs  []*TransferLogResponse `json:"logs"`
	Total int                    `json:"total"`
}
