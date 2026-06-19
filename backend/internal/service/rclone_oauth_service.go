package service

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"runtime"
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
	rcloneClient       *rclone.Client
	rclonePath         string
	accountRepo        *repository.StorageAccountRepository
	providerRepo       *repository.ProviderRepository
	oauthRedirectHost  string
	appBaseURL         string

	// Track active auth sessions
	mu       sync.Mutex
	sessions map[string]*authSession

	// Callback proxy server
	callbackServer     *http.Server
	callbackServerMu   sync.Mutex
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
	oauthRedirectHost string,
	appBaseURL string,
) *RcloneOAuthService {
	return &RcloneOAuthService{
		rcloneClient:      rcloneClient,
		rclonePath:        rclonePath,
		accountRepo:       accountRepo,
		providerRepo:      providerRepo,
		oauthRedirectHost: oauthRedirectHost,
		appBaseURL:        appBaseURL,
		sessions:          make(map[string]*authSession),
	}
}

// killExistingAuthProcesses kills any existing rclone authorize processes
// to free up port 53682 before starting a new one
func (s *RcloneOAuthService) killExistingAuthProcesses() {
	// Kill all rclone processes (cross-platform)
	// This ensures port 53682 is freed
	if runtime.GOOS == "windows" {
		killCmd := exec.Command("taskkill", "/IM", "rclone.exe", "/F")
		if output, err := killCmd.CombinedOutput(); err != nil {
			// Not an error if no rclone process found
			log.Printf("[rclone] cleanup: %s", strings.TrimSpace(string(output)))
		} else {
			log.Printf("[rclone] cleaned up existing processes")
		}
	} else {
		killCmd := exec.Command("pkill", "-f", "rclone authorize")
		if output, err := killCmd.CombinedOutput(); err != nil {
			// Not an error if no rclone process found
			log.Printf("[rclone] cleanup: %s", strings.TrimSpace(string(output)))
		} else {
			log.Printf("[rclone] cleaned up existing processes")
		}
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
	AuthURL          string `json:"auth_url"`
	SessionID        string `json:"session_id"`
	CallbackProxyURL string `json:"callback_proxy_url,omitempty"`
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
					// Clean up trailing characters - keep original 127.0.0.1 URL
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
						// Keep original URL with 127.0.0.1 - don't modify
						url := strings.TrimRight(part, "\"' ,;")
						select {
						case urlChan <- url:
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

	// Start callback proxy server for VPS/headless deployments
	callbackProxyURL := s.startCallbackProxyServer(sessionID)

	return &AuthStartResult{
		AuthURL:          authURL,
		SessionID:        sessionID,
		CallbackProxyURL: callbackProxyURL,
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

	if session.token == "" {
		return "", fmt.Errorf("no OAuth token captured from rclone authorize output")
	}

	// Write config directly to file instead of using `rclone config create`
	// (which starts an interactive wizard and blocks)
	configPath := s.rcloneClient.GetConfigPath()
	if configPath == "" {
		// Default to rclone.conf in current directory
		configPath = "rclone.conf"
	}

	// Build INI-style config block
	configBlock := fmt.Sprintf("[%s]\ntype = %s\nscope = drive\ntoken = %s\n",
		remoteName, session.backend, session.token)

	// Append to config file
	f, err := os.OpenFile(configPath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		return "", fmt.Errorf("failed to open rclone config file: %w", err)
	}
	defer f.Close()

	if _, err := f.WriteString(configBlock + "\n"); err != nil {
		return "", fmt.Errorf("failed to write rclone config: %w", err)
	}

	log.Printf("[rclone] wrote config for remote %s to %s", remoteName, configPath)

	// Get provider from DB
	provider, err := s.providerRepo.GetByType(ctx, session.providerType)
	if err != nil {
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
		return "", fmt.Errorf("failed to create storage account: %w", err)
	}

	log.Printf("[rclone] storage account created: %s (remote: %s)", account.Label, remoteName)
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

// startCallbackProxyServer starts a callback proxy server on port 53682
// that provides a nice HTML page for users to paste their callback URL
func (s *RcloneOAuthService) startCallbackProxyServer(sessionID string) string {
	s.callbackServerMu.Lock()
	defer s.callbackServerMu.Unlock()

	// Stop any existing callback server
	if s.callbackServer != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		s.callbackServer.Shutdown(ctx)
		cancel()
		s.callbackServer = nil
	}

	// Check if port 53682 is available
	listener, err := net.Listen("tcp", ":53682")
	if err != nil {
		log.Printf("[callback-proxy] port 53682 not available: %v", err)
		// Return empty string - frontend will fall back to manual paste
		return ""
	}

	mux := http.NewServeMux()

	// Serve the callback paste page
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(s.getCallbackHTML(sessionID)))
	})

	// Handle callback URL submission
	mux.HandleFunc("/submit-callback", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "POST required", http.StatusMethodNotAllowed)
			return
		}

		// Parse form data
		if err := r.ParseForm(); err != nil {
			http.Error(w, "Failed to parse form", http.StatusBadRequest)
			return
		}

		callbackURL := r.FormValue("callback_url")
		if callbackURL == "" {
			http.Error(w, "callback_url is required", http.StatusBadRequest)
			return
		}

		// Process the callback
		result, err := s.SubmitCallbackURL(r.Context(), sessionID, callbackURL)
		if err != nil {
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			w.WriteHeader(http.StatusOK)
			w.Write([]byte(s.getErrorHTML(err.Error())))
			return
		}

		if result.Success {
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			w.WriteHeader(http.StatusOK)
			w.Write([]byte(s.getSuccessHTML(result.Label)))
		} else {
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			w.WriteHeader(http.StatusOK)
			w.Write([]byte(s.getErrorHTML(result.Error)))
		}
	})

	// Handle the /auth endpoint (in case Google redirect somehow reaches here)
	mux.HandleFunc("/auth", func(w http.ResponseWriter, r *http.Request) {
		code := r.URL.Query().Get("code")
		state := r.URL.Query().Get("state")

		if code != "" {
			// Build the full callback URL and process it
			callbackURL := fmt.Sprintf("http://127.0.0.1:53682/auth?state=%s&code=%s", state, code)
			result, err := s.SubmitCallbackURL(r.Context(), sessionID, callbackURL)

			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			if err != nil {
				w.Write([]byte(s.getErrorHTML(err.Error())))
			} else if result.Success {
				w.Write([]byte(s.getSuccessHTML(result.Label)))
			} else {
				w.Write([]byte(s.getErrorHTML(result.Error)))
			}
			return
		}

		// No code - redirect to paste page
		http.Redirect(w, r, "/", http.StatusFound)
	})

	server := &http.Server{
		Handler:      mux,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 30 * time.Second,
	}

	s.callbackServer = server

	// Start server in background
	go func() {
		log.Printf("[callback-proxy] started on port 53682 for session %s", sessionID)
		if err := server.Serve(listener); err != nil && err != http.ErrServerClosed {
			log.Printf("[callback-proxy] server error: %v", err)
		}
	}()

	// Auto-shutdown after 10 minutes
	go func() {
		time.Sleep(10 * time.Minute)
		s.callbackServerMu.Lock()
		if s.callbackServer == server {
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			server.Shutdown(ctx)
			cancel()
			s.callbackServer = nil
			log.Printf("[callback-proxy] auto-shutdown after timeout")
		}
		s.callbackServerMu.Unlock()
	}()

	// Build the callback proxy URL using the VPS host
	callbackProxyURL := fmt.Sprintf("http://%s:53682", s.oauthRedirectHost)
	log.Printf("[callback-proxy] URL: %s", callbackProxyURL)

	return callbackProxyURL
}

// StopCallbackServer stops the callback proxy server
func (s *RcloneOAuthService) StopCallbackServer() {
	s.callbackServerMu.Lock()
	defer s.callbackServerMu.Unlock()

	if s.callbackServer != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		s.callbackServer.Shutdown(ctx)
		cancel()
		s.callbackServer = nil
		log.Printf("[callback-proxy] stopped")
	}
}

// getCallbackHTML returns the HTML page for pasting callback URL
func (s *RcloneOAuthService) getCallbackHTML(sessionID string) string {
	return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CloudHub - Complete Authorization</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        .container {
            background: white;
            border-radius: 16px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            max-width: 600px;
            width: 100%;
            padding: 40px;
        }
        .logo {
            text-align: center;
            margin-bottom: 30px;
        }
        .logo h1 {
            color: #333;
            font-size: 24px;
            font-weight: 600;
        }
        .logo p {
            color: #666;
            font-size: 14px;
            margin-top: 8px;
        }
        .steps {
            background: #f8fafc;
            border-radius: 12px;
            padding: 24px;
            margin-bottom: 24px;
        }
        .steps h2 {
            font-size: 16px;
            color: #333;
            margin-bottom: 16px;
        }
        .step {
            display: flex;
            gap: 12px;
            margin-bottom: 16px;
            align-items: flex-start;
        }
        .step:last-child { margin-bottom: 0; }
        .step-num {
            background: #667eea;
            color: white;
            width: 28px;
            height: 28px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 600;
            font-size: 14px;
            flex-shrink: 0;
        }
        .step-text {
            color: #444;
            font-size: 14px;
            line-height: 1.5;
            padding-top: 4px;
        }
        .step-text code {
            background: #e2e8f0;
            padding: 2px 6px;
            border-radius: 4px;
            font-family: monospace;
            font-size: 12px;
        }
        .form-group {
            margin-bottom: 20px;
        }
        .form-group label {
            display: block;
            font-size: 14px;
            font-weight: 500;
            color: #333;
            margin-bottom: 8px;
        }
        .form-group input {
            width: 100%;
            padding: 14px 16px;
            border: 2px solid #e2e8f0;
            border-radius: 10px;
            font-size: 14px;
            transition: border-color 0.2s;
        }
        .form-group input:focus {
            outline: none;
            border-color: #667eea;
        }
        .form-group input::placeholder {
            color: #a0aec0;
        }
        .btn {
            width: 100%;
            padding: 16px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            border-radius: 10px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: transform 0.2s, box-shadow 0.2s;
        }
        .btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 10px 20px rgba(102, 126, 234, 0.3);
        }
        .btn:disabled {
            opacity: 0.6;
            cursor: not-allowed;
            transform: none;
        }
        .hint {
            background: #fffbeb;
            border: 1px solid #fcd34d;
            border-radius: 8px;
            padding: 12px 16px;
            margin-bottom: 20px;
            font-size: 13px;
            color: #92400e;
        }
        .hint strong { color: #78350f; }
        .loading {
            display: none;
            text-align: center;
            padding: 20px;
        }
        .loading.active { display: block; }
        .spinner {
            width: 40px;
            height: 40px;
            border: 3px solid #e2e8f0;
            border-top-color: #667eea;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin: 0 auto 16px;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
    </style>
</head>
<body>
    <div class="container">
        <div class="logo">
            <h1>☁️ CloudHub Storage Gateway</h1>
            <p>Complete Your Authorization</p>
        </div>

        <div class="steps">
            <h2>📋 Follow these steps:</h2>
            <div class="step">
                <div class="step-num">1</div>
                <div class="step-text">
                    You clicked the authorization link and signed in with Google ✓
                </div>
            </div>
            <div class="step">
                <div class="step-num">2</div>
                <div class="step-text">
                    Your browser showed <strong>"This site can't be reached"</strong> — this is expected!
                </div>
            </div>
            <div class="step">
                <div class="step-num">3</div>
                <div class="step-text">
                    Copy the <strong>entire URL</strong> from your browser's address bar. It looks like:<br>
                    <code>http://127.0.0.1:53682/auth?state=...&code=...</code>
                </div>
            </div>
            <div class="step">
                <div class="step-num">4</div>
                <div class="step-text">
                    Paste that URL below and click Submit
                </div>
            </div>
        </div>

        <div class="hint">
            <strong>💡 Tip:</strong> Click the address bar, press Ctrl+A (or Cmd+A on Mac) to select all, then Ctrl+C to copy.
        </div>

        <form id="callbackForm" action="/submit-callback" method="POST">
            <div class="form-group">
                <label for="callback_url">Paste the callback URL here:</label>
                <input 
                    type="text" 
                    id="callback_url" 
                    name="callback_url" 
                    placeholder="http://127.0.0.1:53682/auth?state=...&code=..."
                    required
                    autocomplete="off"
                >
            </div>
            <button type="submit" class="btn" id="submitBtn">
                Complete Authorization
            </button>
        </form>

        <div class="loading" id="loading">
            <div class="spinner"></div>
            <p>Processing authorization...</p>
        </div>
    </div>

    <script>
        document.getElementById('callbackForm').addEventListener('submit', function(e) {
            const btn = document.getElementById('submitBtn');
            const loading = document.getElementById('loading');
            btn.disabled = true;
            btn.style.display = 'none';
            loading.classList.add('active');
        });
    </script>
</body>
</html>`
}

// getSuccessHTML returns the success HTML page
func (s *RcloneOAuthService) getSuccessHTML(label string) string {
	return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CloudHub - Authorization Complete</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #10b981 0%, #059669 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        .container {
            background: white;
            border-radius: 16px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            max-width: 500px;
            width: 100%;
            padding: 50px 40px;
            text-align: center;
        }
        .icon {
            width: 80px;
            height: 80px;
            background: #d1fae5;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 24px;
        }
        .icon svg {
            width: 40px;
            height: 40px;
            color: #10b981;
        }
        h1 {
            color: #065f46;
            font-size: 24px;
            margin-bottom: 12px;
        }
        p {
            color: #666;
            font-size: 16px;
            line-height: 1.5;
        }
        .label {
            background: #f0fdf4;
            border: 1px solid #bbf7d0;
            border-radius: 8px;
            padding: 12px 20px;
            margin: 20px 0;
            font-weight: 500;
            color: #166534;
        }
        .note {
            margin-top: 24px;
            font-size: 14px;
            color: #888;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="icon">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
            </svg>
        </div>
        <h1>Authorization Complete!</h1>
        <p>Your account has been connected successfully.</p>
        <div class="label">` + label + `</div>
        <p class="note">You can close this window and return to CloudHub.</p>
    </div>
</body>
</html>`
}

// getErrorHTML returns the error HTML page
func (s *RcloneOAuthService) getErrorHTML(errMsg string) string {
	return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CloudHub - Authorization Failed</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        .container {
            background: white;
            border-radius: 16px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            max-width: 500px;
            width: 100%;
            padding: 50px 40px;
            text-align: center;
        }
        .icon {
            width: 80px;
            height: 80px;
            background: #fee2e2;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 24px;
        }
        .icon svg {
            width: 40px;
            height: 40px;
            color: #ef4444;
        }
        h1 {
            color: #991b1b;
            font-size: 24px;
            margin-bottom: 12px;
        }
        p {
            color: #666;
            font-size: 16px;
            line-height: 1.5;
        }
        .error {
            background: #fef2f2;
            border: 1px solid #fecaca;
            border-radius: 8px;
            padding: 12px 20px;
            margin: 20px 0;
            font-size: 14px;
            color: #991b1b;
            word-break: break-word;
        }
        .btn {
            display: inline-block;
            margin-top: 20px;
            padding: 12px 24px;
            background: #667eea;
            color: white;
            border-radius: 8px;
            text-decoration: none;
            font-weight: 500;
        }
        .btn:hover {
            background: #5a67d8;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="icon">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
        </div>
        <h1>Authorization Failed</h1>
        <p>Something went wrong while completing the authorization.</p>
        <div class="error">` + errMsg + `</div>
        <p>Please return to CloudHub and try again.</p>
        <a href="javascript:window.close()" class="btn">Close Window</a>
    </div>
</body>
</html>`
}
