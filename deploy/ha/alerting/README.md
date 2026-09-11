# Email alert pusher (bounded, transition-only)

Status: **deployed through both production database Dokploy Compose stacks**
on September 10, 2026. Local image
`pointfinder-patroni:16.15-4.1.5-production-alerting-r1`; 28 tests passed locally
and in Linux. Recipient: `mail@davidsbatista.com`, using the existing Resend
credential and sender. The protected host file is `alert-email.json`, mounted
as `/run/secrets/email.json`. No database/application configuration changed.

## What it is

`alert_pusher.py` runs as uid 999 next to the monitoring sidecar, polls the
monitor's `health.json` (mounted read-only) every 30 s and emails status
transitions through the Resend HTTPS API using only the Python standard
library. It never touches PostgreSQL, pgBackRest, Patroni, Dokploy or the
Docker socket. It writes into one directory of its own (`/state`) and reads
one secret file (`/run/secrets/email.json`).

| File | Purpose |
| --- | --- |
| `alert_pusher.py` | The pusher plus `--healthcheck` and `--test-email`. |
| `test_alert_pusher.py` | Unit tests with fake transport, clock, report and secret files. |
| `Dockerfile` | Overlay on `pointfinder-patroni:16.15-4.1.5-production-monitor-r1`; adds the script and `/state`. |
| `alerting-sidecar.example.yml` | Compose shape: `/monitor-state` ro, `/state` rw, secret ro, read-only root, all caps dropped, 64 MiB. |

Run the tests from the repository root:

```
python3 -m unittest discover -s deploy/ha/alerting -v
```

## When it emails

The pusher compares a *fingerprint* of the monitor's picture (overall status
plus the set of non-`ok` `check → status` pairs) with the last picture it
delivered. Reasons, byte counts and ages are not part of the fingerprint, so a
critical archiver that stays critical is one email, not one per minute.

| Situation | Email |
| --- | --- |
| Healthy monitor at first start | none (no "all good" mail, ever) |
| `ok` → `warning` / `unknown` / `critical`, or a change between those levels | alert, immediately |
| Report missing, unparseable, older than `STALE_SECONDS` (180) or future-dated | alert as `unknown` with a synthetic `report` check |
| Same level, different set of failing checks | alert, coalesced: not before `COALESCE_SECONDS` (600) after the last delivered email, carrying the latest picture |
| Back to `ok` after a delivered alert | recovery |
| Monitor recovers after a definite delivery rejection | queued alert is withdrawn |
| Monitor recovers after an uncertain send (for example timeout) | retry the original message/key first, then send recovery after confirmation |
| More than `MAX_EMAILS_PER_HOUR` (12) would be sent | held until the window moves on (logged once) |

Subjects look like `[PointFinder DB] production-hetzner CRITICAL: archiver, backup`
and `[PointFinder DB] production-hetzner recovered (was critical)`. The body
lists every check with its status and the monitor's own (secret-free) reason.

## Delivery, retries, restarts

`/state/alert-state.json` holds the last *delivered* picture (written only
after a 2xx from Resend), the one pending message with its `Idempotency-Key`,
and the timestamps behind the hourly cap. A failed send retries with
exponential backoff from `RETRY_MIN_SECONDS` (30) capped at
`RETRY_MAX_SECONDS` (900), reusing the same idempotency key, so a request that
timed out after Resend accepted it is deduplicated within the provider's
idempotency retention window (not an unlimited exactly-once guarantee). The secret file is
re-read on every attempt, so fixing it needs no restart. A restart resumes the
persisted schedule and never repeats an alert that was already delivered.

## Healthcheck and test email

`--healthcheck` reads the secret-free `/state/pusher-status.json` the loop
writes every tick and exits non-zero when it is missing, older than
`HEALTHCHECK_MAX_AGE_SECONDS` (3 × poll) or when the pending message has been
failing for longer than `DELIVERY_FAILURE_GRACE_SECONDS` (1800), measured from
when the first undelivered message was queued. A held-back (rate-limited or
coalesced) message is not a failure.

`--test-email` sends one "alert pusher installed on <node>" message with the
mounted secret and exits 0 on a 2xx. It reads and writes no alert state, so it
is safe to run on a live installation.

## Secret hygiene

The API key exists only in the `Authorization` header of the request. Logs,
state files, exception messages and the status file carry exception class
names, HTTP status codes, counts and check names. Provider response bodies are
drained up to `RESPONSE_MAX_BYTES` and discarded. The host is fixed to
`api.resend.com`; `http.client` follows no redirects and a 3xx is a definite
failure. TLS uses the default verified context with a 15 s timeout.

## Settings

All via `POINTFINDER_ALERT_*`: `NODE_NAME` (falls back to `PATRONI_NAME`),
`MONITOR_STATE_DIR`, `STATE_DIR`, `SECRET_PATH`, `SUBJECT_PREFIX`,
`POLL_SECONDS`, `STALE_SECONDS`, `COALESCE_SECONDS`, `MAX_EMAILS_PER_HOUR`,
`RETRY_MIN_SECONDS`, `RETRY_MAX_SECONDS`, `HTTP_TIMEOUT_SECONDS`,
`RESPONSE_MAX_BYTES`, `HEALTHCHECK_MAX_AGE_SECONDS`,
`DELIVERY_FAILURE_GRACE_SECONDS`.

## Limitations

- Node-local, like the monitor: one pusher per host, each mailing about its
  own monitor. A host that dies takes its pusher with it. The peer pusher only
  reports effects visible in its own monitor; there is no independent host-down
  or total-site-outage detector. External monitoring remains a separate layer.
- Warnings and criticals go to the same recipients. Routing by level is a
  possible follow-up, not built.
