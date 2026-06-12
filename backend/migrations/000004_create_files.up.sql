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
