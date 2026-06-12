package handlers

import (
	"encoding/json"
	"io"
	"net/http"
	"strconv"
	"strings"

	"storage-gateway/internal/api/apiutil"
	"storage-gateway/internal/service"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

type FileHandler struct {
	fileService *service.FileService
}

func NewFileHandler(fileService *service.FileService) *FileHandler {
	return &FileHandler{fileService: fileService}
}

func (h *FileHandler) Upload(w http.ResponseWriter, r *http.Request) {
	userID, err := getUserID(r)
	if err != nil {
		apiutil.Unauthorized(w, "authentication required")
		return
	}

	// Parse multipart form (max 100MB)
	if err := r.ParseMultipartForm(100 << 20); err != nil {
		apiutil.BadRequest(w, "file too large or invalid form (max 100MB)")
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		apiutil.BadRequest(w, "missing file field")
		return
	}
	defer file.Close()

	// Get optional parent folder ID
	var parentID *uuid.UUID
	if pid := r.FormValue("parent_id"); pid != "" {
		parsed, err := uuid.Parse(pid)
		if err != nil {
			apiutil.BadRequest(w, "invalid parent_id format")
			return
		}
		parentID = &parsed
	}

	result, err := h.fileService.Upload(r.Context(), userID, header.Filename, file, parentID)
	if err != nil {
		if strings.Contains(err.Error(), "no storage accounts") {
			apiutil.BadRequest(w, err.Error())
			return
		}
		apiutil.InternalError(w, err.Error())
		return
	}

	apiutil.RespondJSON(w, http.StatusCreated, result)
}

func (h *FileHandler) Download(w http.ResponseWriter, r *http.Request) {
	userID, err := getUserID(r)
	if err != nil {
		apiutil.Unauthorized(w, "authentication required")
		return
	}

	fileID, err := uuid.Parse(chi.URLParam(r, "fileID"))
	if err != nil {
		apiutil.BadRequest(w, "invalid file ID")
		return
	}

	reader, file, err := h.fileService.Download(r.Context(), userID, fileID)
	if err != nil {
		if strings.Contains(err.Error(), "not found") {
			apiutil.NotFound(w, "file not found")
			return
		}
		if strings.Contains(err.Error(), "unauthorized") {
			apiutil.Forbidden(w, "access denied")
			return
		}
		apiutil.InternalError(w, err.Error())
		return
	}
	defer reader.Close()

	w.Header().Set("Content-Type", file.MimeType)
	w.Header().Set("Content-Disposition", "attachment; filename=\""+file.Name+"\"")
	w.Header().Set("Content-Length", strconv.FormatInt(file.Size, 10))
	io.Copy(w, reader)
}

func (h *FileHandler) ListFiles(w http.ResponseWriter, r *http.Request) {
	userID, err := getUserID(r)
	if err != nil {
		apiutil.Unauthorized(w, "authentication required")
		return
	}

	var parentID *uuid.UUID
	if pid := r.URL.Query().Get("parent_id"); pid != "" {
		parsed, err := uuid.Parse(pid)
		if err != nil {
			apiutil.BadRequest(w, "invalid parent_id format")
			return
		}
		parentID = &parsed
	}

	files, err := h.fileService.ListFiles(r.Context(), userID, parentID)
	if err != nil {
		apiutil.InternalError(w, err.Error())
		return
	}

	apiutil.RespondJSON(w, http.StatusOK, files)
}

func (h *FileHandler) GetFile(w http.ResponseWriter, r *http.Request) {
	userID, err := getUserID(r)
	if err != nil {
		apiutil.Unauthorized(w, "authentication required")
		return
	}

	fileID, err := uuid.Parse(chi.URLParam(r, "fileID"))
	if err != nil {
		apiutil.BadRequest(w, "invalid file ID")
		return
	}

	file, err := h.fileService.GetFile(r.Context(), userID, fileID)
	if err != nil {
		if strings.Contains(err.Error(), "not found") {
			apiutil.NotFound(w, "file not found")
			return
		}
		if strings.Contains(err.Error(), "unauthorized") {
			apiutil.Forbidden(w, "access denied")
			return
		}
		apiutil.InternalError(w, err.Error())
		return
	}

	apiutil.RespondJSON(w, http.StatusOK, file)
}

func (h *FileHandler) DeleteFile(w http.ResponseWriter, r *http.Request) {
	userID, err := getUserID(r)
	if err != nil {
		apiutil.Unauthorized(w, "authentication required")
		return
	}

	fileID, err := uuid.Parse(chi.URLParam(r, "fileID"))
	if err != nil {
		apiutil.BadRequest(w, "invalid file ID")
		return
	}

	if err := h.fileService.DeleteFile(r.Context(), userID, fileID); err != nil {
		if strings.Contains(err.Error(), "not found") {
			apiutil.NotFound(w, "file not found")
			return
		}
		if strings.Contains(err.Error(), "unauthorized") {
			apiutil.Forbidden(w, "access denied")
			return
		}
		apiutil.InternalError(w, err.Error())
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (h *FileHandler) RenameFile(w http.ResponseWriter, r *http.Request) {
	userID, err := getUserID(r)
	if err != nil {
		apiutil.Unauthorized(w, "authentication required")
		return
	}

	fileID, err := uuid.Parse(chi.URLParam(r, "fileID"))
	if err != nil {
		apiutil.BadRequest(w, "invalid file ID")
		return
	}

	var req struct {
		NewName string `json:"new_name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		apiutil.BadRequest(w, "invalid request body")
		return
	}

	if req.NewName == "" {
		apiutil.BadRequest(w, "new_name is required")
		return
	}

	file, err := h.fileService.Rename(r.Context(), userID, fileID, req.NewName)
	if err != nil {
		if strings.Contains(err.Error(), "not found") {
			apiutil.NotFound(w, "file not found")
			return
		}
		if strings.Contains(err.Error(), "unauthorized") {
			apiutil.Forbidden(w, "access denied")
			return
		}
		if strings.Contains(err.Error(), "already exists") {
			apiutil.Conflict(w, err.Error())
			return
		}
		apiutil.InternalError(w, err.Error())
		return
	}

	apiutil.RespondJSON(w, http.StatusOK, file)
}

func (h *FileHandler) CreateFolder(w http.ResponseWriter, r *http.Request) {
	userID, err := getUserID(r)
	if err != nil {
		apiutil.Unauthorized(w, "authentication required")
		return
	}

	var req struct {
		Name     string     `json:"name"`
		ParentID *uuid.UUID `json:"parent_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		apiutil.BadRequest(w, "invalid request body")
		return
	}

	if req.Name == "" {
		apiutil.BadRequest(w, "name is required")
		return
	}

	folder, err := h.fileService.CreateFolder(r.Context(), userID, req.Name, req.ParentID)
	if err != nil {
		if strings.Contains(err.Error(), "already exists") {
			apiutil.Conflict(w, err.Error())
			return
		}
		apiutil.InternalError(w, err.Error())
		return
	}

	apiutil.RespondJSON(w, http.StatusCreated, folder)
}

func (h *FileHandler) SearchFiles(w http.ResponseWriter, r *http.Request) {
	userID, err := getUserID(r)
	if err != nil {
		apiutil.Unauthorized(w, "authentication required")
		return
	}

	query := r.URL.Query().Get("q")
	if query == "" {
		apiutil.BadRequest(w, "search query (q) is required")
		return
	}

	files, err := h.fileService.SearchFiles(r.Context(), userID, query)
	if err != nil {
		apiutil.InternalError(w, err.Error())
		return
	}

	apiutil.RespondJSON(w, http.StatusOK, files)
}
