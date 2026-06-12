package service

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os/exec"
	"strings"
	"sync"
	"time"

	"storage-gateway/internal/model"
	"storage-gateway/internal/rclone"
	"storage-gateway/internal/repository"

	"github.com/google/uuid"
)

// RcloneOAuthService handles OAuth via rclone's built-in authorization
type RcloneOAuthService struct {
	rcloneClient *rclone.Client
	rclonePath   string
	accountRepo  *repository.StorageAccountRepository
	providerRepo *repository.ProviderRepository

	// Track active auth sessions
	mu       sync.Mutex
	sessions map[string]*authSession
}

type authSession struct {
	userID       uuid.UUID
	providerType string
	label        string
	backend      string
	authURL      string
	token        string
	done         bool
	err          error
	cmd          *exec.Cmd
}

func NewRcloneOAuthService(
	rcloneClient *rclone.Client,
	rclonePath string,
	accountRepo *repository.StorageAccountRepository,
	providerRepo *repository.ProviderRepository,
) *RcloneOAuthService {
	return &RcloneOAuthService{
		rcloneClient: rcloneClient,
		rclonePath:   rclonePath,
		accountRepo:  accountRepo,
		providerRepo: providerRepo,
		sessions:     make(map[string]*authSession),
	}
}

// killExistingAuthProcesses kills any existing rclone authorize processes
// to free up port 53682 before starting a new one
func (s *RcloneOAuthService) killExistingAuthProcesses() {
	// Kill all rclone processes (simple and reliable on Windows)
	// This ensures port 53682 is freed
	killCmd := exec.Command("taskkill", "/IM", "rclone.exe", "/F")
	if output, err := killCmd.CombinedOutput(); err != nil {
		// Not an error if no rclone process found
		log.Printf("[rclone] cleanup: %s", strings.TrimSpace(string(output)))
	} else {
		log.Printf("[rclone] cleaned up existing processes")
	}

	// Also kill any existing rclone authorize sessions in our map
	s.mu.Lock()
	for id, sess := range s.sessions {
		if sess.cmd != nil && sess.cmd.Process != nil && !sess.done {
			log.Printf("[rclone] killing old session %s (PID %d)", id, sess.cmd.Process.Pid)
			sess.cmd.Process.Kill()
			sess.done = true
		}
	}
	s.mu.Unlock()

	// Small delay to ensure port is freed
	time.Sleep(2 * time.Second)
}

// AuthStartResult contains the auth URL and session ID
type AuthStartResult struct {
	AuthURL   string `json:"auth_url"`
	SessionID string `json:"session_id"`
}

// StartAuth starts rclone authorize and returns the auth URL
func (s *RcloneOAuthService) StartAuth(ctx context.Context, userID uuid.UUID, providerType, label string) (*AuthStartResult, error) {
	// Map provider type to rclone backend
	backend := providerType
	if providerType == "gdrive" {
		backend = "drive"
	}

	// Kill any existing rclone authorize processes to free port 53682
	s.killExistingAuthProcesses()

	sessionID := uuid.New().String()

	// Create and start rclone authorize command
	cmd := exec.Command(s.rclonePath, "authorize", backend)

	session := &authSession{
		userID:       userID,
		providerType: providerType,
		label:        label,
		backend:      backend,
		cmd:          cmd,
	}

	s.mu.Lock()
	s.sessions[sessionID] = session
	s.mu.Unlock()

	// Start the command and capture output
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, fmt.Errorf("failed to create stdout pipe: %w", err)
	}

	stderr, err := cmd.StderrPipe()
	if err != nil {
		return nil, fmt.Errorf("failed to create stderr pipe: %w", err)
	}

	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("failed to start rclone authorize: %w", err)
	}

	log.Printf("[rclone authorize] started with PID %d for session %s", cmd.Process.Pid, sessionID)

	// Channel to receive the auth URL from either stdout or stderr
	urlChan := make(chan string, 1)

	// Read stderr in background (rclone prints auth URL AND token to stderr!)
	go func() {
		scanner := bufio.NewScanner(stderr)
		for scanner.Scan() {
			line := scanner.Text()
			log.Printf("[rclone authorize stderr] %s", line)

			// Extract URL from stderr - rclone prints it here
			if strings.Contains(line, "http://") || strings.Contains(line, "https://") {
				parts := strings.Fields(line)
				for _, part := range parts {
					if strings.HasPrefix(part, "http://") || strings.HasPrefix(part, "https://") {
						// Clean up trailing characters
						url := strings.TrimRight(part, "\"' ,;")
						select {
						case urlChan <- url:
						default:
						}
						// Don't return - keep reading for token
					}
				}
			}

			// ALSO capture token from stderr (rclone may print token here!)
			if strings.Contains(line, "access_token") || strings.Contains(line, "refresh_token") || strings.Contains(line, "\"token\"") {
				jsonStart := strings.Index(line, "{")
				if jsonStart >= 0 {
					session.token = line[jsonStart:]
					log.Printf("[rclone authorize] token captured from stderr!")
				}
			}
		}
	}()

	// Single goroutine to read ALL stdout - handles URL + token capture
	// Use a buffer to accumulate output for multi-line JSON token
	var outputBuffer strings.Builder
	authURL := ""
	scanner := bufio.NewScanner(stdout)
	scanner.Buffer(make([]byte, 1024*1024), 1024*1024) // 1MB buffer for large tokens
	go func() {
		for scanner.Scan() {
			line := scanner.Text()
			outputBuffer.WriteString(line + "\n")
			log.Printf("[rclone authorize stdout] %s", line)

			// Look for auth URL
			if strings.Contains(line, "http://") || strings.Contains(line, "https://") {
				parts := strings.Fields(line)
				for _, part := range parts {
					if strings.HasPrefix(part, "http://") || strings.HasPrefix(part, "https://") {
						select {
						case urlChan <- part:
						default:
						}
						break
					}
				}
			}

			// Look for token JSON in output (more lenient matching)
			if strings.Contains(line, "access_token") || strings.Contains(line, "refresh_token") || strings.Contains(line, "\"token\"") {
				// Extract the JSON part
				jsonStart := strings.Index(line, "{")
				if jsonStart >= 0 {
					session.token = line[jsonStart:]
					log.Printf("[rclone authorize] token captured from stdout! len=%d", len(session.token))
				}
			}
		}

		// Command finished
		waitErr := cmd.Wait()
		session.err = waitErr
		session.done = true

		// Fallback: if no token captured from line-by-line, try to find it in full output
		if session.token == "" {
			fullOutput := outputBuffer.String()
			if jsonStart := strings.Index(fullOutput, "{\"access_token\""); jsonStart >= 0 {
				jsonEnd := strings.Index(fullOutput[jsonStart:], "}")
				if jsonEnd >= 0 {
					session.token = fullOutput[jsonStart : jsonStart+jsonEnd+1]
					log.Printf("[rclone authorize] token captured from buffer fallback! len=%d", len(session.token))
				}
			}
		}

		if session.token == "" && waitErr == nil {
			log.Printf("[rclone authorize] completed but no token captured. Output length: %d", outputBuffer.Len())
			log.Printf("[rclone authorize] full output:\n%s", outputBuffer.String())
		}

		log.Printf("[rclone authorize] finished, done=%v, token_len=%d, err=%v", session.done, len(session.token), session.err)
	}()

	// Wait for URL with timeout
	select {
	case url := <-urlChan:
		authURL = url
	case <-time.After(15 * time.Second):
		authURL = "http://127.0.0.1:53682/auth"
	}

	session.authURL = authURL

	return &AuthStartResult{
		AuthURL:   authURL,
		SessionID: sessionID,
	}, nil
}

// AuthStatusResult contains the current status of an auth session
type AuthStatusResult struct {
	Done    bool   `json:"done"`
	Success bool   `json:"success"`
	Error   string `json:"error,omitempty"`
	Remote  string `json:"remote,omitempty"`
	Label   string `json:"label,omitempty"`
}

// CheckStatus checks if the auth session has completed
func (s *RcloneOAuthService) CheckStatus(ctx context.Context, sessionID string) (*AuthStatusResult, error) {
	s.mu.Lock()
	session, ok := s.sessions[sessionID]
	s.mu.Unlock()

	if !ok {
		return nil, fmt.Errorf("session not found or expired")
	}

	if !session.done {
		return &AuthStatusResult{Done: false}, nil
	}

	if session.err != nil {
		return &AuthStatusResult{
			Done:    true,
			Success: false,
			Error:   session.err.Error(),
		}, nil
	}

	// Auth completed - now create the rclone remote and storage account
	remoteName, err := s.finalizeAuth(ctx, session)
	if err != nil {
		return &AuthStatusResult{
			Done:    true,
			Success: false,
			Error:   err.Error(),
		}, nil
	}

	// Cleanup session
	s.mu.Lock()
	delete(s.sessions, sessionID)
	s.mu.Unlock()

	return &AuthStatusResult{
		Done:    true,
		Success: true,
		Remote:  remoteName,
		Label:   session.label,
	}, nil
}

func (s *RcloneOAuthService) finalizeAuth(ctx context.Context, session *authSession) (string, error) {
	// Generate rclone remote name
	remoteName := fmt.Sprintf("%s_%s_%d", session.providerType, session.userID.String()[:8], time.Now().Unix())

	// Create rclone remote
	if session.token != "" {
		// We captured the token from rclone authorize output
		rcloneParams := map[string]string{
			"token": session.token,
		}
		if session.backend == "drive" {
			rcloneParams["scope"] = "drive"
		}

		if err := s.rcloneClient.ConfigCreate(ctx, remoteName, session.backend, rcloneParams); err != nil {
			return "", fmt.Errorf("failed to create rclone remote: %w", err)
		}
	} else {
		// Token not captured from output - rclone authorize may have saved it internally
		// Try to create remote using rclone config create with interactive=false
		// Actually, rclone authorize doesn't save to config - it just prints the token
		return "", fmt.Errorf("failed to capture OAuth token from rclone authorize output. Please try again.")
	}

	// Get provider from DB
	provider, err := s.providerRepo.GetByType(ctx, session.providerType)
	if err != nil {
		s.rcloneClient.ConfigDelete(ctx, remoteName)
		return "", fmt.Errorf("provider not found: %w", err)
	}

	// Store credentials
	credentialsJSON, _ := json.Marshal(map[string]string{
		"token": session.token,
	})

	// Create storage account
	account := &model.StorageAccount{
		UserID:           session.userID,
		ProviderID:       provider.ID,
		Label:            session.label,
		RcloneRemoteName: remoteName,
		Credentials:      credentialsJSON,
		HealthStatus:     "healthy",
		IsActive:         true,
	}

	if err := s.accountRepo.Create(ctx, account); err != nil {
		s.rcloneClient.ConfigDelete(ctx, remoteName)
		return "", fmt.Errorf("failed to create storage account: %w", err)
	}

	return remoteName, nil
}

// SubmitCallbackURL handles manually pasted callback URLs
func (s *RcloneOAuthService) SubmitCallbackURL(ctx context.Context, sessionID, callbackURL string) (*AuthStatusResult, error) {
	s.mu.Lock()
	session, ok := s.sessions[sessionID]
	s.mu.Unlock()

	if !ok {
		return nil, fmt.Errorf("session not found or expired")
	}

	// Extract the auth code from callback URL
	// Format: http://127.0.0.1:53682/auth?state=xxx&code=xxx
	// Or: http://localhost:53682/auth?state=xxx&code=xxx
	code := ""
	if strings.Contains(callbackURL, "code=") {
		parts := strings.Split(callbackURL, "code=")
		if len(parts) > 1 {
			code = strings.Split(parts[1], "&")[0]
		}
	}

	if code == "" {
		return &AuthStatusResult{
			Done:    true,
			Success: false,
			Error:   "No authorization code found in callback URL",
		}, nil
	}

	// If rclone authorize is still running, kill it - we'll handle manually
	if session.cmd != nil && session.cmd.Process != nil {
		session.cmd.Process.Kill()
	}

	// Exchange code for token using rclone's built-in OAuth client
	// rclone uses its own client_id for Google Drive
	tokenJSON, err := s.exchangeCodeForToken(ctx, code, session.backend)
	if err != nil {
		return &AuthStatusResult{
			Done:    true,
			Success: false,
			Error:   fmt.Sprintf("Failed to exchange code: %v", err),
		}, nil
	}

	session.token = tokenJSON
	session.done = true

	// Finalize - create remote and account
	remoteName, err := s.finalizeAuth(ctx, session)
	if err != nil {
		return &AuthStatusResult{
			Done:    true,
			Success: false,
			Error:   err.Error(),
		}, nil
	}

	// Cleanup
	s.mu.Lock()
	delete(s.sessions, sessionID)
	s.mu.Unlock()

	return &AuthStatusResult{
		Done:    true,
		Success: true,
		Remote:  remoteName,
		Label:   session.label,
	}, nil
}

// exchangeCodeForToken exchanges an OAuth code for a token using rclone's client
func (s *RcloneOAuthService) exchangeCodeForToken(ctx context.Context, code, backend string) (string, error) {
	// Use rclone to exchange the code
	// rclone authorize can handle this internally
	// Actually, we need to POST to Google's token endpoint
	// rclone's Google Drive client_id: 202264815644.apps.googleusercontent.com
	// rclone's client_secret: X4Z3ca8xfWDb1Voo-F9a7l

	tokenURL := "https://oauth2.googleapis.com/token"
	redirectURI := "http://127.0.0.1:53682/auth"

	data := fmt.Sprintf(
		"code=%s&client_id=202264815644.apps.googleusercontent.com&client_secret=X4Z3ca8xfWDb1Voo-F9a7l&redirect_uri=%s&grant_type=authorization_code",
		code, redirectURI,
	)

	req, err := http.NewRequest("POST", tokenURL, strings.NewReader(data))
	if err != nil {
		return "", fmt.Errorf("failed to create token request: %w", err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req.WithContext(ctx))
	if err != nil {
		return "", fmt.Errorf("failed to exchange code: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != 200 {
		return "", fmt.Errorf("token exchange failed (status %d): %s", resp.StatusCode, string(body))
	}

	// Parse and reformat token as rclone expects
	var tokenResp map[string]interface{}
	if err := json.Unmarshal(body, &tokenResp); err != nil {
		return "", fmt.Errorf("failed to parse token response: %w", err)
	}

	// Format as rclone token JSON
	rcloneToken := map[string]interface{}{
		"access_token":  tokenResp["access_token"],
		"token_type":    tokenResp["token_type"],
		"refresh_token": tokenResp["refresh_token"],
		"expiry":        time.Now().Add(time.Duration(tokenResp["expires_in"].(float64)) * time.Second).Format(time.RFC3339),
	}

	tokenJSON, _ := json.Marshal(rcloneToken)
	return string(tokenJSON), nil
}
