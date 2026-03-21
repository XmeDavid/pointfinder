-- Allow operator-initiated check-ins without a specific player
ALTER TABLE check_ins ALTER COLUMN player_id DROP NOT NULL;
