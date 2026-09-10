-- Two active backends: shared login / player-join / broadcast-code rate limits.
--
-- One row per (scope, key). Every attempt is one atomic upsert that either
-- opens a new window or increments the current one, so alternating requests
-- between instances see one shared allowance and concurrent attempts cannot
-- lose increments. locked_until carries the broadcast-code lockout.
--
-- Additive; no dependency on billing tables. Safe to apply on the V65 schema.
CREATE TABLE rate_limit_buckets (
    scope        VARCHAR(32)  NOT NULL,
    bucket_key   VARCHAR(255) NOT NULL,
    window_start TIMESTAMPTZ  NOT NULL,
    hit_count    INTEGER      NOT NULL,
    locked_until TIMESTAMPTZ,
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    PRIMARY KEY (scope, bucket_key)
);

-- Cleanup job: delete rows untouched for longer than the retention window.
CREATE INDEX idx_rate_limit_buckets_updated_at ON rate_limit_buckets (updated_at);
