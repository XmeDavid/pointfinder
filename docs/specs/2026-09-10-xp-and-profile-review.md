> Product-owner resolution: XP accrues as actions happen. Finding 1 below is superseded; do not defer all action XP until game end. The organizer factor is also accepted as designed. Remaining findings were passed to Fable.

# XP and profile — review for backend and UI integration

Reviewed 2026-09-10 against [the proposed specification](2026-09-10-xp-and-profile.md), the product vision, and the current lifecycle, submission, reset and account services.

**Assessment:** the product direction is coherent. Keep platform XP distinct from organizer points, private profiles, shared team rewards, formula versioning, and a frozen organizer-experience factor. Clarify the items below before implementing award persistence and result finalization. This note proposes resolutions; it does not silently replace the decisions in the source spec.

## Confirmed direction

The product owner reaffirmed the organizer-experience factor: it slows XP farming through newly created organizer accounts and encourages people to experience games before organizing. Keep the formula. It is a deterrent, not a complete anti-abuse system.

The factor is approximately 0.20 at level 0, 0.72 at level 5, 0.89 at level 10, 1.00 at level 15, and 1.095 at level 21. Personal and organization games use the creating operator's level as agreed. No XP for operating and no XP on operator monitoring surfaces.

The UI can show previously finalized profile XP while a different game is live. The unfinished game's contribution must stay hidden. This distinction should be explicit in the spec's opening statement.

## Resolve before implementing the ledger and awards

### 1. One finalization boundary for visibility and eligibility

Live award hooks, `sum(amount)` profile totals, and “only after game end” currently contradict each other. The creator-participation and single-team exclusions are also evaluated at game end, after those hooks could already have issued rewards.

Recommended first slice: calculate and commit finalized awards from authoritative game records at end. Alternatively retain provisional event records, but distinguish them from finalized awards and exclude them from every player-facing total, recent activity, level calculation and reward response. Do not require the client to hide fields that the API exposes.

Apply the game's eligibility decision to **all** reward kinds, not only completion and placement. Freeze the factor/version and finalization inputs. A result response must distinguish an ineligible zero-reward result from a result that has not been finalized yet. Preserve the game's ineligibility reason for a concise player explanation.

### 2. Team membership and shared progress

“Members at the time of the award” means a member joining after the team's first six bases receives fewer check-in/completion rewards. That conflicts with the owner's clarified direction that team progress is each member's progress, unless XP intentionally has a different policy.

Recommended: finalize rewards for the defined eligible end-of-run roster using shared team progress. Late members then receive the same team reward. If action-time membership is intentional, record it as an explicit exception before implementation. Transfers, departures and guest recovery need a precise roster policy.

Current recovery **retains retired guest player rows** and marks their device IDs with `retired:` (`PlayerAccountService.releaseDevice`). Counting every player row as a person would inflate the field and might award one person twice. Define which rows represent eligible participants before calculating `P`, `m`, `T`, and award recipients. A single-team field should mean a single eligible competing team; exclude empty teams and avoid dividing by zero. Decide whether completely inactive registrations qualify for placement XP. None of these choices requires changing the agreed experience factor.

### 3. Resets, replays and exact-once awards

The proposed uniqueness key cannot represent repeated cycles safely. After end → reset → end, a new placement/completion has the same game reference and player ID. A second reversal has the same `(reversal, gameId, playerId)` as the first.

Introduce an explicit reward-cycle/result identity (or an equivalent existing stable generation key). It need not implement the future personal-completion lifecycle now. Tie event awards, frozen results and reversals to that identity. A reversal should identify the particular award/result it reverses; duplicate reset requests must not reverse it twice.

For base completion, deduplicate the **logical completed base for a team in a cycle**, not just the submission that happened to trigger it. Multiple submissions or repeated reviews must not multiply XP.

State precisely what reopening without reset means. Recommended interpretation of the current spec: the prior reward result remains frozen, with no additional awards for that finalized cycle. A reset invalidates that result once and starts a new cycle. Define whether the factor is frozen again for the new cycle; a simple pause/resume must not change it.

`GameProgressResetService` already soft-archives check-ins/submissions. Coordinate result invalidation with that transaction. Reversal rows are an explicit exception to “no award rows after end”; distinguish corrections from new earned rewards in both documentation and API projections.

### 4. Frozen placements need saved results

“Ending freezes results” and “later reviews change game points” can coexist only if the reward placement is a saved snapshot, independent of the mutable operator leaderboard. Otherwise the displayed placement may later disagree with the XP awarded for it.

Persist final placement, tie information, eligible field/team sizes, roster identity, finalization time, factor and formula version. Keep enough display information to explain the result after a game/team rename or deletion. XP alone cannot reconstruct placement reliably: zero XP can mean last place, a tie, or ineligibility.

Review flips before finalization also need a rule. If a base is approved and later rejected before end, should it still count as completed? Recommended: use authoritative accepted/completed state at the finalization cutoff. Define completion through the game's existing completion rules, including manual rescue actions; do not create an XP-specific interpretation that disagrees with player progress. Require a nonempty applicable base set before an “all bases complete” test succeeds.

### 5. Every ending path and concurrent action must agree

`GameService.updateStatus` locks the game during transitions, but scheduled ending follows a separate repository-update path in `GameSchedulerService`. Hooks only in the manual status method will miss automatic endings. Manual completion/rescue in `SubmissionService` is also a separate path from ordinary submission approval.

Use one reward finalizer from every ending path, with transaction/locking or equivalent concurrency protection shared with award-relevant writes. Concurrent review, check-in, account claim and end must produce one consistent cutoff; retries must not duplicate or omit awards. An asynchronous finalizer needs a durable retry mechanism and an explicit pending-result state.

`end-summary` is advisory: submissions can arrive after it is fetched. Recheck pending reviews at end time or document the authoritative cutoff. Preserve existing offline upload/queue behavior; a queued action not accepted by the server before the cutoff cannot silently be presented as finalized reward credit.

## Clarify formulas and ownership

### 6. Starting level and rounding

The formula `200 × n^1.35` gives a level-1 threshold of 200 XP. It cannot simultaneously give level 1 at zero XP while the factor uses level 0 for a brand-new account.

Recommended minimum change: level 0 at 0 XP; level 1 at 200; level 2 at approximately 510. If the intended UI starts at level 1, specify a shifted threshold formula and which level the factor uses. Do not give backend and frontend different notions of level.

Define integer threshold rounding and placement rounding in one place. Specify that the featured multiplier and organizer factor combine before a single final rounding step, and that zero raw placement reward remains zero. The minimum-one rule also means a one-XP check-in at factor 0.2 still awards one XP; that is consistent with the written rule but deserves an intentional test.

Correction to the example: with two equal-sized teams, the winner's raw placement XP is `200 + 100 = 300`; at factor 0.2 it earns **60 placement XP**, before other awards, not 44. “Two teams” alone is insufficient without team sizes: a one-person team beating a 100-person team would earn 1,050 placement XP at factor 0.2. This illustrates why eligible roster counting matters. The size-sensitive formula is retained as agreed.

### 7. Featured control and creator eligibility

The featured multiplier must be admin-controlled from the first slice, even without an admin UI. Do not accept it through ordinary game editing, import, or cloning payloads. Define allowed values and whether the 2.0 cap applies before or after the featured multiplier. Freeze the effective multiplier with the result cycle; later featuring must not retroactively alter rewards.

“Creator participates” cannot reliably detect a creator using an unlinked guest identity. State the enforceable rule in terms of account-linked participation, and whether creator participation at any point in the cycle disqualifies it. End-time unlinking should not accidentally evade a rule meant to cover the whole game. Use existing audited history or a retained eligibility fact if needed. Other co-operators' eligibility remains a separate policy; do not silently expand the agreed creator-only exclusion.

### 8. Immutable amounts versus changing account attribution

The ledger is append-only in its earned amounts, but `user_id` is explicitly backfilled/cleared. Call it current account attribution rather than “account at award time,” or retain a separate historical attribution value if one is needed. Do not describe a mutable field as an immutable historical fact.

Unlinking removes the participation's XP from the account under the current proposal; linking elsewhere transfers that attribution. This also changes derived level. Keep the agreed behavior explicit in the confirmation UI and ensure claims/unlinks/deletion are atomic with the award projection. Do not recalculate factors already frozen on other games when a user's level changes.

Specify game/team/player deletion behavior. An ordinary cascading delete must not accidentally erase an append-only XP history, while restrictive new foreign keys must not unexpectedly break existing game/account deletion. Nullable references require stable result identifiers/snapshots so surviving rewards and idempotency still make sense.

## API additions the design needs

These are proposed response semantics to settle with the backend author, not requests to build new screens in the backend branch.

- **Profile:** finalized XP only; define `xpToNextLevel` as remaining XP, and provide the current and next level thresholds so a progress bar does not reimplement the formula. Define `gamesCompleted` and `basesCompleted`: eligible rewarded completions only, or all completed play including zero-XP games? The latter cannot be inferred from positive ledger entries alone.
- **Results:** stable result ID/revision, frozen end time, game/team display identity, placement and tie/field context, earned XP breakdown, eligibility/reason, and finalization state. Players receive no raw game points. Page or bound placement and recent lists.
- **Reward presentation:** a game-level endpoint can return the current result in the first slice, but identity should leave room for several runs and future personal completion. Return a small summary as well as any detailed award rows; a large game should not require loading hundreds of records to draw the reward screen.
- **Reversals:** define whether the reward endpoint returns an invalidated result after reset or the next pending result. The UI must not replay an old celebration or keep a completion count that was reversed.
- **Notification/discovery of rewards:** provide a reliable way to find newly finalized results after reconnecting. Use result IDs for deduplicating the reward presentation; reopening a profile should not replay a celebration. Cross-device “seen” state can be a later addition if the first version is intentionally device-local.
- **Access:** account profile is private; reward access must be tied to the authenticated player's participation in the requested game. Account authorization does not grant access to other teams' private data.

## Design consequences

The revised design can include a quiet personal level/XP summary and a Profile destination, with a dedicated reward screen after finalization. The live game remains focused on team progress, maps, challenges and sync. Organizer end confirmation explains pending reviews and the reward cutoff without adding XP monitoring panels.

Explore can include featured and nearby activities, but a “featured discovery placement” and a “reward multiplier” must not accidentally become the same client-controlled flag. Future persistent solo/group trails cannot wait for a global game end that may be years away; personal-completion rewards are deferred, and stable result/cycle identity now should avoid baking global ending into every future UI model.

## Focused acceptance cases

Before considering this slice ready for UI integration, cover:

- No unfinished/ineligible-game XP leaks through profile totals, recent awards or levels.
- Late joins and retired guest rows follow the explicitly chosen shared-team/eligible-roster policy.
- Ties, empty teams, one eligible team, unequal teams, zero placement XP and exact threshold boundaries.
- Duplicate approval, approval → rejection → approval, manual rescue and concurrent review/end.
- Automatic ending uses the same finalizer as manual ending.
- End → reopen without reset → end does not duplicate rewards; two full reset/replay cycles and retried resets remain correct.
- Claim/unlink/recover/account deletion during and after finalization preserve agreed attribution without duplicate participants.
- Post-end review changes operator points without changing frozen reward placement or XP.
- Game/team deletion retains or removes history according to a deliberate policy, without accidental cascade loss.
