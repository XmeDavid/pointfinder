# Game admission: lobby, placement and capacity (proposal)

Status: **proposal only, 2026-09-11.** Nothing in this document is implemented,
and it authorizes no implementation. It records a candidate model for the
"Admission" dimension of the [vision](../product/vision.md), sized against the
code that exists today, so the product owner can pick a first slice. Local
working spec; not committed with the canonical docs.

## 1. Why now

PF-07/08 shipped one narrow admission route: a listed, live game may name one
team as its *admission team*, and a signed-in account joining from Explore is
placed on it ([discovery contract](2026-09-10-game-discovery.md)). Everything
else still goes through a team's join code or QR code, which means:

- **Visibility and admission are coupled.** Public admission exists only for
  listed games; a private camp that wants "everyone scans one code and staff
  sort them into patrols" has no route. Conversely a listed game that wants to
  keep placement in the operator's hands has to fake it with one catch-all
  team.
- **Placement is decided by whoever holds the code.** A team code is both an
  invitation and a placement; the organizer cannot change their mind
  afterwards without the device-team lock getting in the way
  (`DEVICE_ALREADY_IN_DIFFERENT_TEAM`).
- **Nothing bounds a team.** `QuotaService.enforcePlayersPerGameLimit` caps a
  game; a team can take any number of phones. Public admission onto one team
  makes that visible.
- **There is no "joined but not yet playing" state.** A `players` row always
  has a team, the player token carries `teamId`, and every gameplay endpoint
  assumes it. So there is nowhere to park a person between joining and being
  placed.

The vision asks that publication, admission, operation and completion stay
separate dimensions. This proposal only touches admission and placement.

## 2. What exists (baseline the proposal builds on)

| Foundation | Where | Relevant behavior |
|---|---|---|
| Team join code / QR | `Team.joinCode`, `PlayerJoinService.joinTeam` | One code per team; device holds one identity per game; rejoin idempotent for the same team, refused for another |
| Account participation | `PlayerAccountService.joinForAccount`, `recoverForAccount` | One row per account per game (partial unique index), recovery moves `device_id`, retires the phone's guest row, emits `team_switch` |
| Publication + admission team | `GamePublication.admissionTeam`, `ExploreService.join` | Listed + live + team set → new account placed on that team; everything serialized under the game row lock |
| Per-game player quota | `QuotaService.enforcePlayersPerGameLimit` | Tier-based cap per game, checked on new rows only |
| Audit | `ActivityEventType.team_join` / `team_switch` (reserved in V36), `[ACCOUNT]`/`[PUBLICATION]`/`[EXPLORE]` structured logs | `team_switch` is emitted on recovery; `team_join` is still unused |
| Lifecycle | `setup → live → ended`, return-to-setup, reset | Go-live readiness requires bases, challenges, ≥ 1 team, tags, assignments, coordinates, team variables |
| XP | `XpService.reassignPlayer`, team-shared credit | Action XP accrues to the team's members; placement changes must re-attribute |
| Offline | Player queue of check-ins/submissions keyed by idempotency key | Joining itself is online-only today; queued actions carry the player token's team |

## 3. Proposed model

### 3.1 Visibility stays where it is

`game_publications` keeps answering "is this in Explore". Nothing below
requires a publication row, and publishing keeps changing nothing about who
may join. The existing `admission_team_id` becomes one *placement strategy*
(§3.4) rather than the only public route, and can be retired once the lobby
exists.

### 3.2 Admission settings on the game

A small settings group on `games` (or a 1:1 `game_admission` table, decision
D1), independent from status and from publication:

| Setting | Values | Meaning |
|---|---|---|
| `lobby_enabled` | bool, default false | Whether a game-level shared code exists at all. Off = today's behavior exactly |
| `lobby_code` | unique, 6–8 chars, same alphabet as team codes, generated | The one code / QR / link an organizer shares. Private by default: it appears only in operator surfaces, never in Explore |
| `lobby_open` | bool, default true when enabled | Manual gate. Closed = code still resolves but answers `ADMISSION_CLOSED`; existing participants recover as usual |
| `placement` | `operator` \| `automatic` \| `player_choice` | Who chooses the team (§3.4) |
| `public_placement` | same enum, nullable | Optional override for arrivals from Explore; null = same as `placement` |

Legacy team codes keep working unchanged next to the lobby code. Scanning a
team QR is still "join this team" (subject to capacity, §3.5). This keeps the
current camp flow intact and lets an organizer mix: patrol leaders get team
codes, latecomers get the lobby code.

Explore: `admission` becomes `open` when the game is listed, live, and either
the lobby is enabled and open (any public placement strategy, operator
placement included: the account joins and waits, §3.3), or (legacy) an
admission team is set. `code` otherwise. The Explore response also carries the
effective public placement (`operator` / `automatic` / `player_choice`) so the
client can say "you will be placed by the organizer" before joining. The join
code is still never returned; the lobby code is not either.

### 3.3 The awaiting state

A participant may exist without a team. Proposed representation: `players.team_id`
becomes nullable, with a partial index on `(game_id) WHERE team_id IS NULL`
for the operator's waiting list. Alternatives (a separate `admissions` table,
or a hidden "lobby" team) are weighed in D2.

While `team_id IS NULL`:

- The player token is issued with `teamId = null`. Every gameplay endpoint
  (`/api/player/games/{gameId}/**` check-in, submit, bases, progress,
  documents, locations) answers `403 PARTICIPATION_UNASSIGNED`. The only
  player endpoints that work are the participation status poll, account
  link/recover, push registration, notifications, and leave.
- The player app shows a waiting screen: game name, "waiting for your team",
  the organizer's instructions, and a live update when placed (realtime
  channel already exists per game; push as a fallback because a phone in a
  pocket will not keep a socket open).
- Guest awaiting rows are device-scoped like any guest row. Account awaiting
  rows recover on another phone through the existing recovery contract
  (`recoverFor` needs to tolerate `team == null` and mint a team-less token).
- Player-visible lists (`/api/account/me`) show the participation as
  `awaiting` so a saved game can be reopened.

Placement moves the row to a team, bumps the game state version, emits
`team_join`, and notifies the phone (realtime channel, push as fallback) with
a *signal only*: "your participation changed, refresh". The client then calls
an authenticated participation endpoint with its existing player credential
(or the account session) and receives the refreshed session for the placed
row. Bearer tokens are never carried over the game-wide realtime channel or
over push, which are not per-participant confidential transports. Only after
that refresh does gameplay open. Scores, check-ins and XP start at zero at
placement; nothing accrued while awaiting because nothing could.

### 3.4 Placement strategies

| `placement` | Who decides | Behavior |
|---|---|---|
| `operator` | Operator | Lobby join creates an awaiting row. Operators place from the roster (drag to team / "place" action), singly or in bulk; the existing move-player operator action becomes the same code path. Default for private lobbies |
| `automatic` | Server | Lobby join places immediately on the team with the most free capacity (ties: fewest members, then creation order). Capacity-less teams count as unbounded. If every team is full → awaiting (or refuse, D4) |
| `player_choice` | Player | Lobby join returns the list of joinable teams (name, colour, `members/capacity`), the player picks, join is retried with `teamId`. Full teams are shown disabled. A team QR is the same choice made by scanning. Intended for public games; allowed privately too |

Operators can always re-place, whatever the strategy, subject to capacity.
Player-initiated team changes stay refused (the device-team lock keeps its
reason: no stealth takeover of another team's score).

### 3.5 Server-enforced team capacity

`teams.capacity INTEGER NULL` (null = unbounded; `CHECK (capacity IS NULL OR
capacity >= 1)`). Enforced on every route that puts a row on a team: team-code
join, account join, Explore join, lobby placement (all three strategies) and
operator moves. Enforcement is atomic (§3.6). Lowering capacity below the
current member count is allowed (operators may be tidying) but the roster
shows the overflow; it never evicts. The per-game player quota keeps applying
to new rows on top.

New error codes (appended after the existing publication codes, mirrored in
`packages/api/src/errors.ts` by whoever integrates them):
`ADMISSION_CLOSED`, `ADMISSION_CODE_INVALID`, `TEAM_FULL`,
`PARTICIPATION_UNASSIGNED`, `PLACEMENT_REQUIRED` (player-choice join without
`teamId`), `PLACEMENT_NOT_ALLOWED` (player picked a team under `operator`
placement).

### 3.6 Atomic joins

Every write that creates or moves a participation takes the game row's
pessimistic write lock first (`GameRepository.findByIdForUpdate`, the lock
go-live, end, publication mutations and Explore joins already share), then the
target team row (`SELECT … FOR UPDATE`), then counts members and inserts or
updates. Lock order is game → team → player, never the reverse, so it composes
with `TeamService.deleteTeam` (already game-first) and with go-live.

Under that lock:

- capacity is `count(players where team_id = :team) < capacity`, no cached
  counter to drift;
- the existing partial unique index `(user_id, game_id)` and the device
  uniqueness on join still catch the concurrent duplicate and resolve to
  recovery, as `joinForAccount` does today;
- `automatic` picks its team after locking the game, so two simultaneous
  arrivals cannot both see the same "one seat left".

The transaction stays short (join already runs with `timeout = 10`). The lock
is per game, so a busy camp lobby serializes only its own arrivals.

### 3.7 Lifecycle interaction

| Game status | Lobby | Placement | Gameplay |
|---|---|---|---|
| `setup` | Joinable when enabled and open (pre-registration) | Operator/automatic/choice all work; teams may still be renamed or deleted (deleting a team returns its members to awaiting rather than cascading them, D5) | None (today's rule) |
| `live` | Joinable when open | As configured | Placed players play; awaiting players wait |
| `ended` | Refused like any join; recovery refused like today | Refused | Read-only as today |
| return to setup / reset | Lobby setting survives; reset does not delete awaiting rows | — | — |

Go-live readiness is unchanged: ≥ 1 team, assignments, variables. An operator
placement mode with all participants still awaiting at go-live is allowed
(placing during the game is the point) but the go-live checklist should warn
"N participants awaiting placement". Whether `player_choice` needs "every
team has capacity set" is D6.

### 3.8 Permissions and audit

- **Edit admission settings, lobby code, capacity**: anyone who can edit game
  settings today (creator, org member with the game-settings permission,
  co-operator). This is deliberately wider than *publish*, which stays with
  the publisher role; a co-operator can run the door without being able to
  list the game.
- **Place / move participants**: any game operator (same as the current
  roster actions).
- **Regenerate the lobby code**: same as editing settings; the old code stops
  resolving immediately; printed QR codes for teams are unaffected.
- **Audit**: `team_join` (first placement, actor = the player for
  automatic/choice, the operator for operator placement, with the V36 actor
  snapshot), `team_switch` (operator re-placement, the existing recovery
  switch). Lobby join without placement, lobby open/close, code regeneration,
  and capacity edits are game-level operator changes and follow the
  structured-log convention (`[ADMISSION] operation=…`). The audit export
  gains no new source; it already reads `team_join`/`team_switch`.
- **Rate limiting**: lobby join sits behind the existing join rate limiter
  (per IP and per device), and the lobby code is checked with the same
  constant-cost lookup as team codes so a public lobby is not a code oracle.

### 3.9 Offline and realtime

- Joining and placement are online operations; the app never queues a join.
- A queued action from an awaiting player cannot exist (endpoints are
  refused), so there is no reconciliation problem at placement.
- Operator re-placement of a player who has queued offline actions: the queue
  **must not silently replay against a different team**. Every queued action
  carries the membership it was performed under (`teamId` plus the
  participation/membership version the phone last saw). On sync the server
  compares it with the row's current membership; a mismatch is refused with a
  typed code (`STALE_TEAM_MEMBERSHIP`, with details `queuedTeamId`,
  `currentTeamId`) and nothing is written. The client stops the queue, shows
  the conflict, and offers an explicit resolution: discard the stale actions,
  or hand them to the operator for review. The operator may then record them
  against the *original* team with the original actor and capture time
  preserved (an audited `operator_override`), or drop them. Actions already
  synced for the old team before the move stay with the old team; nothing is
  re-pointed. This is a new rule; it is not how recovery behaves today and
  needs its own tests in stage B.
- Awaiting players receive the placement over the game realtime channel and
  by push; the waiting screen also polls on resume.

### 3.10 XP implications

- Awaiting time earns nothing: no action XP, no participation award, no
  placement credit. A participation that never gets placed and is later
  removed leaves no XP trace.
- Placement is the moment the participation starts sharing the team's
  progress, exactly as a late guest join does today. Per the vision, a team's
  progress belongs to **every** member: a check-in or approved submission by
  one member advances the team and all its members, and completion and
  results land in every member's history. Audit still records who performed
  each action; that attribution never limits shared credit to the author.
- **Mid-game moves need an explicit, reviewed XP policy before stage B ships;
  this proposal does not set one.** Today's recovery `team_switch` moves a
  phone onto the account's *existing* row and never changes team, so it is
  not a precedent for an operator move between teams. The questions the
  policy must answer: whether action XP the mover already shares with the old
  team is kept, reversed, or frozen; whether the mover starts sharing the new
  team's progress from placement only or retroactively; which team's
  completion and placement awards the mover receives at game end (row at end
  time is the simplest reading, but a reversal ledger entry may be needed for
  the old team); and how the finalizer treats a member who was moved after
  the old team already completed. The XP ledger's existing reversal
  mechanics (used by reset) are the tool to express whichever answer is
  chosen; the end-of-game finalizer must read team from the row, never from a
  cached snapshot. Until decided, stage B may ship with operator moves
  allowed only in `setup` (nothing to reattribute) and refused in `live`.
- A team that ends up empty (everyone moved out) gets no placement award, and
  its presence on the leaderboard is an existing operator concern, not a new
  one.

## 4. Proposed stages

Each stage is independently shippable and leaves the current camp flow intact.

| Stage | Scope | Backend | UI (Codex) | Ships value |
|---|---|---|---|---|
| **A. Team capacity** | `teams.capacity`, enforcement on every join and move under the game lock, `TEAM_FULL`, roster shows `members/capacity` | Migration, `TeamService`, `PlayerJoinService`, `PlayerAccountService`, `ExploreService.join`, operator move | Capacity field in team editor, roster badge, full-team error in join | Bounded public admission team; bounded team QR codes |
| **B. Private lobby + operator placement** | Admission settings, lobby code/QR, awaiting rows, `PARTICIPATION_UNASSIGNED`, waiting screen, operator place/move from roster with `team_join` audit, account recovery of awaiting rows | Migration (`team_id` nullable or `admissions` table, D2), participation-refresh endpoint and change signal, gameplay guard, stale-membership rejection on sync, roster endpoints; moves in `live` gated on D12 | Game Settings "Admission" section, lobby QR/print, waiting screen, roster placement | Camps: one code for everyone, staff sort patrols |
| **C. Automatic placement** | `placement = automatic` | Selection under the lock | One setting | Big events with no staff at the door |
| **D. Player choice + public lobby** | `placement = player_choice`, `public_placement`, Explore `admission=open` via lobby, retire `admission_team_id` | Team list endpoint for a lobby code, Explore join through the lobby | Team picker in join flow, Explore join | Public games where players pick a side |
| **E. Pre-registration polish** | Setup-phase lobby with deleted-team fallback to awaiting, go-live warning, bulk placement, CSV/print of the waiting list | Small | Roster tooling | Larger camps |

Stage A alone is a complete slice with tests. Stage B is the first one that
changes the player data model and should get its own focused spec and a
review of every consumer of `player.team` (there are many: progress, bases,
documents, locations, notifications, push, XP, audit export, tutorials).

## 5. Open decisions

| # | Decision | Options | Proposal's lean |
|---|---|---|---|
| D1 | Where admission settings live | Columns on `games` vs a 1:1 `game_admission` table | Columns on `games` for A; a table if the lobby grows fields (instructions text, open/close schedule) |
| D2 | How to represent "awaiting" | (a) `players.team_id` nullable; (b) separate `admissions` table, row promoted to `players` on placement; (c) hidden lobby team | (a) keeps one participation identity, one token, one recovery path and one XP subject. (b) avoids touching every `player.team` consumer but duplicates identity/recovery/push. (c) leaks into leaderboards, quotas and assignments and is rejected |
| D3 | Team in the player token | Keep `teamId` in the JWT and re-issue on placement (the client refreshes through an authenticated endpoint after a change signal) vs drop the claim and resolve team from the row on every request | Resolve from the row and treat the claim as advisory, so a stale token cannot act for a team the row no longer belongs to; the refresh endpoint still re-issues. Never deliver a token over realtime or push. Needs an audit of where the claim is trusted |
| D12 | Mid-game move XP policy (§3.10) | Keep / reverse / freeze shared action XP; end-of-game awards by row at end vs by tenure | Undecided; gate stage B moves in `live` on this decision |
| D13 | Stale queued actions after a move (§3.9) | Discard vs operator review recorded against the original team | Offer both, operator review preserves original attribution |
| D4 | `automatic` with every team full | Park as awaiting vs refuse with `TEAM_FULL` | Awaiting, so the operator sees demand and can add a team |
| D5 | Deleting a team that has members (today: cascade deletes players) | Keep cascade vs return members to awaiting | Return to awaiting once B exists; before that, keep today's rule |
| D6 | Does `player_choice` require capacities | Required on every team vs optional | Optional; an unbounded team simply never shows as full |
| D7 | Guests in the lobby | Guests may join a lobby and wait as device-scoped rows vs lobby is account-only | Guests allowed (vision: registration is not a prerequisite); recovery of an awaiting guest row on another phone is not possible, same as today |
| D8 | Operator may play (place themselves) | Out of scope here; the vision defers it | Defer |
| D9 | Leaving while awaiting | Reuse `DELETE /api/player/me` (deletes the row) | Yes; nothing accrued, nothing to keep |
| D10 | Who may edit admission vs publish | Game-settings editors vs publisher role | Game-settings editors, as §3.8; revisit if public lobbies need the publisher gate |
| D11 | Solo participation (PF-04) | Lobby with `automatic` placement onto one-person teams is a possible bridge | Do not design solo through the lobby; evaluate PF-04 on its own |

## 6. Explicitly not proposed

Moderation or reporting of public games, independent completion, persistent
challenges, paid participation limits, waiting-list ordering/priority,
invitations by email, operator playing in their own game, any change to the
legacy native apps, and any UI. The current `admission_team_id` route keeps
working until stage D replaces it.
