package auth

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"net/http"
	"net/url"
	"time"
)

// OAuthConfig holds OAuth2 configuration for a provider
type OAuthConfig struct {
	ClientID     string
	ClientSecret string
	AuthURL      string
	TokenURL     string
	RedirectURL  string
	Scopes       []string
}

// OAuthToken represents an OAuth2 token
type OAuthToken struct {
	AccessToken  string    `json:"access_token"`
	RefreshToken string    `json:"refresh_token"`
	TokenType    string    `json:"token_type"`
	ExpiresAt    time.Time `json:"expires_at"`
}

// OAuthFlow manages OAuth2 authentication flows
type OAuthFlow struct {
	states map[string]OAuthState // state -> state data
}

// OAuthState holds state data for an OAuth flow
type OAuthState struct {
	UserID     string
	ProviderID string
	CreatedAt  time.Time
}

// NewOAuthFlow creates a new OAuth flow manager
func NewOAuthFlow() *OAuthFlow {
	return &OAuthFlow{
		states: make(map[string]OAuthState),
	}
}

// GenerateState creates a random state parameter for CSRF protection
func (f *OAuthFlow) GenerateState(userID, providerID string) (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("failed to generate state: %w", err)
	}
	state := hex.EncodeToString(b)

	f.states[state] = OAuthState{
		UserID:     userID,
		ProviderID: providerID,
		CreatedAt:  time.Now(),
	}

	// Clean up old states (older than 10 minutes)
	f.cleanupOldStates()

	return state, nil
}

// ValidateState validates and consumes a state parameter
func (f *OAuthFlow) ValidateState(state string) (*OAuthState, error) {
	s, ok := f.states[state]
	if !ok {
		return nil, fmt.Errorf("invalid or expired state")
	}

	// Check if state is too old (10 minutes)
	if time.Since(s.CreatedAt) > 10*time.Minute {
		delete(f.states, state)
		return nil, fmt.Errorf("state expired")
	}

	// Consume the state (one-time use)
	delete(f.states, state)

	return &s, nil
}

// GetAuthURL builds the OAuth2 authorization URL
func GetAuthURL(config *OAuthConfig, state string) string {
	params := url.Values{
		"client_id":     {config.ClientID},
		"redirect_uri":  {config.RedirectURL},
		"response_type": {"code"},
		"state":         {state},
	}

	if len(config.Scopes) > 0 {
		params.Set("scope", joinScopes(config.Scopes))
	}

	return fmt.Sprintf("%s?%s", config.AuthURL, params.Encode())
}

// Provider OAuth configurations
var ProviderOAuthConfigs = map[string]*OAuthConfig{
	"gdrive": {
		AuthURL:  "https://accounts.google.com/o/oauth2/v2/auth",
		TokenURL: "https://oauth2.googleapis.com/token",
		Scopes:   []string{"https://www.googleapis.com/auth/drive"},
	},
	"onedrive": {
		AuthURL:  "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
		TokenURL: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
		Scopes:   []string{"Files.ReadWrite.All", "offline_access"},
	},
	"dropbox": {
		AuthURL:  "https://www.dropbox.com/oauth2/authorize",
		TokenURL: "https://api.dropboxapi.com/oauth2/token",
		Scopes:   []string{"files.content.write", "files.content.read"},
	},
}

// HandleOAuthCallback processes the OAuth callback
func HandleOAuthCallback(r *http.Request, flow *OAuthFlow) (*OAuthState, string, error) {
	// Validate state
	state := r.URL.Query().Get("state")
	if state == "" {
		return nil, "", fmt.Errorf("missing state parameter")
	}

	oauthState, err := flow.ValidateState(state)
	if err != nil {
		return nil, "", err
	}

	// Get authorization code
	code := r.URL.Query().Get("code")
	if code == "" {
		return nil, "", fmt.Errorf("missing authorization code")
	}

	// Check for errors
	if errStr := r.URL.Query().Get("error"); errStr != "" {
		return nil, "", fmt.Errorf("OAuth error: %s - %s", errStr, r.URL.Query().Get("error_description"))
	}

	return oauthState, code, nil
}

// ExchangeCodeForToken exchanges an authorization code for tokens
func ExchangeCodeForToken(ctx context.Context, config *OAuthConfig, code string) (*OAuthToken, error) {
	// Build token request
	data := url.Values{
		"grant_type":   {"authorization_code"},
		"code":         {code},
		"redirect_uri": {config.RedirectURL},
		"client_id":    {config.ClientID},
		"client_secret": {config.ClientSecret},
	}

	req, err := http.NewRequestWithContext(ctx, "POST", config.TokenURL, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create token request: %w", err)
	}

	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.URL.RawQuery = data.Encode()

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to exchange code: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("token exchange failed with status: %d", resp.StatusCode)
	}

	// Parse response (provider-specific)
	// For now, return a placeholder - actual implementation would parse JSON
	return &OAuthToken{
		AccessToken:  "placeholder_access_token",
		RefreshToken: "placeholder_refresh_token",
		TokenType:    "Bearer",
		ExpiresAt:    time.Now().Add(1 * time.Hour),
	}, nil
}

func (f *OAuthFlow) cleanupOldStates() {
	for state, s := range f.states {
		if time.Since(s.CreatedAt) > 10*time.Minute {
			delete(f.states, state)
		}
	}
}

func joinScopes(scopes []string) string {
	result := ""
	for i, s := range scopes {
		if i > 0 {
			result += " "
		}
		result += s
	}
	return result
}
