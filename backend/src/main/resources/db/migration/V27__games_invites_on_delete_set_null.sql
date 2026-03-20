-- ============================================================
-- games.created_by and operator_invites.invited_by:
-- make nullable + ON DELETE SET NULL
-- ============================================================

-- games.created_by
ALTER TABLE games
    ALTER COLUMN created_by DROP NOT NULL;

ALTER TABLE games
    DROP CONSTRAINT games_created_by_fkey;

ALTER TABLE games
    ADD CONSTRAINT games_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

-- operator_invites.invited_by
ALTER TABLE operator_invites
    DROP CONSTRAINT operator_invites_invited_by_fkey;

ALTER TABLE operator_invites
    ADD CONSTRAINT operator_invites_invited_by_fkey
    FOREIGN KEY (invited_by) REFERENCES users(id) ON DELETE SET NULL;
