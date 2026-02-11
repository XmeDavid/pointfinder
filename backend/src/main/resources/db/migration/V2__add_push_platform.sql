ALTER TABLE players
ADD COLUMN push_platform VARCHAR(32) NOT NULL DEFAULT 'ios';

CREATE INDEX idx_players_push_platform ON players (push_platform);
