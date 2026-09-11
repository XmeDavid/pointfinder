-- Every change to a game's public listing (summary saved, listed, delisted,
-- direct-joining team changed, featured, unfeatured) is kept as an audit row
-- with the acting account, next to the [PUBLICATION] log line. activity_events
-- is team-scoped, which a listing change is not, so this is its own table.
CREATE TABLE game_publication_events (
    id                  UUID PRIMARY KEY,
    game_id             UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    operation           VARCHAR(32) NOT NULL,
    actor_user_id       UUID REFERENCES users(id) ON DELETE SET NULL,
    actor_name_snapshot VARCHAR(255) NOT NULL,
    team_id             UUID REFERENCES teams(id) ON DELETE SET NULL,
    previous_team_id    UUID REFERENCES teams(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_game_publication_events_operation
        CHECK (operation IN ('save', 'admission', 'publish', 'unpublish', 'feature', 'unfeature'))
);
CREATE INDEX idx_game_publication_events_game ON game_publication_events (game_id, created_at);
