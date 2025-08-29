-- Phase 1: Fix critical database issues
-- This migration addresses schema inconsistencies and missing constraints

-- Fix teams.game_id foreign key constraint (was missing)
-- Add constraint if it doesn't exist (PostgreSQL will ignore if exists)
alter table teams drop constraint if exists fk_teams_game_id;
alter table teams add constraint fk_teams_game_id 
    foreign key (game_id) references games(id) on delete cascade;

-- Ensure teams.game_id is not null (required for proper operation)
alter table teams alter column game_id set not null;

-- Fix operator_games constraint that was referenced in migration 0005 but had wrong values
-- Drop old constraint if it exists and recreate with correct values
alter table operator_games drop constraint if exists chk_operator_games_role_valid;
alter table operator_games drop constraint if exists operator_games_role_check;

-- Add the corrected constraint allowing only 'operator' role (as per migration 0007)
alter table operator_games add constraint chk_operator_games_role_valid 
    check (role in ('operator'));

-- Fix progress table base_id to use text instead of uuid to match bases JSONB structure
-- The base_id should reference the base.id field in the games.bases JSONB array
alter table progress alter column base_id type text;

-- Drop the old composite unique constraint and recreate it 
alter table progress drop constraint if exists uq_progress_team_base;
alter table progress add constraint uq_progress_team_base unique (team_id, base_id);

-- Add missing constraint for progress table chronological timestamps
-- This ensures arrived_at <= solved_at <= completed_at
alter table progress drop constraint if exists chk_progress_timestamps_order;
alter table progress add constraint chk_progress_timestamps_order 
    check (
        (arrived_at is null or solved_at is null or arrived_at <= solved_at) and
        (solved_at is null or completed_at is null or solved_at <= completed_at) and
        (arrived_at is null or completed_at is null or arrived_at <= completed_at)
    );

-- Ensure NFC tags table has proper base_id format consistency
-- base_id should be text UUID format to match games.bases[].id
alter table nfc_tags alter column base_id type text;

-- Add indexes that were missing for performance
create index if not exists idx_progress_team_base on progress (team_id, base_id);
create index if not exists idx_progress_timestamps on progress (arrived_at, solved_at, completed_at);

-- Add constraints that were failing due to missing tables (now that tables exist)
-- These were referenced in migration 0005 but couldn't be created

-- Validate operator status values
alter table operators drop constraint if exists chk_operators_status_valid;
alter table operators add constraint chk_operators_status_valid 
    check (status in ('active', 'inactive', 'suspended', 'pending'));

-- Ensure operator invitation tokens are not empty
ALTER TABLE operator_invites DROP CONSTRAINT IF EXISTS chk_operator_invites_token_not_empty;
ALTER TABLE operator_invites ADD CONSTRAINT chk_operator_invites_token_not_empty 
    CHECK (length(trim(token)) > 0);

-- Add constraint to prevent expired invitations from being used
ALTER TABLE operator_invites DROP CONSTRAINT IF EXISTS chk_operator_invites_not_used_when_expired;
ALTER TABLE operator_invites ADD CONSTRAINT chk_operator_invites_not_used_when_expired
    CHECK (used_at IS NULL OR used_at <= expires_at);

-- Fix events table to include all valid event types from the spec
alter table events drop constraint if exists chk_events_type_valid;
alter table events add constraint chk_events_type_valid 
    check (type in ('team_joined', 'base_arrived', 'base_completed', 'enigma_solved', 'locationPing', 'game_started', 'game_finished', 'team_location'));

-- Add missing index for better event querying performance
create index if not exists idx_events_team_type_created on events (team_id, type, created_at desc);

-- Ensure game activities have valid action types
ALTER TABLE game_activities DROP CONSTRAINT IF EXISTS chk_game_activities_action_not_empty;
ALTER TABLE game_activities ADD CONSTRAINT chk_game_activities_action_not_empty
    CHECK (length(trim(action)) > 0);

-- Add index for game activities querying
create index if not exists idx_game_activities_action on game_activities (action);

-- Add constraint to ensure base_id in progress references valid bases
-- This is a complex constraint that validates base_id exists in the games.bases JSONB array
-- We'll add this as a comment for now since it requires a custom function
-- TODO: Add function to validate base_id exists in games.bases JSONB array

-- Add indexes for location tracking queries
create index if not exists idx_team_locations_device_created on team_locations (device_id, created_at desc);
create index if not exists idx_team_locations_coordinates on team_locations (latitude, longitude);

-- Add constraint to ensure enigma solutions reference valid data
ALTER TABLE enigma_solutions DROP CONSTRAINT IF EXISTS chk_enigma_solutions_base_id_not_empty;
ALTER TABLE enigma_solutions ADD CONSTRAINT chk_enigma_solutions_base_id_not_empty 
    CHECK (length(trim(base_id::text)) > 0);

-- Performance index for enigma solution queries
create index if not exists idx_enigma_solutions_correct_solved on enigma_solutions (is_correct, solved_at desc);
create index if not exists idx_enigma_solutions_enigma_id on enigma_solutions (enigma_id);

-- Ensure all UUID fields are properly formatted
alter table progress alter column team_id set not null;
alter table team_locations alter column team_id set not null;
alter table enigma_solutions alter column team_id set not null;
alter table game_activities alter column game_id set not null;