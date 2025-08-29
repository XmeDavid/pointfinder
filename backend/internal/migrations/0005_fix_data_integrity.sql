-- Fix data integrity issues and add missing constraints

-- Add foreign key constraint for teams.game_id (was missing)
alter table teams add constraint fk_teams_game_id 
    foreign key (game_id) references games(id) on delete cascade;

-- Add constraint to ensure teams must have a game assigned
alter table teams alter column game_id set not null;

-- Add constraint to ensure invite codes are not empty
alter table teams add constraint chk_teams_invite_code_not_empty 
    check (invite_code is not null and length(trim(invite_code)) > 0);

-- Add constraint for team names
alter table teams add constraint chk_teams_name_not_empty 
    check (length(trim(name)) > 0);

-- Add constraint for game names  
alter table games add constraint chk_games_name_not_empty 
    check (length(trim(name)) > 0);

-- Add constraint for game status validation
alter table games add constraint chk_games_status_valid 
    check (status in ('setup', 'live', 'finished'));

-- Add constraint for operator names and emails
alter table operators add constraint chk_operators_name_not_empty 
    check (length(trim(name)) > 0);
alter table operators add constraint chk_operators_email_not_empty 
    check (length(trim(email)) > 0);
alter table operators add constraint chk_operators_status_valid 
    check (status in ('active', 'inactive', 'suspended'));

-- Add constraint for operator game roles
alter table operator_games add constraint chk_operator_games_role_valid 
    check (role in ('owner', 'collaborator'));

-- Add constraints for location data
alter table team_locations add constraint chk_team_locations_latitude_valid 
    check (latitude >= -90 and latitude <= 90);
alter table team_locations add constraint chk_team_locations_longitude_valid 
    check (longitude >= -180 and longitude <= 180);
alter table team_locations add constraint chk_team_locations_accuracy_positive 
    check (accuracy >= 0);

-- Add constraint for events types
alter table events add constraint chk_events_type_valid 
    check (type in ('team_joined', 'base_arrived', 'base_completed', 'enigma_solved', 'locationPing', 'game_started', 'game_finished'));

-- Add constraint for progress scores
alter table progress add constraint chk_progress_score_non_negative 
    check (score >= 0);

-- Add constraint for enigma solution answers
alter table enigma_solutions add constraint chk_enigma_solutions_answer_not_empty 
    check (length(trim(answer_given)) > 0);
alter table enigma_solutions add constraint chk_enigma_solutions_enigma_id_not_empty 
    check (length(trim(enigma_id)) > 0);

-- Add composite unique constraint to prevent duplicate base arrivals
alter table progress add constraint uq_progress_team_base unique (team_id, base_id);

-- Add constraint to ensure chronological order of progress timestamps
alter table progress add constraint chk_progress_timestamps_order 
    check (
        (arrived_at is null or solved_at is null or arrived_at <= solved_at) and
        (solved_at is null or completed_at is null or solved_at <= completed_at) and
        (arrived_at is null or completed_at is null or arrived_at <= completed_at)
    );

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