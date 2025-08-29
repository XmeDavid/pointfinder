-- Create NFC tags table for linking physical NFC tags to game bases

create table if not exists nfc_tags (
    id uuid primary key default uuid_generate_v4(),
    game_id uuid not null references games(id) on delete cascade,
    base_id text not null, -- UUID stored as text to match bases JSON
    tag_uuid text unique not null,
    linked_by_operator_id uuid references operators(id) on delete set null,
    linked_at timestamptz not null default now(),
    created_at timestamptz not null default now()
);

-- Add constraints
alter table nfc_tags add constraint chk_nfc_tags_tag_uuid_not_empty 
    check (length(trim(tag_uuid)) > 0);
alter table nfc_tags add constraint chk_nfc_tags_base_id_not_empty 
    check (length(trim(base_id)) > 0);

-- Add indexes for performance
create index if not exists idx_nfc_tags_game_id on nfc_tags (game_id);
create index if not exists idx_nfc_tags_base_id on nfc_tags (base_id);
create index if not exists idx_nfc_tags_tag_uuid on nfc_tags (tag_uuid);
create index if not exists idx_nfc_tags_game_base on nfc_tags (game_id, base_id);

-- Add unique constraint to prevent duplicate base linkages per game
create unique index if not exists idx_nfc_tags_unique_game_base 
    on nfc_tags (game_id, base_id);