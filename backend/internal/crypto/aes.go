package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
)

// Encryptor provides AES-256-GCM encryption for credential storage
type Encryptor struct {
	key []byte
	gcm cipher.AEAD
}

// NewEncryptor creates a new AES-256-GCM encryptor
// key must be exactly 32 bytes (256 bits)
func NewEncryptor(key string) (*Encryptor, error) {
	keyBytes := []byte(key)
	if len(keyBytes) != 32 {
		return nil, fmt.Errorf("encryption key must be exactly 32 bytes, got %d", len(keyBytes))
	}

	block, err := aes.NewCipher(keyBytes)
	if err != nil {
		return nil, fmt.Errorf("failed to create cipher: %w", err)
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("failed to create GCM: %w", err)
	}

	return &Encryptor{
		key: keyBytes,
		gcm: gcm,
	}, nil
}

// Encrypt encrypts plaintext using AES-256-GCM and returns base64-encoded ciphertext
func (e *Encryptor) Encrypt(plaintext string) (string, error) {
	if plaintext == "" {
		return "", nil
	}

	nonce := make([]byte, e.gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", fmt.Errorf("failed to generate nonce: %w", err)
	}

	// nonce is prepended to ciphertext
	ciphertext := e.gcm.Seal(nonce, nonce, []byte(plaintext), nil)

	return base64.StdEncoding.EncodeToString(ciphertext), nil
}

// Decrypt decrypts base64-encoded ciphertext using AES-256-GCM
func (e *Encryptor) Decrypt(encoded string) (string, error) {
	if encoded == "" {
		return "", nil
	}

	ciphertext, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return "", fmt.Errorf("failed to decode base64: %w", err)
	}

	nonceSize := e.gcm.NonceSize()
	if len(ciphertext) < nonceSize {
		return "", errors.New("ciphertext too short")
	}

	nonce, ciphertext := ciphertext[:nonceSize], ciphertext[nonceSize:]
	plaintext, err := e.gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return "", fmt.Errorf("failed to decrypt: %w", err)
	}

	return string(plaintext), nil
}

// EncryptMap encrypts all values in a map (for credential fields)
func (e *Encryptor) EncryptMap(data map[string]string) (map[string]string, error) {
	encrypted := make(map[string]string)
	for k, v := range data {
		enc, err := e.Encrypt(v)
		if err != nil {
			return nil, fmt.Errorf("failed to encrypt field %s: %w", k, err)
		}
		encrypted[k] = enc
	}
	return encrypted, nil
}

// DecryptMap decrypts all values in a map (for credential fields)
func (e *Encryptor) DecryptMap(data map[string]string) (map[string]string, error) {
	decrypted := make(map[string]string)
	for k, v := range data {
		dec, err := e.Decrypt(v)
		if err != nil {
			return nil, fmt.Errorf("failed to decrypt field %s: %w", k, err)
		}
		decrypted[k] = dec
	}
	return decrypted, nil
}
