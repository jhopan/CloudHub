package rclone

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os/exec"
	"strings"
	"time"
)

type Client struct {
	rclonePath string
	configPath string
	timeout    time.Duration
}

func NewClient(rclonePath, configPath string) *Client {
	return &Client{
		rclonePath: rclonePath,
		configPath: configPath,
		timeout:    5 * time.Minute,
	}
}

func (c *Client) SetTimeout(timeout time.Duration) {
	c.timeout = timeout
}

// GetConfigPath returns the rclone config file path
func (c *Client) GetConfigPath() string {
	return c.configPath
}

// exec runs an rclone command with timeout
func (c *Client) exec(ctx context.Context, args ...string) ([]byte, error) {
	timeoutCtx, cancel := context.WithTimeout(ctx, c.timeout)
	defer cancel()

	cmd := exec.CommandContext(timeoutCtx, c.rclonePath, args...)
	if c.configPath != "" {
		cmd.Env = append(cmd.Env, fmt.Sprintf("RCLONE_CONFIG=%s", c.configPath))
	}

	output, err := cmd.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("rclone command failed: %w, output: %s", err, string(output))
	}

	return output, nil
}

// Copy uploads a file to remote storage
func (c *Client) Copy(ctx context.Context, source, remote, remotePath string) error {
	dest := fmt.Sprintf("%s:%s", remote, remotePath)
	_, err := c.exec(ctx, "copy", source, dest, "--progress")
	return err
}

// CopyStream uploads from a reader to remote storage
func (c *Client) CopyStream(ctx context.Context, reader io.Reader, remote, remotePath string) error {
	dest := fmt.Sprintf("%s:%s", remote, remotePath)

	timeoutCtx, cancel := context.WithTimeout(ctx, c.timeout)
	defer cancel()

	cmd := exec.CommandContext(timeoutCtx, c.rclonePath, "rcat", dest)
	cmd.Env = append(cmd.Env, fmt.Sprintf("RCLONE_CONFIG=%s", c.configPath))
	cmd.Stdin = reader

	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("rclone rcat failed: %w, output: %s", err, string(output))
	}

	return nil
}

// Cat downloads a file from remote storage
func (c *Client) Cat(ctx context.Context, remote, remotePath string) ([]byte, error) {
	source := fmt.Sprintf("%s:%s", remote, remotePath)
	return c.exec(ctx, "cat", source)
}

// CatStream downloads a file as a stream
func (c *Client) CatStream(ctx context.Context, remote, remotePath string) (io.ReadCloser, error) {
	source := fmt.Sprintf("%s:%s", remote, remotePath)

	timeoutCtx, cancel := context.WithTimeout(ctx, c.timeout)

	cmd := exec.CommandContext(timeoutCtx, c.rclonePath, "cat", source)
	cmd.Env = append(cmd.Env, fmt.Sprintf("RCLONE_CONFIG=%s", c.configPath))

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		cancel()
		return nil, err
	}

	if err := cmd.Start(); err != nil {
		cancel()
		return nil, err
	}

	// Return a reader that also cleans up the process
	return &streamReader{
		ReadCloser: stdout,
		cmd:        cmd,
		cancel:     cancel,
	}, nil
}

type streamReader struct {
	io.ReadCloser
	cmd    *exec.Cmd
	cancel context.CancelFunc
}

func (sr *streamReader) Close() error {
	sr.cancel()
	sr.ReadCloser.Close()
	return sr.cmd.Wait()
}

// Delete removes a file from remote storage
func (c *Client) Delete(ctx context.Context, remote, remotePath string) error {
	target := fmt.Sprintf("%s:%s", remote, remotePath)
	_, err := c.exec(ctx, "delete", target)
	return err
}

// Mkdir creates a directory in remote storage
func (c *Client) Mkdir(ctx context.Context, remote, remotePath string) error {
	target := fmt.Sprintf("%s:%s", remote, remotePath)
	_, err := c.exec(ctx, "mkdir", target)
	return err
}

// About retrieves storage capacity information
func (c *Client) About(ctx context.Context, remote string) (*AboutInfo, error) {
	output, err := c.exec(ctx, "about", remote+":", "--json")
	if err != nil {
		return nil, err
	}

	var info AboutInfo
	if err := json.Unmarshal(output, &info); err != nil {
		return nil, err
	}

	return &info, nil
}

// AboutWithConfig retrieves storage capacity using a dynamic config string
func (c *Client) AboutWithConfig(ctx context.Context, remote, config string) (*AboutInfo, error) {
	timeoutCtx, cancel := context.WithTimeout(ctx, c.timeout)
	defer cancel()

	cmd := exec.CommandContext(timeoutCtx, c.rclonePath, "about", remote+":", "--json", "--config", "-")
	cmd.Stdin = strings.NewReader(config)

	output, err := cmd.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("rclone about failed: %w, output: %s", err, string(output))
	}

	var info AboutInfo
	if err := json.Unmarshal(output, &info); err != nil {
		return nil, err
	}

	return &info, nil
}

// HealthCheckWithConfig tests connection using a dynamic config string
func (c *Client) HealthCheckWithConfig(ctx context.Context, remote, config string) error {
	timeoutCtx, cancel := context.WithTimeout(ctx, c.timeout)
	defer cancel()

	cmd := exec.CommandContext(timeoutCtx, c.rclonePath, "lsjson", remote+":/", "--config", "-")
	cmd.Stdin = strings.NewReader(config)

	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("rclone health check failed: %w, output: %s", err, string(output))
	}

	return nil
}

// Lsjson lists files in a remote directory
func (c *Client) Lsjson(ctx context.Context, remote, remotePath string) ([]FileInfo, error) {
	target := fmt.Sprintf("%s:%s", remote, remotePath)
	output, err := c.exec(ctx, "lsjson", target)
	if err != nil {
		return nil, err
	}

	var files []FileInfo
	if err := json.Unmarshal(output, &files); err != nil {
		return nil, err
	}

	return files, nil
}

// LsjsonRecursive lists all files recursively in a remote directory
func (c *Client) LsjsonRecursive(ctx context.Context, remote, remotePath string) ([]FileInfo, error) {
	target := fmt.Sprintf("%s:%s", remote, remotePath)
	output, err := c.exec(ctx, "lsjson", target, "--recurse")
	if err != nil {
		return nil, err
	}

	var files []FileInfo
	if err := json.Unmarshal(output, &files); err != nil {
		return nil, err
	}

	return files, nil
}

// Version returns rclone version
func (c *Client) Version(ctx context.Context) (string, error) {
	output, err := c.exec(ctx, "version")
	if err != nil {
		return "", err
	}
	return string(output), nil
}

// HealthCheck tests if rclone can access a remote
func (c *Client) HealthCheck(ctx context.Context, remote string) error {
	_, err := c.Lsjson(ctx, remote, "/")
	return err
}

// FileExists checks if a file exists in the remote
func (c *Client) FileExists(ctx context.Context, remote, remotePath string) (bool, error) {
	target := fmt.Sprintf("%s:%s", remote, remotePath)
	output, err := c.exec(ctx, "lsjson", target)
	if err != nil {
		// If the command fails, the file likely doesn't exist
		return false, nil
	}
	// If we get output, the file exists
	return len(output) > 0 && string(output) != "[]", nil
}

// ConfigCreate creates an rclone remote configuration
// Example: rclone config create myremote drive client_id=xxx client_secret=yyy scope=drive token='{"access_token":"..."}'
func (c *Client) ConfigCreate(ctx context.Context, remoteName, storageType string, params map[string]string) error {
	args := []string{"config", "create", remoteName, storageType}
	for key, value := range params {
		args = append(args, fmt.Sprintf("%s=%s", key, value))
	}
	_, err := c.exec(ctx, args...)
	return err
}

// ConfigDelete deletes an rclone remote configuration
func (c *Client) ConfigDelete(ctx context.Context, remoteName string) error {
	_, err := c.exec(ctx, "config", "delete", remoteName)
	return err
}

// ConfigShow shows the configuration for a remote
func (c *Client) ConfigShow(ctx context.Context, remoteName string) (string, error) {
	output, err := c.exec(ctx, "config", "show", remoteName)
	if err != nil {
		return "", err
	}
	return string(output), nil
}

// ConfigDump dumps all rclone configuration as JSON
func (c *Client) ConfigDump(ctx context.Context) (map[string]map[string]string, error) {
	output, err := c.exec(ctx, "config", "dump")
	if err != nil {
		return nil, err
	}

	var config map[string]map[string]string
	if err := json.Unmarshal(output, &config); err != nil {
		return nil, fmt.Errorf("failed to parse config dump: %w", err)
	}
	return config, nil
}

// ListRemotes lists all configured rclone remotes
func (c *Client) ListRemotes(ctx context.Context) ([]string, error) {
	output, err := c.exec(ctx, "listremotes")
	if err != nil {
		return nil, err
	}

	remotes := strings.Split(strings.TrimSpace(string(output)), "\n")
	var result []string
	for _, r := range remotes {
		r = strings.TrimSuffix(strings.TrimSpace(r), ":")
		if r != "" {
			result = append(result, r)
		}
	}
	return result, nil
}
