# Planned product capabilities

Updated 2026-09-12. Direction and dependencies, with no dates or authorization to implement everything. “Implemented slice” means present in this checkout; it is not a release or device-parity claim. See [vision](vision.md), [repository context](repository-context.md), and the consolidated [open-work register](open-work.md).

## Dependency order

Identity → solo joining and/or independent team completion → persistent runs. Solo and independent completion are separate choices. Documents → consistent audiences/unlocks → multi-game activities when a real use case needs them. Discovery can serve conventional event games now; persistent listings need independent completion. Player monetization follows a defined participation lifecycle and explicit approval.

## Capability register

| ID | Capability | Current baseline | Next useful direction / gate |
|---|---|---|---|
| PF-01 | Persistent account participation | Backend and shared frontend implemented: account-aware joining, saved games, recovery, per-phone push | Session-entry continuity implemented (OW-01); verify installed-device recovery without losing queued/team progress |
| PF-02 | Guest-to-account claiming | Linking in place and a separate persistent account session implemented | Preserve guests, conflict recovery and account/player separation; no row merging or verification gate on play |
| PF-03 | Player history and profiles | Live action XP/levels, private profile, finalized results, reset reversals and frontend integration implemented | Verify full lifecycle/recovery journeys; public profiles, achievements and operator rewards are not included |
| PF-04 | Solo participation | Team-oriented gameplay only | Individual competitor join with assignments/variables/readiness/quota rules defined; preserve guest joining |
| PF-05 | Independent participation completion | Shared game end and XP cycles exist | Explicit run identity, completion conditions, review/offline cutoff, leave/reset/replay policy; solo is not required |
| PF-06 | Persistent challenges | Scheduling and long-lived live games are foundations | PF-05; new runs, late joins, content changes, closure and durable results; PF-04 only for solo trails |
| PF-07 | Publication and admission | Opt-in listings, publisher controls, direct account admission to one existing team and per-team player limits implemented | Lobby, operator/automatic/player-choice placement (OW-05); visibility stays independent |
| PF-08 | Explore | Signed-in featured/search/nearby/map/pagination and joining, admin curation and listing reports implemented | Moderation hold, listing artwork, area location, scalable queries and refresh (OW-06/07); persistent offerings need PF-06 |
| PF-09 | Player participation entitlements | Organizer/workspace quotas exist; player allowance does not | Explicit approval; define guest/claim/leave/reservation/downgrade/sponsorship rules using PF-01/05 |
| PF-10 | Activity files and documents | Game-scoped organizer authoring/sharing, read-first viewer/editor, live refresh and player documents implemented | Organization resources for org games, deliberate offline-file policy (OW-08) |
| PF-11 | Consistent audiences and resource unlocks | Shared flag plus check-in/submission embeds; authorized nested enrichment exists | Define audiences and completion-based access consistently across list/content/download/cache paths (OW-09) |
| PF-12 | Global challenges | Challenges are game-owned but availability/submission is base-linked | Base-independent objective, presence and authorization; later stage/time gates |
| PF-13 | Multi-game activities | Organizations and game stages exist | A real camp use case; ownership, membership, shared information and inherited permissions; reuse PF-10/11 |
| PF-14 | Activity branding | Canonical PointFinder branding exists | Event identity scope, permitted assets and accessible fallbacks; distinguish event customization from app-brand rollout |
| PF-15 | Quizzes and shared question formats | Text/file/none and single/multiple-choice challenges and rich content exist; multi-question quiz attempts do not | Multiple choice (OW-34) → base-bound scored quiz (OW-35) → game-wide availability via PF-12 and completion unlocks. Define team attempts, grading/retries/pass thresholds and game-point/XP effects; use OW-04/38 draft/resume foundations |

The owner's testing feedback is consolidated in the open-work register with a proposed delivery order. Stage-scoped ordering and trigger activation (OW-40/21) support mixed exploratory/linear games; content language (OW-33) improves discovery without changing interface localization. Do not infer that introducing a setting or database field completes a capability. Update the baseline and remove completed open items when the intended journey and relevant checks pass.
