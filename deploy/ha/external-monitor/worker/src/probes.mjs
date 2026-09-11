// Public HTTP probes. Each probe is a fixed URL from config.mjs; the result
// carries only a pass/fail verdict and a short internally generated reason
// (status code, timeout, class of error). Response bodies are read with a
// byte cap and never surface in reasons, logs or emails.

import { PROBES, USER_AGENT } from './config.mjs';

async function readBounded(response, maxBytes) {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        return null; // too large: treated as a failed health check
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock?.();
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

function errorReason(error) {
  if (error?.name === 'AbortError') return 'timeout';
  const name = typeof error?.name === 'string' ? error.name : 'Error';
  return `fetch failed (${name.replace(/[^A-Za-z0-9_]/g, '').slice(0, 40)})`;
}

/**
 * Run one probe. `deps.fetch` and `deps.setTimeout`/`clearTimeout` are
 * injectable for tests. Resolves to { id, ok, reason }.
 */
export async function runProbe(probe, options, deps) {
  const controller = new AbortController();
  const timer = deps.setTimeout(() => controller.abort(), options.probeTimeoutMs);
  try {
    const response = await deps.fetch(probe.url, {
      method: 'GET',
      redirect: 'manual',
      signal: controller.signal,
      headers: { 'user-agent': USER_AGENT, accept: 'application/json, text/html;q=0.5' },
      cf: { cacheTtl: 0, cacheEverything: false },
    });
    if (response.status !== 200) {
      await response.body?.cancel?.().catch(() => {});
      return { id: probe.id, ok: false, reason: `HTTP ${response.status}` };
    }
    if (probe.kind === 'http') {
      await response.body?.cancel?.().catch(() => {});
      return { id: probe.id, ok: true, reason: '' };
    }
    const text = await readBounded(response, options.probeBodyMaxBytes);
    if (text === null) return { id: probe.id, ok: false, reason: 'health body too large' };
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      return { id: probe.id, ok: false, reason: 'health body not JSON' };
    }
    if (parsed?.status !== 'UP') return { id: probe.id, ok: false, reason: 'health status not UP' };
    return { id: probe.id, ok: true, reason: '' };
  } catch (error) {
    return { id: probe.id, ok: false, reason: errorReason(error) };
  } finally {
    deps.clearTimeout(timer);
  }
}

export function runAllProbes(options, deps) {
  return Promise.all(PROBES.map((probe) => runProbe(probe, options, deps)));
}
