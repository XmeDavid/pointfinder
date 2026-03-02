-- Game-level team variables (e.g., team region, mascot — reusable across all challenges)
CREATE TABLE team_variables (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id        UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    team_id        UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    variable_key   VARCHAR(100) NOT NULL,
    variable_value TEXT NOT NULL DEFAULT '',
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_team_variables_game ON team_variables (game_id);
CREATE INDEX idx_team_variables_team ON team_variables (team_id);
CREATE UNIQUE INDEX uq_team_variables_game_team_key
    ON team_variables (game_id, team_id, variable_key);

-- Challenge-level team variables (per team per challenge)
CREATE TABLE challenge_team_variables (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    challenge_id   UUID NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
    team_id        UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    variable_key   VARCHAR(100) NOT NULL,
    variable_value TEXT NOT NULL DEFAULT '',
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_challenge_team_variables_challenge ON challenge_team_variables (challenge_id);
CREATE INDEX idx_challenge_team_variables_team ON challenge_team_variables (team_id);
CREATE UNIQUE INDEX uq_challenge_team_variables_challenge_team_key
    ON challenge_team_variables (challenge_id, team_id, variable_key);
