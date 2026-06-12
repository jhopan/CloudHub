package service

import (
	"context"
	"fmt"

	"storage-gateway/internal/rclone"
)

// ConnectionService handles credential validation and connection testing
type ConnectionService struct {
	rcloneClient *rclone.Client
}

// NewConnectionService creates a new connection service
func NewConnectionService(rcloneClient *rclone.Client) *ConnectionService {
	return &ConnectionService{
		rcloneClient: rcloneClient,
	}
}

// ValidateCredentials validates credentials for a specific provider type
func (s *ConnectionService) ValidateCredentials(providerType string, credentials map[string]string) error {
	switch providerType {
	case "gdrive":
		return s.validateGoogleDrive(credentials)
	case "mega":
		return s.validateMega(credentials)
	case "onedrive":
		return s.validateOneDrive(credentials)
	case "dropbox":
		return s.validateDropbox(credentials)
	case "r2":
		return s.validateR2(credentials)
	case "s3":
		return s.validateS3(credentials)
	case "b2":
		return s.validateB2(credentials)
	case "webdav":
		return s.validateWebDAV(credentials)
	default:
		return fmt.Errorf("unsupported provider type: %s", providerType)
	}
}

// TestConnection tests the connection to a provider using rclone
func (s *ConnectionService) TestConnection(ctx context.Context, remoteName string, providerType string, credentials map[string]string) (*ConnectionResult, error) {
	// Create temporary rclone config
	config := s.buildRcloneConfig(providerType, credentials)

	// Test connection using rclone about with dynamic config
	result, err := s.rcloneClient.AboutWithConfig(ctx, remoteName, config)
	if err != nil {
		return nil, fmt.Errorf("connection test failed: %w", err)
	}

	return &ConnectionResult{
		Success: true,
		Total:   result.Total,
		Used:    result.Used,
		Free:    result.Free,
	}, nil
}

// ConnectionResult holds the result of a connection test
type ConnectionResult struct {
	Success bool  `json:"success"`
	Total   int64 `json:"total"`
	Used    int64 `json:"used"`
	Free    int64 `json:"free"`
}

func (s *ConnectionService) validateGoogleDrive(creds map[string]string) error {
	// Google Drive requires OAuth tokens
	if _, ok := creds["access_token"]; !ok {
		return fmt.Errorf("missing access_token")
	}
	if _, ok := creds["refresh_token"]; !ok {
		return fmt.Errorf("missing refresh_token")
	}
	return nil
}

func (s *ConnectionService) validateMega(creds map[string]string) error {
	// Mega requires email and password
	if _, ok := creds["email"]; !ok {
		return fmt.Errorf("missing email")
	}
	if _, ok := creds["password"]; !ok {
		return fmt.Errorf("missing password")
	}
	return nil
}

func (s *ConnectionService) validateOneDrive(creds map[string]string) error {
	// OneDrive requires OAuth tokens
	if _, ok := creds["access_token"]; !ok {
		return fmt.Errorf("missing access_token")
	}
	if _, ok := creds["refresh_token"]; !ok {
		return fmt.Errorf("missing refresh_token")
	}
	return nil
}

func (s *ConnectionService) validateDropbox(creds map[string]string) error {
	// Dropbox requires OAuth token
	if _, ok := creds["access_token"]; !ok {
		return fmt.Errorf("missing access_token")
	}
	return nil
}

func (s *ConnectionService) validateR2(creds map[string]string) error {
	// Cloudflare R2 requires account_id, access_key, secret_key, and bucket
	required := []string{"account_id", "access_key", "secret_key", "bucket"}
	for _, field := range required {
		if _, ok := creds[field]; !ok {
			return fmt.Errorf("missing %s", field)
		}
	}
	return nil
}

func (s *ConnectionService) validateS3(creds map[string]string) error {
	// S3 requires endpoint, region, access_key, secret_key, and bucket
	required := []string{"endpoint", "region", "access_key", "secret_key", "bucket"}
	for _, field := range required {
		if _, ok := creds[field]; !ok {
			return fmt.Errorf("missing %s", field)
		}
	}
	return nil
}

func (s *ConnectionService) validateB2(creds map[string]string) error {
	// Backblaze B2 requires account_id and application_key
	required := []string{"account_id", "application_key"}
	for _, field := range required {
		if _, ok := creds[field]; !ok {
			return fmt.Errorf("missing %s", field)
		}
	}
	return nil
}

func (s *ConnectionService) validateWebDAV(creds map[string]string) error {
	// WebDAV requires url, username, and password
	required := []string{"url", "username", "password"}
	for _, field := range required {
		if _, ok := creds[field]; !ok {
			return fmt.Errorf("missing %s", field)
		}
	}
	return nil
}

// buildRcloneConfig generates rclone config string for a provider
func (s *ConnectionService) buildRcloneConfig(providerType string, credentials map[string]string) string {
	switch providerType {
	case "gdrive":
		return fmt.Sprintf(`[remote]
type = drive
client_id = %s
client_secret = %s
token = {"access_token":"%s","token_type":"Bearer","refresh_token":"%s"}
`, credentials["client_id"], credentials["client_secret"], credentials["access_token"], credentials["refresh_token"])

	case "mega":
		return fmt.Sprintf(`[remote]
type = mega
user = %s
pass = %s
`, credentials["email"], credentials["password"])

	case "onedrive":
		return fmt.Sprintf(`[remote]
type = onedrive
client_id = %s
client_secret = %s
token = {"access_token":"%s","token_type":"Bearer","refresh_token":"%s"}
`, credentials["client_id"], credentials["client_secret"], credentials["access_token"], credentials["refresh_token"])

	case "dropbox":
		return fmt.Sprintf(`[remote]
type = dropbox
client_id = %s
client_secret = %s
token = {"access_token":"%s","token_type":"Bearer"}
`, credentials["client_id"], credentials["client_secret"], credentials["access_token"])

	case "r2":
		return fmt.Sprintf(`[remote]
type = s3
provider = Cloudflare
access_key_id = %s
secret_access_key = %s
endpoint = https://%s.r2.cloudflarestorage.com
`, credentials["access_key"], credentials["secret_key"], credentials["account_id"])

	case "s3":
		return fmt.Sprintf(`[remote]
type = s3
provider = AWS
access_key_id = %s
secret_access_key = %s
region = %s
endpoint = %s
`, credentials["access_key"], credentials["secret_key"], credentials["region"], credentials["endpoint"])

	case "b2":
		return fmt.Sprintf(`[remote]
type = b2
account = %s
key = %s
`, credentials["account_id"], credentials["application_key"])

	case "webdav":
		return fmt.Sprintf(`[remote]
type = webdav
url = %s
vendor = other
user = %s
pass = %s
`, credentials["url"], credentials["username"], credentials["password"])

	default:
		return ""
	}
}
