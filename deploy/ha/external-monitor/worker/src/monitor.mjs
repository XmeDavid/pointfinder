// One scheduled cycle: claim the lease, probe, evaluate heartbeats, update
// per-check state, reconcile the pending email, send at most one email, and
// commit everything in a single D1 batch. `deps` (fetch, now, timers, log)
// is injectable so tests run without network or real time.

import { DEFAULTS, HOSTS, PROBES, checkIds } from './config.mjs';
import { runAllProbes } from './probes.mjs';
import { mailConfigured, sendMail } from './mail.mjs';
import * as store from './store.mjs';
import { DOWN, fingerprintOf, freshCheck, heartbeatObservation, observe, reconcilePending } from './state.mjs';

export function defaultDeps() {
  return {
    fetch: (...args) => globalThis.fetch(...args),
    now: () => Date.now(),
    setTimeout: (...args) => globalThis.setTimeout(...args),
    clearTimeout: (...args) => globalThis.clearTimeout(...args),
    log: (entry) => console.log(JSON.stringify(entry)),
    randomId: () => crypto.randomUUID(),
  };
}

/**
 * Run one monitoring cycle. Returns a secret-free summary for logs/tests:
 * { skipped?, transitions, fingerprint, mail: null | { outcome, status } }.
 */
export async function runCycle(env, overrides = {}, partialDeps = {}) {
  const options = { ...DEFAULTS, ...overrides };
  const deps = { ...defaultDeps(), ...partialDeps };
  const db = env.DB;
  const nowMs = deps.now();
  const owner = deps.randomId();

  if (!(await store.claimLease(db, owner, nowMs, options.leaseMs))) {
    deps.log({ event: 'cycle-skipped', reason: 'lease held' });
    return { skipped: 'lease held', transitions: [], fingerprint: null, mail: null };
  }

  const meta = await store.loadMeta(db, nowMs);
  const [probeResults, heartbeats, storedChecks, incident] = await Promise.all([
    runAllProbes(options, deps),
    store.loadHeartbeats(db),
    store.loadChecks(db),
    store.loadIncident(db),
  ]);

  const events = [];
  const transitions = [];
  const checks = [];
  const apply = (id, observed, reason, thresholds) => {
    const current = storedChecks.get(id) || freshCheck(id, nowMs);
    const { check, transition } = observe(current, observed, reason, thresholds, nowMs);
    checks.push(check);
    if (transition) {
      transitions.push({ id, to: transition });
      events.push({ kind: transition === DOWN ? 'down' : 'recovered', detail: `${id}${reason ? ': ' + reason : ''}` });
    }
  };

  const probeThresholds = { failsToAlert: options.probeFailsToAlert, passesToRecover: options.probePassesToRecover };
  for (const probe of PROBES) {
    const result = probeResults.find((r) => r.id === probe.id);
    apply(`probe:${probe.id}`, result.ok ? 'pass' : 'fail', result.reason, probeThresholds);
  }
  const hostThresholds = {
    failsToAlert: options.heartbeatFailsToAlert,
    passesToRecover: options.heartbeatPassesToRecover,
  };
  for (const host of HOSTS) {
    const { observed, reason } = heartbeatObservation(heartbeats.get(host) ?? null, meta.first_run_ms, options, nowMs);
    apply(`host:${host}`, observed, reason, hostThresholds);
  }
  // Keep the row set closed: anything not in config is dropped from the commit.
  const known = new Set(checkIds());
  const finalChecks = checks.filter((c) => known.has(c.id));

  let pending = await reconcilePending(incident, finalChecks, nowMs);
  const nextIncident = { ...incident };
  let mail = null;
  if (pending && !pending.uncertain && pending.attempts === 0 && incident.pending_json === '') {
    events.push({ kind: 'queued', detail: `${pending.kind} ${pending.fingerprint || '(all ok)'}` });
  }
  const rateLimited = nowMs - incident.last_email_ms < options.minEmailIntervalMs;
  if (pending && !rateLimited) {
    if (!mailConfigured(env)) {
      deps.log({ event: 'mail-unconfigured' });
      events.push({ kind: 'mail-unconfigured', detail: pending.kind });
    } else {
      if (!(await store.stageMail(db, owner, deps.now(), pending))) {
        return { skipped: 'lease lost', transitions, fingerprint: fingerprintOf(finalChecks), mail: null };
      }
      const result = await sendMail(env, pending, options, deps);
      mail = { outcome: result.outcome, status: result.status };
      deps.log({ event: 'mail', kind: pending.kind, outcome: result.outcome, status: result.status, error: result.error });
      if (result.outcome === 'delivered') {
        nextIncident.delivered_fingerprint = pending.fingerprint;
        nextIncident.last_email_ms = nowMs;
        nextIncident.emails_sent = (incident.emails_sent || 0) + 1;
        events.push({ kind: 'delivered', detail: `${pending.kind} ${pending.fingerprint || '(all ok)'} HTTP ${result.status}` });
        pending = null;
      } else {
        pending = { ...pending, attempts: (pending.attempts || 0) + 1, uncertain: pending.uncertain || result.outcome === 'uncertain' };
        events.push({ kind: 'mail-failed', detail: `${result.outcome} status ${result.status}${result.error ? ' ' + result.error : ''}` });
      }
    }
  } else if (pending && rateLimited) {
    deps.log({ event: 'mail-held', reason: 'rate limit', kind: pending.kind });
  }
  nextIncident.pending_json = pending ? JSON.stringify(pending) : '';

  if (!(await store.leaseHeldBy(db, owner, deps.now()))) {
    deps.log({ event: 'cycle-abandoned', reason: 'lease lost before commit' });
    return { skipped: 'lease lost', transitions, fingerprint: fingerprintOf(finalChecks), mail };
  }
  await store.commitRun(db, {
    owner,
    nowMs,
    commitNowMs: deps.now(),
    checks: finalChecks,
    incident: nextIncident,
    events,
    eventsKeep: options.eventsKeep,
  });
  const fingerprint = fingerprintOf(finalChecks);
  deps.log({
    event: 'cycle',
    down: fingerprint,
    transitions,
    probes: probeResults.map((r) => ({ id: r.id, ok: r.ok, reason: r.reason })),
    pending: pending ? pending.kind : null,
  });
  return { transitions, fingerprint, mail };
}
