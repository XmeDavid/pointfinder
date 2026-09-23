# Repository context

Reviewed against source on 2026-09-12. This is an implementation baseline, not proof of deployment or physical-device parity. Read [vision](vision.md) for intent, [roadmap](roadmap.md) for dependencies, [contracts](contracts.md) for constraints, and [open work](open-work.md) for remaining gaps.

## One application

`web/` owns the browser and Tauri React frontend. `mobile/` is the Tauri shell, consuming `web/dist-native`; native capabilities go through `web/src/platform/`. The legacy SwiftUI and Compose applications remain maintained until device parity is verified. They are not a second target for every new React feature.

`/dashboard` is the account home, combining discovery, saved participation and the workspace-aware organizer library. `/profile` contains account controls and private XP/history. The player map and `/game/:id` operator workspace remain the real gameplay/editing surfaces. See `web/src/App.tsx` for current routing and redirects; do not create another parallel dashboard. Account and operator sessions remain separate stores. Organizer/admin accounts signed in through player entry can enter Organize through a server-authorized exchange for a separate operator session (OW-01); participant accounts receive no operator permission.

Home continuation (OW-30): the last actually opened organizer game is remembered locally by account/workspace, with fresh authorization before its name is shown. Active play stays primary; ended participation yields to organizing. Account-entry organizers use a separate operator-session exchange on opening. Cross-device recency is not implemented.

Mobile is primary for both roles. Use the [visual system](../visual-system/README.md), canonical components and generated tokens. The current-game progress denominator is the player-visible `progress` projection, not the broader base payload, which also carries hidden unlock/geofence data. Unknown progress is omitted. Account deletion belongs in Profile; back navigation is not leaving a game or signing out.

## Implemented foundations

| Area | Current implementation and source |
|---|---|
| Identity | Guest participation, account claiming in place, account-aware join/recovery, persistent account session beside player session, per-phone push registration. `service/PlayerAccountService.java`, `PlayerJoinService.java`, `controller/AccountController.java`; `web/src/app/player/account.ts`, `features/user-home/PlayingGames.tsx`. V74 already makes `players.game_id` NOT NULL. |
| XP and results | Live action XP/levels, saved end results, reset reversals, private profile and end summary. `xp/XpService.java`, `xp/XpLevels.java`; `web/src/features/profile/useAccountProfile.ts`, `features/user-home/ExplorerProfile.tsx`. This is integrated UI, not an untouched backend foundation. |
| Publication and discovery | Opt-in publication, game-name title, authored description/area, code or designated-team admission, search/featured/nearby/pagination. `service/GamePublicationService.java`, `ExploreService.java`; `web/src/features/user-home/DiscoverySection.tsx`. Listing changes have durable events (V79). Admins curate and review listing reports in the admin panel (V86); per-team player limits apply to every join (V85). Lobby admission remains open. |
| Builder | Direct map placement opens the base editor; an empty challenge of submit type `none` can be created and linked. Challenge linking, auto-linking, route ordering, reveals-base editor, variable preview and contextual NFC/QR controls exist. `web/src/features/build/`, `features/build/ContentDrawer.tsx`. Base/challenge drafts persist by account/game/entity and valid edits save in the background. Opening a challenge awaits base saving. Creation/linking remain separate requests, with a durable retry key and backend idempotency for uncertain outcomes (OW-04). Challenge metadata includes the short description; editable accepted-answer chips and variable suggestions sit beside automatic checking (OW-31/02). Setup readiness shows actionable blockers, then Go live directly, with distinct loading/error/retry states (OW-39). Choice questions have an option editor (OW-34); each stage has its own order switch and route editor (OW-40). Navigation is Build/Monitor/Review with Results inside Monitor, and phones use one content-section chooser (OW-32/36). |
| Check-in and route | NFC, QR and foreground location proofs, claim fallback, ordered check-in progression and offline dependencies. `service/CheckInVerificationService.java`, `BaseOrderService.java`; `packages/game-core/src/{arrival,geofence,proof,queue}.ts`. Legacy apps remain NFC-only for the new method UI. |
| Tutorials | Operator practice games, per-account tutorial progress and advanced scenarios; contextual player field guide. `web/src/features/tutorials/`, `features/player/`; `service/TutorialProgressService.java`. “Approved, not planned” in the old specs was stale. |
| Documents | Organizer Content drawer writes/uploads/edits/shares through the existing `ResourceBrowser`; players list/read permitted game documents and open files. `web/src/features/org/ResourceBrowser.tsx`, `features/player/DocumentsScreen.tsx`, `usePlayerDocuments.ts`; `service/ResourceEmbedService.java`. Resources open read-first in `ResourceViewer` with an explicit Edit (OW-08). Player lists refresh on a content-free realtime signal, on reopening and by polling; document bodies are cached, file bytes are not. |
| Realtime and offline | Versioned role-specific snapshots, configuration broadcasts, durable action/media queue and native storage adapters. `service/GameSnapshotService.java`, `websocket/GameEventBroadcaster.java`; `packages/game-core/src/`, `web/src/platform/tauri/`. Native restart restores authorized routes, scoped workspace selections and map cameras; drafts and queued actions remain separate. Reconnect and hardware guarantees need release evidence (OW-38/15). |
| Visual foundation | `design-system/tokens.json`, generator/audits, canonical status/panel/map components, Storybook, `/dev/visual-system`, SwiftUI/Compose previews. The old claim that these foundations do not exist was stale; remaining coverage is in the preview matrix. |

Backend paths abbreviated above are under `backend/src/main/java/com/prayer/pointfinder/`. Client contracts live in `packages/api/src/`; controllers, DTOs, Flyway migrations and focused integration tests define exact schemas. Avoid maintaining a second hand-copied endpoint catalogue.

## Important distinctions

A challenge belongs to a game; an assignment links a challenge to a base and a team. User-facing copy says **Challenge** or **Link challenges**, while domain/API names stay intact. A team member's progress is the team's progress and vice versa. Audit attribution identifies the actor without restricting shared credit to that actor.

Resources already support game/organization scope, files/documents/folders and embeds. Player access currently covers game resources shared explicitly or exposed through the team's check-ins/submissions. Submission exposure does not require approval, and challenge embeds combine ordinary and completion content. `enrichHtmlForPlayer` now accepts the authorized resource map, so nested references cannot grant access on their own. A three-audience policy and completion-based unlocks are still new work, not an existing contract.

Publication is independent of game lifecycle. The UI saves no pinpoint coordinates; the API retains optional coordinates for compatibility. Consequently new publications without coordinates cannot support meaningful nearby/map placement until an area-location contract is chosen. Explore is signed-in discovery; anonymous guests retain team-code joining. Neither path creates independent solo runs.

Organizations/workspaces are not multi-game activities. `ActivityEvent` is an audit record, not an activity container. Existing live games and XP cycles do not establish independent completion, repeated personal runs or permanent trails. Ownership-based organizer quotas are not player participation entitlements.

## Development and release references

Run `./scripts/start-design.sh` for the isolated seeded account/game backend, private object storage and LAN Vite server. Seed/configuration truth lives in that script, `scripts/seed-design.py`, and `docker-compose.design.yml`; keep generated data, screenshots and temporary plans out of tracked docs. HTTP LAN is useful for layout/editing; browser camera/geolocation verification needs a trusted secure context.

Build/test entry points: [root README](../../README.md), [web README](../../web/README.md), [mobile README](../../mobile/README.md). Infrastructure procedures stay beside implementation in [deploy/ha](../../deploy/ha/README.md) and [application acceptance](../../deploy/ha/application-acceptance.md). Deployment, cache and hardware checks are listed in [release checklist](../store-submission/release-checklist.md).

Keep docs to `product/`, `visual-system/`, and `store-submission/`. Product direction is not permission to implement every roadmap item. Consolidate decisions here and open items in one register; completed task transcripts and superseded specs belong in Git history, not another archive folder.
