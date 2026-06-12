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
