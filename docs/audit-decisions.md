# Audit Fix Decisions

Decisions made while resolving findings from `docs/full-codebase-audit-2026-03-21.md`.

---

## Finding 6.16 -- Android contentDescription = null

**Decision:** Added descriptive contentDescription strings to 31 out of 34 `contentDescription = null` instances across 15 files. Left 3 instances as null where icons are purely decorative (inside labeled Button/OutlinedButton composables with visible text).

**Alternatives considered:**
- Leave all as null (previous decision), arguing all were decorative.
- Add string resources (R.string) for all descriptions for full i18n.

**Rationale:** Upon closer review, many icons were inside standalone clickable elements (status indicators, action icons in rows, navigation chevrons) that screen readers should announce. Used a mix of existing label parameters, computed variables, and short English literals. Full i18n of content descriptions is lower priority since the primary accessibility gap was missing descriptions entirely.

---

## Finding 3.9 -- AppState.swift god object

**Decision:** Doc comment added (already present in codebase) acknowledging the debt and outlining the extraction plan. Full refactoring deferred because it touches auth, game progress, notifications, location, sync, and realtime -- splitting this requires careful dependency analysis and extensive testing across all 22+ screens.

**Alternatives considered:**
- Extract NotificationManager, LocationTracker, and RealtimeManager as separate @Observable classes immediately.
- Keep as-is with no documentation.

**Rationale:** The doc comment (lines 7-16 of AppState.swift) captures the plan for future extraction. Doing the extraction now without ViewModel tests (finding 9.6) risks silent regressions.

---

## Finding 10.11 -- push_platform DB default still 'ios'

**Decision:** Created Flyway migration V56 (`V56__drop_push_platform_default.sql`) to `ALTER TABLE players ALTER COLUMN push_platform DROP DEFAULT`.

**Alternatives considered:**
- Also set existing 'ios' rows to NULL where pushToken is NULL.
- Change only NotificationService code to handle the default.

**Rationale:** The NotificationService already correctly filters by PushPlatform enum (null does not match either ios or android). The problem was the DB-level DEFAULT 'ios' from V2, which V30 failed to remove when making the column nullable. New rows without an explicit pushPlatform should get NULL. Existing rows with 'ios' and a valid pushToken are correct and should not be changed.

---

## Finding 2.16 -- No spring.datasource.url in application.yml

**Decision:** Added a block comment to `application.yml` explaining that datasource URL, username, and password must be provided via environment variables or profile-specific YAML. References `docs/infrastructure.md`.

**Alternatives considered:**
- Add a placeholder `spring.datasource.url` with a default pointing to localhost.
- Move all datasource config to a dedicated `application-local.yml`.

**Rationale:** Environment-variable-based config is the standard for containerized deployments. Adding a default localhost URL would mask misconfiguration in production.

---

## Deferred Findings -- Structural/Architectural

Findings 1.11-1.14, 2.13-2.14, 2.18-2.19, 4.1-4.2, 5.6, 5.11, 5.16, 5.18-5.19, 6.10, 7.10, 8.6-8.13, 9.1-9.9, 10.10, 11.11, 12.1-12.3, 12.6, 12.8-12.9, 12.12 are acknowledged deferrals requiring either:
- Multi-day refactoring efforts (service extraction, component splitting, coordinate unification)
- Significant feature development (marker clustering, offline tile caching, certificate pinning)
- Infrastructure changes (backup strategy, HttpOnly cookie migration)
- Dedicated test-writing sessions

These are documented in the original audit with `[DEFERRED: ...]` annotations and remain valid technical debt items for future sprints.
