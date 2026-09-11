# Unified user experience — mobile-first iteration

Status: active work with the product owner on `codex/unified-user-experience`. These changes are not a claim of release or device parity.

Mobile is primary for both playing and organizing, including creating and operating live games. Desktop expands the same flows. Codex owns the UI; Claude Fable may implement scoped backend work in parallel. UI review by Claude remains deferred until the owner and Codex have finished iterating.

## One application

`/dashboard` is the canonical account home. Home combines the current game with discovery; Play lists account participations and recovers them through the existing API; Organize contains the original dashboard's workspace-aware games, quotas, invites, import and creation controls. The avatar opens the existing `/profile`, extended with live XP and team results. `/home`, `/play`, `/organize`, `/me`, `/explore` and the old development entry redirect into these existing destinations. There is no second player map or operator workspace: playing uses `/`, editing uses `/game/:id`.

Use canonical branding, semantic tokens, buttons, panels, markers, feedback, dialogs and tour components. Scenery connects Home with the public landing page. The discovery map is optional, location is requested only after Near me, and the mobile navigation has Home, Play and Organize. No prototype notices appear in product copy.

The current-game card only counts bases in the canonical player snapshot's `progress` collection. Its denominator means currently visible/discovered bases, not every hidden base delivered in game data. Unknown progress is omitted. Game-defined points are never summed into platform XP. Profile data comes from the XP backend, with action XP visible while playing; finalized team results belong to every member. The ended-game card handles pending/finalized/invalidated rewards.

## Player and operator continuity

The player map includes a return to Play, a legend that fades after initial reading and can be recalled, and a contextual field guide. It reuses Spotlight/CoachBubble, highlights map/base/logbook/documents/messages/settings/location/legend/sync/back controls and uses the existing character artwork. It never performs a game action. The welcome offer and Settings help open this guide in the game.

Registered account deletion lives in Profile, not game settings. Game settings retain participation linking and existing recovery/queue boundaries. Guest participation remains usable without an account; the guest dashboard offers saving progress. Back navigation does not sign out or delete a participation.

The existing operator editor now puts a base's challenge before coordinates and tag controls. Location/check-in, visibility and optional challenge rules expand where needed, with configured optional rules visible. Following a base's challenge retains a return path to that base. The challenge library, assignment grid and team-specific variants remain available in the same flow.

Placing a base on the map immediately creates it and opens the existing base editor. New Base in the content drawer returns to map placement. The Challenge section offers Create empty challenge, creating a blank challenge of type none and linking it for every team before opening its editor. An acknowledged challenge is retained when linking fails, so retry does not duplicate it. These remain separate API operations; an unacknowledged creation response can still require reconciliation. Readiness rows open the relevant editor; Go Live stays in Build until the server confirms success, with inline error/retry feedback.

## Local account and games

Run `./scripts/start-design.sh` with Docker, Python 3 and Bun. It starts only the isolated `pointfinder-design` Compose project and its persistent Postgres volume. Backend binds loopback port 8188; Vite proxies API/socket/upload requests and listens on the local network at port 5188. Stop Vite with Ctrl-C and services with `docker compose -f docker-compose.design.yml stop`.

Local account: `david@pointfinder.local` / `Trailhead2026!`. Automatic local sign-in requires both development mode and `PF_LOCAL_DESIGN=1`. Production builds do not activate it. Mail and push delivery are disabled. No production accounts or services are used.

The club owns the live discovery trails; David owns Autumn camp (live) and River expedition (setup). These games have real QR bases, assigned challenges and teams. Lighthouse has a shared trail guide. Along the river is a completed historical game with real teammate actions and finalized XP. Rerunning the seed preserves edits and does not move David's active lighthouse device. The ignored `data/design/catalog.json` remembers seed IDs and preserves edits. The coast, forest and city trails have real opt-in publications; a separate local curator account features the first two. David remains an operator.

Continue playing, participation recovery, documents, operator editing, profile and discovery use normal APIs. Home queries `/api/explore/games` with search, featured, bounded pagination and an optional nearby query after an explicit location request. Generic category artwork is decorative; private base totals and join codes never appear in discovery. Guests keep direct joining and see an account invitation instead of listings. HTTP LAN supports joining/editing; trusted HTTPS is needed to verify browser camera/geolocation on a phone.

## Remaining integration and verification boundaries

- PF-07/08 now have a working event-game slice: existing Game Settings contains a deliberate public title/summary/place, optional approximate map location and code-only or designated-team admission. Save, publish and unpublish use the reviewed backend. Setup listings show upcoming; live listings can admit accounts or recover existing participants. Existing games stay unlisted. Admin curation currently has an API but no new administration UI. Reporting/removal moderation, uploaded artwork and database-scale nearby queries remain future work. See the [discovery contract](2026-09-10-game-discovery.md).
- Complete account-session/operator-session convergence for accounts that signed in exclusively through the player entry. No participant role receives organizer permissions through this UI. The established operator session already supports playing and organizing concurrently.
- Preserve pending actions and last-device recovery semantics during switching, and verify native secure storage, push and offline reconnection on physical devices. Do not infer these from browser builds.
- Solo participation, independent completion, persistent runs, entitlements and multi-game activities remain separate roadmap slices. This composition creates places for them without enabling unsupported settings.

## Evidence

Focused Vitest covers map legend recall, contextual intro, empty-challenge link retry, editor behavior, readiness, shared coach controls, settings/account boundaries and publication permissions/error recovery. Backend XP tests cover live accrual, finalization, reset/reopen and frozen organizer factors. Playwright uses the isolated backend to cover the linked mobile journey, documents, historical profile, discovery/filtering/location and the base placement/editor. A real-API smoke creates a disposable game and exercises save without publishing, publish, discovery, setup admission, live account joining and unpublish, then deletes the test game. The responsive matrix covers 360/390/768/1280 px, EN/PT/DE, both themes and reduced motion. Screenshots live in `artifacts/user-home-review/` (`v4-`, publication `v5-`). The 32-case browser suite passed; the additional offline discovery/reconnect smoke passed separately (33 distinct scenarios). Typecheck, lint, focused Vitest, translation parity, browser/native builds and generated-token checks are required for this slice; the advisory design audit still reports 19 existing findings.

Run `bun run typecheck`, `bun run lint`, focused `bun run test`, `bunx playwright test --config playwright.user-home.config.ts`, `bun run build` and `bun run build:native` from `web/`. The combined XP/discovery integration run passed after importing the backend work: `XpLedgerIntegrationTest`, `GameDiscoveryIntegrationTest` and `GameDiscoveryConcurrencyTest`. Browser/native builds do not establish physical-device journey parity.

Operator editor refinement (September 11): points and notes remain visible, optional disclosures use compact summaries, automatic text checking uses a switch and hides inactive accepted answers without clearing them, and QR row printing targets one code. Focused unit coverage and a disposable-game browser journey verify direct placement and blank challenge creation; v6 editor captures cover mobile/desktop and both themes.

Publication refinement (September 11): Make it public is an explicit switch saved with the listing form. The title comes from the game name; Description and Place or area remain authored publication text. The form no longer asks for coordinates and saves null coordinates. Existing stored coordinates remain until that listing is saved. Admission still uses the current team/code contract pending the separate lobby proposal. Base QR previews open the full-screen image viewer and save/share a PNG; NFC controls are contextual, with browser capability guidance.

Verification for this refinement: focused editor/publication/QR tests, EN/PT/DE
catalog checks, typecheck, lint, browser and native builds, and real-API browser
smokes passed. Publication captures cover mobile/desktop and both themes (`v7-`).
Backend publication/name/search compatibility, long names and concurrency are
covered by the focused 32-test run. Physical NFC writing and phone photo saving
still require device verification; browser PNG download was exercised end to end.

Organizer documents (September 11): the existing content drawer now includes
Documents and reuses ResourceBrowser with the game scope. Organizers can write,
name, edit and upload resources, then explicitly share them with players. The
mobile browser has visible actions and sharing switches; failed saves retain
editor contents. Player Documents refreshes on reopening. A real-API smoke creates
and shares a document and uploaded file, reads the document as a player and
verifies downloaded bytes. The local design stack now has a private MinIO bucket
(initialized by scripts/init-design-storage.py); PF_DESIGN_HOST controls its
phone-reachable address. This adds no new resource permissions or unlock policy.
