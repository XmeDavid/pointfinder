# Audit Fix Decisions

Decisions made while resolving findings from `docs/full-codebase-audit-2026-03-21.md`.

---

## Finding 6.16 -- Android contentDescription = null

**Decision:** No code changes. The 34 remaining `contentDescription = null` instances are all on decorative `Icon` composables (status indicators, icons inside labeled buttons, icons in rows alongside text). Per Android accessibility guidelines, decorative icons should have `contentDescription = null` so TalkBack skips them. All truly interactive icons (inside `IconButton` composables) already have proper `contentDescription` values using `stringResource()`.

**Alternatives considered:**
- Add descriptions to all 34 instances regardless of context.
- Add descriptions only to icons inside clickable containers.

**Rationale:** Adding descriptions to decorative icons would cause TalkBack to announce redundant information (e.g., "check circle icon" followed by "Completed" text). The current approach matches Google's Compose accessibility guidance: decorative icons use `null`, interactive icons use descriptive strings.

---

## Finding 3.9 -- AppState.swift god object

**Decision:** Doc comment added (already present in codebase) acknowledging the debt and outlining the extraction plan. Full refactoring deferred because it touches auth, game progress, notifications, location, sync, and realtime -- splitting this requires careful dependency analysis and extensive testing across all 22+ screens.

**Alternatives considered:**
- Extract NotificationManager, LocationTracker, and RealtimeManager as separate @Observable classes immediately.
- Keep as-is with no documentation.

**Rationale:** The doc comment (lines 7-16 of AppState.swift) captures the plan for future extraction. Doing the extraction now without ViewModel tests (finding 9.6) risks silent regressions.

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
