-- 000001_create_users.up.sql
-- 000001_create_users.up.sql

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    display_name VARCHAR(100),
    role VARCHAR(20) DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
-- 000002_create_providers.up.sql
-- 000002_create_providers.up.sql

CREATE TABLE providers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(50) UNIQUE NOT NULL,
    type VARCHAR(50) NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    icon_url TEXT,
    auth_type VARCHAR(20) NOT NULL CHECK (auth_type IN ('oauth', 'credentials', 'email_password')),
    config_schema JSONB NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_providers_type ON providers(type);
CREATE INDEX idx_providers_active ON providers(is_active);

-- Seed default providers
INSERT INTO providers (name, type, display_name, auth_type, config_schema) VALUES
('gdrive', 'gdrive', 'Google Drive', 'oauth', '{"fields": ["client_id", "client_secret", "token"]}'),
('onedrive', 'onedrive', 'OneDrive', 'oauth', '{"fields": ["client_id", "client_secret", "token"]}'),
('dropbox', 'dropbox', 'Dropbox', 'oauth', '{"fields": ["client_id", "client_secret", "token"]}'),
('mega', 'mega', 'Mega', 'email_password', '{"fields": ["email", "password"]}'),
('r2', 'r2', 'Cloudflare R2', 'credentials', '{"fields": ["account_id", "access_key_id", "secret_access_key", "bucket"]}'),
('s3', 's3', 'Amazon S3', 'credentials', '{"fields": ["endpoint", "region", "access_key_id", "secret_access_key", "bucket"]}'),
('b2', 'b2', 'Backblaze B2', 'credentials', '{"fields": ["account", "key", "bucket"]}'),
('webdav', 'webdav', 'WebDAV', 'credentials', '{"fields": ["url", "username", "password"]}');
-- 000003_create_storage_accounts.up.sql
-- 000003_create_storage_accounts.up.sql

CREATE TABLE storage_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider_id UUID NOT NULL REFERENCES providers(id),
    label VARCHAR(100) NOT NULL,
    credentials BYTEA NOT NULL,
    rclone_remote_name VARCHAR(100) UNIQUE NOT NULL,
    capacity_bytes BIGINT DEFAULT 0,
    used_bytes BIGINT DEFAULT 0,
    health_status VARCHAR(20) DEFAULT 'unknown' CHECK (health_status IN ('healthy', 'degraded', 'unhealthy', 'unknown')),
    last_health_check TIMESTAMPTZ,
    last_capacity_sync TIMESTAMPTZ,
    cost_per_gb_month DECIMAL(10,4) DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_storage_accounts_user ON storage_accounts(user_id);
CREATE INDEX idx_storage_accounts_provider ON storage_accounts(provider_id);
CREATE INDEX idx_storage_accounts_health ON storage_accounts(health_status);
CREATE INDEX idx_storage_accounts_active ON storage_accounts(is_active);
CREATE INDEX idx_storage_accounts_user_active ON storage_accounts(user_id, is_active);
-- 000004_create_files.up.sql
-- 000004_create_files.up.sql

CREATE TABLE files (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(500) NOT NULL,
    virtual_path TEXT NOT NULL,
    size BIGINT NOT NULL,
    checksum VARCHAR(64),
    mime_type VARCHAR(200),
    parent_id UUID REFERENCES files(id) ON DELETE CASCADE,
    is_directory BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, virtual_path)
);

CREATE INDEX idx_files_user_path ON files(user_id, virtual_path);
CREATE INDEX idx_files_parent ON files(parent_id);
CREATE INDEX idx_files_name ON files(name);
CREATE INDEX idx_files_checksum ON files(checksum);
CREATE INDEX idx_files_user_dir ON files(user_id, is_directory);
-- 000005_create_file_locations.up.sql
-- 000005_create_file_locations.up.sql

CREATE TABLE file_locations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES storage_accounts(id) ON DELETE CASCADE,
    remote_path TEXT NOT NULL,
    chunk_index INTEGER DEFAULT 0,
    chunk_size BIGINT,
    checksum VARCHAR(64),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_file_locations_file ON file_locations(file_id);
CREATE INDEX idx_file_locations_account ON file_locations(account_id);
CREATE INDEX idx_file_locations_remote ON file_locations(account_id, remote_path);
CREATE UNIQUE INDEX idx_file_locations_chunk ON file_locations(file_id, chunk_index);
-- 000006_create_transfer_logs.up.sql
-- 000006_create_transfer_logs.up.sql

CREATE TABLE transfer_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    file_id UUID REFERENCES files(id) ON DELETE SET NULL,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    account_id UUID REFERENCES storage_accounts(id) ON DELETE SET NULL,
    operation VARCHAR(20) NOT NULL CHECK (operation IN ('upload', 'download', 'delete', 'move')),
    status VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'in_progress', 'completed', 'failed', 'retrying')),
    bytes_transferred BIGINT DEFAULT 0,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_transfer_logs_user ON transfer_logs(user_id);
CREATE INDEX idx_transfer_logs_file ON transfer_logs(file_id);
CREATE INDEX idx_transfer_logs_status ON transfer_logs(status);
CREATE INDEX idx_transfer_logs_created ON transfer_logs(created_at DESC);
CREATE INDEX idx_transfer_logs_retry ON transfer_logs(status, retry_count) WHERE status = 'failed';
CREATE INDEX idx_transfer_logs_user_created ON transfer_logs(user_id, created_at DESC);
-- 000007_add_scheduler_mode.up.sql
-- 000007_add_scheduler_mode.up.sql

ALTER TABLE users ADD COLUMN IF NOT EXISTS scheduler_mode VARCHAR(20) DEFAULT 'largest_free'
    CHECK (scheduler_mode IN ('largest_free', 'round_robin', 'balanced', 'cheapest'));
-- 000008_add_filename_to_transfer_logs.up.sql
ALTER TABLE transfer_logs ADD COLUMN file_name VARCHAR(500) DEFAULT '';
