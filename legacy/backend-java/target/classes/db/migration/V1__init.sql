create extension if not exists "uuid-ossp";

create table if not exists games (
    id uuid primary key default uuid_generate_v4(),
    name text not null,
    rules_html text,
    bases jsonb not null default '[]'::jsonb,
    enigmas jsonb not null default '[]'::jsonb,
    created_at timestamptz not null default now()
);

create table if not exists teams (
    id uuid primary key default uuid_generate_v4(),
    name text not null,
    members jsonb not null default '[]'::jsonb,
    leader_device_id text,
    active_base_id uuid,
    created_at timestamptz not null default now()
);

create table if not exists progress (
    team_id uuid not null references teams(id) on delete cascade,
    base_id uuid not null,
    arrived_at timestamptz,
    solved_at timestamptz,
    completed_at timestamptz,
    score int not null default 0,
    primary key (team_id, base_id)
);

create table if not exists events (
    id uuid primary key default uuid_generate_v4(),
    type text not null,
    team_id uuid,
    message text not null,
    created_at timestamptz not null default now()
);

create index if not exists idx_events_created_at on events (created_at desc);


