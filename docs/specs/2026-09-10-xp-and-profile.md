# XP, levels, placements and the player profile (PF-03)

Local working spec. Decisions taken with the product owner on 2026-09-10.
Formulas carry a version so they can be retuned without rewriting history.

## What it settles

- Players never see game points. Game points belong to the organizer's own
  scoring and are not comparable across games. Players see **XP**, a
  **level**, and **placements**, and only after a game has ended.
- XP is the platform's currency, not the game's. While a game runs, XP is
  irrelevant to operating it and is never shown on operator monitoring
  surfaces. It appears on a profile, and on a personal reward screen when a
  game a player took part in ends.
- Profile stats are computed from participation rows and the XP ledger,
  never stored as counters. There is no merge step when a guest claims an
  account: the rows start pointing at the account and the numbers follow.

## Roster: who receives a team award

A team award goes to the team's **eligible roster at the moment of the
award**, which is every non-retired player row on the team at that
instant. Members present at an action are irrelevant: the team's progress is
every member's progress. At finalization the roster is the team's eligible
rows at end time; someone who joins after the end receives nothing for that
cycle, and someone who left before the end keeps what they earned while on
the team. Retired guest rows (`device_id` starting with `retired:`, left
behind by account recovery) are never eligible: they earn nothing, are not
counted in `P`, `m` or member counts anywhere, and a person recovering a
game therefore never receives a second copy. This wave also changes the
player counts used by quotas and operator snapshots to ignore retired rows.

## Result cycles

Every run of a game between going live and ending is a **cycle**.
`xp_cycles`: id, game_id, number (1, 2, …), started_at (go-live),
finalized_at (end), invalidated_at (reset), factor (frozen at this cycle's
go-live from the creator's level), featured_multiplier, formula_version.
Returning to setup **without** reset keeps the cycle and its saved result;
going live again reopens it (same factor): events already paid stay paid,
new events pay, and the next end finalizes again without rewriting the saved
placement or paying completion and placement twice. Returning to setup **with** reset invalidates the cycle
exactly once (idempotent) and the next go-live opens a new cycle with a
freshly frozen factor.

## Ledger

`xp_awards` is append-only:

| column | meaning |
|---|---|
| id | uuid |
| player_id | the participation (FK players, on delete set null) |
| user_id | the account at award time, nullable; backfilled when a guest claims |
| game_id | FK games |
| team_id | FK teams |
| kind | `check_in`, `base_completed`, `game_completed`, `placement`, `reversal` |
| amount | signed integer, already multiplied by the game factor |
| base_amount | before factors, for audits |
| factor | the game factor applied |
| formula_version | integer, starts at 1 |
| cycle_id | FK xp_cycles |
| reference_id | the logical thing awarded: the base id for check-in and base completion (one per team per base per cycle, whatever submission or review triggered it), the cycle id for game completion, placement and reversal |
| awarded_at | timestamp |

Uniqueness: `(cycle_id, kind, reference_id, player_id)`, enforced by the
database and written with `INSERT … ON CONFLICT DO NOTHING` in plain SQL so
an award never flushes or poisons the caller's transaction. Replays,
repeated reviews, multiple submissions for one base, retried finalizers and
repeated reset requests therefore cannot double-award or double-reverse.
History outlives its game and team: cycles keep a game-name snapshot and
game/team references become null on deletion instead of cascading. A reversal
row negates the participation's rows of that cycle; one per participation
per cycle. Rows are never deleted. Claiming a guest participation sets
`user_id` on its rows; unlinking clears it.

## Saved results

Placement is a saved snapshot, not a live query, so it can never disagree
with the XP it produced. `xp_results`: cycle_id, team_id, placement,
tied (boolean), teams (`T`), players (`P`), members (`m`), beaten,
points at finalization, eligible (boolean, with a reason when not), and the
placement award amount. The profile and the reward screen read this table.

Totals: `sum(amount)` per user (or per participation while a guest).

## Awards (formula version 1)

Every member of a team receives identical rows for a team event. "Members"
are the team's player rows at the time of the award.

| event | base amount | when |
|---|---|---|
| check-in | 1 | when the team's check-in at a base is recorded (once per team per base per cycle) |
| base completed | 5 | when the base first counts as completed for the team in this cycle (a submission for it becomes `approved` or `correct`, including operator manual completion), once per team per base per cycle |
| game completed | 50 | at finalization, if every base assigned to the team is completed |
| placement | see below | at finalization |

Amounts are multiplied by the game's frozen factor and rounded to the
nearest integer, minimum 1 for a non-zero base amount.

### Placement

Computed once per team from the operator's leaderboard at game end (points,
ties share the better placement). Let `T` be the number of teams, `p` the
team's placement (1 = first), `P` the total number of players in the game,
`m` the team's member count, and `beaten` the number of players in teams
ranked strictly below this team. The team's share of the field beaten is
`s = beaten / (P - m)` (0 when the team is alone).

placement XP = `s × ( (T / p) × 100 + min(P / m, 10) × 50 )`

First of ten teams with everyone beaten: full amount. Last place: 0.
Smaller teams that beat larger teams earn more through `P / m` and through
`s`, which counts people, not teams; the size ratio is capped at 10 so a
lone player beating a hundred-person field tops out rather than running
away. Teammates never differ: `s`, `p`, `m` are per team and every member
gets the same row. Only eligible teams count in `T` and `P`: teams with no
eligible roster are ignored, and a field of one eligible team awards no
placement and no game-completion XP. Ties share the better placement and are
recorded as tied.

### Game factor

Frozen on the cycle when it goes live, from the creator's level at that
moment (`L`; a brand-new account is level 0):

factor = `0.2 + 1.8 × ln(1 + L) / ln(500)`, capped at 2.0

That is 0.2 at level 0, about 1.1 at level 21, 2.0 at level 500. An
organization game uses the creating operator's level. A `featured`
multiplier on the game (operator-side, default 1) multiplies the factor;
featuring is a later admin feature and needs no new machinery.

### Games that award nothing

Practice and tutorial games, games with a single team at end, and games
where the creator holds a participation in one of the teams. What is
knowable while live (practice, creator plays) is refused at award time; a
single-team field is only known at the end, so its live rows are reversed
then. Profile totals, levels and the frozen factor count only finalized,
non-reversed cycles, so a running or reset game never moves a level. The
living-room game is not blocked, it is merely worth little: two equal
teams, level-0 creator, the winner's placement is `1 × (200 + 100) × 0.2`,
60 XP, plus a few for bases.

## Levels

A brand-new account is level 0 with 0 XP. Reaching level `n` (n ≥ 1)
requires total XP of `200 × n^1.35`: level 1 needs 200, level 2 about 510,
level 21 about 12,000, level 500 about 880,000. Level is derived from total
XP on read; nothing is stored. The factor formula above takes this same
level, so a new account's games use 0.2.

## Ending a game: one finalizer, every path

Ending finalizes the cycle. There is exactly one finalizer, and every
ending path calls it under the game's row lock: the operator's status
change, the scheduler's automatic end at `endDate`, and any future
personal-completion rule. The scheduler stops bulk-updating status and ends
each due game through the same transactional path. The finalizer is
idempotent (the uniqueness key above), so a retry after a crash completes
the same result rather than a second one.

**Ended is frozen.** After the end, submissions cannot be reviewed,
manually completed or rescued; those calls answer with a typed refusal so
game points, placement and XP can never drift apart. Today only submitting
is guarded on `live`; review and manual completion gain the same guard.
The end confirmation shows how many submissions are still pending review at
that moment and warns that ending leaves them unreviewed; the count is
advisory, the authoritative cutoff is the finalizer's transaction. Queued
offline actions that reach the server after the cutoff are rejected like
any action on an ended game and never appear as reward credit.

## Backend surface

- `GET /api/games/{id}/end-summary` (operator): `{ pendingReviews, teams,
  players }` for the end confirmation.
- Award hooks: check-in recorded, base first completed for the team
  (submission approved/correct, including manual completion), and the
  finalizer on every ending path (completion + placement per team, results
  saved).
- Guards: review, manual completion and rescue refuse an ended game; reset
  invalidates the cycle once; player counts ignore retired rows.
- `GET /api/account/profile` (account): `{ level, xp, xpForCurrentLevel,
  xpForNextLevel, gamesPlayed, gamesCompleted, basesCompleted, placements:
  [{ gameId, gameName, endedAt, teamName, placement, tied, teams, completed,
  eligible, ineligibleReason, xp }] }`, finalized cycles only. Also
  `GET /api/player/games/{gameId}/reward` (player token, own game only):
  `state` is `pending` (no amounts shown) while the game runs, `finalized`
  with awards by kind, the saved placement and the account's level after the
  end, `invalidated` after a reset.
- Claiming a participation backfills `user_id` on its rows; unlinking
  clears it; deleting an account leaves rows attached to the participation.
- The reward endpoint returns the participation's latest **finalized**
  result; after a reset it reports the cycle as invalidated so the UI never
  replays an old celebration or keeps a reversed completion count.
- Profiles are private to the account in this slice. Public profiles wait
  for a retention decision.

## Out of scope

Achievements, public profiles, the featured-game admin UI, operator
placement overrides, and any XP for operating.

## UI (owned by the product owner's design work)

Reward screen at game end for the player, profile from Settings, the end
confirmation with the pending count for the operator. The backend lands
first behind endpoints; screens are integrated from the design branch.
