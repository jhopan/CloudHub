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
