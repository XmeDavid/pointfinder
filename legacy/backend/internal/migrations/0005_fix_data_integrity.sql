-- Fix data integrity issues and add missing constraints

-- Add foreign key constraint for teams.game_id (was missing) - with IF NOT EXISTS safety
ALTER TABLE teams DROP CONSTRAINT IF EXISTS fk_teams_game_id;
ALTER TABLE teams ADD CONSTRAINT fk_teams_game_id 
    FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE;

-- Add constraint to ensure teams must have a game assigned
alter table teams alter column game_id set not null;

-- Add constraint to ensure invite codes are not empty
ALTER TABLE teams DROP CONSTRAINT IF EXISTS chk_teams_invite_code_not_empty;
ALTER TABLE teams ADD CONSTRAINT chk_teams_invite_code_not_empty 
    CHECK (invite_code IS NOT NULL AND length(trim(invite_code)) > 0);

-- Add constraint for team names
ALTER TABLE teams DROP CONSTRAINT IF EXISTS chk_teams_name_not_empty;
ALTER TABLE teams ADD CONSTRAINT chk_teams_name_not_empty 
    CHECK (length(trim(name)) > 0);

-- Add constraint for game names  
ALTER TABLE games DROP CONSTRAINT IF EXISTS chk_games_name_not_empty;
ALTER TABLE games ADD CONSTRAINT chk_games_name_not_empty 
    CHECK (length(trim(name)) > 0);

-- Add constraint for game status validation
ALTER TABLE games DROP CONSTRAINT IF EXISTS chk_games_status_valid;
ALTER TABLE games ADD CONSTRAINT chk_games_status_valid 
    CHECK (status IN ('setup', 'live', 'finished'));

-- Add constraint for operator names and emails
ALTER TABLE operators DROP CONSTRAINT IF EXISTS chk_operators_name_not_empty;
ALTER TABLE operators ADD CONSTRAINT chk_operators_name_not_empty 
    CHECK (length(trim(name)) > 0);
ALTER TABLE operators DROP CONSTRAINT IF EXISTS chk_operators_email_not_empty;
ALTER TABLE operators ADD CONSTRAINT chk_operators_email_not_empty 
    CHECK (length(trim(email)) > 0);
ALTER TABLE operators DROP CONSTRAINT IF EXISTS chk_operators_status_valid;
ALTER TABLE operators ADD CONSTRAINT chk_operators_status_valid 
    CHECK (status IN ('active', 'inactive', 'suspended'));

-- Add constraint for operator game roles (will be updated in later migration)
-- NOTE: This constraint is handled in migration 0008 to avoid conflicts

-- Add constraints for location data
ALTER TABLE team_locations DROP CONSTRAINT IF EXISTS chk_team_locations_latitude_valid;
ALTER TABLE team_locations ADD CONSTRAINT chk_team_locations_latitude_valid 
    CHECK (latitude >= -90 AND latitude <= 90);
ALTER TABLE team_locations DROP CONSTRAINT IF EXISTS chk_team_locations_longitude_valid;
ALTER TABLE team_locations ADD CONSTRAINT chk_team_locations_longitude_valid 
    CHECK (longitude >= -180 AND longitude <= 180);
ALTER TABLE team_locations DROP CONSTRAINT IF EXISTS chk_team_locations_accuracy_positive;
ALTER TABLE team_locations ADD CONSTRAINT chk_team_locations_accuracy_positive 
    CHECK (accuracy >= 0);

-- Add constraint for events types
ALTER TABLE events DROP CONSTRAINT IF EXISTS chk_events_type_valid;
ALTER TABLE events ADD CONSTRAINT chk_events_type_valid 
    CHECK (type IN ('team_joined', 'base_arrived', 'base_completed', 'enigma_solved', 'locationPing', 'game_started', 'game_finished'));

-- Add constraint for progress scores
ALTER TABLE progress DROP CONSTRAINT IF EXISTS chk_progress_score_non_negative;
ALTER TABLE progress ADD CONSTRAINT chk_progress_score_non_negative 
    CHECK (score >= 0);

-- Add constraint for enigma solution answers
ALTER TABLE enigma_solutions DROP CONSTRAINT IF EXISTS chk_enigma_solutions_answer_not_empty;
ALTER TABLE enigma_solutions ADD CONSTRAINT chk_enigma_solutions_answer_not_empty 
    CHECK (length(trim(answer_given)) > 0);
ALTER TABLE enigma_solutions DROP CONSTRAINT IF EXISTS chk_enigma_solutions_enigma_id_not_empty;
ALTER TABLE enigma_solutions ADD CONSTRAINT chk_enigma_solutions_enigma_id_not_empty 
    CHECK (length(trim(enigma_id)) > 0);

-- Add composite unique constraint to prevent duplicate base arrivals
-- NOTE: This constraint is handled in migration 0008 with proper base_id type

-- Add constraint to ensure chronological order of progress timestamps
-- NOTE: This constraint is handled in migration 0008 to avoid conflicts

-- Add index for better query performance on frequently accessed fields
create index if not exists idx_teams_invite_code on teams (invite_code);
create index if not exists idx_teams_leader_device on teams (leader_device_id) where leader_device_id is not null;
create index if not exists idx_progress_arrived_at on progress (arrived_at) where arrived_at is not null;
create index if not exists idx_progress_completed_at on progress (completed_at) where completed_at is not null;
create index if not exists idx_enigma_solutions_correct on enigma_solutions (is_correct);
create index if not exists idx_events_type_created on events (type, created_at desc);

-- Add partial unique index to ensure only one leader per team
create unique index if not exists idx_teams_unique_leader 
    on teams (game_id, leader_device_id) 
    where leader_device_id is not null;