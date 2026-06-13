-- 000007_add_scheduler_mode.down.sql

ALTER TABLE users DROP COLUMN IF EXISTS scheduler_mode;
