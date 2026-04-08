ALTER TABLE upload_sessions
    ADD COLUMN media_item_key VARCHAR(128);

CREATE INDEX idx_upload_sessions_player_recoverable
    ON upload_sessions (game_id, player_id, status, updated_at DESC);

CREATE INDEX idx_upload_sessions_media_item_key
    ON upload_sessions (game_id, player_id, media_item_key)
    WHERE media_item_key IS NOT NULL;

CREATE UNIQUE INDEX uq_upload_sessions_game_player_media_item_recoverable
    ON upload_sessions (game_id, player_id, media_item_key)
    WHERE media_item_key IS NOT NULL
      AND status IN ('active'::upload_session_status, 'completed'::upload_session_status);
