-- Migration: Add file encryption support
-- Run: psql -h localhost -U postgres -d storage_gateway -f migrations/003_file_encryption.sql

-- Users: encryption settings
ALTER TABLE users ADD COLUMN IF NOT EXISTS encryption_enabled BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS encryption_salt BYTEA;
ALTER TABLE users ADD COLUMN IF NOT EXISTS encryption_passphrase_hash TEXT;

-- Files: track if a file is stored encrypted
ALTER TABLE files ADD COLUMN IF NOT EXISTS is_encrypted BOOLEAN DEFAULT false;

-- File locations: track if a specific location is encrypted
ALTER TABLE file_locations ADD COLUMN IF NOT EXISTS is_encrypted BOOLEAN DEFAULT false;
