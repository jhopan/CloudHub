-- 000007_add_scheduler_mode.up.sql

ALTER TABLE users ADD COLUMN IF NOT EXISTS scheduler_mode VARCHAR(20) DEFAULT 'largest_free'
    CHECK (scheduler_mode IN ('largest_free', 'round_robin', 'balanced', 'cheapest'));
