-- Add game state and metadata
alter table games add column if not exists status text not null default 'setup';
alter table games add column if not exists created_by_operator_id uuid;
alter table games add column if not exists updated_at timestamptz not null default now();

-- Add operators system
create table if not exists operators (
    id uuid primary key default uuid_generate_v4(),
    email text unique not null,
    password_hash text not null,
    name text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists operator_invites (
    id uuid primary key default uuid_generate_v4(),
    email text not null,
    token text unique not null,
    created_by_admin boolean not null default true,
    expires_at timestamptz not null,
    used_at timestamptz,
    created_at timestamptz not null default now()
);

create table if not exists operator_games (
    operator_id uuid not null references operators(id) on delete cascade,
    game_id uuid not null references games(id) on delete cascade,
    role text not null default 'collaborator',
    added_at timestamptz not null default now(),
    primary key (operator_id, game_id)
);

-- Enhanced base tracking with NFC linking
alter table games add column if not exists bases_linked boolean not null default false;
alter table progress add column if not exists nfc_tag_uuid text;

-- Add location tracking for teams
create table if not exists team_locations (
    id uuid primary key default uuid_generate_v4(),
    team_id uuid not null references teams(id) on delete cascade,
    latitude double precision not null,
    longitude double precision not null,
    accuracy double precision,
    device_id text not null,
    created_at timestamptz not null default now()
);

-- Add enigma solutions tracking
create table if not exists enigma_solutions (
    id uuid primary key default uuid_generate_v4(),
    team_id uuid not null references teams(id) on delete cascade,
    base_id uuid not null,
    enigma_id text not null,
    answer_given text not null,
    is_correct boolean not null,
    solved_at timestamptz not null default now(),
    device_id text not null
);

-- Add game activity/audit log
create table if not exists game_activities (
    id uuid primary key default uuid_generate_v4(),
    game_id uuid not null references games(id) on delete cascade,
    operator_id uuid references operators(id) on delete set null,
    action text not null,
    details jsonb,
    created_at timestamptz not null default now()
);

-- Indexes for performance
create index if not exists idx_operators_email on operators (email);
create index if not exists idx_operator_invites_token on operator_invites (token);
create index if not exists idx_operator_invites_email on operator_invites (email);
create index if not exists idx_operator_games_operator on operator_games (operator_id);
create index if not exists idx_operator_games_game on operator_games (game_id);
create index if not exists idx_team_locations_team_created on team_locations (team_id, created_at desc);
create index if not exists idx_enigma_solutions_team_base on enigma_solutions (team_id, base_id);
create index if not exists idx_game_activities_game_created on game_activities (game_id, created_at desc);
create index if not exists idx_games_status on games (status);