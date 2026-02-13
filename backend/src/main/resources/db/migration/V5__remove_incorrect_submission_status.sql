-- Remove legacy 'incorrect' from submission_status enum after normalization.
ALTER TABLE submissions
    ALTER COLUMN status DROP DEFAULT;

UPDATE submissions
SET status = 'rejected'
WHERE status = 'incorrect';

CREATE TYPE submission_status_new AS ENUM ('pending', 'approved', 'rejected', 'correct');

ALTER TABLE submissions
    ALTER COLUMN status TYPE submission_status_new
    USING (
        CASE
            WHEN status::text = 'incorrect' THEN 'rejected'
            ELSE status::text
        END
    )::submission_status_new;

DROP TYPE submission_status;
ALTER TYPE submission_status_new RENAME TO submission_status;

ALTER TABLE submissions
    ALTER COLUMN status SET DEFAULT 'pending';

