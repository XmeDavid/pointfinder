# Audit Fix Decisions

Design decisions made while fixing findings from `docs/full-codebase-audit-2026-03-21.md`.

---

## Finding 1.4 -- Points type mismatch (long vs int)

**Decision:** Changed iOS `points` to `Int64` and Android `points` to `Long` on the mobile DTOs. Backend keeps `long`.

**Alternatives considered:** (a) Change backend to `int`; (b) Leave mobile as `Int` with clamping.

**Rationale:** Backend `long` is correct for future-proofing. Mobile clients must match to avoid overflow. Int64/Long are the natural 64-bit integer types on each platform.

---

## Finding 2.1 -- File deletion outside transaction rollback scope

**Decision:** Moved `fileStorageService.deleteGameFiles(id)` to a `TransactionSynchronization.afterCommit()` callback so file deletion only runs after the DB transaction commits.

**Alternatives considered:** (a) Async event listener; (b) Scheduled cleanup job.

**Rationale:** `afterCommit()` is the simplest approach with zero infrastructure overhead. It guarantees files are only deleted if the DB changes succeed.

---

## Finding 2.5 -- Silent challenge pool exhaustion

**Decision:** Added a warning log when `teamPool.isEmpty()` and the team is skipped. Did not throw an exception because this can legitimately happen when there are more teams than challenges.

**Alternatives considered:** (a) Throw exception to abort; (b) Reassign from global pool.

**Rationale:** Throwing would prevent any assignments from being created. A warning log allows operators to see the issue and add more challenges if needed.

---

## Finding 2.15 / 5.3 -- JWT secret validation

**Decision:** Enhanced `JwtTokenProvider` to check at startup (`@PostConstruct`) whether the JWT secret equals the known insecure default, and refuse to start regardless of active profile.

**Alternatives considered:** (a) Only check on `prod` profile; (b) Generate random secret if default detected.

**Rationale:** Profile-based checks are fragile (custom profile names bypass them). Failing fast on the insecure default is the safest approach.

---

## Finding 5.2 -- Unpinned Docker image tags

**Decision:** Pinned Prometheus to `v2.51.0`, Grafana to `10.4.1`, and Certbot to `v2.9.0`.

**Alternatives considered:** Using SHA digests for maximum reproducibility.

**Rationale:** Version tags are readable and sufficient for this project's scale. SHA digests add maintenance burden with minimal benefit.

---

## Finding 5.4 -- JAVA_OPTS vs JAVA_TOOL_OPTIONS

**Decision:** Standardized on `JAVA_TOOL_OPTIONS` in both Dockerfile and docker-compose.yml.

**Alternatives considered:** Using `JAVA_OPTS` everywhere.

**Rationale:** `JAVA_TOOL_OPTIONS` is the JVM-standard env var that is automatically picked up by the JVM without requiring shell expansion in the entrypoint.

---

## Finding 7.2 -- Idempotency key for auto-approve submissions

**Decision:** Added a server-side duplicate check by team+challenge+base for auto-approved/correct submissions when no idempotency key is provided. If a matching submission already exists, return it instead of creating a duplicate.

**Alternatives considered:** (a) Deterministic idempotency key from player+challenge+base (previous approach, but does not account for player identity in the key since submissions are team-scoped); (b) Require clients to always send a key (breaking change); (c) DB unique constraint on team+challenge+base (prevents legitimate re-submissions after rejection).

**Rationale:** The duplicate check only applies to auto-resolved submissions (approved/correct) where points are awarded immediately, which is where the real data integrity risk lies. Pending submissions that go through operator review are unaffected. This approach is backwards-compatible and preserves the ability to re-submit after rejection.

---

## Finding 7.5 -- Invalid push token cleanup

**Decision:** Added cleanup logic in both `ApnsPushService` and `FcmPushService` to null out `pushToken` on the Player entity when the push service reports the token as invalid.

**Alternatives considered:** (a) Separate cleanup job; (b) Soft-delete with retry window.

**Rationale:** Inline cleanup is immediate and prevents wasted push attempts on the next notification. A separate job adds complexity for minimal benefit.

---

## Finding 8.1 / 8.2 -- Float equality for marker matching

**Decision:** On Android, switched to tag-based marker identification using annotation metadata maps keyed by coordinate strings. On iOS, added identifier-based tagging to map annotations.

**Alternatives considered:** Epsilon-based float comparison.

**Rationale:** ID-based matching is deterministic and does not depend on coordinate precision. Epsilon comparison is fragile and hard to tune.

---

## Finding 8.9 -- Location accuracy mismatch

**Decision:** Changed Android from `PRIORITY_HIGH_ACCURACY` to `PRIORITY_BALANCED_POWER_ACCURACY`.

**Alternatives considered:** Changing iOS to high accuracy instead.

**Rationale:** The feature is team location tracking for operator overview, not navigation. Hundred-meter accuracy is sufficient, and high accuracy drains battery significantly during outdoor scouting events.

---

## Finding 10.10 / 10.11 -- Push platform defaults

**Decision:** Removed the `ios` default from `Player.pushPlatform`. Updated `NotificationService` to skip push (instead of defaulting to APNs) when `pushPlatform` is null.

**Alternatives considered:** Detecting platform from User-Agent header.

**Rationale:** Null means "no push platform registered." Defaulting to iOS was incorrect for Android users. Skipping push for unknown platforms is safer than sending to the wrong service.

---

## Finding 11.9 -- Shared camera temp file on Android

**Decision:** Changed from static `capture.jpg` to timestamped unique filenames (`capture_{timestamp}.jpg`).

**Alternatives considered:** UUID-based filenames.

**Rationale:** Timestamps are human-readable for debugging and equally unique for practical purposes (millisecond precision).

---

## Finding 12.5 -- HTML sanitizer style attribute

**Decision:** Removed the `style` attribute from the sanitizer's global allowed attributes entirely.

**Alternatives considered:** Allowlisting specific CSS properties.

**Rationale:** CSS property allowlisting is complex and error-prone. Challenge content styling should come from the app's own CSS, not inline styles in user-provided HTML.

---

## Finding 12.11 -- data: URI in sanitizer

**Decision:** Removed `data` from the allowed protocols for image sources.

**Alternatives considered:** Limiting data URIs to specific MIME types.

**Rationale:** Data URIs in user content are a phishing vector and provide no legitimate value for challenge descriptions that can reference uploaded images via URLs.
