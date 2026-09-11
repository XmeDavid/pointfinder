# Two-backend acceptance gate

Scope: application readiness only. Do not increase production replicas until all
required gates below pass. Implementation and test evidence belongs in
`docs/ha-application-readiness.md`; this checklist defines acceptance independently.

September 9 result: application changes implemented; 190 focused tests passed on
the current source tree, followed by Codex's real-socket two-application test.
The isolated HA-only release baseline passed the combined 191 tests and built
successfully, without pending billing V66/V67. No production deployment or scaling
was performed. See the evidence document for limits and follow-up requirements.

## Required checks

- Upload on A, upload subsequent chunks on B, restart A, complete on B, and verify
  final bytes. Duplicate requests must not corrupt data or create duplicate domain
  actions. Concurrent completion, expiry cleanup, and completion-versus-cleanup
  must have deterministic outcomes. Reject unauthorized access on either node.
- Generate and retrieve thumbnails from S3 media without a shared upload volume.
  Keep bounded local temporary files and clean up both success and failure paths.
- Commit a game event through A and observe it on clients connected to both A and
  B, through STOMP and native WebSockets. A rolled-back transaction must not emit
  an event. Consumer restart, delayed transactions, duplicate delivery and replay
  must not skip committed events or violate existing client ordering semantics.
- Presence aggregates sessions across nodes. Disconnecting one session must not
  remove another active session. Crashed-node presence expires; reconnect restores
  it. Polling and cleanup remain bounded and indexed.
- Alternating login/join/broadcast attempts between A and B must not multiply the
  allowance. Atomic concurrent attempts, expiry and successful-login reset must
  preserve existing policy. Database failure must not silently bypass protection.
- Running scheduled jobs concurrently and then sequentially on A and B must not
  duplicate a logical transition or notification. Test failure before/after work,
  lease expiry and retry. A claim must not turn a crash into permanently lost work.
- Flyway additions are compatible with the preserved release schema and rollback
  boundary. No migration checksum changes. Existing API/authorization/offline
  retry/audit contracts continue to pass focused regression tests.
- Bound outbox, presence, limiter, job-claim and chunk retention. No unbounded
  per-instance growth or cleanup race that deletes active work.
- Audit all remaining `@Scheduled` methods and process-local security state.
  Billing implementation stays untouched; any unsafe billing scheduler must be
  explicitly isolated or remain a replica-enablement blocker.

## Release gate

Tests using mocks alone are insufficient for PostgreSQL concurrency and restart
guarantees. Run real PostgreSQL tests and an S3-compatible integration test, and
record skipped tests explicitly. Run two app instances before production scaling.
Do not call a component test a full authenticated application journey.

The working tree contains later billing work than the preserved production image.
Establish a reviewed release boundary before building or deploying. Do not use a
normal Dokploy rebuild to silently activate unrelated pending environment values.
Both production nodes must eventually run the same immutable image digest.

Release investigation: Dokploy deployment `aV2pAb0qoMAsMn4AYd2tF`, created
2026-09-09T14:24:17Z, records commit
`e01aa214a6fae651c4801e431f9d5150ae895869` in its description. This is the
candidate baseline matching the preserved image's build time and V65 schema.
There is no embedded image revision label, so this correlation alone is not a
byte-for-byte provenance proof. Later billing changes and V66/V67 are outside
the HA release scope. Verify an isolated HA patch against this baseline before
any release build; do not ship the whole current working branch implicitly.
