# pgBackRest for the production Patroni pair

Verified September 10: image `pointfinder-patroni:16.15-4.1.5-production-pgbackrest-r2`
is running on both production PostgreSQL hosts with pgBackRest 2.59.1. All 24
runner unit tests passed locally and inside Linux. The current Hetzner image
ID is `sha256:5e44f413a3bb178d096665c4996d953d1c3d42c5f09cbf89efc1c423285a6747`.
Encrypted WAL archiving and primary-only scheduled backup sidecars are active.
The first full backup completed at 06:44:47 UTC. Synthetic PITR and an isolated
restore of the real encrypted S3 backup to 06:45:40.683376 UTC both passed;
the real restore matched the production system ID, 69 migrations and 46 tables.
The user explicitly chose
the existing local general S3 credential; a new backup key is **not required**.
`../prepare-pgbackrest-secrets.py` stages it in protected configuration files on
both database hosts, with a generated encryption passphrase preserved in the
protected local recovery directory. Do not restrict or rotate the shared key
without accounting for its other consumers.

Live rollout (image
build, secrets, `stanza-create`, `archive_mode` via Patroni DCS, rolling restart,
sidecar deployment) was performed through the host-specific Dokploy Compose
definitions and guarded helpers in the parent directory. Do not repeat stanza
initialization or restore into live PGDATA.

## What is here

| File | Purpose |
| --- | --- |
| `Dockerfile` | Overlay on `pointfinder-patroni:16.15-4.1.5-production-r1` that installs pgBackRest `2.59.1-1.pgdg13+1` from the PGDG trixie repository already present in the base image, creates postgres-owned log/spool/state dirs and ships the runner. The inherited Patroni entrypoint is unchanged, so the same image can run Patroni (for `archive_command`) and the sidecar. |
| `pgbackrest.conf.example` | Placeholder configuration: one encrypted S3 repository (Hetzner FSN1 backups bucket) shared by both hosts, stanza `pointfinder-production`, socket + PGDATA paths matching the Patroni container. |
| `runner.py` | Primary-only scheduled backup sidecar. Weekly full (Sunday 03:30 UTC by default), daily differential otherwise. |
| `test_runner.py` | Unit tests. `python3 -m unittest discover -s deploy/ha/pgbackrest -v` (24 tests, no network, no pgBackRest). |
| `pgbackrest-sidecar.example.yml` | Compose shape for the sidecar next to the Hetzner Patroni service; adapt for Rainer (named `pointfinder-production-pgdata` volume). |

## Runner behaviour

- Every tick merges the local success file with `pgbackrest info --output=json`
  from the shared repository, so after a failover the other host's sidecar does
  not repeat a backup that already exists. If `info` fails it falls back to the
  local record only and logs a warning.
- Decision: full if no full since the latest weekly slot; else differential if
  no backup since the latest daily slot; else sleep until the next slot.
- Role check via `SELECT pg_is_in_recovery()` over the shared socket as `scout`
  (local trust in `pg_hba`). Standby or unknown role: nothing runs, poll every
  60 s. Role changes are logged once.
- Only a zero exit writes `state.json` (atomic replace + fsync). Failures retry
  every `RETRY_SECONDS` (900) up to `MAX_RETRIES` (6) per daily slot, then wait
  for the next slot. Backup timestamps in the state file are wall-clock at
  completion and the repository's own stop times, whichever is newer.
- `SIGTERM`/`SIGINT` set a stop flag and forward `terminate()` to a running
  pgBackRest process; an interrupted backup is never recorded. Set
  `stop_grace_period` long enough for pgBackRest to abort cleanly.
- Logging: exit codes, timestamps, role and schedule only. pgBackRest console
  output is captured and discarded (`--log-level-console=off` as well); the
  detailed record is pgBackRest's file log under `/var/log/pgbackrest`.
  Credentials live only in the config file pgBackRest reads itself.
- Starts as root only to copy `/run/secrets/pgbackrest.conf` to a
  postgres-owned `0400` file under `/run/pgbackrest`, fix directory ownership,
  then re-executes itself as `postgres` through `gosu`.

Environment overrides, all prefixed `POINTFINDER_PGBACKREST_`: `STANZA`,
`BINARY`, `CONFIG`, `CONFIG_SOURCE`, `STATE`, `SOCKET_DIR`, `PG_USER`,
`FULL_WEEKDAY` (0=Monday … 6=Sunday), `HOUR`, `MINUTE`, `RETRY_SECONDS`,
`MAX_RETRIES`, `POLL_SECONDS`.

## Integration reference (already applied; not a rerun checklist)

1. **Build and tag** on each database host (image is local, never pushed):
   `docker build -t pointfinder-patroni:16.15-4.1.5-production-pgbackrest-r2 deploy/ha/pgbackrest`.
   Record the resolved `pgbackrest --version` in the HA execution record.
2. **Secrets** (root-only, both hosts, never committed): fill
   `pgbackrest.conf.example` uses the existing user-authorized general S3 key
   pair and a long random `repo1-cipher-pass`. Keep the passphrase in
   the protected recovery location with the other HA recovery material; without
   it the repository is unreadable. Cipher settings are immutable after
   `stanza-create`. The Patroni container needs a postgres-readable copy
   (uid 999, mode 0400) because its entrypoint does not perform the copy the
   sidecar does; alternatively extend `production_entrypoint.py` later to do
   so (out of scope here).
3. **Shared socket**: add a `pg-socket` volume mounted at `/var/run/postgresql`
   in both the Patroni service and the sidecar; PGDATA must be mounted at the
   same path (`/var/lib/postgresql/data`) in both.
4. **Stanza** (once, on the primary, as `postgres`):
   `pgbackrest --config=/run/pgbackrest/pgbackrest.conf --stanza=pointfinder-production stanza-create`
   then, after archiving is on, `... check`.
5. **Patroni** (you own this step). DCS via `patronictl edit-config`:
   `postgresql.parameters.archive_mode: "on"` and
   `archive_command: "pgbackrest --config=/run/pgbackrest/pgbackrest.conf --stanza=pointfinder-production archive-push %p"`;
   `archive_mode` needs the rolling restart. Recommended local additions later:
   `postgresql.recovery_conf.restore_command: "pgbackrest --config=/run/pgbackrest/pgbackrest.conf --stanza=pointfinder-production archive-get %f \"%p\""`
   and `create_replica_methods: [pgbackrest, basebackup]` with
   `pgbackrest: {command: "pgbackrest --config=... --stanza=pointfinder-production --delta restore", keep_data: true, no_params: true, no_leader: 1}`
   (Patroni replica-bootstrap docs, verified 2026-09-10). Do not add
   `restore_command` before `stanza-create`, or standby startup logs constant
   `archive-get` errors.
6. **First backup**: with the sidecar running on the primary it takes the
   pending weekly full immediately; verify with `pgbackrest info`.
7. **Restore tests**: `isolated-pitr-test.py` verifies before/after target rows;
   `restore-production-s3-test.py` verifies an isolated real-data restore.
   Neither publishes PostgreSQL or joins the production network. Test volumes
   are retained and must be protected like production data.

## Limitations

- Automated standby bootstrap/archive fallback is not configured. Existing
  streaming replication and controlled rewind/failback passed. A disaster
  restore remains an explicit operator procedure, not an unattended restore.
- Backups always run on the primary; `backup-standby` (offloading to Rainer)
  needs pgBackRest TLS/SSH host access between containers and was not set up.
- Two sidecars (one per host) with separate local state files rely on
  `pgbackrest info` to coordinate; if S3 is unreachable from both, each falls
  back to its own record and the first host to regain access runs the backup.
- Retention/expiry runs as part of `backup`; WAL archive growth on the primary
  (`archive_command` failures fill `pg_wal`) must be monitored separately.
- The privilege-drop path (`main()`), the psycopg2 role query and the `gosu`
  re-exec are not unit-tested; everything else in `runner.py` is.
- Tests ran on Python 3.9 locally; the image runs the Patroni virtualenv's
  Python (trixie, 3.13). No 3.10+ syntax is used.
- The Hetzner backups bucket lacks lifecycle/object-lock policies; pgBackRest
  retention deletes objects, so the versioned bucket keeps deleted versions
  until a separate lifecycle rule exists (cost) or is added (irreversibility).
