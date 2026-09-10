-- Two active backends: durable, idempotent coordination for scheduled jobs.
--
-- One row per logical job. An instance claims a job by writing its id and a
-- lease deadline in a single atomic statement that only succeeds when the
-- previous lease has expired or was released. A crash mid-job leaves the
-- lease to expire, after which any instance may claim it again, so a claim
-- never turns a crash into lost work. Advisory locks alone were rejected
-- because they vanish with the connection and leave no record of the last
-- run for operators.
--
-- Additive; no dependency on billing tables. Safe to apply on the V65 schema.
CREATE TABLE scheduled_job_leases (
    job_name          VARCHAR(128) PRIMARY KEY,
    owner_instance    VARCHAR(128),
    leased_until      TIMESTAMPTZ,
    last_started_at   TIMESTAMPTZ,
    last_completed_at TIMESTAMPTZ,
    last_outcome      VARCHAR(16),
    last_error        TEXT,
    run_count         BIGINT NOT NULL DEFAULT 0,
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
