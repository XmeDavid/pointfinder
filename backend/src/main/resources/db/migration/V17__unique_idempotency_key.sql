ALTER TABLE submissions ADD CONSTRAINT uk_submissions_idempotency_key UNIQUE (idempotency_key);
