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
