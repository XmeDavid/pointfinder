# PointFinder product vision

Status: long-term product direction, not an implementation specification or release commitment.
Reviewed against the repository on 2026-09-09. Based on the product owner's spoken vision, subsequently transcribed and clarified with project context.

## Purpose

PointFinder should grow from a platform for running location-based games into a platform for creating, operating, discovering, and participating in location-based activities. Games remain the core. Persistent identity, flexible participation, discovery, and activity information should broaden what organizers can build without making a simple camp game harder to run or join.

The current event flow remains valuable:

Create game → share joining instructions → guests join → teams play → operator ends game.

The broader experience becomes:

Create an activity → configure its games and information → share privately or publish → guests and account holders participate → retain useful history → discover other activities.

This direction should inform relevant work incrementally. It does not authorize implementing the whole vision, speculative schema changes, replacing working systems, or delaying a small feature until a general platform exists. See [planned capabilities](roadmap.md) for dependencies and [repository context](repository-context.md) for what already exists.

## Product principles

- Design for mobile first in both playing and organizing. Operators create and manage games in the field too; desktop expands the same workflows.

- Preserve frictionless guest participation. Registration adds continuity and discovery; it is not a prerequisite for casually joining a directly shared activity.
- Treat operating and playing as roles a person can hold, rather than mutually exclusive kinds of person. Shared identity must preserve distinct permissions and platform-native credential handling.
- In a team game, the team's progress is every member's progress. A member's contribution advances the team and all its members; completion and results belong in each member's game history. Solo progress is individual. Game-defined points are not a comparable currency across games.
- Compose game behavior from independent settings. Avoid hard-coded city, camp, solo, and long-running game types.
- Separate publication, admission, game operation, and participation completion. Discovering a game is not permission to see its private content or participate at any time.
- Extend resources, rich content, unlock rules, stages, subscriptions, and organization permissions before introducing competing systems.
- Preserve field use: offline actions, reconnection, recoverable errors, accessibility, and English/Portuguese/German support remain part of the product.
- Make useful slices independently shippable. Each should solve a current need and leave a clear path to later capabilities.

## Identity and participation

A registered user should be able to operate one game and play another concurrently. The same account can support both roles; game and organization permissions remain explicit. Whether an operator may compete in the same game, and how that affects ranked results, is a later policy decision.

Guests should continue to join through codes, QR codes, or direct links without registering. NFC can provide an entry point where an explicit joining flow makes sense; scanning a base is not automatically authorization to join its game.

An authenticated guest-to-account claim should attach an existing participation to an account without resetting it. Preserve team membership, score, check-ins, submissions, completed challenges, unlocks, and queued actions. In team mode the account retains the team's progress as its own progress in that game, including shared completion and results in its history. The team remains the shared source of that progress. Claiming must verify control of the guest session, resolve an account already participating in that game, and be safe to retry.

Account identity should provide continuity across devices. Device/session identifiers remain useful for guest access and delivery, but must not become the permanent identity of a registered player. Joining from a second device should recover the existing participation rather than create another competitor.

Persistent profiles can later show joined and completed games, results, completion times, statistics, and achievements. In team games, this includes the team's progress and results for each member, regardless of which member performed a particular action. For example, when one member completes a challenge, it is completed for the team and every member; when the team completes the game, that completion belongs in every member's history. Audit records can still identify who performed an action without limiting shared progress to that person.

Game-defined points should remain contextual to their game: an organizer can make a base worth 10,000 points, so summing those points across games does not provide a meaningful measure of a user's progress or a fair universal ranking. History visibility and retention need explicit choices before public profiles launch.

Today's player APIs deliberately hide scores and leaderboards. The proposed visible results and placements therefore need an explicit product decision: post-completion results, an organizer-controlled visibility option, or broader player leaderboards are different experiences. Preserve the current behavior until that choice is made; account linking alone must not expose scores.

## Configurable games

| Dimension | Intended choices | Meaning |
|---|---|---|
| Participation | Team / solo | Who shares progress and appears on the leaderboard |
| Completion | Shared game end / personal completion | Whether a run finishes globally or independently |
| Publication | Unlisted / publicly discoverable | Whether the activity appears in Explore |
| Schedule | Fixed window / no fixed end | When joining and play are available |
| Admission | Direct joining and eligible account joining | Who may join, through which routes, under what conditions |
| Challenge availability | Base-associated / global objectives | Where and when an objective is available |

These are conceptual choices, not prescribed database enums. "Unlisted" means absent from discovery; it does not promise invitation-only security. Discoverability derives from publication and eligibility, rather than a second setting that can contradict public visibility.

Team mode preserves today's shared score, progression, and leaderboard. Solo mode offers one common joining flow, individual identity and results, and no user-facing team creation or per-person team QR code. A one-person team may be an incremental implementation choice, but must be evaluated against assignments, variables, quotas, and history before it is adopted.

| Participation | Completion | Example |
|---|---|---|
| Team | Shared game end | Camp competition ending at 17:00 |
| Solo | Shared game end | Individual event race |
| Team | Personal completion | Groups completing a permanent city trail |
| Solo | Personal completion | Tourism trail or a nationwide via ferrata challenge |

The existing game lifecycle remains `setup → live → ended`, with its existing reset/return-to-setup behavior. Publishing is not a new lifecycle state. Archiving for organization or discovery is not silently a replacement for ending gameplay. Stage closure is scoped to the stage unless a separately defined completion rule says otherwise.

Personal completion adds a separate run lifecycle: a participant or team joins, plays, and completes while the game can remain live for others. Leaving, expiry, abandonment, replays, and the effect of a global game end require a feature specification. Completion criteria must be explicit; "visit every base," "finish all required challenges," and "have all submissions approved" are different rules. Review-dependent results may need finalization after the last action.

Long-running games emerge from personal completion plus a long or open-ended schedule. They do not need a separate fundamental game type. "No fixed end" does not promise perpetual operation: organizers must still be able to close admission, maintain locations/content, and eventually retire a game. Rules and result comparability across edits need a deliberate policy.

The via ferrata example is a useful test of the direction: an individual discovers a Switzerland-wide challenge, visits tagged locations over months, and retains progress across devices. The city example tests repeated independent runs: visitors complete the same set of monuments at different times, receive their own result, and leave the trail open for later visitors. Neither example requires building that entire experience first.

## Public discovery

Operators should eventually be able to publish and unpublish eligible games. Registered users can browse Explore for upcoming, active, and persistent activities, with nearby discovery as a possible later extension. Guests keep direct joining and do not browse Explore under this vision.

Publication and guest admission remain separate: a public game can still accept guests with a QR code or direct link. An upcoming listing need not be open for joining or gameplay. Explore should expose a deliberate public summary, not existing operator/game snapshots, hidden objectives, staff documents, or participant locations. Public publishing needs an identified publisher, a removal/reporting path, and location visibility decisions before release.

## Activity information and organization

PointFinder should gradually become the digital home for camps and other activities: games, stages, schedules, maps, instructions, general objectives, and relevant participant information.

An activity is a future event-level grouping, potentially containing several games and shared information. It is not automatically the existing organization (a durable club/workspace), a stage (part of a game), or the audit `ActivityEvent`. Start with useful game-level improvements; introduce an activity container when a concrete multi-game workflow requires it.

Uploaded files and native rich documents should form one coherent resource experience. Maps, schedules, rules, staff rotas, instructions, clues, images, and PDFs should share organization and authorization behavior. Extend the existing file/document and rich-content systems. Tables, checklists, and embedded PointFinder content can evolve as needed rather than requiring a general-purpose document suite first.

The intended audiences are:

- Participant-visible: immediately available to eligible participants, such as maps and schedules.
- Unlockable: released to the appropriate team or solo run by a defined gameplay condition, such as a map fragment after a challenge.
- Operator-only: operational material that is never delivered through participant endpoints, snapshots, downloads, or caches.

Audience is not a paywall and not public publication. Both files and documents should follow the same access rules. Extend existing unlock concepts to resource access rather than creating unrelated file-only mechanics. Server-side downloads and embeds must enforce the same rules as lists. Already downloaded offline material cannot be reliably recalled; visibility changes must acknowledge that limit.

Global challenges are objectives available without checking in at a particular base: find a person, take a photo, solve an overarching puzzle, or finish an activity-wide task. They should reuse challenge submission, validation, scoring, and audit behavior. Availability may be immediate, stage-based, time-limited, or unlocked. Game-scoped global challenges can precede objectives shared across a multi-game activity.

Lightweight branding should let organizers add an event name, logo, and imagery to relevant participant and operator surfaces. Limited accent choices may follow. This should feel integrated into a camp while retaining PointFinder's canonical brand geometry, semantic tokens, accessibility, and native platform behavior; full white-labeling is not the current goal.

## Commercial direction

Operating entitlements and player participation entitlements are distinct. Operating a game should not consume a player's participation allowance. A proposal worth evaluating is one active participation for a free registered user, with more simultaneous participations for paid users. This is not an approved or currently enforced limit.

Before implementing that proposal, define whether joining a future event reserves a slot, what ends participation, how a player leaves a months-long challenge, how guests and account claiming behave at the limit, and what happens after a downgrade. Do not use device identifiers to pretend to enforce a person-level quota for guests.

Files, documents, branding, larger storage, advanced visibility, and additional player participations are candidates for paid packaging. Some storage and billing foundations already exist; this list is not a declaration that currently available features should become paid.

Prefer account/workspace entitlements over purchasing each game separately. For personal games, resolve organizer features through the owning account; for organization games, preserve the owning organization's plan and permissions. A visiting Pro operator should not automatically upgrade every game they can operate. Any different entitlement rule requires an explicit decision. Players should not need their own Pro subscription to read organizer-provided content that they are entitled to access.

## Decisions intentionally left open

These questions gate their relevant feature, not this documentation or unrelated work:

1. What closes a participation: completion, leaving, expiry, global ending, or a combination? Can users replay or join several runs of the same game?
2. How do team changes affect completion and historical credit? How are already-linked guest/account participations reconciled?
3. Which completion conditions and review/finalization rules ship first? How do queued offline actions interact with a closed run?
4. How do edits to a persistent challenge affect active runs and comparable leaderboards?
5. What public metadata, publisher permissions, eligibility, and reporting controls are required for Explore?
6. When does a separate activity container become useful, and which permissions/content inherit across its games?
7. Which paid capabilities and participation limits are actually chosen? How do organization sponsorship and account downgrades interact with player access?
8. Which history is personal, shared with a team, or public, and what retention/deletion behavior should apply?
9. When should players see scores or leaderboards, given today's deliberate score-free player experience? Should that differ between live events and completed persistent runs?

Implementation proposals should resolve only the questions needed for their slice and record the answer in a focused specification. Update this vision when product intent changes; do not treat assumptions in an implementation plan as product approval.
