alter table teams add column if not exists game_id uuid;
alter table teams add column if not exists invite_code text unique;
create index if not exists idx_teams_game_id on teams (game_id);
