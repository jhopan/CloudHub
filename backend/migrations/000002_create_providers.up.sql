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
