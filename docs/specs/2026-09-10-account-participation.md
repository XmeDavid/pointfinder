# Account participation and guest claiming (PF-01 + PF-02, first slice)

Local working spec. Not committed; the roadmap records the shipped slice.

## Decisions taken (product owner, 2026-09-10)

- Open self-serve signup for participants from inside the player app, with a
  verification email. Existing accounts (operators, club members) can also
  claim. Signup collects only email, name and password and stays optional.
- One-shot sign-in for this slice. Claim and recover exchange credentials
  once; the app never keeps a user session next to the player session, so
  the native "operator wins" routing is untouched. Concurrent operate-and-play
  is a later slice; revisit if this proves limiting.
- A claim that collides with an existing participation of that account in the
  same game is rejected with a typed code. The app then offers to switch this
  device to the existing participation once queued actions have synced. Two
  player rows are never merged.

## Decisions taken during review (2026-09-10)

- The security default became operator-only (`anyRequest().hasAnyRole(ADMIN, OPERATOR)`) and `POST /api/auth/login` refuses participants. Before that, an unverified participant token could reach org invites and billing; that chain is closed and covered by `SecurityRulesTest`.
- `EMAIL_ALREADY_TAKEN` on link is an account-existence oracle for holders of a player token. Accepted on purpose: the field UI needs "sign in instead", and the link call sits behind the join rate limiter (per IP and per player).
- `players.game_id` stays nullable in the schema for one release so a rolling deploy cannot 500 guest joins from the previous build; a follow-up migration makes it NOT NULL.
- Recover retires the recovering phone's own guest row in that game and refuses a row owned by another account; it also clears the push token so the old phone stops receiving.
- Bad credentials on link and recover answer 400 `INVALID_CREDENTIALS`, never 401, because clients treat a 401 on a player token as a revoked session.

## Model

- New user role `participant`. Named so its Spring authority
  (`ROLE_PARTICIPANT`) cannot collide with the player token's `ROLE_PLAYER`.
  Participants can call `/api/auth/**` only; every operator route already
  requires admin or operator.
- `users.email_verified` (default true for existing rows; false for
  participant signups until the emailed link is opened). Verification does
  not gate play or recovery: a scout in the field must not be blocked by a
  mail round trip. An unverified address can be taken over through password
  reset, which proves control of the mailbox.
- `players.user_id` (nullable, `ON DELETE SET NULL`) and `players.game_id`
  (backfilled from the team, kept in sync on join). Partial unique index on
  `(user_id, game_id)`: one participation per account per game.
- The player row, its id, its token, the offline queue, caches, upload
  sessions and push registration are untouched by a claim. Linking happens in
  place.

## Endpoints

- `GET /api/player/account` (player token) → `{ linked, email, name, emailVerified }`.
- `POST /api/player/account/link` (player token) body
  `{ email, password, name?, createAccount }`.
  - `createAccount=true`: creates a participant user, links, sends the
    verification email. `EMAIL_ALREADY_TAKEN` (400) when the address exists.
  - `createAccount=false`: checks credentials with the same lockout as login,
    then links. Any role may link.
  - Idempotent when already linked to the same account. `PLAYER_ALREADY_LINKED`
    (409) when linked to another account.
  - `ACCOUNT_ALREADY_IN_GAME` (409, details `teamId`, `teamName`, `sameTeam`)
    when the account already has a participation in this game.
- `POST /api/auth/player/recover` (public, join rate limiter) body
  `{ email, password, deviceId, joinCode? , gameId? }`. Resolves the game from
  either field, finds the account's participation, updates `device_id` to
  the recovering device (last device wins, which also targets push
  notifications there), and returns the same `PlayerAuthResponse` shape as
  join with the existing player id. `NO_PARTICIPATION_FOUND` (404) when the
  account never joined that game; ended games answer like join.
- Guest join is unchanged. `DELETE /api/player/me` still deletes the
  participation; `DELETE /api/users/me` leaves participations as guests.

## Player app

- Settings gains an **Account** section: "Save my progress" when unlinked,
  the linked email (and an unverified hint) when linked.
- `/account` screen: create account or sign in, then link. On
  `ACCOUNT_ALREADY_IN_GAME` it explains where the account already plays and
  offers to switch this device; the switch is blocked while queued actions
  are pending, and otherwise calls recover and replaces the session.
- Join gains "Already have an account? Recover your game" → `/join/recover`
  with email, password and team code.
- The operator web login refuses participant accounts with a clear message.

## Out of scope

History and profiles (PF-03), scores, solo joining (PF-04), a persistent
account session in the player app, multi-device push fan-out, and the legacy
native apps (the join contract only gains optional fields).

## Tests

- Backend: `PlayerAccountServiceTest` (link register/login/idempotent/
  conflicts, recover found/device update/none/ended), `SecurityRulesTest`
  additions, `AuthControllerTest` recover, an integration test proving the
  player id and token survive a claim and a second device recovers the same
  row.
- Web: `AccountScreen.test.tsx`, `RecoverScreen.test.tsx`, Settings account
  row, operator login refusal.
- e2e API: guest join → link → recover from a second device id.
