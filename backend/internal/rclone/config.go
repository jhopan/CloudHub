package rclone

import (
	"fmt"
	"os"
	"text/template"
)

// GenerateConfig creates an rclone config file from storage accounts
func GenerateConfig(configs []RemoteConfig, outputPath string) error {
	f, err := os.Create(outputPath)
	if err != nil {
		return err
	}
	defer f.Close()

	for _, config := range configs {
		configBlock, err := generateRemoteConfig(config)
		if err != nil {
			return fmt.Errorf("failed to generate config: %w", err)
		}

		if _, err := f.WriteString(configBlock + "\n"); err != nil {
			return err
		}
	}

	return nil
}

func generateRemoteConfig(config RemoteConfig) (string, error) {
	tmpl := `[{{.Name}}]
type = {{.Type}}
{{range $key, $value := .Config}}{{$key}} = {{$value}}
{{end}}`

	t, err := template.New("remote").Parse(tmpl)
	if err != nil {
		return "", err
	}

	// Create a temporary file to write the template output
	tmpFile, err := os.CreateTemp("", "rclone-config-*")
	if err != nil {
		return "", err
	}
	defer os.Remove(tmpFile.Name())
	defer tmpFile.Close()

	if err := t.Execute(tmpFile, config); err != nil {
		return "", err
	}

	// Read the file content
	content, err := os.ReadFile(tmpFile.Name())
	if err != nil {
		return "", err
	}

	return string(content), nil
}
