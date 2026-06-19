package service

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/url"
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

// RcloneOAuthService handles OAuth for cloud storage providers using a custom
// OAuth flow that works on headless VPS deployments.  It generates the Google
// OAuth URL directly (no rclone authorize subprocess) and runs its own
// callback proxy server on port 53682.
type RcloneOAuthService struct {
	rcloneClient      *rclone.Client
	rclonePath        string
	accountRepo       *repository.StorageAccountRepository
	providerRepo      *repository.ProviderRepository
	oauthRedirectHost string
	appBaseURL        string

	// Track active auth sessions
	mu              sync.Mutex
	sessions        map[string]*authSession
	sessionsByState map[string]string // state -> sessionID

	// Callback proxy server
	callbackServer   *http.Server
	callbackServerMu sync.Mutex
}

type authSession struct {
	userID       uuid.UUID
	providerType string
	label        string
	backend      string
	token        string
	done         bool
	err          error
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
		sessionsByState:   make(map[string]string),
	}
}

// ---------------------------------------------------------------------------
// AuthStartResult contains the auth URL, session ID and callback proxy address
// ---------------------------------------------------------------------------

type AuthStartResult struct {
	AuthURL       string `json:"auth_url"`
	SessionID     string `json:"session_id"`
	CallbackProxy string `json:"callback_proxy"`
}

// AuthStatusResult contains the current status of an auth session
type AuthStatusResult struct {
	Done    bool   `json:"done"`
	Success bool   `json:"success"`
	Error   string `json:"error,omitempty"`
	Remote  string `json:"remote,omitempty"`
	Label   string `json:"label,omitempty"`
}

// ---------------------------------------------------------------------------
// killExistingAuthProcesses – kills stale rclone authorize processes that may
// be holding port 53682, and cleans up orphaned sessions from our map.
// ---------------------------------------------------------------------------

func (s *RcloneOAuthService) killExistingAuthProcesses() {
	if runtime.GOOS == "windows" {
		killCmd := exec.Command("taskkill", "/IM", "rclone.exe", "/F")
		if output, err := killCmd.CombinedOutput(); err != nil {
			log.Printf("[rclone] cleanup: %s", strings.TrimSpace(string(output)))
		} else {
			log.Printf("[rclone] cleaned up existing processes")
		}
	} else {
		killCmd := exec.Command("pkill", "-f", "rclone authorize")
		if output, err := killCmd.CombinedOutput(); err != nil {
			log.Printf("[rclone] cleanup: %s", strings.TrimSpace(string(output)))
		} else {
			log.Printf("[rclone] cleaned up existing processes")
		}
	}

	// Clean up any stale sessions that are still marked as in-progress
	s.mu.Lock()
	for id, sess := range s.sessions {
		if !sess.done {
			log.Printf("[rclone] cleaning up stale session %s", id)
			sess.done = true
			sess.err = fmt.Errorf("session superseded by new auth request")
		}
	}
	s.mu.Unlock()

	// Small delay to ensure port is freed
	time.Sleep(1 * time.Second)
}

// ---------------------------------------------------------------------------
// StartAuth – generates a Google OAuth URL directly and starts the callback
// proxy server.  No rclone subprocess is spawned.
// ---------------------------------------------------------------------------

func (s *RcloneOAuthService) StartAuth(ctx context.Context, userID uuid.UUID, providerType, label string) (*AuthStartResult, error) {
	// Kill any stale rclone processes that might be holding port 53682
	s.killExistingAuthProcesses()

	sessionID := uuid.New().String()
	state := uuid.New().String()[:16] // short state for URL readability

	// Map provider type to rclone backend name
	backend := providerType
	if providerType == "gdrive" {
		backend = "drive"
	}

	session := &authSession{
		userID:       userID,
		providerType: providerType,
		label:        label,
		backend:      backend,
	}

	s.mu.Lock()
	s.sessions[sessionID] = session
	s.sessionsByState[state] = sessionID
	s.mu.Unlock()

	// Build the Google OAuth URL using url.Values for proper encoding
	params := url.Values{
		"client_id":     {"202264815644.apps.googleusercontent.com"},
		"redirect_uri":  {"http://127.0.0.1:53682/auth"},
		"response_type": {"code"},
		"scope":         {"https://www.googleapis.com/auth/drive"},
		"state":         {state},
		"access_type":   {"offline"},
		"prompt":        {"consent"},
	}
	authURL := "https://accounts.google.com/o/oauth2/v2/auth?" + params.Encode()

	// Start the callback proxy server
	callbackProxy := s.startCallbackProxy()

	log.Printf("[oauth] session %s started, state=%s, backend=%s", sessionID, state, backend)

	return &AuthStartResult{
		AuthURL:       authURL,
		SessionID:     sessionID,
		CallbackProxy: callbackProxy,
	}, nil
}

// ---------------------------------------------------------------------------
// CheckStatus – polls whether the auth session has completed.  When the
// callback proxy (or paste flow) marks session.done = true, this method
// finalizes the auth (creates rclone remote + storage account).
// ---------------------------------------------------------------------------

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

	// Auth completed – create the rclone remote and storage account
	remoteName, err := s.finalizeAuth(ctx, session)
	if err != nil {
		return &AuthStatusResult{
			Done:    true,
			Success: false,
			Error:   err.Error(),
		}, nil
	}

	// Cleanup session and state mapping
	s.mu.Lock()
	for st, sid := range s.sessionsByState {
		if sid == sessionID {
			delete(s.sessionsByState, st)
			break
		}
	}
	delete(s.sessions, sessionID)
	s.mu.Unlock()

	return &AuthStatusResult{
		Done:    true,
		Success: true,
		Remote:  remoteName,
		Label:   session.label,
	}, nil
}

// ---------------------------------------------------------------------------
// finalizeAuth – writes the rclone config and creates the storage account
// ---------------------------------------------------------------------------

func (s *RcloneOAuthService) finalizeAuth(ctx context.Context, session *authSession) (string, error) {
	remoteName := fmt.Sprintf("%s_%s_%d", session.providerType, session.userID.String()[:8], time.Now().Unix())

	if session.token == "" {
		return "", fmt.Errorf("no OAuth token captured")
	}

	// Write config to rclone config file
	configPath := s.rcloneClient.GetConfigPath()
	if configPath == "" {
		configPath = "rclone.conf"
	}

	configBlock := fmt.Sprintf("[%s]\ntype = %s\nscope = drive\ntoken = %s\n",
		remoteName, session.backend, session.token)

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

// ---------------------------------------------------------------------------
// SubmitCallbackURL – API handler for manually pasted callback URLs (called
// from the frontend via POST /api/oauth/callback).
// ---------------------------------------------------------------------------

func (s *RcloneOAuthService) SubmitCallbackURL(ctx context.Context, sessionID, callbackURL string) (*AuthStatusResult, error) {
	// Parse the callback URL to extract code and state
	parsedURL, err := url.Parse(callbackURL)
	if err != nil {
		return nil, fmt.Errorf("invalid callback URL: %w", err)
	}

	code := parsedURL.Query().Get("code")
	state := parsedURL.Query().Get("state")

	if code == "" {
		return &AuthStatusResult{
			Done:    true,
			Success: false,
			Error:   "No authorization code found in callback URL",
		}, nil
	}

	// Look up session – prefer state-based lookup, fall back to sessionID
	s.mu.Lock()
	var session *authSession
	var ok bool
	resolvedSessionID := sessionID

	if state != "" {
		if sid, found := s.sessionsByState[state]; found {
			session, ok = s.sessions[sid]
			if ok {
				resolvedSessionID = sid
			}
		}
	}
	if !ok {
		session, ok = s.sessions[sessionID]
	}
	s.mu.Unlock()

	if !ok {
		return nil, fmt.Errorf("session not found or expired")
	}

	// Exchange code for token
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

	// Finalize – create remote and account
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
	if state != "" {
		delete(s.sessionsByState, state)
	}
	delete(s.sessions, resolvedSessionID)
	s.mu.Unlock()

	return &AuthStatusResult{
		Done:    true,
		Success: true,
		Remote:  remoteName,
		Label:   session.label,
	}, nil
}

// ---------------------------------------------------------------------------
// exchangeCodeForToken – exchanges an OAuth authorization code for a token
// using rclone's well-known Google Drive client_id / client_secret.
// ---------------------------------------------------------------------------

func (s *RcloneOAuthService) exchangeCodeForToken(ctx context.Context, code, backend string) (string, error) {
	tokenURL := "https://oauth2.googleapis.com/token"
	redirectURI := "http://127.0.0.1:53682/auth"

	data := fmt.Sprintf(
		"code=%s&client_id=202264815644.apps.googleusercontent.com&client_secret=X4Z3ca8xfWDb1Voo-F9a7l&redirect_uri=%s&grant_type=authorization_code",
		url.QueryEscape(code), url.QueryEscape(redirectURI),
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

	// Build rclone-format token JSON
	rcloneToken := map[string]interface{}{
		"access_token":  tokenResp["access_token"],
		"token_type":    tokenResp["token_type"],
		"refresh_token": tokenResp["refresh_token"],
	}
	if expIn, ok := tokenResp["expires_in"].(float64); ok {
		rcloneToken["expiry"] = time.Now().Add(time.Duration(expIn) * time.Second).Format(time.RFC3339)
	}

	tokenJSON, _ := json.Marshal(rcloneToken)
	return string(tokenJSON), nil
}

// ---------------------------------------------------------------------------
// startCallbackProxy – starts (or restarts) the callback proxy server on
// 0.0.0.0:53682.  The server handles:
//
//	GET  /auth?code=xxx&state=xxx  – direct OAuth redirect (e.g. via SSH tunnel)
//	GET  /                         – paste page for headless flow
//	POST /callback                 – receive pasted URL from the paste page
//
// Auto-shuts down after 10 minutes.
// ---------------------------------------------------------------------------

func (s *RcloneOAuthService) startCallbackProxy() string {
	s.callbackServerMu.Lock()
	defer s.callbackServerMu.Unlock()

	// Stop any existing callback server
	if s.callbackServer != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		s.callbackServer.Shutdown(ctx)
		cancel()
		s.callbackServer = nil
	}

	// Bind to 0.0.0.0:53682 so it's reachable from outside the VPS
	listener, err := net.Listen("tcp", "0.0.0.0:53682")
	if err != nil {
		log.Printf("[callback-proxy] port 53682 not available: %v", err)
		return ""
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/", s.handleRoot)
	mux.HandleFunc("/auth", s.handleCallbackAuth)
	mux.HandleFunc("/callback", s.handlePostCallback)

	server := &http.Server{
		Handler:      mux,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 30 * time.Second,
	}

	s.callbackServer = server

	go func() {
		log.Printf("[callback-proxy] listening on 0.0.0.0:53682")
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
			log.Printf("[callback-proxy] auto-shutdown after 10-minute timeout")
		}
		s.callbackServerMu.Unlock()
	}()

	callbackProxyURL := fmt.Sprintf("http://%s:53682", s.oauthRedirectHost)
	log.Printf("[callback-proxy] URL: %s", callbackProxyURL)
	return callbackProxyURL
}

// ---------------------------------------------------------------------------
// StopCallbackServer – gracefully stops the callback proxy
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// HTTP Handlers
// ---------------------------------------------------------------------------

// handleRoot serves the paste page (GET /).
func (s *RcloneOAuthService) handleRoot(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/" {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	fmt.Fprint(w, s.getPasteHTML())
}

// handleCallbackAuth handles the OAuth redirect at GET /auth?code=xxx&state=xxx.
// If no code is present it redirects to the paste page.
func (s *RcloneOAuthService) handleCallbackAuth(w http.ResponseWriter, r *http.Request) {
	code := r.URL.Query().Get("code")
	state := r.URL.Query().Get("state")

	if code == "" {
		// No code – redirect to paste page
		http.Redirect(w, r, "/", http.StatusFound)
		return
	}

	// Look up session by state
	s.mu.Lock()
	sessionID, ok := s.sessionsByState[state]
	var session *authSession
	if ok {
		session, ok = s.sessions[sessionID]
	}
	s.mu.Unlock()

	if !ok || session == nil {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		fmt.Fprint(w, s.getErrorHTML("Invalid or expired authorization state. Please start a new authorization."))
		return
	}

	// Check for error from Google
	if errParam := r.URL.Query().Get("error"); errParam != "" {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		fmt.Fprint(w, s.getErrorHTML("Google returned an error: "+errParam))
		return
	}

	// Exchange code for token
	tokenJSON, err := s.exchangeCodeForToken(context.Background(), code, session.backend)
	if err != nil {
		log.Printf("[callback-proxy] token exchange failed: %v", err)
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		fmt.Fprint(w, s.getErrorHTML("Token exchange failed: "+err.Error()))
		return
	}

	// Store token and mark session done
	s.mu.Lock()
	session.token = tokenJSON
	session.done = true
	s.mu.Unlock()

	// Finalize – create rclone remote and storage account in DB
	remoteName, finalizeErr := s.finalizeAuth(context.Background(), session)
	if finalizeErr != nil {
		log.Printf("[callback-proxy] finalize failed for session %s: %v", sessionID, finalizeErr)
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		fmt.Fprint(w, s.getErrorHTML("Authorization succeeded but failed to save account: "+finalizeErr.Error()))
		return
	}

	// Cleanup session
	s.mu.Lock()
	delete(s.sessionsByState, state)
	delete(s.sessions, sessionID)
	s.mu.Unlock()

	log.Printf("[callback-proxy] auth code received, token obtained, account created for session %s (remote: %s)", sessionID, remoteName)

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	fmt.Fprint(w, s.getSuccessHTML())
}

// handlePostCallback handles POST /callback – receives a pasted URL from the
// paste page, extracts the code and state, and processes the OAuth callback.
func (s *RcloneOAuthService) handlePostCallback(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "POST required", http.StatusMethodNotAllowed)
		return
	}

	if err := r.ParseForm(); err != nil {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		fmt.Fprint(w, s.getErrorHTML("Failed to parse form data."))
		return
	}

	callbackURL := r.FormValue("callback_url")
	if callbackURL == "" {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		fmt.Fprint(w, s.getErrorHTML("Callback URL is required."))
		return
	}

	// Parse the pasted URL to extract code and state
	parsedURL, err := url.Parse(callbackURL)
	if err != nil {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		fmt.Fprint(w, s.getErrorHTML("Invalid URL format."))
		return
	}

	code := parsedURL.Query().Get("code")
	state := parsedURL.Query().Get("state")

	if code == "" {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		fmt.Fprint(w, s.getErrorHTML("No authorization code found in the URL. Make sure you copied the full URL."))
		return
	}

	if state == "" {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		fmt.Fprint(w, s.getErrorHTML("No state parameter found in the URL."))
		return
	}

	// Look up session by state
	s.mu.Lock()
	sessionID, ok := s.sessionsByState[state]
	var session *authSession
	if ok {
		session, ok = s.sessions[sessionID]
	}
	s.mu.Unlock()

	if !ok || session == nil {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		fmt.Fprint(w, s.getErrorHTML("Session not found or expired. Please start a new authorization."))
		return
	}

	// Exchange code for token
	tokenJSON, err := s.exchangeCodeForToken(context.Background(), code, session.backend)
	if err != nil {
		log.Printf("[callback-proxy] token exchange failed (paste): %v", err)
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		fmt.Fprint(w, s.getErrorHTML("Token exchange failed: "+err.Error()))
		return
	}

	// Store token and mark session done
	s.mu.Lock()
	session.token = tokenJSON
	session.done = true
	s.mu.Unlock()

	// Finalize – create rclone remote and storage account in DB
	remoteName, finalizeErr := s.finalizeAuth(context.Background(), session)
	if finalizeErr != nil {
		log.Printf("[callback-proxy] finalize failed (paste) for session %s: %v", sessionID, finalizeErr)
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		fmt.Fprint(w, s.getErrorHTML("Token obtained but failed to save account: "+finalizeErr.Error()))
		return
	}

	// Cleanup session
	s.mu.Lock()
	delete(s.sessionsByState, state)
	delete(s.sessions, sessionID)
	s.mu.Unlock()

	log.Printf("[callback-proxy] pasted URL processed, token obtained, account created for session %s (remote: %s)", sessionID, remoteName)

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	fmt.Fprint(w, s.getSuccessHTML())
}

// ---------------------------------------------------------------------------
// HTML Pages
// ---------------------------------------------------------------------------

// getPasteHTML returns the paste page – a step-by-step guide for the headless
// flow where the user copies the failed redirect URL and pastes it here.
func (s *RcloneOAuthService) getPasteHTML() string {
	return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CloudHub — Complete Authorization</title>
    <style>
        *{box-sizing:border-box;margin:0;padding:0}
        body{
            font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,sans-serif;
            background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);
            min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px;
        }
        .container{
            background:#fff;border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,.3);
            max-width:620px;width:100%;padding:40px;
        }
        .logo{text-align:center;margin-bottom:28px}
        .logo h1{color:#333;font-size:24px;font-weight:600}
        .logo p{color:#666;font-size:14px;margin-top:8px}
        .steps{background:#f8fafc;border-radius:12px;padding:24px;margin-bottom:24px}
        .steps h2{font-size:16px;color:#333;margin-bottom:16px}
        .step{display:flex;gap:12px;margin-bottom:16px;align-items:flex-start}
        .step:last-child{margin-bottom:0}
        .step-num{
            background:#667eea;color:#fff;width:28px;height:28px;border-radius:50%;
            display:flex;align-items:center;justify-content:center;font-weight:600;font-size:14px;flex-shrink:0;
        }
        .step-text{color:#444;font-size:14px;line-height:1.5;padding-top:4px}
        .step-text code{
            background:#e2e8f0;padding:2px 6px;border-radius:4px;font-family:monospace;font-size:12px;
        }
        .form-group{margin-bottom:20px}
        .form-group label{display:block;font-size:14px;font-weight:500;color:#333;margin-bottom:8px}
        .form-group input{
            width:100%;padding:14px 16px;border:2px solid #e2e8f0;border-radius:10px;
            font-size:14px;transition:border-color .2s;
        }
        .form-group input:focus{outline:none;border-color:#667eea}
        .form-group input::placeholder{color:#a0aec0}
        .btn{
            width:100%;padding:16px;
            background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);
            color:#fff;border:none;border-radius:10px;font-size:16px;font-weight:600;
            cursor:pointer;transition:transform .2s,box-shadow .2s;
        }
        .btn:hover{transform:translateY(-2px);box-shadow:0 10px 20px rgba(102,126,234,.3)}
        .btn:disabled{opacity:.6;cursor:not-allowed;transform:none}
        .hint{
            background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;
            padding:12px 16px;margin-bottom:20px;font-size:13px;color:#92400e;
        }
        .hint strong{color:#78350f}
        .loading{display:none;text-align:center;padding:20px}
        .loading.active{display:block}
        .spinner{
            width:40px;height:40px;border:3px solid #e2e8f0;border-top-color:#667eea;
            border-radius:50%;animation:spin 1s linear infinite;margin:0 auto 16px;
        }
        @keyframes spin{to{transform:rotate(360deg)}}
    </style>
</head>
<body>
    <div class="container">
        <div class="logo">
            <h1>☁️ CloudHub Storage Gateway</h1>
            <p>Complete Your Google Drive Authorization</p>
        </div>

        <div class="steps">
            <h2>📋 How it works on a headless server:</h2>
            <div class="step">
                <div class="step-num">1</div>
                <div class="step-text">
                    You clicked the authorization link and signed in with Google&nbsp;✓
                </div>
            </div>
            <div class="step">
                <div class="step-num">2</div>
                <div class="step-text">
                    After granting access, your browser tried to redirect to
                    <code>http://127.0.0.1:53682/auth?...</code> and showed
                    <strong>"This site can't be reached"</strong> — this is expected on a remote server!
                </div>
            </div>
            <div class="step">
                <div class="step-num">3</div>
                <div class="step-text">
                    <strong>Copy the entire URL</strong> from your browser's address bar.<br>
                    It looks like: <code>http://127.0.0.1:53682/auth?state=...&amp;code=...</code>
                </div>
            </div>
            <div class="step">
                <div class="step-num">4</div>
                <div class="step-text">
                    Paste that full URL below and click <strong>Complete Authorization</strong>.
                </div>
            </div>
        </div>

        <div class="hint">
            <strong>💡 Tip:</strong> Click the address bar, press <kbd>Ctrl+A</kbd>
            (<kbd>⌘+A</kbd> on Mac) to select all, then <kbd>Ctrl+C</kbd> to copy.
        </div>

        <form id="callbackForm" action="/callback" method="POST">
            <div class="form-group">
                <label for="callback_url">Paste the callback URL here:</label>
                <input
                    type="text"
                    id="callback_url"
                    name="callback_url"
                    placeholder="http://127.0.0.1:53682/auth?state=...&amp;code=..."
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
            <p>Processing authorization…</p>
        </div>
    </div>

    <script>
        document.getElementById('callbackForm').addEventListener('submit', function() {
            var btn = document.getElementById('submitBtn');
            var loading = document.getElementById('loading');
            btn.disabled = true;
            btn.style.display = 'none';
            loading.classList.add('active');
        });

        // If the URL has code and state params (direct redirect reached this page),
        // auto-submit the current URL.
        (function() {
            var params = new URLSearchParams(window.location.search);
            if (params.get('code') && params.get('state')) {
                var input = document.getElementById('callback_url');
                input.value = window.location.href;
                document.getElementById('callbackForm').dispatchEvent(new Event('submit'));
                document.getElementById('callbackForm').submit();
            }
        })();
    </script>
</body>
</html>`
}

// getSuccessHTML returns the success page shown after a code is captured.
func (s *RcloneOAuthService) getSuccessHTML() string {
	return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CloudHub — Authorization Successful</title>
    <style>
        *{box-sizing:border-box;margin:0;padding:0}
        body{
            font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
            background:linear-gradient(135deg,#10b981 0%,#059669 100%);
            min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px;
        }
        .container{
            background:#fff;border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,.3);
            max-width:500px;width:100%;padding:50px 40px;text-align:center;
        }
        .icon{
            width:80px;height:80px;background:#d1fae5;border-radius:50%;
            display:flex;align-items:center;justify-content:center;margin:0 auto 24px;
        }
        .icon svg{width:40px;height:40px;color:#10b981}
        h1{color:#065f46;font-size:24px;margin-bottom:12px}
        p{color:#666;font-size:16px;line-height:1.5}
        .note{margin-top:24px;font-size:14px;color:#888}
        .auto-close{margin-top:16px;font-size:13px;color:#aaa}
    </style>
</head>
<body>
    <div class="container">
        <div class="icon">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
            </svg>
        </div>
        <h1>Authorization Successful!</h1>
        <p>Your Google Drive account has been connected.<br>The CloudHub app will detect this automatically.</p>
        <p class="note">You can close this window and return to CloudHub.</p>
        <p class="auto-close" id="countdown"></p>
    </div>
    <script>
        (function(){
            var sec = 10;
            var el = document.getElementById('countdown');
            var iv = setInterval(function(){
                if(sec <= 0){ clearInterval(iv); window.close(); return; }
                el.textContent = 'Closing in ' + sec + 's…';
                sec--;
            }, 1000);
        })();
    </script>
</body>
</html>`
}

// getErrorHTML returns the error page.
func (s *RcloneOAuthService) getErrorHTML(errMsg string) string {
	return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CloudHub — Authorization Failed</title>
    <style>
        *{box-sizing:border-box;margin:0;padding:0}
        body{
            font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
            background:linear-gradient(135deg,#ef4444 0%,#dc2626 100%);
            min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px;
        }
        .container{
            background:#fff;border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,.3);
            max-width:500px;width:100%;padding:50px 40px;text-align:center;
        }
        .icon{
            width:80px;height:80px;background:#fee2e2;border-radius:50%;
            display:flex;align-items:center;justify-content:center;margin:0 auto 24px;
        }
        .icon svg{width:40px;height:40px;color:#ef4444}
        h1{color:#991b1b;font-size:24px;margin-bottom:12px}
        p{color:#666;font-size:16px;line-height:1.5}
        .error{
            background:#fef2f2;border:1px solid #fecaca;border-radius:8px;
            padding:12px 20px;margin:20px 0;font-size:14px;color:#991b1b;word-break:break-word;
        }
        .btn{
            display:inline-block;margin-top:20px;padding:12px 24px;
            background:#667eea;color:#fff;border-radius:8px;text-decoration:none;font-weight:500;
        }
        .btn:hover{background:#5a67d8}
    </style>
</head>
<body>
    <div class="container">
        <div class="icon">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
        </div>
        <h1>Authorization Failed</h1>
        <p>Something went wrong while completing the authorization.</p>
        <div class="error">` + errMsg + `</div>
        <p>Please return to CloudHub and try again.</p>
        <a href="/" class="btn">Try Again</a>
    </div>
</body>
</html>`
}
