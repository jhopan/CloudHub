package crypto

import (
	"bytes"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"io"

	"golang.org/x/crypto/argon2"
)

// FileEncryptor handles AES-256-GCM encryption/decryption for file contents.
// Keys are derived from user passphrases using Argon2id.
type FileEncryptor struct {
	key []byte // 32-byte key derived from passphrase
	gcm cipher.AEAD
}

// Argon2id parameters (recommended by OWASP)
const (
	argon2Time    = 1
	argon2Memory  = 64 * 1024 // 64 MB
	argon2Threads = 4
	argon2KeyLen  = 32
	saltLen       = 16
	nonceLen      = 12 // AES-GCM standard nonce size
)

// GenerateSalt generates a random 16-byte salt for key derivation
func GenerateSalt() ([]byte, error) {
	salt := make([]byte, saltLen)
	if _, err := io.ReadFull(rand.Reader, salt); err != nil {
		return nil, fmt.Errorf("failed to generate salt: %w", err)
	}
	return salt, nil
}

// NewFileEncryptor creates a FileEncryptor from a passphrase and salt.
// Uses Argon2id to derive a 32-byte key.
func NewFileEncryptor(passphrase string, salt []byte) (*FileEncryptor, error) {
	key := argon2.IDKey([]byte(passphrase), salt, argon2Time, argon2Memory, argon2Threads, argon2KeyLen)

	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, fmt.Errorf("failed to create AES cipher: %w", err)
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("failed to create GCM: %w", err)
	}

	return &FileEncryptor{
		key: key,
		gcm: gcm,
	}, nil
}

// Encrypt encrypts plaintext using AES-256-GCM.
// Output format: nonce (12 bytes) + ciphertext + tag (16 bytes)
func (e *FileEncryptor) Encrypt(plaintext []byte) ([]byte, error) {
	nonce := make([]byte, e.gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, fmt.Errorf("failed to generate nonce: %w", err)
	}

	// Seal appends the ciphertext+tag to the nonce
	ciphertext := e.gcm.Seal(nonce, nonce, plaintext, nil)
	return ciphertext, nil
}

// Decrypt decrypts AES-256-GCM ciphertext.
// Input format: nonce (12 bytes) + ciphertext + tag (16 bytes)
func (e *FileEncryptor) Decrypt(ciphertext []byte) ([]byte, error) {
	nonceSize := e.gcm.NonceSize()
	if len(ciphertext) < nonceSize {
		return nil, fmt.Errorf("ciphertext too short: expected at least %d bytes, got %d", nonceSize, len(ciphertext))
	}

	nonce, encrypted := ciphertext[:nonceSize], ciphertext[nonceSize:]
	plaintext, err := e.gcm.Open(nil, nonce, encrypted, nil)
	if err != nil {
		return nil, fmt.Errorf("decryption failed (wrong passphrase or corrupted data): %w", err)
	}

	return plaintext, nil
}

// EncryptStream encrypts an io.Reader and returns an io.Reader of ciphertext.
// Reads all data into memory, encrypts, and returns a reader over the result.
// For very large files, consider chunk-based encryption in the future.
func (e *FileEncryptor) EncryptStream(reader io.Reader) (io.Reader, error) {
	plaintext, err := io.ReadAll(reader)
	if err != nil {
		return nil, fmt.Errorf("failed to read plaintext: %w", err)
	}

	ciphertext, err := e.Encrypt(plaintext)
	if err != nil {
		return nil, err
	}

	return bytes.NewReader(ciphertext), nil
}

// DecryptStream decrypts an io.Reader and returns an io.Reader of plaintext.
// Reads all data into memory, decrypts, and returns a reader over the result.
func (e *FileEncryptor) DecryptStream(reader io.Reader) (io.Reader, error) {
	ciphertext, err := io.ReadAll(reader)
	if err != nil {
		return nil, fmt.Errorf("failed to read ciphertext: %w", err)
	}

	plaintext, err := e.Decrypt(ciphertext)
	if err != nil {
		return nil, err
	}

	return bytes.NewReader(plaintext), nil
}

// HashPassphrase creates an Argon2id hash of the passphrase for verification.
// The hash includes its own random salt embedded in the output.
func HashPassphrase(passphrase string) (string, error) {
	// Generate a random salt for the verification hash (separate from file encryption salt)
	hashSalt := make([]byte, saltLen)
	if _, err := io.ReadFull(rand.Reader, hashSalt); err != nil {
		return "", fmt.Errorf("failed to generate hash salt: %w", err)
	}

	// Derive key using Argon2id
	key := argon2.IDKey([]byte(passphrase), hashSalt, argon2Time, argon2Memory, argon2Threads, argon2KeyLen)

	// Encode salt + key together as base64 for storage
	combined := append(hashSalt, key...)
	return base64.StdEncoding.EncodeToString(combined), nil
}

// VerifyPassphrase verifies a passphrase against a stored hash
func VerifyPassphrase(passphrase, encodedHash string) (bool, error) {
	combined, err := base64.StdEncoding.DecodeString(encodedHash)
	if err != nil {
		return false, fmt.Errorf("failed to decode hash: %w", err)
	}

	if len(combined) < saltLen+argon2KeyLen {
		return false, fmt.Errorf("invalid hash format")
	}

	hashSalt := combined[:saltLen]
	storedKey := combined[saltLen:]

	// Derive key from passphrase using the same salt
	derivedKey := argon2.IDKey([]byte(passphrase), hashSalt, argon2Time, argon2Memory, argon2Threads, argon2KeyLen)

	// Constant-time comparison
	if len(derivedKey) != len(storedKey) {
		return false, nil
	}
	var diff byte
	for i := range derivedKey {
		diff |= derivedKey[i] ^ storedKey[i]
	}
	return diff == 0, nil
}
