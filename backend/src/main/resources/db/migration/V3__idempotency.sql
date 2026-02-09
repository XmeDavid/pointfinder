-- ============================================================
-- Idempotency support for offline sync
-- ============================================================

-- Add idempotency key to submissions for deduplication
ALTER TABLE submissions ADD COLUMN idempotency_key UUID UNIQUE;

CREATE INDEX idx_submissions_idempotency ON submissions (idempotency_key);
