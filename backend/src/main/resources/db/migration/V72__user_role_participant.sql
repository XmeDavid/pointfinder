-- A registered player who is not an operator. Named "participant" so its
-- Spring authority (ROLE_PARTICIPANT) cannot collide with the player token's
-- ROLE_PLAYER. ALTER TYPE ... ADD VALUE is committed immediately and the new
-- value must not be used in the same migration, so the columns live in V73.
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'participant';
