-- Move requirePresenceToSubmit from bases to challenges

-- Add requirePresenceToSubmit to challenges table (default false)
ALTER TABLE challenges ADD COLUMN require_presence_to_submit BOOLEAN NOT NULL DEFAULT false;

-- Migrate: for each assignment, copy the base's requirePresenceToSubmit to the challenge
UPDATE challenges c
SET require_presence_to_submit = true
WHERE c.id IN (
    SELECT DISTINCT a.challenge_id
    FROM assignments a
    JOIN bases b ON a.base_id = b.id
    WHERE b.require_presence_to_submit = true
);

-- Also handle fixed challenges on bases (not via assignments)
UPDATE challenges c
SET require_presence_to_submit = true
WHERE c.id IN (
    SELECT b.fixed_challenge_id
    FROM bases b
    WHERE b.require_presence_to_submit = true
    AND b.fixed_challenge_id IS NOT NULL
);

-- Drop from bases
ALTER TABLE bases DROP COLUMN require_presence_to_submit;
