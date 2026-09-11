# Account session in the player app (PF-01/PF-02, second slice)

Local working spec. Not committed.

## Decision (product owner, 2026-09-10)

The player app keeps the account signed in. "One-shot" in the first slice was
a misunderstanding: once an account exists on a phone it stays signed in
until the refresh token's absolute lifetime (30 days of inactivity) or an
explicit sign-out. Legacy native apps and the e2e API suite are out of scope.

## Sessions on a phone

Two sessions live side by side in the player app and never mix:

- Player session: unchanged (player JWT, one game).
- Account session: user access + refresh tokens, stored under its own key
  (`account`), driven by a second `AuthSession` instance with the same
  proactive-refresh logic operators get. It is never written to the operator
  store, so the native "operator wins" routing is untouched.

Operators may sign the same account into the player app to play; that does
not put the player app into operator mode.

## Backend

- `POST /api/auth/login` issues tokens to participants again. The operator
  web login keeps refusing them client-side; the security default
  (operator-only for anything not opened to players) is what keeps a
  participant token harmless. `/api/account/**` is opened to
  admin, operator and participant.
- `POST /api/auth/participant/register` `{ email, name, password }` (public,
  join rate limiter): creates a participant, sends the verification mail,
  returns the auth pair. `EMAIL_ALREADY_TAKEN` when the address exists.
- Registration through an operator or org invite for an address that
  belongs to an **unverified** participant takes that account over (new
  password, role from the invite, verified). The invite token proves the
  mailbox; this closes the "park a club owner's address" denial.
- `GET /api/account/me` → `{ id, email, name, role, emailVerified,
  participations: [{ playerId, gameId, gameName, gameStatus, teamId,
  teamName, teamColor, joinedAt }] }`. No scores.
- `POST /api/account/join` `{ joinCode, displayName, deviceId }` (user token):
  if the account already plays that game → same as recover (retire this
  phone's guest row, move device, clear push); else guest-join rules
  (quota, ended, device-team lock) and the new row is linked. Returns
  `PlayerAuthResponse`. This is the only join path a signed-in phone uses.
- `POST /api/account/participations/{gameId}/recover` `{ deviceId }` (user
  token): recover without retyping a password.
- `POST /api/player/account/link` gains `accountAccessToken` as an
  alternative to credentials: link the calling guest row to the signed-in
  account.
- `DELETE /api/player/account/link` (player token): unlink; the row becomes
  a guest again.
- `POST /api/account/resend-verification` (user token, rate limited).
- `DELETE /api/account` (user token, participant only): deletes the user;
  participations stay as guests (`ON DELETE SET NULL`). Operators keep the
  existing `/api/users/me` path.
- Operator roster: `PlayerResponse` for teams gains `hasAccount` (no email).
- Password reset response includes `role` so the web reset page can point
  participants back to the app.
- Push: one token per device. `player_push_tokens (player_id, device_id,
  token, platform, updated_at)` (V75, backfilled from `players.push_token`,
  which stays as an unused relic for one release); fan-out sends to every
  device of a player; recover no longer clears anything; unregister removes
  one device; a provider-rejected token is dropped from every phone.
- V74 makes `players.game_id NOT NULL`.

## Player app

- Join: signed in → "Signed in as {email}", team code + name → account join
  (auto-recovers); "Not you? Sign out". Not signed in → guest join as today,
  plus "Sign in" / "Create account" (both create the account session, then
  continue joining).
- Settings → Account: signed in and linked → email, verified state with
  "Resend email", "Sign out", "Remove this game from my account" (unlink),
  "Delete account". Signed in but this participation unlinked → "Save this
  game to {email}" (link by session) or sign out. Not signed in → "Save my
  progress" → `/account` create/sign-in, which now creates the account
  session and links.
- Recover screen: signed in → list of the account's games with "Get this game
  back"; not signed in → sign-in first.
- Unverified banner on the map header and Settings until verified.

## Out of scope

Concurrent operate-and-play inside the same app session (the account
session exists, but the player app never enters operator mode), history
beyond the participation list, scores, solo joining, legacy native apps,
e2e API runs.

## Decisions taken during review (2026-09-10)

- A guest row a phone leaves behind when recovering is retired, never
  deleted: `check_ins`, locations and upload sessions cascade from it and
  belong to the team. Retirement is audited as a `team_switch` event.
- `V75` carries over only registrations with a known platform; guessing iOS
  would push FCM tokens through APNs, which then purges them.
- A phone keeps its push rows across the games it plays (release scoped to
  other device ids); a token still belongs to one phone.
- Public participant signup answers `EMAIL_ALREADY_TAKEN`; that is an
  existence oracle behind the join rate limiter, accepted so the app can say
  "sign in instead". `request-registration` keeps its silent behaviour.
- An invite takeover of an unverified parked address unlinks the parker's
  participations (they stay guests) instead of handing them to the mailbox
  owner.
