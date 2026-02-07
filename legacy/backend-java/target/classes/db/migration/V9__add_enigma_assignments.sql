-- Add team enigma assignments table for dynamic enigma distribution

-- Create table to track which enigma each team gets at each base
create table if not exists team_enigma_assignments (
    team_id uuid not null references teams(id) on delete cascade,
    base_id text not null, -- UUID as text to match base IDs in games.bases JSONB
    enigma_id text not null, -- UUID as text to match enigma IDs in games.enigmas JSONB
    assigned_at timestamptz not null default now(),
    primary key (team_id, base_id)
);

-- Add indexes for performance
create index if not exists idx_team_enigma_assignments_team on team_enigma_assignments (team_id);
create index if not exists idx_team_enigma_assignments_enigma on team_enigma_assignments (enigma_id);
create index if not exists idx_team_enigma_assignments_base on team_enigma_assignments (base_id);

-- Add constraints for data integrity
ALTER TABLE team_enigma_assignments DROP CONSTRAINT IF EXISTS chk_team_enigma_assignments_base_id_not_empty;
ALTER TABLE team_enigma_assignments ADD CONSTRAINT chk_team_enigma_assignments_base_id_not_empty 
    CHECK (length(trim(base_id)) > 0);
ALTER TABLE team_enigma_assignments DROP CONSTRAINT IF EXISTS chk_team_enigma_assignments_enigma_id_not_empty;
ALTER TABLE team_enigma_assignments ADD CONSTRAINT chk_team_enigma_assignments_enigma_id_not_empty 
    CHECK (length(trim(enigma_id)) > 0);