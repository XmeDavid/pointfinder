-- ============================================================
-- Player Authentication & Check-ins
-- ============================================================

-- Add token column to players for player auth
ALTER TABLE players ADD COLUMN token VARCHAR(512) UNIQUE;

CREATE INDEX idx_players_token ON players (token);
CREATE INDEX idx_players_device_id ON players (device_id);

-- ============================================================
-- Check-ins (tracks when a team checks into a base)
-- ============================================================
CREATE TABLE check_ins (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id         UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    team_id         UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    base_id         UUID NOT NULL REFERENCES bases(id) ON DELETE CASCADE,
    player_id       UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    checked_in_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_check_ins_game ON check_ins (game_id);
CREATE INDEX idx_check_ins_team ON check_ins (team_id);
CREATE INDEX idx_check_ins_base ON check_ins (base_id);
CREATE UNIQUE INDEX idx_check_ins_team_base ON check_ins (team_id, base_id);
