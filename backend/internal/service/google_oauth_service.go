package service

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"storage-gateway/internal/model"
	"storage-gateway/internal/rclone"
	"storage-gateway/internal/repository"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
)

// GoogleOAuthService handles Google OAuth 2.0 flow
type GoogleOAuthService struct {
	clientID     string
	clientSecret string
	redirectURI  string
	accountRepo  *repository.StorageAccountRepository
	providerRepo *repository.ProviderRepository
	rcloneClient *rclone.Client
	redis        *redis.Client
}

func NewGoogleOAuthService(
	clientID, clientSecret, redirectURI string,
	accountRepo *repository.StorageAccountRepository,
	providerRepo *repository.ProviderRepository,
	rcloneClient *rclone.Client,
	redis *redis.Client,
) *GoogleOAuthService {
	return &GoogleOAuthService{
		clientID:     clientID,
		clientSecret: clientSecret,
		redirectURI:  redirectURI,
		accountRepo:  accountRepo,
		providerRepo: providerRepo,
		rcloneClient: rcloneClient,
		redis:        redis,
	}
}

// OAuthStateData stores the user context during OAuth flow
type OAuthStateData struct {
	UserID string `json:"user_id"`
	Label  string `json:"label"`
}

// GenerateAuthURL creates the Google OAuth authorization URL
func (s *GoogleOAuthService) GenerateAuthURL(ctx context.Context, userID uuid.UUID, label string) (string, string, error) {
	// Generate random state for CSRF protection
	stateBytes := make([]byte, 16)
	if _, err := rand.Read(stateBytes); err != nil {
		return "", "", fmt.Errorf("failed to generate state: %w", err)
	}
	state := hex.EncodeToString(stateBytes)

	// Store state in Redis (expires in 10 minutes)
	stateData := OAuthStateData{
		UserID: userID.String(),
		Label:  label,
	}
	stateJSON, _ := json.Marshal(stateData)

	err := s.redis.Set(ctx, fmt.Sprintf("oauth_state:%s", state), string(stateJSON), 10*time.Minute).Err()
	if err != nil {
		return "", "", fmt.Errorf("failed to store state: %w", err)
	}

	// Build Google OAuth URL
	params := url.Values{
		"client_id":     {s.clientID},
		"redirect_uri":  {s.redirectURI},
		"response_type": {"code"},
		"scope":         {"https://www.googleapis.com/auth/drive"},
		"access_type":   {"offline"},
		"prompt":        {"consent"},
		"state":         {state},
	}

	authURL := fmt.Sprintf("https://accounts.google.com/o/oauth2/v2/auth?%s", params.Encode())
	return authURL, state, nil
}

// GoogleTokenResponse represents the token exchange response
type GoogleTokenResponse struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ExpiresIn    int    `json:"expires_in"`
	TokenType    string `json:"token_type"`
	Scope        string `json:"scope"`
}

// OAuthCallbackResult is returned after successful OAuth callback
type OAuthCallbackResult struct {
	RemoteName string `json:"remote_name"`
	Label      string `json:"label"`
}

// HandleCallback processes the OAuth callback
func (s *GoogleOAuthService) HandleCallback(ctx context.Context, code, state string) (*OAuthCallbackResult, error) {
	// Verify state
	stateJSON, err := s.redis.Get(ctx, fmt.Sprintf("oauth_state:%s", state)).Result()
	if err != nil {
		return nil, fmt.Errorf("invalid or expired state")
	}

	// Delete state (one-time use)
	s.redis.Del(ctx, fmt.Sprintf("oauth_state:%s", state))

	var stateData OAuthStateData
	if err := json.Unmarshal([]byte(stateJSON), &stateData); err != nil {
		return nil, fmt.Errorf("invalid state data")
	}

	userID, err := uuid.Parse(stateData.UserID)
	if err != nil {
		return nil, fmt.Errorf("invalid user ID in state")
	}

	// Exchange code for tokens
	tokenResp, err := s.exchangeCodeForTokens(ctx, code)
	if err != nil {
		return nil, fmt.Errorf("token exchange failed: %w", err)
	}

	// Get Google Drive provider
	provider, err := s.providerRepo.GetByType(ctx, "gdrive")
	if err != nil {
		return nil, fmt.Errorf("Google Drive provider not found: %w", err)
	}

	// Generate rclone remote name
	remoteName := fmt.Sprintf("gdrive_%s_%d", userID.String()[:8], time.Now().Unix())

	// Build rclone token JSON
	expiry := time.Now().Add(time.Duration(tokenResp.ExpiresIn) * time.Second)
	tokenJSON := fmt.Sprintf(
		`{"access_token":"%s","token_type":"%s","refresh_token":"%s","expiry":"%s"}`,
		tokenResp.AccessToken,
		tokenResp.TokenType,
		tokenResp.RefreshToken,
		expiry.Format("2006-01-02T15:04:05.999999999Z"),
	)

	// Create rclone remote
	rcloneParams := map[string]string{
		"client_id":     s.clientID,
		"client_secret": s.clientSecret,
		"scope":         "drive",
		"token":         tokenJSON,
	}

	if err := s.rcloneClient.ConfigCreate(ctx, remoteName, "drive", rcloneParams); err != nil {
		return nil, fmt.Errorf("failed to create rclone remote: %w", err)
	}

	// Encrypt and store credentials
	credentials := map[string]string{
		"client_id":     s.clientID,
		"client_secret": s.clientSecret,
		"refresh_token": tokenResp.RefreshToken,
	}
	credentialsJSON, _ := json.Marshal(credentials)

	// Create storage account in DB
	account := &model.StorageAccount{
		UserID:           userID,
		ProviderID:       provider.ID,
		Label:            stateData.Label,
		RcloneRemoteName: remoteName,
		Credentials:      credentialsJSON,
		HealthStatus:     "healthy",
		IsActive:         true,
	}

	if err := s.accountRepo.Create(ctx, account); err != nil {
		// Cleanup rclone remote if DB insert fails
		s.rcloneClient.ConfigDelete(ctx, remoteName)
		return nil, fmt.Errorf("failed to create storage account: %w", err)
	}

	return &OAuthCallbackResult{
		RemoteName: remoteName,
		Label:      stateData.Label,
	}, nil
}

func (s *GoogleOAuthService) exchangeCodeForTokens(ctx context.Context, code string) (*GoogleTokenResponse, error) {
	data := url.Values{
		"code":          {code},
		"client_id":     {s.clientID},
		"client_secret": {s.clientSecret},
		"redirect_uri":  {s.redirectURI},
		"grant_type":    {"authorization_code"},
	}

	req, err := http.NewRequestWithContext(ctx, "POST", "https://oauth2.googleapis.com/token", strings.NewReader(data.Encode()))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("token exchange failed (status %d): %s", resp.StatusCode, string(body))
	}

	var tokenResp GoogleTokenResponse
	if err := json.Unmarshal(body, &tokenResp); err != nil {
		return nil, err
	}

	return &tokenResp, nil
}
