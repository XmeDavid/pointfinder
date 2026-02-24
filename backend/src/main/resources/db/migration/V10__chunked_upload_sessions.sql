CREATE TYPE upload_session_status AS ENUM ('active', 'completed', 'cancelled', 'expired');

CREATE TABLE upload_sessions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id             UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    player_id           UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    original_file_name  VARCHAR(512),
    content_type        VARCHAR(255) NOT NULL,
    total_size_bytes    BIGINT NOT NULL,
    chunk_size_bytes    INTEGER NOT NULL,
    total_chunks        INTEGER NOT NULL,
    status              upload_session_status NOT NULL DEFAULT 'active',
    file_url            TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at          TIMESTAMPTZ NOT NULL,
    completed_at        TIMESTAMPTZ
);

CREATE INDEX idx_upload_sessions_game_player ON upload_sessions (game_id, player_id);
CREATE INDEX idx_upload_sessions_status_expires ON upload_sessions (status, expires_at);

CREATE TABLE upload_session_chunks (
    session_id        UUID NOT NULL REFERENCES upload_sessions(id) ON DELETE CASCADE,
    chunk_index       INTEGER NOT NULL,
    chunk_size_bytes  INTEGER NOT NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (session_id, chunk_index)
);

CREATE INDEX idx_upload_session_chunks_session ON upload_session_chunks (session_id);
