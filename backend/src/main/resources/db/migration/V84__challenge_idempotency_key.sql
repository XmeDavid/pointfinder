-- OW-04: a client that is unsure whether a challenge create landed (offline
-- queue replay, app restart mid-request) resends the same client-generated
-- key and must get the same challenge back instead of a second, empty one.
-- The key is scoped per game; rows created without a key are unaffected.
ALTER TABLE challenges ADD COLUMN idempotency_key UUID;
CREATE UNIQUE INDEX uq_challenges_game_idempotency_key
    ON challenges (game_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;
