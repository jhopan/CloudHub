package dto

type FileResponse struct {
	ID            string `json:"id"`
	UserID        string `json:"user_id"`
	Name          string `json:"name"`
	VirtualPath   string `json:"virtual_path"`
	Size          int64  `json:"size"`
	Checksum      string `json:"checksum"`
	MimeType      string `json:"mime_type"`
	ParentID      string `json:"parent_id,omitempty"`
	IsDirectory   bool   `json:"is_directory"`
	LocationCount int    `json:"location_count"`
	CreatedAt     string `json:"created_at"`
	UpdatedAt     string `json:"updated_at"`
}

type CreateFolderRequest struct {
	Name     string `json:"name" validate:"required,min=1,max=255"`
	ParentID string `json:"parent_id,omitempty"`
}

type RenameFileRequest struct {
	Name string `json:"name" validate:"required,min=1,max=255"`
}
