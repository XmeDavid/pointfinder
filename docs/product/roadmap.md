# Planned product capabilities

Status: proposed sequencing, with no dates or implementation commitment. See the [vision](vision.md) for product intent and [repository context](repository-context.md) for the code baseline updated on 2026-09-10. Work present on the redesign branch is identified separately from a released user journey.

These are broad capabilities, not an executable task queue. "Foundation exists" means there is relevant code to extend; it does not establish full behavior, platform parity, or release readiness. Before starting a capability, recheck current code, choose one useful slice, resolve its blocking product questions, and write a focused specification. Keep concrete near-term maintenance in the root `TODO`.

## Dependency order

There are two useful tracks. Neither needs to wait for the entire other track:

1. Identity and participation: link accounts to existing participation → support solo joining → add independent run completion and durable results → support persistent challenges.
2. Activity information: extend existing resources/documents → unify participant access and unlocks → introduce shared activity organization when multiple games need it.

Discovery needs account-aware joining, a publication/access contract, and an operable public publishing process. It can start with traditional event games; personal completion is needed before promoting independently completable persistent challenges. Global challenges and limited branding can ship separately. Participation monetization comes after participation has a well-defined lifecycle.

## Capability register

| ID | Capability | Starting point | Smallest useful direction | Dependencies / decision gates |
|---|---|---|---|---|
| PF-01 | Persistent account participation | **Existing backend and shared-frontend foundation (2026-09-10)**: `players.user_id` (+ `game_id`, NOT NULL since V74), one participation per account per game, credential/session recovery, account-aware join, `GET /api/account/me`, and an Account badge in the operator roster. Multi-device push uses `player_push_tokens`, one row per phone | Integrate saved participations into the common mobile experience and retain recovery across devices; private XP/results use the PF-03 foundation | Decided: link in place, recovery moves `device_id` but retains per-phone push registrations, `participant` role, verification never gates play; no legacy-native parity claim |
| PF-02 | Guest-to-account claiming | **Two existing slices (2026-09-10)**: claiming preserves the participation; the shared player app also keeps a separate account session, supports account management, joins through `/api/account/join`, and recovers saved games by session. Invites can reclaim an unverified parked address | Unify navigation and account controls while preserving simultaneous account/player sessions; playing/organizing integration is underway on this branch, not a released parity claim | Decided: account session survives until sign-out or 30 days idle; reject-then-recover on conflicts, never merge rows; account deletion belongs to account management |
| PF-03 | Player history and profiles | **Backend foundation imported on this branch (2026-09-10)**: XP ledger, private `/api/account/profile`, player `/reward`, and operator `/end-summary`; action XP/levels advance live, placement and completion awards finalize at game end. Game points remain absent from player APIs | Integrate the real private profile, live XP and ended-game results into the shared mobile UI. Use `/account/me` for all participations: XP history contains award-bearing cycles only | Frontend integration and journey verification remain in progress; preserve team credit, reset/reversal and deletion semantics. Solo/independent runs still need PF-04/05; existing shared-game results do not |
| PF-04 | Solo participation | Core gameplay is team-oriented | Common join flow creates or recovers an individual competitor without team setup | PF-01 identity/recovery contract for registered users; preserve guests; assignment and variable initialization, readiness rules, leaderboard and quota semantics |
| PF-05 | Independent participation completion | Shared game lifecycle and team progress exist | A team can complete a defined trail while others continue | Explicit run identity/status, completion condition and result finalization; offline/review/leave/reset policy; solo is not a prerequisite |
| PF-06 | Persistent challenges | Live games and scheduling provide a foundation | A maintained game admits new runs over time and preserves prior results | PF-05; late-join assignments, rule/content edits, closure, retention and replay policy; PF-04 for solo trails |
| PF-07 | Publication and admission | **Event-game slice on the redesign branch (2026-09-10)**: explicit publication summary, publish/unpublish, creator/admin/org-game-admin permissions and existing Game Settings controls; unlisted by default | Validate publisher experience and admission choices with the owner; listing never changes game status | Designate one existing team for direct account joining or require codes; moderation/removal, richer media and independent-run admission remain future work |
| PF-08 | Explore | **Event-game slice on the redesign branch (2026-09-10)**: Home queries authenticated published listings, search, featured, optional map, nearby and paginated results; joining reuses account participation/recovery | Iterate mobile discovery and real joining before release | PF-01/PF-07 contracts apply; nearby sorting is currently in memory; PF-06 still needed for independently completable persistent listings; physical-device verification remains |
| PF-09 | Player participation entitlements | Existing quotas govern organizer/workspace capacity | Only after approval, explain and enforce a distinct account participation allowance | PF-01/05 lifecycle semantics; settle free/paid limits, guests, reservations, leaving, claims, downgrade and sponsorship rules |
| PF-10 | Activity files and documents | Game/org resources, folders, file uploads and rich documents exist; **first slice shipped 2026-09-10**: the player app lists and opens shared files and documents (see below) | Next: organization-scoped resources for org games, and realtime refresh when sharing changes | Verify current player exposure, content authorization and offline behavior; no new activity entity required |
| PF-11 | Consistent audiences and resource unlocks | Sharing and exposure through base/challenge embeds exist, without a complete three-audience policy | Make one file or document reliably unlock for a team through a defined challenge condition | PF-10 access contract; lists/downloads/embeds/snapshots must agree; clarify existing exposure semantics; reuse run identity for solo |
| PF-12 | Global challenges | Challenges are game-owned; play is tied to base/assignment/check-in paths | An always-available game objective using existing submissions and scoring | Explicit availability independent of a base, presence rules and authorization; later stage/time/condition gates; activity-wide scope can wait |
| PF-13 | Multi-game activities | Organizations/workspaces and game stages exist | Group several games with shared participant information for a real camp workflow | Clarify activity ownership, membership, inherited permissions/content and game relationships; reuse PF-10/11; an organization is not an activity |
| PF-14 | Activity branding | Canonical PointFinder visual system exists | Add an event logo/name to a small set of useful surfaces | Read visual-system and brand guidance; choose game/activity scope, resource access, image handling and accessible fallbacks; accents later |

## Suggested first steps

Choose one of these when implementation is requested; this document does not start them automatically.

**Existing identity slices (2026-09-10, PF-01 + PF-02).** A guest can link a new or existing account while keeping the player ID, token, queue, caches and shared team progress, then recover the participation on another phone. The second slice already adds a persistent account session beside the player session, account-aware joining and recovery from the participation list. Guest joining remains available. See the [participation contract](../specs/2026-09-10-account-participation.md) and [account-session contract](../specs/2026-09-10-account-session.md). Legacy native parity and a completed unified playing/organizing journey are not established by these foundations.

**Current frontend step: integrate PF-01/02/03 into the existing app.** Build the common account navigation, saved-game recovery and private profile from those contracts. The XP backend now exists; frontend integration on the redesign branch must still verify guest-to-account continuity, role boundaries, live refresh, reset/reopen behavior and useful empty/error/offline states. A new account starts at level 0. Action XP advances its visible level during play; only finalized XP determines the creator factor frozen when another game goes live. Placements stay finalized-only. This does not enable public profiles, solo participation or independent completion. The separately scoped PF-07/08 event-game slice now connects discovery within Home to the publication backend; see the [discovery contract](../specs/2026-09-10-game-discovery.md).

**Independent camp benefit: PF-10.** Review the existing file/document journey and choose its most useful missing piece. Extend that working system, then add PF-11 when the access and unlock behavior is specified. This advances the broader activity experience without waiting for identity work or a multi-game container.

*Shipped slice (2026-09-10):* a Documents screen in the player app (web and Tauri) reached from the map header. It lists game-scoped resources shared with players plus resources embedded in bases the team checked in at and challenges it submitted to, opens files through the platform opener and documents inline, and keeps the last list cached for offline reading. The player download endpoint now enforces the same team-aware visibility rule as the list. Not part of this slice: a three-audience policy, unlock-by-completion semantics (PF-11), organization-scoped resources, realtime invalidation on share changes, and the legacy native apps.

**Useful frontend slice with existing contracts: game information (PF-10).** Make the current game's rules, schedule and documents easy to reach from the unified playing experience, reusing `DocumentsScreen`, its cached player-visible resource list and the existing organizer resource browser. This adds a useful camp feature without a public listing API or a new activity entity. Keep file downloads distinct from cached document content, and preserve current check-in/submission exposure semantics until PF-11 is specified.

**Next mechanics step: PF-04 or PF-05 according to the first real use case.** A solo event needs individual joining; a permanent group trail needs independent completion. Keeping these separate avoids implementing both just to deliver one. Revisit go-live readiness explicitly for each new mode rather than weakening the traditional game checks globally.

## Completion evidence for future slices

A capability is only marked delivered when its intended user journey works, including relevant authorization, offline/sync, audit, localization, accessibility, and browser/native behavior. Follow the repository's focused testing and platform requirements. Foundation-only work should be labeled as such, with the remaining journey called out.

When delivery changes the baseline, update this register and the repository-context note. Keep stable IDs for discussion, link the implementation specification or PR, and state which slice shipped. Do not mark an entire capability complete because a table, API, or component now exists.

**PF-07 admission direction (2026-09-11):** keep visibility independent from
joining. Candidate steps are team capacity, a shared lobby with operator
placement, automatic placement, and player team choice. Legacy team codes and
QR links remain valid. The [admission proposal](../specs/2026-09-11-game-admission-proposal.md)
records dependencies and unresolved policies, especially mid-game moves and
queued actions; these capabilities are not implemented by the publication UI.
