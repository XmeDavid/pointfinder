-- Junction table for many-to-many: one challenge can unlock multiple hidden bases
CREATE TABLE challenge_unlocks_bases (
    challenge_id UUID NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
    base_id UUID NOT NULL REFERENCES bases(id) ON DELETE CASCADE,
    PRIMARY KEY (challenge_id, base_id)
);

-- Migrate existing data from the single-column relationship
INSERT INTO challenge_unlocks_bases (challenge_id, base_id)
SELECT id, unlocks_base_id FROM challenges WHERE unlocks_base_id IS NOT NULL;

-- Drop the unique constraint and old column
ALTER TABLE challenges DROP CONSTRAINT IF EXISTS uq_challenges_unlocks_base;
ALTER TABLE challenges DROP COLUMN unlocks_base_id;
