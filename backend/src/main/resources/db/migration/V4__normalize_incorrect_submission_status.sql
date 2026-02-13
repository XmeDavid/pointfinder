-- Normalize legacy auto-validation mismatch records to the rejected terminal status.
UPDATE submissions
SET status = 'rejected'
WHERE status = 'incorrect';

