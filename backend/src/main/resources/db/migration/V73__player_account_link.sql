-- PF-01/PF-02: link a guest participation to an account without touching the
-- player row's identity. See docs/product/roadmap.md.

-- Existing accounts were invited or verified through a mailed link; participant
-- self-signups start unverified until they open their verification email.
ALTER TABLE users ADD COLUMN email_verified BOOLEAN NOT NULL DEFAULT TRUE;

-- The game is reachable through the team, but the one-participation-per-account
-- invariant needs it on the row so the database can enforce it. The column stays
-- nullable for one release: a node still running the previous build inserts
-- players without it during a rolling deploy. Join sets it; a later migration
-- makes it NOT NULL once every node writes it.
ALTER TABLE players ADD COLUMN game_id UUID REFERENCES games(id) ON DELETE CASCADE;
UPDATE players p SET game_id = t.game_id FROM teams t WHERE p.team_id = t.id;
CREATE INDEX idx_players_game_id ON players (game_id);

ALTER TABLE players ADD COLUMN user_id UUID REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX idx_players_user_id ON players (user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX uq_players_user_game ON players (user_id, game_id) WHERE user_id IS NOT NULL;
