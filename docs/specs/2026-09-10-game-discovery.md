# Game discovery: publication and Explore (PF-07 / PF-08, backend slice)

Branch `codex/discovery-backend`, based on the completed XP branch. Backend,
migration V77, `packages/api` types/endpoints and integration tests only. The
UI is integrated separately from this contract.

## Decisions (conservative opt-in slice)

- **Unlisted by default.** A game has no publication row until a publisher
  saves one, and is not in Explore until it is published. Listing is separate
  from the `setup → live → ended` lifecycle and never changes game status.
- **Deliberate public summary.** `summary`, `place`, `category` and
  optional approximate `lat`/`lng` are authored separately. The game's own
  `description`, bases, challenges, teams, join codes, resources,
  player lists and locations are never read for or exposed through Explore.
  Coordinates are whatever the publisher types; nothing is derived from bases.
  No media in this slice.
- **The listing title is the game's name (2026-09-11).** There is no separate
  public title: every publication, admin and Explore response derives `title`
  from the current `game.name`, and text search matches it, so renaming the
  game renames the listing without a resave. The request still accepts
  `title` for compatibility (the web client sends `title = game.name`) but it
  is ignored; the `title` column is only a mirror written at save time and
  V78 widens it to 255 so every valid `games.name` (bound 255) fits.
  `place` is an area label rather than a pinpoint; the client sends
  `lat`/`lng` as `null`, and the optional coordinate contract is unchanged.
- **Categories** are stable IDs: `coast`, `forest`, `city`, `other`.
- **Publisher permission** = platform admin, the game's creator, or for an
  organization game a member holding `DELETE_GAMES` (the org's game-admin
  bit, the same one `deleteGame` requires). A co-operator listed in
  `game_operators` can read the publication but cannot save, publish or
  unpublish it. Reads still require normal game access.
- **Featured** is platform-admin only, only on a listed publication, and is
  cleared when the game is unpublished.
- **Admission.** The publisher may designate one existing team of the game as
  the public admission team, or leave it null (listing says "code"). Guest
  code joining is untouched. A new participation from Explore is created only
  when the listing exists, the game is `live` and an admission team is set;
  `setup` games list as upcoming but admit nobody new. Deleting the admission
  team sets the column NULL, which closes admission by itself. Changing the
  admission team never moves existing participants.
- **Public join reuses the account participation contract.** An account that
  already plays the game is recovered with `recoverForAccount` (team kept,
  device moved, guest row on that phone retired, push cleared). A new one
  goes through `joinForAccount` with the admission team's code, so quotas,
  the device-team lock, ended-game rejection and XP reassignment apply
  unchanged. The join code is never returned; the response is the usual
  `PlayerAuthResponse`.
- **Eligibility to browse:** any signed-in account role (`participant`,
  `operator`, `admin`). Player tokens and anonymous callers are refused at
  the filter chain. Guests keep direct joining and do not browse.
- **Explore never answers for an unlisted game by id** (404), so a game id
  cannot be probed.
- **Audit boundary.** The activity-event stream is team-scoped
  (`team_id NOT NULL`) and game-level operator changes such as go-live are
  audited by structured logs plus row attribution, so this slice follows
  that: every save/admission/publish/unpublish/feature/unfeature/join writes
  a `[PUBLICATION]` or `[EXPLORE]` log line with `operation=` and the acting
  `userId`/`adminId`, and the row keeps `published_by/at` and
  `featured_by/at`. No new `ActivityEventType`.
- **Concurrency.** Every publication mutation (save, publish, unpublish,
  feature, unfeature) and the Explore join first take the pessimistic write
  lock on the game row (`GameRepository.findByIdForUpdate`), the same lock
  go-live and end already take, and only then load the publication row. So a
  save or feature can never flush listing/admission state it read before a
  concurrent unpublish committed, and a join can never create a
  participation from listing, admission or status it read before a
  concurrent unpublish, admission closure or end committed. Lock order is
  always game row, then publication row, then whatever the account join
  contract touches; reads (GET) stay unlocked. `TeamService.deleteTeam`
  takes the same game lock first as well: deleting a team touches the team
  row and, through `admission_team_id ON DELETE SET NULL`, the publication
  row before its synchronous state-version bump updates the game row, which
  was the reverse order and could deadlock against a save or join.
- **Not in this slice:** reporting/removal by admins beyond unfeature,
  images, solo participation, independent completion, paid limits, new
  roles, new organization abstractions, nearby search in the database
  (distance is computed in memory over the small eligible set), realtime
  invalidation of listings, and any UI.

## Schema (V77)

`game_publications` (one row per game, `game_id` PK → `games ON DELETE CASCADE`):
`title VARCHAR(120)`, `summary TEXT`, `place VARCHAR(120)`, `lat`, `lng`
(both or neither, CHECK), `category` (CHECK in coast/forest/city/other,
default `other`), `admission_team_id → teams ON DELETE SET NULL`,
`published_at`, `published_by → users ON DELETE SET NULL`, `featured`,
`featured_at`, `featured_by`, `created_at`, `updated_at`. Partial index on
`published_at IS NOT NULL`.

## HTTP contract

All bodies and responses are JSON. Errors use the standard
`{ status, message, errors, timestamp, traceId, code? }` envelope. New codes,
in `ErrorCode.java` order after `RATE_LIMITED`: `PUBLICATION_NOT_ALLOWED`,
`PUBLICATION_TEAM_INVALID`, `PUBLICATION_ADMISSION_CLOSED` (mirrored in
`packages/api/src/errors.ts`).

### Publisher: `/api/games/{gameId}/publication` (operator or admin token)

| Method | Path | Who | Result |
|---|---|---|---|
| GET | `/api/games/{gameId}/publication` | anyone with game access | `GamePublicationResponse`; 404 until a draft exists |
| PUT | `/api/games/{gameId}/publication` | publisher | upserts the draft, listing state untouched; 403 co-operator/stranger |
| POST | `/api/games/{gameId}/publication/publish` | publisher | lists; idempotent; 404 no draft; 400 `PUBLICATION_NOT_ALLOWED` practice or ended game |
| POST | `/api/games/{gameId}/publication/unpublish` | publisher | delists, clears featured, keeps the draft; idempotent |

`GamePublicationRequest`:

```json
{ "title": "Salt, sand & hidden stories", "summary": "A coastal trail for families.",
  "place": "Costa de Lavos", "lat": 40.0797, "lng": -8.8708,
  "category": "coast", "admissionTeamId": "<team uuid or null>" }
```

Validation: `title` optional and ignored (≤ 255 if sent), summary ≤ 2000,
place ≤ 120 (both required, non-blank); lat ∈ [-90, 90] and lng ∈ [-180, 180], both or neither;
`category` one of the four IDs (else 400); `admissionTeamId` must be a team
of this game (else 400 `PUBLICATION_TEAM_INVALID`). Saving for a practice
game is 400 `PUBLICATION_NOT_ALLOWED`. Saving for an ended game is allowed
(draft only); publishing it is not.

`GamePublicationResponse`:

```json
{ "gameId": "…", "gameName": "…", "gameStatus": "live", "organizer": "Lavos Pathfinder",
  "title": "<always gameName>", "summary": "…", "place": "…", "lat": 40.0797, "lng": -8.8708,
  "category": "coast", "admissionTeamId": "…|null", "admissionTeamName": "Falcons|null",
  "listed": true, "publishedAt": "…|null", "publishedById": "…|null", "publishedByName": "…|null",
  "featured": false, "featuredAt": null, "updatedAt": "…" }
```

`organizer` is the organization name for org games, else the creator's name.

### Platform admin: `/api/admin/publications` (admin token)

| Method | Path | Result |
|---|---|---|
| GET | `/api/admin/publications` | `GamePublicationResponse[]`, drafts included, newest update first |
| POST | `/api/admin/publications/{gameId}/feature` | 400 `PUBLICATION_NOT_ALLOWED` unless listed |
| POST | `/api/admin/publications/{gameId}/unfeature` | idempotent |

Operators and participants get 403 from the filter chain.

### Explore: `/api/explore` (participant, operator or admin token; player token → 403; anonymous → 401)

`GET /api/explore/games` with optional query parameters:

| Param | Rule |
|---|---|
| `q` | ≤ 100 chars; case-insensitive substring of the game name (the title), place or summary |
| `category` | one of the four IDs; unknown → 400 |
| `featured` | `true` narrows to curated listings |
| `lat`, `lng` | together, in range; adds `distanceKm` and sorts nearest first (no coordinates last) |
| `radiusKm` | needs lat/lng; 0 < r ≤ 500; drops listings without coordinates or farther away |
| `page` | 0-based, ≥ 0; the offset is computed in long arithmetic, so a page past the end (up to `Integer.MAX_VALUE`) is an empty page, never an overflow |
| `size` | 1..50, default 20 |

Default order: featured first, then `live` before `setup`, then earliest
`startDate`, then newest `publishedAt`. Only listed games in `setup` or
`live` that are not practice games appear; an ended game disappears without
anyone touching its publication and reappears if it returns to setup.

Response `ExplorePageResponse`:

```json
{ "items": [ {
    "gameId": "…", "title": "…", "summary": "…", "place": "…", "lat": 40.0797, "lng": -8.8708,
    "category": "coast", "organizer": "Lavos Pathfinder", "gameStatus": "live",
    "admission": "open|code", "joinable": true, "featured": false,
    "startDate": null, "endDate": null, "publishedAt": "…", "distanceKm": 1.2,
    "joined": false, "playerId": null } ],
  "page": 0, "size": 20, "total": 1, "hasMore": false }
```

`admission` is `open` when an admission team is designated. `joinable` is
`admission == open && gameStatus == live`; a saved participation always
recovers regardless. `joined`/`playerId` describe the caller only.

`GET /api/explore/games/{gameId}` → one `ExploreGameResponse` (no
`distanceKm`); 404 when not currently listed.

`POST /api/explore/games/{gameId}/join` body `{ "displayName", "deviceId" }`,
rate limited like `/api/account/join` (429 `RATE_LIMITED`):

| Situation | Result |
|---|---|
| Caller already participates | 200 `PlayerAuthResponse`, same player and team, device moved (account recovery) |
| Listed, live, admission team set, new caller | 200 `PlayerAuthResponse` on that team, row linked to the account |
| Admission team null or deleted | 400 `PUBLICATION_ADMISSION_CLOSED` |
| Game in `setup` | 400 `PUBLICATION_ADMISSION_CLOSED` |
| Not listed / unpublished / ended | 404 |
| Phone already a guest on another team here | 400 `DEVICE_ALREADY_IN_DIFFERENT_TEAM` (unchanged rule) |
| Quota, ended mid-flight | existing account-join errors |

### `packages/api`

Types `PublicationCategory`, `PublicationAdmission`, `GamePublicationRequest`,
`GamePublicationResponse`, `ExploreQuery`, `ExploreGameResponse`,
`ExplorePageResponse`, `ExploreJoinRequest`. Endpoints `api.publication.{get,
save, publish, unpublish, admin.list, admin.feature, admin.unfeature}` and
`api.explore.{list(query), get, join}`.

## Tests and results (2026-09-10, Docker)

`docker compose -f docker-compose.test.yml run --rm backend-test ./gradlew test --no-daemon --tests '*GameDiscoveryIntegrationTest' --tests '*SecurityRulesTest' --tests '*AccountParticipationIntegrationTest'`

| Class | Tests | Result |
|---|---|---|
| `integration.GameDiscoveryIntegrationTest` (new) | 7 | pass |
| `integration.GameDiscoveryConcurrencyTest` (new, review fixes) | 5 | pass |
| `controller.SecurityRulesTest` (+1: explore roles, admin tree) | 16 | pass |
| `integration.AccountParticipationIntegrationTest` (regression) | 6 | pass |

Scenarios: unlisted-by-default and no private leakage (description, team
names, join codes absent; unlisted id → 404); publisher vs co-operator vs
stranger vs admin; featured admin-only, draft cannot be featured, unpublish
clears it; summary validation (foreign team, unknown team, half coordinates,
bad category, blank title, practice game, ended game); filters, near-me
distance and radius, bounded pagination; public join create → recover on a
second phone → admission disabled → team deleted → setup game → unpublished;
device already a guest on another team.

Review fix run (concurrency, paging overflow): `docker compose -f docker-compose.test.yml run --rm backend-test ./gradlew test --no-daemon --tests '*GameDiscoveryConcurrencyTest' --tests '*GameDiscoveryIntegrationTest' --tests '*AccountParticipationIntegrationTest' --tests '*GameStatusTransitionsTest'` → all pass. Each concurrency test holds the game row lock in a transaction that has already unpublished / ended / closed admission but not committed, then runs the competing save or join on a second thread: the save waits and does not restore `published_at`; the join waits and is refused (404 after end, `PUBLICATION_ADMISSION_CLOSED` after closure) with no participation row; no deadlocks (single lock, fixed order). The rerun with the `page=2147483647&size=20` case (`GameDiscoveryIntegrationTest`, 7) and `GameDiscoveryConcurrencyTest` (3) also passes.

Deletion review run (2026-09-11): `docker compose -f docker-compose.test.yml run --rm backend-test ./gradlew test --no-daemon --tests '*GameDiscoveryConcurrencyTest' --tests '*GameDiscoveryIntegrationTest' --tests '*TeamServiceTest' --tests '*TeamControllerTest' --tests '*OperatorRescueEndpointsTest' --tests '*AuditFoundationTest'` → all pass (5 + 7 + 4 + 14 + 17 + 6). The two new cases run the real `deleteTeam` of the admission team inside the held transaction: the join waits and is refused with `PUBLICATION_ADMISSION_CLOSED` without deadlocking, and a save naming the deleted team waits and is refused with `PUBLICATION_TEAM_INVALID`; the listing stays published with `admissionTeamId` null.

`docker compose -f docker-compose.test.yml run --rm frontend-test sh -lc "bun install --frozen-lockfile && bun run --cwd packages/api typecheck && bun run --cwd packages/api test && bun run --cwd web test src/__tests__/error-codes.sync.test.ts"` → all pass (the sync test proves `errors.ts` matches `ErrorCode.java`).

Not run: the full backend suite, web lint/typecheck of the UI tree (root's),
the E2E smoke, and any device check. Known limit: the `ExploreService`
filters, sorts and pages in memory over every listed game, which is fine at
the current scale and should move into the query before listings reach the
thousands.

Title-from-game-name run (2026-09-11): `docker compose -f docker-compose.test.yml run --rm backend-test ./gradlew test --no-daemon --tests '*GameDiscoveryIntegrationTest' --tests '*GameDiscoveryConcurrencyTest' --tests '*SecurityRulesTest' --tests '*PlayerJoinRequestValidationTest'` → see the session report. `GameDiscoveryIntegrationTest` gains `listingTitleFollowsTheGameNameAfterARename` (publication, Explore list/detail and admin list all show the new name after a rename with no resave; search matches the new name and not the old; a request without a title or with a different title is accepted and ignored; a title over 255 characters is 400; `gameNamesLongerThanTheOldTitleBoundAreSavedAndReturnedInFull` saves and lists a game name longer than the old 120 bound in full). The concurrency tests now use the summary as their write marker.
