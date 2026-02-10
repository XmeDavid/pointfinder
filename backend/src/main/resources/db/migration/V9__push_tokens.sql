ALTER TABLE players ADD COLUMN push_token VARCHAR(255);

CREATE INDEX idx_players_push_token ON players(push_token);
