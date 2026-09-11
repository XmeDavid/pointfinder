-- PointFinder external uptime monitor: D1 schema.
-- Every table is bounded: one row per fixed check/host, singleton rows for
-- lease/incident/meta, and an events log pruned to EVENTS_KEEP rows by the
-- Worker. Apply with:
--   npx wrangler d1 execute pointfinder-monitor --remote --file=schema.sql
-- Re-running is safe (IF NOT EXISTS / INSERT OR IGNORE).

CREATE TABLE IF NOT EXISTS meta (
  id           INTEGER PRIMARY KEY CHECK (id = 1),
  first_run_ms INTEGER NOT NULL,
  last_run_ms  INTEGER NOT NULL DEFAULT 0,
  run_count    INTEGER NOT NULL DEFAULT 0
);

-- Single-row lease claimed atomically by each cron run so two overlapping
-- scheduled invocations cannot both evaluate and commit.
CREATE TABLE IF NOT EXISTS lease (
  id         INTEGER PRIMARY KEY CHECK (id = 1),
  owner      TEXT    NOT NULL DEFAULT '',
  expires_ms INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO lease (id, owner, expires_ms) VALUES (1, '', 0);

-- Last accepted heartbeat per fixed host (hetzner, arthur, rainer).
CREATE TABLE IF NOT EXISTS heartbeats (
  host         TEXT    PRIMARY KEY,
  last_seen_ms INTEGER NOT NULL,
  count        INTEGER NOT NULL DEFAULT 0
);

-- One row per check (probe:* and host:*), with hysteresis counters.
CREATE TABLE IF NOT EXISTS checks (
  id         TEXT    PRIMARY KEY,
  state      TEXT    NOT NULL CHECK (state IN ('ok', 'down')),
  fails      INTEGER NOT NULL DEFAULT 0,
  passes     INTEGER NOT NULL DEFAULT 0,
  reason     TEXT    NOT NULL DEFAULT '',
  since_ms   INTEGER NOT NULL DEFAULT 0,
  updated_ms INTEGER NOT NULL DEFAULT 0
);

-- Singleton incident/email state: what was last *delivered*, when, and the
-- one pending message (JSON) preserved until Resend acknowledges it.
CREATE TABLE IF NOT EXISTS incident (
  id                    INTEGER PRIMARY KEY CHECK (id = 1),
  delivered_fingerprint TEXT    NOT NULL DEFAULT '',
  last_email_ms         INTEGER NOT NULL DEFAULT 0,
  pending_json          TEXT    NOT NULL DEFAULT '',
  emails_sent           INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO incident (id) VALUES (1);

-- Bounded audit trail of transitions and deliveries (secret-free).
CREATE TABLE IF NOT EXISTS events (
  seq    INTEGER PRIMARY KEY AUTOINCREMENT,
  at_ms  INTEGER NOT NULL,
  kind   TEXT    NOT NULL,
  detail TEXT    NOT NULL
);
