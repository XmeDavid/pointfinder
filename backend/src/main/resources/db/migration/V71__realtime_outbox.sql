-- Two active backends: durable realtime event outbox.
--
-- GameEventBroadcaster inserts one row per fan-out in the same transaction as
-- the state change it announces, so a rolled-back transaction leaves no event
-- and a committed one always leaves exactly one. The inserting instance
-- dispatches to its own sockets after commit; every other instance consumes
-- the row and dispatches to its sockets.
--
-- tx_id is the inserting transaction id (pg_current_xact_id). Consumers cursor
-- on tx_id against pg_current_snapshot(): every transaction below the
-- snapshot's xmin has finished, so a row from a slow transaction that commits
-- after later rows were already delivered is still picked up. A plain id
-- cursor would skip it. PostgreSQL NOTIFY only wakes consumers early; the
-- poll over this table is the delivery guarantee.
--
-- Additive; references games only. Safe to apply on the V65 schema.
CREATE TABLE realtime_outbox (
    id              BIGSERIAL PRIMARY KEY,
    tx_id           BIGINT NOT NULL DEFAULT pg_current_xact_id()::text::bigint,
    origin_instance VARCHAR(128) NOT NULL,
    game_id         UUID NOT NULL,
    audience        VARCHAR(16) NOT NULL,
    team_id         UUID,
    event_type      VARCHAR(64) NOT NULL,
    destination     TEXT NOT NULL,
    payload         JSONB NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- Consumer read path: rows in a transaction-id window, in insert order.
CREATE INDEX idx_realtime_outbox_tx_id ON realtime_outbox (tx_id, id);
-- Retention path.
CREATE INDEX idx_realtime_outbox_created_at ON realtime_outbox (created_at);

-- Where each instance's consumer resumes after a restart. Bounded by the
-- outbox retention window on read and by cursor retention on cleanup.
CREATE TABLE realtime_outbox_cursors (
    instance_id VARCHAR(128) PRIMARY KEY,
    tx_id       BIGINT NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Rows a consumer could not deliver before they aged out of retention. Kept
-- for operators to inspect; never replayed automatically. The original row
-- is deleted by retention like any other; this copy is the durable record.
CREATE TABLE realtime_outbox_dead_letters (
    id               BIGSERIAL PRIMARY KEY,
    outbox_id        BIGINT NOT NULL,
    instance_id      VARCHAR(128) NOT NULL,
    game_id          UUID NOT NULL,
    audience         VARCHAR(16) NOT NULL,
    team_id          UUID,
    event_type       VARCHAR(64) NOT NULL,
    payload          JSONB NOT NULL,
    attempts         INTEGER NOT NULL,
    last_error       TEXT,
    created_at       TIMESTAMPTZ NOT NULL,
    dead_lettered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (outbox_id, instance_id)
);
CREATE INDEX idx_realtime_outbox_dead_letters_at ON realtime_outbox_dead_letters (dead_lettered_at);
