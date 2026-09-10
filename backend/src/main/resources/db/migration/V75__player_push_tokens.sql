-- PF-01: one participation can live on several phones (account recovery), so a
-- push registration belongs to a device, not to the player row. players.push_token
-- stays for one release as a read-only relic; every writer and reader moves here.
CREATE TABLE player_push_tokens (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id   UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    device_id   VARCHAR(128) NOT NULL,
    token       TEXT NOT NULL,
    platform    VARCHAR(32) NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_player_push_tokens_device UNIQUE (player_id, device_id)
);
CREATE INDEX idx_player_push_tokens_token ON player_push_tokens (token);

INSERT INTO player_push_tokens (player_id, device_id, token, platform)
SELECT id, device_id, push_token, COALESCE(push_platform, 'ios')
FROM players
WHERE push_token IS NOT NULL AND push_token <> '';
