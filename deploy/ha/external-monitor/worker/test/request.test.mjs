import test from 'node:test';
import assert from 'node:assert/strict';

import { handleRequest } from '../src/index.mjs';
import { parseTokenMap, tokenMatches } from '../src/auth.mjs';
import { FakeD1 } from './fake-d1.mjs';

const TOKENS = { hetzner: 'h-secret-1', arthur: 'a-secret-2', rainer: 'r-secret-3' };

function makeEnv() {
  return { DB: new FakeD1(), HEARTBEAT_TOKENS: JSON.stringify(TOKENS) };
}

function beat(host, token, extra = {}) {
  const headers = new Headers({ 'content-length': '0', ...(extra.headers || {}) });
  if (token !== undefined) headers.set('authorization', `Bearer ${token}`);
  return new Request(`https://monitor.example/heartbeat/${host}`, { method: extra.method || 'POST', headers });
}

const clock = (ms) => ({ now: () => ms, log: () => {} });

test('valid heartbeat records the timestamp and returns 204 with no body', async () => {
  const env = makeEnv();
  const response = await handleRequest(beat('hetzner', TOKENS.hetzner), env, clock(1_000_000));
  assert.equal(response.status, 204);
  assert.equal(await response.text(), '');
  assert.deepEqual(env.DB.row('SELECT host, last_seen_ms, count FROM heartbeats'), {
    host: 'hetzner', last_seen_ms: 1_000_000, count: 1,
  });
  const again = await handleRequest(beat('hetzner', TOKENS.hetzner), env, clock(1_300_000));
  assert.equal(again.status, 204);
  assert.deepEqual(env.DB.row('SELECT last_seen_ms, count FROM heartbeats'), { last_seen_ms: 1_300_000, count: 2 });
});

test('wrong token, cross-host token and missing token are rejected without a body', async () => {
  const env = makeEnv();
  for (const request of [
    beat('hetzner', 'nope'),
    beat('hetzner', TOKENS.arthur),
    beat('hetzner', undefined),
    beat('hetzner', 'x'.repeat(600)),
  ]) {
    const response = await handleRequest(request, env, clock(1));
    assert.equal(response.status, 401);
    assert.equal(response.headers.get('www-authenticate'), 'Bearer');
    assert.equal(await response.text(), '');
  }
  assert.equal(env.DB.rows('SELECT * FROM heartbeats').length, 0);
});

test('unknown hosts, wrong methods and non-empty bodies are refused', async () => {
  const env = makeEnv();
  assert.equal((await handleRequest(beat('evil', 'x'), env, clock(1))).status, 404);
  assert.equal((await handleRequest(beat('hetzner', TOKENS.hetzner, { method: 'GET' }), env, clock(1))).status, 405);
  const withBody = new Request('https://monitor.example/heartbeat/hetzner', {
    method: 'POST',
    headers: { authorization: `Bearer ${TOKENS.hetzner}` },
    body: '{"url":"https://attacker"}',
  });
  assert.equal((await handleRequest(withBody, env, clock(1))).status, 400);
  assert.equal((await handleRequest(new Request('https://monitor.example/anything'), env, clock(1))).status, 404);
  assert.equal(env.DB.rows('SELECT * FROM heartbeats').length, 0);
});

test('a malformed HEARTBEAT_TOKENS secret rejects every heartbeat', async () => {
  const env = { DB: new FakeD1(), HEARTBEAT_TOKENS: '{not json' };
  const response = await handleRequest(beat('hetzner', TOKENS.hetzner), env, clock(1));
  assert.equal(response.status, 401);
});

test('token comparison hashes both sides and never accepts a missing host secret', async () => {
  const map = parseTokenMap(JSON.stringify({ hetzner: 'abc', bogus: 'zzz', arthur: 7 }), ['hetzner', 'arthur', 'rainer']);
  assert.deepEqual([...map.keys()], ['hetzner']);
  assert.equal(await tokenMatches(map, 'hetzner', 'abc'), true);
  assert.equal(await tokenMatches(map, 'hetzner', 'abd'), false);
  assert.equal(await tokenMatches(map, 'hetzner', 'ab'), false);
  assert.equal(await tokenMatches(map, 'rainer', ''), false);
});

test('D1 failure on heartbeat returns 503 and asks the client to retry', async () => {
  const env = makeEnv();
  env.DB.prepare = () => ({ bind: () => ({ run: async () => { throw new Error('boom'); } }) });
  const logs = [];
  const response = await handleRequest(beat('hetzner', TOKENS.hetzner), env, { now: () => 1, log: (e) => logs.push(e) });
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('retry-after'), '60');
  assert.deepEqual(logs, [{ event: 'heartbeat-store-failed', host: 'hetzner', error: 'Error' }]);
});

test('/health is generic and reflects only whether D1 answers', async () => {
  const env = makeEnv();
  const ok = await handleRequest(new Request('https://monitor.example/health'), env, clock(1));
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { status: 'ok' });
  assert.equal(ok.headers.get('cache-control'), 'no-store');

  env.DB.prepare = () => ({ first: async () => { throw new Error('down'); } });
  const degraded = await handleRequest(new Request('https://monitor.example/health'), env, clock(1));
  assert.equal(degraded.status, 503);
  assert.deepEqual(await degraded.json(), { status: 'degraded' });

  const post = await handleRequest(new Request('https://monitor.example/health', { method: 'POST' }), env, clock(1));
  assert.equal(post.status, 405);
});
