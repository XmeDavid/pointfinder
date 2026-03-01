ALTER TABLE games ADD COLUMN broadcast_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE games ADD COLUMN broadcast_code VARCHAR(6);
CREATE UNIQUE INDEX idx_games_broadcast_code ON games(broadcast_code) WHERE broadcast_code IS NOT NULL;
