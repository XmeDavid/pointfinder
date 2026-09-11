# Dokploy control-plane backup, retention and restore rehearsal

Status: **deployed and restore-tested September 10, 2026.** Dokploy compose
`4a7QOggMrpT0Wx-wNpfOm` runs `../control-plane-production.yml` on Hetzner.
Daily backups run at 04:15 UTC, with guarded 7-daily/4-weekly/3-monthly local
retention and an isolated restore every 30 days. The first backup passed
decryption, S3 GET verification, and restoration of all 62 tables, 388
configuration files, registry configuration and three mounted secret entries.
The encrypted archive and manifest also passed a Garage read-back check.
This is a database/configuration recovery test, not a live Dokploy UI or
whole-Swarm failover test. Existing email alerting reports backup health.

It replaces the one-shot, unencrypted
`../backup-control-plane.py` export flow with a scheduled, encrypted,
validated one, and closes the recovery gap found on live inspection: Dokploy
0.29.x keeps the database password and auth secret in **Swarm secrets**
(`POSTGRES_PASSWORD_FILE`, `BETTER_AUTH_SECRET_FILE`), which neither
`/etc/dokploy` nor `docker service inspect` contain. This runner captures the
mounted secret bytes into the encrypted archive.

| File | Purpose |
| --- | --- |
| `backup_runner.py` | Stdlib-only runner: `backup`, `prune`, `restore-test`, `restore-cleanup`, `run`, `status`, `healthcheck`. |
| `s3_upload.py` | Optional boto3 post-backup hook: upload + GET-verify to the private backups bucket. |
| `test_backup_runner.py` | 61 unit tests; all Docker interactions are faked, `openssl` is real. |
| `Dockerfile` | Alpine (same pinned base as `Dockerfile.s3-recovery`) + Docker 29 CLI + openssl + py3-boto3. |
| `control-plane-backup.example.yml` | Compose shape for the Dokploy-managed service on the main host. |

Run the tests from the repository root (Python ≥ 3.9, `openssl` on PATH):

```
python3 -m unittest discover -s deploy/ha/control-plane-backup -v
```

## What a backup contains

One encrypted file `dokploy-control-plane-<UTC stamp>.tar.gz.enc` and one
secret-free sidecar `dokploy-control-plane-<stamp>.manifest.json`. Inside the
encrypted tar:

| Member | Source | Notes |
| --- | --- | --- |
| `dump/dokploy.dump` | `docker exec <dokploy-postgres> pg_dump --format=custom --no-owner --no-acl` | Custom format gives a single consistent snapshot. |
| `services/<name>.json` | `docker service inspect` for `dokploy`, `dokploy-postgres`, `dokploy-redis` | Full specs, including env values; secrets are only *referenced* here. |
| `secrets/<service>/<secret>` | `docker exec <task container> cat /run/secrets/<name>` | Exact bytes of every Swarm secret each service mounts, written straight to protected staging. |
| `secrets/manifest.json` | derived | Service → secret name → absolute mount target, mode/uid/gid, size, SHA-256. Encrypted only. |
| `etc/dokploy/**` | read-only bind mount | Excludes any directory named `code`, `logs`, `.git` or `node_modules` at any depth; symlinks stored, never followed. |
| `root/.docker/**` | optional read-only bind mount | Registry logins (GHCR) for repeatable `docker login`; only when `CPB_DOCKER_CONFIG_DIR` is set. |

The sidecar manifest holds counts, sizes, hashes of the *archive*, the table
list from the dump's table of contents, live row counts per table, the
Postgres image and role/database names. It names no secret and contains no
hash of one, so it can be read without the passphrase.

## Pipeline (fail closed)

1. Preconditions: passphrase file is a regular file, mode `0?00`, non-empty;
   destination (and copy) directories exist; `/etc/dokploy` mounted. Any
   failure stops before a single Docker call.
2. Exactly one running `dokploy-postgres` task is required. `docker inspect`
   is parsed in memory for `POSTGRES_USER`/`POSTGRES_DB`/image only.
3. Row counts (`count(*)` per public table, one statement) are read, then
   `pg_dump` streams into tmpfs staging; `pg_restore --list` must succeed and
   list at least one `TABLE DATA` entry.
4. Service specs and every referenced Swarm secret are captured; a missing,
   unreadable or empty secret aborts the backup.
5. The plain tar is built with Python's `tarfile`, then fully re-read (gzip
   CRC, member safety, dump size, member count).
6. `openssl enc -aes-256-cbc -pbkdf2 -iter 600000 -md sha256 -salt -pass file:…`
   encrypts it; the result is decrypted again and must hash-match the plain
   archive, proving the passphrase file in use can decrypt.
7. The encrypted file is written under `<dest>/.incoming/`, fsynced and
   `rename`d into place; the manifest follows. A backup without a manifest is
   an orphan and is neither counted nor pruned.
8. Optional copy directory (temp + fsync + rename + re-hash) and optional S3
   upload. A failed copy directory is a **warning**; a failed or unverified
   S3 upload is **critical**, and `last-success.json` is not written.

Staging (`/tmp`, tmpfs) is deleted in a `finally`. Plaintext never touches
the destination disk. Logs and state files carry names, counts, hashes,
return codes and exception class names only; command stdout/stderr is never
logged (the message says how many bytes were suppressed).

## Retention

`prune` keeps the newest backup of each of the 7 most recent *distinct days*,
4 most recent distinct ISO weeks and 3 most recent distinct months that have a
backup, plus the newest backup unconditionally. Counting distinct periods
rather than calendar windows means an outage never widens deletion. Only
files whose names match exactly `dokploy-control-plane-YYYYMMDDTHHMMSSZ`
with `.tar.gz.enc` **and** a matching `.manifest.json` are candidates;
legacy `dokploy-control-plane-*.tar.gz` exports, orphans, symlinks and any
other file are reported as protected and never touched. Dry-run is the
default; `--apply` (or `CPB_PRUNE_APPLY=true` for the scheduler) deletes.

The same `prune` works standalone on the Mac copy directory with no Docker:

```
CPB_DEST_DIR=/srv/pointfinder-s3/control-plane-backups CPB_STATE_DIR=/tmp/cpb-state \
  python3 backup_runner.py prune            # dry-run report
```

Garage's version archives are **not** garbage-collected by this package;
WAL/manifest coherence there needs its own review.

## Restore rehearsal (`restore-test`)

Order: verify the encrypted file's hash against the manifest → decrypt to
tmpfs and hash-check → safe extraction (rejects absolute or `..` members,
skips symlinks) and member-count check → verify the configuration tree
(representative artefacts, default `traefik/traefik.yml` and
`traefik/dynamic`, reported as present/size only), service specs parse,
every Swarm secret matches size and SHA-256 from the encrypted secrets
manifest, and `root/.docker/config.json` parses if captured → create a fresh
volume and run PostgreSQL (the image recorded at backup time unless
`CPB_RESTORE_IMAGE` overrides) with:

```
--network none  --volume <fresh>:/var/lib/postgresql/data  --label pointfinder.control-plane-restore=1
--env POSTGRES_HOST_AUTH_METHOD=trust  --memory 512m --cpus 1 --pids-limit 256
--security-opt no-new-privileges:true --restart no
```

No socket, no production volume, no host path and no Dokploy scheduler is
involved; trust auth is reachable only through `docker exec` on a container
with no network. `pg_restore --exit-on-error --single-transaction` restores
the dump; the same `count(*)` statement then compares the table set (must
match the dump's table of contents exactly) and per-table rows against the
counts taken before the dump, within `CPB_ROW_COUNT_TOLERANCE_ROWS` (5) or
`CPB_ROW_COUNT_TOLERANCE_PERCENT` (2). Row counts were read from the live
database just before `pg_dump`, so they are not snapshot-consistent with the
dump; the tolerance absorbs writes Dokploy made in between. The container,
volume and work directory are removed in a `finally` even on failure;
`--keep` retains them (they contain production secrets) and
`restore-cleanup --apply` removes anything carrying the label later.

**Honest scope.** A passed rehearsal proves the archive decrypts, the
configuration and secrets reconstruct bit-exactly, and the database restores
with the expected tables and rows. It does **not** start Dokploy, Traefik or
Redis against the restored data, does not touch Swarm, and is not an
end-to-end control-plane failover. Starting an isolated Dokploy UI from a
restored set is a separate exercise.

## Scheduler and health

`run` (the container's default command) performs one cycle a day at
`CPB_BACKUP_TIME_UTC` (default 04:15, after pgBackRest's 03:30 window):
backup → prune destination → prune copy directory → optional restore
rehearsal when `CPB_RESTORE_INTERVAL_DAYS` > 0 and the last one is older.
A cycle missed while the container was down runs immediately at start. A
non-blocking `flock` on `/state/runner.lock` keeps `docker exec` one-off
jobs from overlapping the loop. Every tick (60 s) rewrites `/state/health.json`:

| Check | ok / warning / critical |
| --- | --- |
| `backup` | newest complete backup in the destination older than 36 h (`CPB_BACKUP_MAX_AGE_HOURS`) or absent → critical |
| `copy` (if configured) | newest copy older than 48 h or absent → warning |
| `remote_copy` (if S3 enabled) | last upload failed or verified copy older than 48 h → critical; newest local backup not yet uploaded → warning; none recorded → warning |
| `last_run` | last cycle failed → warning while the newest backup is still fresh, critical otherwise; none → warning |
| `restore_test` | failed → critical; older than 35 d or never → warning |
| `prune` | errors → warning; pending dry-run deletions are reported |

`healthcheck` mirrors the database monitor's rule: missing, unparseable,
stale (> 5 ticks), future-dated, critical or unknown → exit 1; warnings pass.
Two mtime files let the existing monitoring sidecar consume the runner
without changes, through `POINTFINDER_MONITOR_MAC_RECOVERY_FILES`:

- `/state/last-success.json` — touched only when a backup and **all enabled
  copies** succeeded and verified;
- `/state/last-healthy.json` — touched every tick while overall status is ok
  or warning (a heartbeat that still embeds the 36 h freshness rule).

The monitor's shared 2 h default for those files suits the heartbeat; a
per-label age would be needed to watch `last-success.json` directly.

## Off-host copy (optional)

`CPB_S3_CREDENTIALS_FILE` points at a root-only JSON file
(`{"endpoint","region","access_key","secret_key"}`) for a key allowed to
write `pointfinder-prod-backups-202609` (the application key is denied there
by policy). `s3_upload.py` PUTs the archive and manifest under
`control-plane/`, GETs the archive back and requires the SHA-256 to match
before the run counts as successful. It never lists or deletes; keys are
unique per stamp and the bucket is versioned. The existing hourly Garage
backup-recovery mirror then carries the encrypted files to the Mac
automatically. Enabling it requires removing `network_mode: none`.

## Deployment caveats

- **Root-equivalent.** The runner needs the Docker socket to `docker exec`
  into Dokploy's containers and to run the rehearsal; socket access is root
  on the host. Keep the image local, the compose file reviewed, and the
  passphrase/credential files `0600` under `/etc/dokploy/pointfinder/ha-secrets`.
- **Docker CLI version.** The image copies the CLI from `docker:29-cli` to
  match the Docker 29.x engine's minimum API; do not swap in a distribution
  package without checking `docker version` against the engine.
- **Passphrase custody.** Losing the passphrase makes every archive useless;
  `openssl enc` is unauthenticated encryption, so integrity comes from the
  manifest hashes and the decrypt round trip, not from the cipher. Keep a
  copy with the pgBackRest passphrase custody, never in this repository.
- **Swarm secrets.** Capture relies on each service having exactly one
  running task and on `cat` existing in the task image (true for Dokploy,
  postgres and redis images). A service with no running task and no secrets
  is fine; with secrets it fails the backup.
- **Dokploy image versions.** `pg_dump`/`pg_restore --list` run inside the
  live `dokploy-postgres` container, so the dump matches its server version;
  the rehearsal defaults to the same image reference recorded in the
  manifest. If that tag has moved on the registry, pin `CPB_RESTORE_IMAGE`.
- **Restore container capabilities.** The throw-away PostgreSQL keeps the
  image's default capabilities (its entrypoint chowns and drops to
  `postgres`); the isolation comes from `--network none`, a fresh volume and
  the absence of any host mount.
- **Untested against real Docker.** The fakes model the CLI contracts used
  (`ps -q --filter label=`, `inspect`, `service inspect`, `exec`, `run`,
  `volume create/rm`, `rm -f`). The first production run should be
  `backup` by hand, then `restore-test`, then `prune` dry-run review before
  enabling `CPB_PRUNE_APPLY` and the scheduler.
- **Existing exports.** The unencrypted `dokploy-control-plane-*.tar.gz`
  files in the destination are foreign to the runner and are never pruned;
  retiring them is a deliberate decision once encrypted backups have passed
  a rehearsal.
- **Not covered.** Redis state (Dokploy uses it for queues, not durable
  data), Docker volumes of deployed applications, TeamSpeak, and Garage
  archive GC are outside this package.
