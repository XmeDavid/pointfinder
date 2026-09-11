# External uptime monitor (Cloudflare Worker + D1 + outbound heartbeats)

Status: **deployed September 10, 2026; scheduled execution blocked by a provider incident.**
Worker `pointfinder-infra-monitor`, D1 `b2061d61-7651-4542-9465-94491218e142`,
and Dokploy heartbeat stack `57TZ5opDnnfH67aJe10Wf` are installed. All three
hosts have repeatedly submitted authenticated heartbeats successfully.
The deployment helper is `../deploy-external-monitor.py`; `status` is read-only.

A real, explicitly invoked Worker cycle passed all seven checks and sent the
installation-test email (Resend HTTP 200). Its temporary authenticated test
route and credential were removed afterward. D1 `run_count=1` at acceptance
is that manual cycle, **not evidence of a successful cron invocation**.
Cloudflare reports [Workers Cron Triggers degraded](https://www.cloudflarestatus.com/incidents/sjs8s0q2x4hw),
active since September 9 at 19:17 UTC: triggers may not run or may be delayed.
The normal five-minute trigger remains configured. Before relying on external
outage alerts, verify a real `scheduled` invocation and increasing D1 run count
after that incident clears. Existing host-local database/email monitors remain
running, but are not a substitute for total-site outage detection.

## What it is

An independent, bounded outage monitor that runs *outside* every PointFinder
host, on the existing Cloudflare account (free plan: one Worker on
`workers.dev`, one D1 database, one cron trigger) and emails
`mail@davidsbatista.com` through the existing Resend credential when the
public sites, the API health endpoints or any of the three Dokploy hosts
stop responding. It adds no inbound port at home, no paid service and no
dependency on the infrastructure it watches.

```
hetzner  ─┐  outbound POST /heartbeat/hetzner (bearer)      every 5 min
arthur   ─┼──────────────────────────────────────▶  Worker  ─▶  D1 (state)
rainer   ─┘                                            │
                                                       │ cron */5: probe
              https://pointfinder.ch  ◀────────────────┤   pointfinder.ch/.pt
              https://api.pointfinder.ch/actuator/health ◀┤   api.pointfinder.ch/.pt
                                                       │ evaluate, then
                                                       └─▶ Resend (one email per transition)
```

| Path | Purpose |
| --- | --- |
| `worker/src/index.mjs` | Routes: `POST /heartbeat/{host}`, `GET /health`, cron entry. |
| `worker/src/monitor.mjs` | One cycle: lease, probes, heartbeats, hysteresis, email, commit. |
| `worker/src/state.mjs` | Pure transition logic, fingerprint, message composition. |
| `worker/src/auth.mjs` | Constant-time bearer check (SHA-256 digests, XOR compare). |
| `worker/src/probes.mjs` | Fixed-URL probes, 8 s timeout, no redirects, bounded bodies. |
| `worker/src/mail.mjs` | Resend delivery with `Idempotency-Key`; bodies discarded. |
| `worker/src/store.mjs` | All D1 SQL; atomic batch commit. |
| `worker/schema.sql` | Bounded D1 schema. |
| `worker/wrangler.toml` | Free-plan template (workers.dev, cron, D1 binding). |
| `worker/test/` | `node:test` suites over a D1-shaped adapter on `node:sqlite`. |
| `heartbeat/heartbeat.py` | Stdlib-only outbound heartbeat runner + `--healthcheck`. |
| `heartbeat/test_heartbeat.py` | `unittest` with fake transport, fake clock, temp secrets. |
| `heartbeat/Dockerfile` | `python:3.12-slim`, uid 999, one script. |
| `heartbeat/heartbeat-sidecar.example.yml` | Compose shape: read-only root, all caps dropped, 64 MiB, no socket. |

## Running the tests (no network, no secrets, no email)

```
cd deploy/ha/external-monitor/worker && node --test 'test/*.test.mjs'      # 20 tests, Node >= 22.5
cd deploy/ha/external-monitor/heartbeat && python3 -m unittest -v test_heartbeat   # 21 tests, Python >= 3.9
```

The Worker tests exercise the real `schema.sql` and the real SQL through a
small adapter over Node's built-in `node:sqlite`; `fetch`, the clock and
timers are injected. No test sends an email or opens a socket. There is
deliberately no "send a test email" route on the Worker: the unit tests
cover the email path with a fake Resend, and the operator can confirm real
delivery once by temporarily pointing a probe at a failing URL in
`config.mjs` on a preview deploy, or by trusting the existing alert pusher's
proven Resend credential.

## Behaviour

**Checks.** Seven fixed checks: four public probes (`web-ch`, `web-pt`,
`api-ch`, `api-pt`) and three host heartbeats (`hetzner`, `arthur`,
`rainer`). Nothing in a request can add, rename or redirect a check.

| Check | Passes when | Fails when |
| --- | --- | --- |
| `web-*` | HTTP 200 within 8 s, redirects not followed | anything else, timeout, network error |
| `api-*` | HTTP 200 and JSON body with `"status":"UP"` (body capped at 16 KiB) | non-200, non-JSON, status not UP, oversized body |
| `host:*` | a heartbeat was accepted within the last 15 min | no beat for > 15 min (client beats every 5 min, so 3 misses) |

**Hysteresis.** A probe becomes `down` after 2 consecutive failing cron
runs (about 10 minutes) and `ok` again after 2 consecutive passes.
Heartbeats flip immediately because the 15-minute window already debounces
them. Never-seen hosts are ignored for 15 minutes after the first cron run
(deployment grace) and then count as missing until their first beat.

**Email.** Emails are sent only on *transitions* of the aggregate picture.
The set of `down` check ids (sorted, joined) is the incident fingerprint;
one email describes the whole difference between the last delivered picture
and the current one (new failures, partial recoveries and the full check list
in one message). There is no email at first start when everything is
healthy, and no recurring "still down" reminders. At most one email is
delivered per 5 minutes; transitions inside that window are folded into the
next message. Subjects:

```
[PointFinder uptime] DOWN: api-ch
[PointFinder uptime] DOWN: api-ch, web-pt (recovered: hetzner)
[PointFinder uptime] recovered: api-ch, web-pt
```

**Delivery and retries.** The single pending message lives in D1 with a
stable `Idempotency-Key` (`pf-uptime-<kind>-<hash>-<created>`) and survives
Worker restarts. A 2xx from Resend marks the fingerprint as delivered and
clears it. A 5xx, timeout or network error is *uncertain*: the same message
and key are retried on the following runs before anything else is sent, so a
request that Resend actually accepted is deduplicated within its idempotency
window. A 3xx/4xx is a definite rejection: the message stays pending and is
retried while the picture still differs from what was delivered, and is
withdrawn if everything recovers first. Missing mail secrets never throw;
the message stays pending and an event is recorded.

**Concurrency.** Each cron run atomically claims a single-row lease
(`UPDATE ... WHERE expires_ms < now`, 4-minute expiry, shorter than the cron
period). A run that cannot claim it exits; a run that loses it before
committing abandons its results. All writes of a run go in one D1 batch
(transactional) whose last statement releases the lease.

**Bounded state.** D1 holds 7 check rows, 3 heartbeat rows, singleton
`lease`/`incident`/`meta` rows and an `events` log pruned to the last 200
entries on every commit. Writes per day stay around 4 000, far inside the
free tier.

**Secrets and logs.** Bearer tokens are compared as SHA-256 digests in
constant time and never appear in responses, logs or D1. Rejected heartbeats
log only the host name. Upstream response bodies (probes and Resend) are
never logged, never stored and never quoted in emails; reasons are internally
generated strings such as `HTTP 502`, `timeout`, `health status not UP`,
`no heartbeat for 20 min`. The Worker's `/health` answers only
`{"status":"ok"}` or `{"status":"degraded"}` depending on whether D1 answers.

## Deploying the Worker (main operator)

Run from `deploy/ha/external-monitor/worker`. Wrangler is used via `npx`, it
is not a dependency of the package.

```
npx wrangler@4 login
npx wrangler@4 d1 create pointfinder-monitor            # put the id into wrangler.toml
npx wrangler@4 d1 execute pointfinder-monitor --remote --file=schema.sql
npx wrangler@4 secret put HEARTBEAT_TOKENS               # {"hetzner":"…","arthur":"…","rainer":"…"}
npx wrangler@4 secret put RESEND_API_KEY                 # existing Resend key
npx wrangler@4 secret put ALERT_FROM                     # e.g. PointFinder uptime <info@pointfinder.pt>
npx wrangler@4 secret put ALERT_TO                       # mail@davidsbatista.com
npx wrangler@4 deploy
curl -s https://pointfinder-monitor.xmedavid.workers.dev/health
```

Generate the three tokens locally (for example `openssl rand -hex 32` each),
paste them into the `HEARTBEAT_TOKENS` prompt as one JSON object, and keep
the per-host copies only for the secret-file installation step below. The
same JSON must never land in a shell history, environment file or log.

Cloudflare runs the cron globally; the D1 lease keeps overlapping runs from
double-evaluating. `npx wrangler@4 tail --format=json` shows the
secret-free JSON log lines (`cycle`, `mail`, `mail-held`, `heartbeat-rejected`).

## Deploying the heartbeat runner (per Dokploy host)

1. Build the image on the host: `docker build -t pointfinder-heartbeat:1 deploy/ha/external-monitor/heartbeat`.
2. Install `/etc/dokploy/pointfinder/ha-secrets/heartbeat.json` as
   `{"token": "…"}`, owner uid 999, mode 0400 (see the comment block in
   `heartbeat-sidecar.example.yml` for a stdin-only installer).
3. Create a Compose stack from `heartbeat-sidecar.example.yml` with
   `POINTFINDER_HEARTBEAT_HOST` set to `hetzner`, `arthur` or `rainer`.
4. Check `docker compose ps` shows `healthy` after the first beat, and that
   `wrangler tail` shows no `heartbeat-rejected` for that host.

The runner refuses to start when the secret file is not a regular file with
mode 0400 owned by its own uid, re-reads the file on every attempt (so
rotating a token needs no restart), posts an empty body with
`Content-Length: 0`, follows no redirects and closes the connection after
each beat. `--healthcheck` judges health from the last *accepted* beat, not
the last attempt, so a Worker that starts rejecting a rotated token surfaces
in Dokploy within three intervals.

Rotating a token: `wrangler secret put HEARTBEAT_TOKENS` with the new value,
then replace the host file. Beats fail for at most one interval, well inside
the 15-minute window.

## Limitations (read before relying on it)

- **Shared provider with ingress.** The public sites are fronted by a
  Cloudflare Tunnel, and this monitor also runs on Cloudflare. A Cloudflare
  incident that breaks Workers, cron triggers or D1 can silence both the
  sites and the monitor at the same time. Emails also depend on Resend.
  This is a second, independent *vantage point*, not an independent
  *provider*.
- **Free-plan cron granularity.** Evaluation happens every 5 minutes;
  detection latency is 10 to 15 minutes for probes (two failing runs) and
  15 to 20 minutes for a silent host. Free-plan cron triggers are best
  effort and can occasionally be late; the lease tolerates that.
- **Heartbeat proves egress, not service health.** A host that can still
  reach Cloudflare but whose containers are broken keeps beating. Service
  health is what the four public probes cover; the heartbeat only says the
  host is up and has internet.
- **One recipient, one channel.** Alerts go to a single mailbox via Resend.
  If Resend rejects the sender or the mailbox is full, alerts stall; the
  pending message is retried every 5 minutes and shows in the Worker log and
  the D1 `events` table.
- **No dashboard, no history beyond 200 events.** Query D1 directly
  (`npx wrangler@4 d1 execute pointfinder-monitor --remote --command "SELECT * FROM checks"`)
  for the current picture.
- **Probe semantics are deliberately strict.** A site that answers with a
  redirect, a maintenance page returning 200 for the API health path, or a
  health JSON whose top-level `status` is not exactly `UP` counts as down.
- **Constant-time comparison is best effort in a shared runtime.** Digest
  comparison removes token-dependent early exits from the Worker's own
  code; it cannot control timing inside Cloudflare's network path.
- **The monitor does not act.** It never restarts anything and never calls
  Dokploy, Hetzner or the tunnel APIs. The existing database alert pusher
  and the HA runbooks remain the response tooling.
