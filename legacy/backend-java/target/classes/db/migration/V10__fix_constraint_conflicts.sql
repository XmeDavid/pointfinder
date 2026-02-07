-- Fix constraint conflicts that are preventing deployment
-- Simple approach compatible with basic migration executor

-- Drop problematic constraints that are causing conflicts
ALTER TABLE teams DROP CONSTRAINT IF EXISTS fk_teams_game_id;
ALTER TABLE operator_games DROP CONSTRAINT IF EXISTS chk_operator_games_role_valid;
ALTER TABLE operator_games DROP CONSTRAINT IF EXISTS operator_games_role_check;
ALTER TABLE progress DROP CONSTRAINT IF EXISTS uq_progress_team_base;

-- Recreate constraints with proper definitions
ALTER TABLE teams ADD CONSTRAINT fk_teams_game_id 
    FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE;

ALTER TABLE operator_games ADD CONSTRAINT chk_operator_games_role_valid 
    CHECK (role = 'operator');

ALTER TABLE progress ADD CONSTRAINT uq_progress_team_base UNIQUE (team_id, base_id);

-- Ensure all tables have proper NOT NULL constraints (idempotent)
ALTER TABLE teams ALTER COLUMN game_id SET NOT NULL;
ALTER TABLE progress ALTER COLUMN team_id SET NOT NULL;
ALTER TABLE team_locations ALTER COLUMN team_id SET NOT NULL;
ALTER TABLE enigma_solutions ALTER COLUMN team_id SET NOT NULL;
ALTER TABLE game_activities ALTER COLUMN game_id SET NOT NULL;

-- Add missing indexes
CREATE INDEX IF NOT EXISTS idx_progress_team_base ON progress (team_id, base_id);
CREATE INDEX IF NOT EXISTS idx_progress_timestamps ON progress (arrived_at, solved_at, completed_at);
CREATE INDEX IF NOT EXISTS idx_events_team_type_created ON events (team_id, type, created_at DESC);