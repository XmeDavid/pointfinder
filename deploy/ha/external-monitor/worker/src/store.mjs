// D1 access. Every statement is parameterised; the schema lives in
// ../schema.sql. The fake in test/fake-d1.mjs implements the same surface
// (prepare().bind().first()/run()/all(), batch()) on top of node:sqlite.

export async function claimLease(db, owner, nowMs, leaseMs) {
  const result = await db
    .prepare('UPDATE lease SET owner = ?, expires_ms = ? WHERE id = 1 AND expires_ms < ?')
    .bind(owner, nowMs + leaseMs, nowMs)
    .run();
  return (result?.meta?.changes ?? 0) === 1;
}

export async function leaseHeldBy(db, owner, nowMs) {
  const row = await db.prepare('SELECT owner, expires_ms FROM lease WHERE id = 1').first();
  return row?.owner === owner && row.expires_ms > nowMs;
}

export async function loadMeta(db, nowMs) {
  const row = await db.prepare('SELECT first_run_ms, last_run_ms, run_count FROM meta WHERE id = 1').first();
  if (row) return row;
  await db.prepare('INSERT OR IGNORE INTO meta (id, first_run_ms, last_run_ms, run_count) VALUES (1, ?, 0, 0)')
    .bind(nowMs).run();
  return { first_run_ms: nowMs, last_run_ms: 0, run_count: 0 };
}

export async function loadHeartbeats(db) {
  const { results } = await db.prepare('SELECT host, last_seen_ms FROM heartbeats').all();
  return new Map((results || []).map((r) => [r.host, r.last_seen_ms]));
}

export async function loadChecks(db) {
  const { results } = await db
    .prepare('SELECT id, state, fails, passes, reason, since_ms, updated_ms FROM checks')
    .all();
  return new Map((results || []).map((r) => [r.id, r]));
}

export async function loadIncident(db) {
  const row = await db
    .prepare('SELECT delivered_fingerprint, last_email_ms, pending_json, emails_sent FROM incident WHERE id = 1')
    .first();
  return row || { delivered_fingerprint: '', last_email_ms: 0, pending_json: '', emails_sent: 0 };
}

export async function recordHeartbeat(db, host, nowMs) {
  await db
    .prepare(
      'INSERT INTO heartbeats (host, last_seen_ms, count) VALUES (?, ?, 1) ' +
        'ON CONFLICT(host) DO UPDATE SET last_seen_ms = excluded.last_seen_ms, count = count + 1',
    )
    .bind(host, nowMs)
    .run();
}

// Write-ahead outbox: a crash after Resend accepts a request must not create
// a new idempotency key on the next cycle. Conservatively mark it uncertain
// before the network call, while atomically checking lease ownership.
export async function stageMail(db, owner, nowMs, pending) {
  const result = await db.prepare(
    'UPDATE incident SET pending_json = ? WHERE id = 1 AND EXISTS ' +
    '(SELECT 1 FROM lease WHERE id = 1 AND owner = ? AND expires_ms > ?)',
  ).bind(JSON.stringify({ ...pending, uncertain: true }), owner, nowMs).run();
  return (result?.meta?.changes ?? 0) === 1;
}

/**
 * Commit one run atomically. The final statement releases the lease only if
 * this run still owns it; the caller verifies ownership just before calling.
 */
export async function commitRun(db, { owner, nowMs, commitNowMs = nowMs, checks, incident, events, eventsKeep }) {
  // NOT NULL is an assertion inside the same transaction as every state write.
  // A lease lost between the caller's read and this batch aborts the whole batch.
  const statements = [db.prepare(
    'UPDATE lease SET owner = CASE WHEN owner = ? AND expires_ms > ? THEN owner ELSE NULL END WHERE id = 1',
  ).bind(owner, commitNowMs)];
  for (const check of checks) {
    statements.push(
      db
        .prepare(
          'INSERT INTO checks (id, state, fails, passes, reason, since_ms, updated_ms) VALUES (?, ?, ?, ?, ?, ?, ?) ' +
            'ON CONFLICT(id) DO UPDATE SET state = excluded.state, fails = excluded.fails, passes = excluded.passes, ' +
            'reason = excluded.reason, since_ms = excluded.since_ms, updated_ms = excluded.updated_ms',
        )
        .bind(check.id, check.state, check.fails, check.passes, check.reason, check.since_ms, check.updated_ms),
    );
  }
  statements.push(
    db
      .prepare(
        'UPDATE incident SET delivered_fingerprint = ?, last_email_ms = ?, pending_json = ?, emails_sent = ? WHERE id = 1',
      )
      .bind(incident.delivered_fingerprint, incident.last_email_ms, incident.pending_json, incident.emails_sent),
  );
  for (const event of events) {
    statements.push(
      db.prepare('INSERT INTO events (at_ms, kind, detail) VALUES (?, ?, ?)').bind(nowMs, event.kind, event.detail),
    );
  }
  statements.push(
    db
      .prepare('DELETE FROM events WHERE seq <= (SELECT COALESCE(MAX(seq), 0) FROM events) - ?')
      .bind(eventsKeep),
  );
  statements.push(
    db.prepare('UPDATE meta SET last_run_ms = ?, run_count = run_count + 1 WHERE id = 1').bind(nowMs),
  );
  statements.push(db.prepare('UPDATE lease SET expires_ms = 0 WHERE id = 1 AND owner = ?').bind(owner));
  await db.batch(statements);
}

export async function ping(db) {
  const row = await db.prepare('SELECT 1 AS one').first();
  return row?.one === 1;
}
