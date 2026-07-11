# Product surface migration inventory

Status values: `foundation`, `in progress`, `not started`, `verified`. This inventory is intentionally honest: adding shared foundations does not mark a journey redesigned.

| Mode | Journey / production surface | Canonical dependencies | Migration status |
|---|---|---|---|
| Public | Landing, product explanation, FAQ/legal | tokens, buttons, editorial layout | in progress |
| Public | Live/broadcast viewer | map, game status, loading/error | in progress |
| Auth | Login, registration, recovery, invitations, onboarding | form primitives, banners, role choice | in progress |
| Player field | Join, map/orient, scan/check-in, solve, submit | map markers, NFC prompt, sync queue, result | in progress |
| Operator setup | Library and map-centered builder | readiness, inspector, tables, lifecycle | in progress |
| Operator command | Live map, risk, team/base inspection | stats, activity, markers, rescue actions | in progress |
| Review | Submission queue and decision history | review card, media, status, audit context | in progress |
| Results | Standings, breakdowns, exports | stats, tables, charts | in progress |
| Organization | Teams, resources, notifications, profile | forms, rows, tables, states | in progress |
| Billing/admin | Billing, permissions, administration | banners, tables, dialogs | in progress |
| Native parity | iOS player/operator journeys | generated adapter, native components/previews | in progress |
| Native parity | Android player/operator journeys | shared `core:designsystem`, native components/previews | in progress |

Owners are assigned by the active delivery team per journey. Update this table only after the preview matrix and journey checks pass.

## 2026-07-11 migration slice

- Authenticated web feature code now uses semantic Tailwind roles for operational status, scrims, panels, overlays, billing/admin badges, results, setup lifecycle warnings, and rescue dialogs.
- Public FAQ/privacy and broadcast shells consume semantic theme roles while retaining their editorial/broadcast layouts.
- Android auth, player, operator, and map status consumers now share `core:designsystem`; existing user-configurable tag/team palettes remain intentional data, not UI tokens.
- iOS auth, maps, rescue actions, and shared theme aliases consume generated semantic roles.
- The iOS and Android player live loop now composes shared native NFC prompts, field-status banners, and submission outcomes with matching light/dark preview fixtures. Existing offline, navigation, localization, and automation contracts are unchanged.
- Player maps now share semantic overlay headers, scroll-safe localized legends, dark/light marker meanings, and reusable locked/offline/empty detail states. Android no longer exposes challenge points in its player base sheet.
- Native operator command, review, and rescue surfaces now share semantic stat tiles, connectivity banners, submission cards, status/override badges, scroll-safe map legends, and wrapping rescue actions. Review override confirmations, haptics, audit metadata, and rescue API boundaries are unchanged.
- Native operator setup now uses a persistent five-part readiness workspace, semantic resource rows, an explicit spatial summary linked to the existing map/base editor, and a shared launch control. Existing warning conditions, management routes, launch confirmation, realtime status transition, API contract, and automation identifiers are unchanged.
- Native operator game libraries now share semantic lifecycle summaries, game cards, workspace selectors, long-copy behavior, and empty/error handling. Workspace selection, invitation polling/deep links, game creation, refresh, logout, and `create-game-btn` behavior are unchanged.
- Native teams, bases, challenges, and stages now share dense semantic resource rows, list summaries, long-copy wrapping, NFC/visibility/answer/transition states, and team join-code controls. User-defined team/tag colors, filters, clipboard feedback, realtime refresh, editors, creation routes, and automation identifiers are unchanged.
- Native assignments now share semantic grouped summaries and assignment rows, while team/challenge variable editors expose the same completeness readout. Duplicate-assignment validation, picker eligibility, destructive confirmation/haptics, variable-key validation, normalized team values, save semantics, and automation identifiers are unchanged.
- Native base, challenge, and stage editors now expose persistent semantic context and readiness summaries while retaining map gestures, NFC writing, variable-aware rich text, linking rules, scheduling/trigger controls, validation, destructive confirmation, API behavior, and automation identifiers.
- Web results, public broadcast, billing, profile, and administration now compose canonical tabs, buttons, inputs, panels, responsive stat summaries, status badges, and empty/loading states. Broadcast polling/realtime behavior, exports, audit downloads, subscription mutations, and admin permission boundaries are unchanged.
- Native notifications and organization management now share semantic history and workspace summaries. Android organization actions are localized in English, Portuguese, and German; invitations, permissions, destructive confirmation, refresh, API behavior, and automation identifiers are unchanged.
- Full on-device screenshot/E2E sign-off is still required before the player row becomes `verified`.
