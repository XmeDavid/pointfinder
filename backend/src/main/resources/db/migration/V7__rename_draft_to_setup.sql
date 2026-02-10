-- ============================================================
-- Rename game status 'draft' to 'setup'
-- ============================================================

-- Rename enum value (PostgreSQL 10+)
ALTER TYPE game_status RENAME VALUE 'draft' TO 'setup';

-- Update default value for the games table
ALTER TABLE games ALTER COLUMN status SET DEFAULT 'setup';
