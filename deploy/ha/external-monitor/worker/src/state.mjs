// Pure state-transition logic: per-check hysteresis, incident fingerprint and
// the single pending email. No I/O here; monitor.mjs feeds it observations and
// persists the result.

import { HOSTS, PROBES, SUBJECT_PREFIX } from './config.mjs';

export const OK = 'ok';
export const DOWN = 'down';

export function freshCheck(id, nowMs) {
  return { id, state: OK, fails: 0, passes: 0, reason: '', since_ms: nowMs, updated_ms: nowMs };
}

/**
 * Apply one observation ('pass' | 'fail' | 'skip') to a check row.
 * Returns { check, transition } where transition is null, 'down' or 'ok'.
 */
export function observe(check, observed, reason, thresholds, nowMs) {
  const next = { ...check, updated_ms: nowMs };
  let transition = null;
  if (observed === 'skip') return { check: next, transition };
  if (observed === 'fail') {
    next.fails += 1;
    next.passes = 0;
    next.reason = reason;
    if (next.state === OK && next.fails >= thresholds.failsToAlert) {
      next.state = DOWN;
      next.since_ms = nowMs;
      transition = DOWN;
    }
  } else {
    next.passes += 1;
    next.fails = 0;
    if (next.state === DOWN && next.passes >= thresholds.passesToRecover) {
      next.state = OK;
      next.since_ms = nowMs;
      next.reason = '';
      transition = OK;
    } else if (next.state === OK) {
      next.reason = '';
    }
  }
  return { check: next, transition };
}

/** Observation for a host heartbeat given its last accepted timestamp. */
export function heartbeatObservation(lastSeenMs, firstRunMs, options, nowMs) {
  if (lastSeenMs === null || lastSeenMs === undefined) {
    if (nowMs - firstRunMs < options.deploymentGraceMs) return { observed: 'skip', reason: '' };
    return { observed: 'fail', reason: 'no heartbeat received since deployment' };
  }
  const ageMs = nowMs - lastSeenMs;
  if (ageMs > options.heartbeatMissingMs) {
    return { observed: 'fail', reason: `no heartbeat for ${Math.floor(ageMs / 60_000)} min` };
  }
  return { observed: 'pass', reason: '' };
}

export function fingerprintOf(checks) {
  return checks.filter((c) => c.state === DOWN).map((c) => c.id).sort().join(',');
}

function splitFingerprint(fp) {
  return fp ? fp.split(',') : [];
}

const LABELS = new Map([
  ...PROBES.map((p) => [`probe:${p.id}`, `${p.id} (${p.url})`]),
  ...HOSTS.map((h) => [`host:${h}`, `${h} heartbeat`]),
]);

function label(id) {
  return LABELS.get(id) || id;
}

function isoMinute(ms) {
  return new Date(ms).toISOString().slice(0, 16) + 'Z';
}

/** Build the subject/text for a transition from deliveredFp to currentFp. */
export function composeMessage(kind, deliveredFp, currentFp, checks, nowMs) {
  const wasDown = new Set(splitFingerprint(deliveredFp));
  const nowDown = splitFingerprint(currentFp);
  const recovered = [...wasDown].filter((id) => !nowDown.includes(id)).sort();
  const shortName = (id) => id.replace(/^(probe|host):/, '');

  let subject;
  if (kind === 'recovery') {
    subject = `${SUBJECT_PREFIX} recovered: ${recovered.map(shortName).join(', ')}`;
  } else {
    subject = `${SUBJECT_PREFIX} DOWN: ${nowDown.map(shortName).join(', ')}`;
    if (recovered.length) subject += ` (recovered: ${recovered.map(shortName).join(', ')})`;
  }
  subject = subject.slice(0, 200);

  const lines = [
    `PointFinder external uptime monitor, evaluated ${isoMinute(nowMs)}.`,
    '',
    kind === 'recovery' ? 'All checks are passing again.' : 'Checks currently failing:',
  ];
  if (kind !== 'recovery') {
    for (const id of nowDown) {
      const check = checks.find((c) => c.id === id);
      const reason = check?.reason ? ` - ${check.reason}` : '';
      lines.push(`  DOWN  ${label(id)} since ${isoMinute(check?.since_ms ?? nowMs)}${reason}`);
    }
  }
  if (recovered.length) {
    lines.push('', 'Recovered since the last email:');
    for (const id of recovered) lines.push(`  OK    ${label(id)}`);
  }
  lines.push('', 'All checks:');
  for (const check of [...checks].sort((a, b) => a.id.localeCompare(b.id))) {
    lines.push(`  ${check.state === DOWN ? 'DOWN' : 'OK  '}  ${label(check.id)}`);
  }
  lines.push('', 'Alerts fire after 2 consecutive probe failures or 15 minutes without a heartbeat;',
    'at most one email is sent per 5 minutes. Source: deploy/ha/external-monitor.');
  return { subject, text: lines.join('\n') };
}

async function shortHash(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].slice(0, 8).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Decide the pending message after this run's evaluation.
 *
 * Rules:
 *  - An uncertain in-flight message (timeout, 5xx, network error) is retried
 *    unchanged so a request that did go through is deduplicated by key.
 *  - If the current picture differs from what was delivered, one pending
 *    message describes the whole transition (alert or recovery). A pending
 *    message for the same fingerprint keeps its key; a different picture
 *    replaces it with a new key.
 *  - If the picture matches what was delivered, any undelivered message is
 *    withdrawn (nothing to say any more).
 *  - No message is ever created while nothing was delivered and nothing is
 *    down: there is no "all healthy" email.
 */
export async function reconcilePending(incident, checks, nowMs) {
  const pending = incident.pending_json ? JSON.parse(incident.pending_json) : null;
  if (pending?.uncertain) return pending;
  const currentFp = fingerprintOf(checks);
  const deliveredFp = incident.delivered_fingerprint || '';
  if (currentFp === deliveredFp) return null;
  const kind = currentFp === '' ? 'recovery' : 'alert';
  if (pending && pending.fingerprint === currentFp && pending.kind === kind) return pending;
  const { subject, text } = composeMessage(kind, deliveredFp, currentFp, checks, nowMs);
  const key = `pf-uptime-${kind}-${await shortHash(currentFp)}-${nowMs}`;
  return { key, kind, fingerprint: currentFp, subject, text, created_ms: nowMs, attempts: 0, uncertain: false };
}
