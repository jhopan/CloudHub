package service

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"hash"
	"io"
)

// ChecksumReader wraps an io.ReadCloser and verifies checksum on close
type ChecksumReader struct {
	reader   io.ReadCloser
	hash     hash.Hash
	expected string
	fileName string
}

// NewChecksumReader creates a new checksum-verifying reader
func NewChecksumReader(reader io.ReadCloser, expectedChecksum, fileName string) *ChecksumReader {
	return &ChecksumReader{
		reader:   reader,
		hash:     sha256.New(),
		expected: expectedChecksum,
		fileName: fileName,
	}
}

func (r *ChecksumReader) Read(p []byte) (n int, err error) {
	n, err = r.reader.Read(p)
	if n > 0 {
		r.hash.Write(p[:n])
	}
	return
}

func (r *ChecksumReader) Close() error {
	// Close the underlying reader first
	closeErr := r.reader.Close()

	// Verify checksum
	actual := hex.EncodeToString(r.hash.Sum(nil))
	if actual != r.expected {
		return fmt.Errorf("checksum mismatch for %s: expected %s, got %s", r.fileName, r.expected, actual)
	}

	return closeErr
}
