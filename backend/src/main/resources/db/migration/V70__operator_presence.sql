-- Two active backends: operator presence shared across instances.
--
-- One row per STOMP session subscribed to a game topic. The owning instance
-- refreshes last_seen_at for all of its sessions on a heartbeat; a session
-- whose instance crashed stops being refreshed and expires. Readers ignore
-- expired rows, and the cleanup job deletes them and re-broadcasts presence.
--
-- Additive; references games and users only. Safe to apply on the V65 schema.
CREATE TABLE operator_presence (
    session_id   VARCHAR(128) PRIMARY KEY,
    instance_id  VARCHAR(128) NOT NULL,
    game_id      UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_name    VARCHAR(255) NOT NULL,
    connected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Read path: operators currently present in a game.
CREATE INDEX idx_operator_presence_game_seen ON operator_presence (game_id, last_seen_at);
-- Heartbeat path: refresh every session owned by one instance.
CREATE INDEX idx_operator_presence_instance ON operator_presence (instance_id);
-- Cleanup path: expired sessions regardless of game.
CREATE INDEX idx_operator_presence_last_seen ON operator_presence (last_seen_at);
