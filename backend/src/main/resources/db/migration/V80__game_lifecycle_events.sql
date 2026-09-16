-- OW-14: every game lifecycle transition (setup → live → ended and the
-- reverts) is kept as an audit row: who did it, or which scheduler path, and
-- whether progress was erased. activity_events is team-scoped, which a
-- lifecycle change is not, so this is its own table.
CREATE TABLE game_lifecycle_events (
    id                  UUID PRIMARY KEY,
    game_id             UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    from_status         VARCHAR(16) NOT NULL,
    to_status           VARCHAR(16) NOT NULL,
    reason              VARCHAR(32) NOT NULL,
    actor_user_id       UUID REFERENCES users(id) ON DELETE SET NULL,
    actor_name_snapshot VARCHAR(255),
    reset_progress      BOOLEAN NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_game_lifecycle_events_reason
        CHECK (reason IN ('operator', 'scheduled_end', 'practice_expired'))
);
CREATE INDEX idx_game_lifecycle_events_game ON game_lifecycle_events (game_id, created_at);
