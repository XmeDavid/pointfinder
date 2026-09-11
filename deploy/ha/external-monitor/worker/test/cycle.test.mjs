import test from 'node:test';
import assert from 'node:assert/strict';

import { runCycle } from '../src/monitor.mjs';
import { MAIL_ENDPOINT, MINUTE_MS, PROBES } from '../src/config.mjs';
import { recordHeartbeat } from '../src/store.mjs';
import { FakeD1 } from './fake-d1.mjs';

const T0 = Date.UTC(2026, 8, 10, 12, 0, 0);
const URL_OF = Object.fromEntries(PROBES.map((p) => [p.id, p.url]));

test('crash after provider acceptance preserves the write-ahead key for retry', async () => {
  const h = harness();
  await h.beatAll();
  h.state.responders['api-ch'] = status(503);
  await h.run();
  const batch = h.db.batch.bind(h.db);
  h.state.mailResponder = () => {
    const staged = JSON.parse(h.incident().pending_json);
    assert.equal(staged.key, h.state.mails.at(-1).headers['idempotency-key']);
    assert.equal(staged.uncertain, true);
    h.db.batch = async () => { throw new Error('simulated crash after send'); };
    return new Response('{}', { status: 200 });
  };
  await assert.rejects(h.runAfter(5 * MINUTE_MS), /simulated crash/);
  const firstKey = h.state.mails[0].headers['idempotency-key'];
  h.db.batch = batch;
  h.state.mailResponder = () => new Response('{}', { status: 200 });
  await h.runAfter(5 * MINUTE_MS);
  assert.equal(h.state.mails[1].headers['idempotency-key'], firstKey);
  assert.equal(h.incident().pending_json, '');
});

const up = () => new Response('{"status":"UP","details":"INTERNAL-ONLY"}', { status: 200 });
const html = () => new Response('<html>ok</html>', { status: 200 });
const status = (code, body = '{"status":"DOWN","components":"SECRET-INTERNAL"}') => () => new Response(body, { status: code });
const hang = () => (init) =>
  new Promise((_, reject) => {
    init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
  });
const network = () => () => Promise.reject(new TypeError('fetch failed'));

function harness() {
  const db = new FakeD1();
  const env = { DB: db, HEARTBEAT_TOKENS: '{}', RESEND_API_KEY: 're_test_secret', ALERT_FROM: 'PointFinder <alerts@example.test>', ALERT_TO: 'ops@example.test' };
  const state = {
    nowMs: T0,
    responders: { 'web-ch': html, 'web-pt': html, 'api-ch': up, 'api-pt': up },
    mailResponder: () => new Response('{"id":"x"}', { status: 200 }),
    mails: [],
    logs: [],
    runs: 0,
    onProbe: null,
  };
  const fetch = async (url, init) => {
    if (url === MAIL_ENDPOINT) {
      state.mails.push({ headers: init.headers, body: JSON.parse(init.body), redirect: init.redirect });
      return state.mailResponder(init);
    }
    const id = Object.keys(URL_OF).find((k) => URL_OF[k] === url);
    assert.ok(id, `unexpected fetch ${url}`);
    assert.equal(init.redirect, 'manual');
    state.onProbe?.();
    return state.responders[id](init);
  };
  const deps = {
    fetch,
    now: () => state.nowMs,
    log: (entry) => state.logs.push(entry),
    setTimeout: (...a) => globalThis.setTimeout(...a),
    clearTimeout: (...a) => globalThis.clearTimeout(...a),
    randomId: () => `run-${state.runs += 1}`,
  };
  return {
    db, env, state,
    async run(overrides = {}) {
      return runCycle(env, overrides, deps);
    },
    async runAfter(ms, overrides = {}) {
      state.nowMs += ms;
      return runCycle(env, overrides, deps);
    },
    async beatAll() {
      for (const host of ['hetzner', 'arthur', 'rainer']) await recordHeartbeat(db, host, state.nowMs);
    },
    async beat(host) {
      await recordHeartbeat(db, host, state.nowMs);
    },
    checks() {
      return Object.fromEntries(db.rows('SELECT id, state, fails, passes, reason FROM checks').map((r) => [r.id, r]));
    },
    incident() {
      return db.row('SELECT * FROM incident');
    },
    events() {
      return db.rows('SELECT kind, detail FROM events ORDER BY seq');
    },
  };
}

test('first healthy run sends nothing, creates all rows and releases the lease', async () => {
  const h = harness();
  await h.beatAll();
  const result = await h.run();
  assert.deepEqual(result, { transitions: [], fingerprint: '', mail: null });
  assert.equal(h.state.mails.length, 0);
  assert.equal(Object.keys(h.checks()).length, 7);
  assert.ok(Object.values(h.checks()).every((c) => c.state === 'ok'));
  assert.deepEqual(h.db.row('SELECT first_run_ms, last_run_ms, run_count FROM meta'), { first_run_ms: T0, last_run_ms: T0, run_count: 1 });
  assert.deepEqual(h.db.row('SELECT owner, expires_ms FROM lease'), { owner: 'run-1', expires_ms: 0 });
  assert.deepEqual(h.events(), []);
});

test('a probe alerts after two consecutive failures and recovers after two passes', async () => {
  const h = harness();
  await h.beatAll();
  await h.run();
  h.state.responders['api-ch'] = status(502);
  await h.beatAll();
  let result = await h.runAfter(5 * MINUTE_MS);
  assert.deepEqual(result.transitions, []);
  assert.equal(h.state.mails.length, 0);
  assert.equal(h.checks()['probe:api-ch'].fails, 1);

  await h.beatAll();
  result = await h.runAfter(5 * MINUTE_MS);
  assert.deepEqual(result.transitions, [{ id: 'probe:api-ch', to: 'down' }]);
  assert.deepEqual(result.mail, { outcome: 'delivered', status: 200 });
  assert.equal(h.state.mails.length, 1);
  const mail = h.state.mails[0];
  assert.equal(mail.body.subject, '[PointFinder uptime] DOWN: api-ch');
  assert.match(mail.body.text, /DOWN  api-ch \(https:\/\/api\.pointfinder\.ch\/actuator\/health\) since .* - HTTP 502/);
  assert.match(mail.headers['idempotency-key'], /^pf-uptime-alert-[0-9a-f]{16}-\d+$/);
  assert.equal(mail.headers.authorization, 'Bearer re_test_secret');
  assert.equal(mail.redirect, 'manual');
  assert.doesNotMatch(mail.body.text, /SECRET-INTERNAL/);
  assert.equal(h.incident().delivered_fingerprint, 'probe:api-ch');
  assert.equal(h.incident().pending_json, '');
  assert.deepEqual(h.events().map((e) => e.kind), ['down', 'queued', 'delivered']);

  h.state.responders['api-ch'] = up;
  await h.beatAll();
  result = await h.runAfter(5 * MINUTE_MS);
  assert.deepEqual(result.transitions, []);
  assert.equal(h.state.mails.length, 1);
  await h.beatAll();
  result = await h.runAfter(5 * MINUTE_MS);
  assert.deepEqual(result.transitions, [{ id: 'probe:api-ch', to: 'ok' }]);
  assert.equal(h.state.mails.length, 2);
  assert.equal(h.state.mails[1].body.subject, '[PointFinder uptime] recovered: api-ch');
  assert.match(h.state.mails[1].headers['idempotency-key'], /^pf-uptime-recovery-/);
  assert.equal(h.incident().delivered_fingerprint, '');
  assert.equal(h.incident().emails_sent, 2);
});

test('probe verdicts: health not UP, non-JSON, redirect, timeout and network errors fail; HTML 200 passes', async () => {
  const h = harness();
  await h.beatAll();
  h.state.responders['api-ch'] = status(200, '{"status":"DOWN"}');
  h.state.responders['api-pt'] = status(200, 'not json');
  h.state.responders['web-ch'] = status(301, '');
  h.state.responders['web-pt'] = hang();
  await h.run({ probeTimeoutMs: 5 });
  const c = h.checks();
  assert.equal(c['probe:api-ch'].reason, 'health status not UP');
  assert.equal(c['probe:api-pt'].reason, 'health body not JSON');
  assert.equal(c['probe:web-ch'].reason, 'HTTP 301');
  assert.equal(c['probe:web-pt'].reason, 'timeout');
  h.state.responders['web-pt'] = network();
  h.state.responders['api-ch'] = status(200, 'x'.repeat(20_000));
  await h.beatAll();
  await h.runAfter(5 * MINUTE_MS);
  assert.equal(h.checks()['probe:web-pt'].reason, 'fetch failed (TypeError)');
  assert.equal(h.checks()['probe:api-ch'].reason, 'health body too large');
  assert.equal(h.checks()['probe:web-ch'].fails, 2);
  assert.equal(h.checks()['probe:web-ch'].state, 'down');
});

test('a host missing for more than 15 minutes alerts and recovers on the next heartbeat', async () => {
  const h = harness();
  await h.beatAll();
  await h.run();
  for (let i = 0; i < 3; i += 1) {
    await h.beat('hetzner');
    await h.beat('rainer');
    const result = await h.runAfter(5 * MINUTE_MS);
    assert.deepEqual(result.transitions, [], `run ${i}`);
  }
  await h.beat('hetzner');
  await h.beat('rainer');
  const result = await h.runAfter(5 * MINUTE_MS);
  assert.deepEqual(result.transitions, [{ id: 'host:arthur', to: 'down' }]);
  assert.equal(h.state.mails[0].body.subject, '[PointFinder uptime] DOWN: arthur');
  assert.match(h.state.mails[0].body.text, /arthur heartbeat since .* - no heartbeat for 20 min/);

  await h.beatAll();
  const recovered = await h.runAfter(5 * MINUTE_MS);
  assert.deepEqual(recovered.transitions, [{ id: 'host:arthur', to: 'ok' }]);
  assert.equal(h.state.mails[1].body.subject, '[PointFinder uptime] recovered: arthur');
});

test('never-seen hosts stay silent during the 15-minute deployment grace, then alert together', async () => {
  const h = harness();
  await h.run();
  assert.ok(Object.values(h.checks()).every((c) => c.state === 'ok' && c.fails === 0));
  await h.runAfter(10 * MINUTE_MS);
  assert.equal(h.state.mails.length, 0);
  const result = await h.runAfter(6 * MINUTE_MS);
  assert.deepEqual(result.transitions.map((t) => t.id).sort(), ['host:arthur', 'host:hetzner', 'host:rainer']);
  assert.equal(h.state.mails.length, 1);
  assert.equal(h.state.mails[0].body.subject, '[PointFinder uptime] DOWN: arthur, hetzner, rainer');
  assert.match(h.state.mails[0].body.text, /no heartbeat received since deployment/);
});

test('new failures inside the 5-minute window are aggregated into one later email', async () => {
  const h = harness();
  await h.beatAll();
  await h.run();
  h.state.responders['api-ch'] = status(503);
  await h.beatAll();
  await h.runAfter(5 * MINUTE_MS);
  await h.beatAll();
  await h.runAfter(5 * MINUTE_MS);
  assert.equal(h.state.mails.length, 1);

  h.state.responders['web-pt'] = status(500);
  await h.beatAll();
  await h.runAfter(2 * MINUTE_MS);
  await h.beatAll();
  const held = await h.runAfter(2 * MINUTE_MS);
  assert.deepEqual(held.transitions, [{ id: 'probe:web-pt', to: 'down' }]);
  assert.equal(held.mail, null);
  assert.equal(h.state.mails.length, 1);
  assert.ok(h.state.logs.some((l) => l.event === 'mail-held'));
  assert.equal(JSON.parse(h.incident().pending_json).fingerprint, 'probe:api-ch,probe:web-pt');

  await h.beatAll();
  const sent = await h.runAfter(2 * MINUTE_MS);
  assert.deepEqual(sent.mail, { outcome: 'delivered', status: 200 });
  assert.equal(h.state.mails.length, 2);
  assert.equal(h.state.mails[1].body.subject, '[PointFinder uptime] DOWN: api-ch, web-pt');
  assert.equal(h.incident().delivered_fingerprint, 'probe:api-ch,probe:web-pt');

  h.state.responders['api-ch'] = up;
  await h.beatAll();
  await h.runAfter(5 * MINUTE_MS);
  await h.beatAll();
  await h.runAfter(5 * MINUTE_MS);
  assert.equal(h.state.mails[2].body.subject, '[PointFinder uptime] DOWN: web-pt (recovered: api-ch)');
});

test('an uncertain send is retried with the same key and body before any recovery mail', async () => {
  const h = harness();
  await h.beatAll();
  await h.run();
  h.state.responders['api-pt'] = status(502);
  await h.beatAll();
  await h.runAfter(5 * MINUTE_MS);
  h.state.mailResponder = () => new Response('', { status: 500 });
  await h.beatAll();
  let result = await h.runAfter(5 * MINUTE_MS);
  assert.deepEqual(result.mail, { outcome: 'uncertain', status: 500 });
  const pending = JSON.parse(h.incident().pending_json);
  assert.equal(pending.attempts, 1);
  assert.equal(pending.uncertain, true);
  assert.equal(h.incident().delivered_fingerprint, '');

  h.state.mailResponder = hang();
  await h.beatAll();
  result = await h.runAfter(5 * MINUTE_MS, { mailTimeoutMs: 5 });
  assert.deepEqual(result.mail, { outcome: 'uncertain', status: 0 });
  assert.equal(h.state.mails[1].headers['idempotency-key'], h.state.mails[0].headers['idempotency-key']);
  assert.deepEqual(h.state.mails[1].body, h.state.mails[0].body);

  h.state.responders['api-pt'] = up;
  h.state.mailResponder = () => new Response('{}', { status: 200 });
  await h.beatAll();
  await h.runAfter(5 * MINUTE_MS);
  assert.equal(h.state.mails[2].headers['idempotency-key'], h.state.mails[0].headers['idempotency-key']);
  assert.equal(h.incident().delivered_fingerprint, 'probe:api-pt');
  assert.equal(h.incident().pending_json, '');

  await h.beatAll();
  await h.runAfter(5 * MINUTE_MS);
  assert.equal(h.state.mails.length, 4);
  assert.equal(h.state.mails[3].body.subject, '[PointFinder uptime] recovered: api-pt');
});

test('a definitely rejected alert is retried while down and withdrawn once everything recovers', async () => {
  const h = harness();
  await h.beatAll();
  await h.run();
  h.state.responders['web-ch'] = status(500);
  h.state.mailResponder = () => new Response('', { status: 422 });
  await h.beatAll();
  await h.runAfter(5 * MINUTE_MS);
  await h.beatAll();
  const result = await h.runAfter(5 * MINUTE_MS);
  assert.deepEqual(result.mail, { outcome: 'rejected', status: 422 });
  assert.equal(JSON.parse(h.incident().pending_json).uncertain, false);

  h.state.responders['web-ch'] = html;
  await h.beatAll();
  const retried = await h.runAfter(5 * MINUTE_MS);
  assert.deepEqual(retried.mail, { outcome: 'rejected', status: 422 });
  assert.equal(JSON.parse(h.incident().pending_json).attempts, 2);
  assert.equal(h.state.mails[1].headers['idempotency-key'], h.state.mails[0].headers['idempotency-key']);

  h.state.mailResponder = () => new Response('{}', { status: 200 });
  await h.beatAll();
  const withdrawn = await h.runAfter(5 * MINUTE_MS);
  assert.deepEqual(withdrawn.transitions, [{ id: 'probe:web-ch', to: 'ok' }]);
  assert.equal(withdrawn.mail, null);
  assert.equal(h.incident().pending_json, '');
  assert.equal(h.incident().delivered_fingerprint, '');
  assert.equal(h.state.mails.length, 2);
});

test('missing mail configuration keeps the message pending and never throws', async () => {
  const h = harness();
  delete h.env.RESEND_API_KEY;
  await h.beatAll();
  await h.run();
  h.state.responders['web-ch'] = status(500);
  await h.beatAll();
  await h.runAfter(5 * MINUTE_MS);
  await h.beatAll();
  const result = await h.runAfter(5 * MINUTE_MS);
  assert.equal(result.mail, null);
  assert.equal(h.state.mails.length, 0);
  assert.equal(JSON.parse(h.incident().pending_json).kind, 'alert');
  assert.ok(h.events().some((e) => e.kind === 'mail-unconfigured'));
});

test('a held lease skips the run; a lease lost before commit abandons it', async () => {
  const h = harness();
  h.db.raw.exec(`UPDATE lease SET owner = 'other', expires_ms = ${T0 + 60_000}`);
  const skipped = await h.run();
  assert.equal(skipped.skipped, 'lease held');
  assert.equal(h.db.rows('SELECT * FROM checks').length, 0);

  h.state.nowMs = T0 + 61_000;
  h.state.onProbe = () => h.db.raw.exec("UPDATE lease SET owner = 'thief', expires_ms = 9e15");
  const lost = await h.run();
  assert.equal(lost.skipped, 'lease lost');
  assert.equal(h.db.rows('SELECT * FROM checks').length, 0);
  assert.equal(h.db.row('SELECT run_count FROM meta').run_count, 0);
});

test('the events table is bounded and the lease is released by the commit', async () => {
  const h = harness();
  await h.beatAll();
  await h.run({ eventsKeep: 3 });
  h.state.responders['web-ch'] = status(500);
  h.state.responders['web-pt'] = status(500);
  h.state.responders['api-ch'] = status(500);
  h.state.responders['api-pt'] = status(500);
  await h.beatAll();
  await h.runAfter(5 * MINUTE_MS, { eventsKeep: 3 });
  await h.beatAll();
  await h.runAfter(5 * MINUTE_MS, { eventsKeep: 3 });
  assert.equal(h.events().length, 3);
  assert.equal(h.db.row('SELECT expires_ms FROM lease').expires_ms, 0);
});

test('logs and emails never carry the API key or upstream response bodies', async () => {
  const h = harness();
  await h.beatAll();
  await h.run();
  h.state.responders['api-ch'] = status(500);
  await h.beatAll();
  await h.runAfter(5 * MINUTE_MS);
  await h.beatAll();
  await h.runAfter(5 * MINUTE_MS);
  const everything = JSON.stringify({ logs: h.state.logs, events: h.events(), mail: h.state.mails.map((m) => m.body) });
  assert.doesNotMatch(everything, /re_test_secret/);
  assert.doesNotMatch(everything, /SECRET-INTERNAL|INTERNAL-ONLY/);
});
