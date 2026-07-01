# Audit Decisions Log

Design decisions made while resolving findings from `docs/full-codebase-audit-2026-03-21.md`.

---

## Finding 10.11 -- User.java PushPlatform default

**Decision:** Remove `PushPlatform.ios` default from `User.java` entity and create migration V58 to drop `NOT NULL` + default on the `users.push_platform` column.

**Alternatives considered:**
- Keep the default and add explicit null handling in OperatorPushNotificationService
- Change default to a sentinel value (e.g. `UNKNOWN`)

**Rationale:** Mirrors the Player entity fix (V30 + V56). The `sendByPlatform` method in `OperatorPushNotificationService` already correctly handles null pushPlatform by skipping those users (null matches neither `== PushPlatform.ios` nor `== PushPlatform.android`). Users who register push tokens always set the platform explicitly via `UserService.updatePushToken`, so only users without push tokens would have null -- and those are correctly skipped anyway since they have no token to send to.

---

## Finding 6.16 -- Remaining contentDescription = null instances

**Decision:** Keep the 3 remaining `contentDescription = null` instances (PlayerGameplayScreens.kt:138, :211 and SetupHubScreen.kt:434) as-is.

**Alternatives considered:**
- Add string resource descriptions to all Icon composables

**Rationale:** All 3 are decorative icons inside Buttons that already have explicit Text labels providing the accessible name. Per Compose accessibility guidelines, setting `contentDescription = null` is the correct approach for decorative icons within labeled containers -- adding a description would cause screen readers to read redundant information (icon description + button text).

---

## Finding 12.3 -- Broadcast code brute-force mitigation

**Decision:** Rely on nginx rate limiting (10r/m per IP) combined with the widened broadcast code (10 chars, 28-char alphabet) rather than adding application-level rate limiting.

**Alternatives considered:**
- Add a Spring-level rate limiter (e.g. Bucket4j or custom service similar to PlayerJoinRateLimiter)
- Require lightweight authentication (e.g. a short-lived viewer token)

**Rationale:** V57 widened the broadcast code from 6 to 10 characters, increasing the search space from ~480M to ~280 trillion combinations. The nginx `broadcast_limit` zone (10r/m per IP, burst=5) makes enumeration impractical even from distributed sources given the code entropy. Application-level rate limiting would add complexity for marginal benefit. If the threat model changes (e.g. targeted attacks with botnets), the next step would be adding a CAPTCHA or requiring a lightweight viewer token.

---

## Finding 10.9 -- StringListJsonConverter null safety

**Decision:** Add a null guard after Jackson deserialization in `convertToEntityAttribute` so the converter never returns null, even if the database column contains the JSON literal `null`.

**Alternatives considered:**
- Also change `convertToDatabaseColumn` to write `"[]"` instead of SQL NULL for null input
- Leave as-is since callers already handle nulls

**Rationale:** The converter's contract should be: always return a non-null list. The `convertToEntityAttribute` already returns `Collections.emptyList()` for SQL NULL and blank strings, but Jackson can deserialize the JSON string `"null"` to Java null, which would slip through. Adding a post-deserialization null check makes the contract airtight without changing write behavior (which could affect queries that check `IS NULL`).

---

## Finding 3.9 -- AppState God Object

**Decision:** Accept the current extension-based decomposition as sufficient.

**Alternatives considered:**
- Extract subsystems into dedicated @Observable classes (LocationTracker, NotificationManager, RealtimeClient, etc.)

**Rationale:** AppState is already split across 5 files (AppState.swift + 4 extensions: Auth, GameActions, Notifications, Snapshot) with clear MARK sections. The main file is 256 lines. While `AppState+GameActions.swift` at 666 lines could benefit from further extraction, this is a significant architectural change that affects the entire iOS app's dependency graph. The current structure is documented with a tech-debt comment (lines 7-16 of AppState.swift) and works correctly.
