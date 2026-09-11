// Cloudflare Worker entry point for the PointFinder external uptime monitor.
//
//   POST /heartbeat/{host}  bearer-authenticated, empty body -> 204
//   GET  /health            generic liveness, no internal data
//   cron */5 * * * *        runCycle() in monitor.mjs
//
// Bindings (wrangler.toml): DB (D1). Secrets: HEARTBEAT_TOKENS (JSON object
// host -> token), RESEND_API_KEY, ALERT_FROM, ALERT_TO.

import { bearerToken, parseTokenMap, tokenMatches } from './auth.mjs';
import { DEFAULTS, HOSTS } from './config.mjs';
import { runCycle } from './monitor.mjs';
import { ping, recordHeartbeat } from './store.mjs';

const NO_STORE = { 'cache-control': 'no-store' };

function json(status, body, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...NO_STORE, ...extra },
  });
}

function empty(status, extra = {}) {
  return new Response(null, { status, headers: { ...NO_STORE, ...extra } });
}

/**
 * True when the request carries any body bytes. Checks the declared length
 * first and otherwise reads at most one chunk, so a chunked body is refused
 * without buffering it.
 */
async function hasBody(request) {
  const declared = request.headers.get('content-length');
  if (declared !== null) return declared !== '0';
  if (!request.body) return false;
  const reader = request.body.getReader();
  try {
    const { done, value } = await reader.read();
    return !done && (value?.byteLength ?? 0) > 0;
  } finally {
    await reader.cancel().catch(() => {});
  }
}

export async function handleRequest(request, env, deps = {}) {
  const now = deps.now || (() => Date.now());
  const log = deps.log || ((entry) => console.log(JSON.stringify(entry)));
  const url = new URL(request.url);

  if (url.pathname === '/health') {
    if (request.method !== 'GET' && request.method !== 'HEAD') return empty(405, { allow: 'GET, HEAD' });
    let ok = false;
    try {
      ok = await ping(env.DB);
    } catch {
      ok = false;
    }
    return json(ok ? 200 : 503, { status: ok ? 'ok' : 'degraded' });
  }

  const match = /^\/heartbeat\/([a-z]{1,32})$/.exec(url.pathname);
  if (match) {
    if (request.method !== 'POST') return empty(405, { allow: 'POST' });
    const host = match[1];
    if (!HOSTS.includes(host)) return empty(404);
    if (await hasBody(request)) return empty(400);
    const presented = bearerToken(request, DEFAULTS.maxTokenBytes);
    if (presented === null) return empty(401, { 'www-authenticate': 'Bearer' });
    const tokens = parseTokenMap(env.HEARTBEAT_TOKENS, HOSTS);
    if (!(await tokenMatches(tokens, host, presented))) {
      log({ event: 'heartbeat-rejected', host });
      return empty(401, { 'www-authenticate': 'Bearer' });
    }
    try {
      await recordHeartbeat(env.DB, host, now());
    } catch (error) {
      log({ event: 'heartbeat-store-failed', host, error: error?.name || 'Error' });
      return empty(503, { 'retry-after': '60' });
    }
    return empty(204);
  }

  return empty(404);
}

export default {
  fetch(request, env) {
    return handleRequest(request, env);
  },
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(
      runCycle(env).catch((error) =>
        console.log(JSON.stringify({ event: 'cycle-failed', error: error?.name || 'Error' })),
      ),
    );
  },
};
