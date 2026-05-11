# Onboarding — PointFinder

Welcome. This document is a single page you can read **before** you have access to the codebase. It tells you what the platform is, who uses it, what it does, how the pieces fit together, and the non-obvious rules that govern its behaviour. By the end you should be able to talk about PointFinder confidently and know what to look for once you do open the source tree.

If something here disagrees with what you find in the code, the code wins — please update this document in the same change.

---

## 1. What PointFinder is

PointFinder is a real-world, NFC-driven game platform for scouting / Pathfinder organisations and similar youth groups. The product turns a physical outdoor event — a camp, a city game, a station-based mission day — into a digital experience.

The story is simple. An organiser sets up a game on a laptop: a list of physical bases (the scout hut, a tree by the river, the church car park), a challenge attached to each base, and the teams that will compete. The organiser writes a short identifier onto an NFC tag and physically sticks each tag at the matching location. On the day of the event, every team has a phone. They walk to a base, scan the tag, get the challenge, solve it, submit an answer (typed or photo / video), earn points if it is right, and move on. Organisers watch the whole thing unfold in real time on a map, review photo submissions as they come in, and — critically — can rescue teams who get stuck.

It exists because these events have always been run with paper, pens, walkie-talkies and a single overwhelmed event coordinator. PointFinder replaces the paper, automates the scoring, gives the coordinator a god-view, and — because half the events are in the woods where signal drops — works offline on the players' phones.

Today the platform is live and used in production. The product is intentionally team-focused: players never see scores, leaderboards, or points. They see status (pending / approved / rejected). Scoring is operator-side only. This is a deliberate, hard product rule to keep the social dynamic of the game intact.

The three live language locales are English, Portuguese and German.

---

## 2. The four kinds of human

Everything else in the system makes sense once you internalise who is using it.

| Role | How they sign in | What they do |
|---|---|---|
| **Admin** | Email + password (one is seeded at install time) | Cross-tenant. Sees every organisation and every game. Used for support and platform administration, not day-to-day game running. |
| **Operator** | Email + password. Accounts are only created by **accepting an emailed invite** | Builds a game. Places bases on a map. Writes challenges. Manages teams and players. Runs the event live. Reviews photo submissions. Rescues stuck teams. |
| **Player** | No password. Joins a team using a **join code** or a **QR code**, plus a chosen display name. Identified by their phone (a stable device identifier) | Walks to bases. Scans the NFC tag. Gets a challenge. Submits an answer. Sees their team's per-base progress. **Does not see scores.** |
| **Spectator** | No login at all. Visits a public link with a short broadcast code | Watches a leaderboard, an activity feed, and a live map. Useful for projecting on a screen at the event. |

There is no self-service operator signup. Operators always come in via an invite, because events are private and you do not want strangers operating someone else's game.

Operators belong to **organisations** (paid tenants). An organisation owns the games it creates, has a tier, has quotas (how many active games, how much storage, how many players), and pays for a subscription. There is also a "personal workspace" concept for operators who are not part of an organisation.

---

## 3. The big picture

PointFinder is one backend serving four clients: a web admin, an iOS app, an Android app, and a public spectator view. Everything runs behind a single reverse proxy that does TLS termination.

```
                         ┌──────────────┐
                         │   nginx      │  :80 / :443  TLS, rate limiting
                         │  + Certbot   │
                         └──────┬───────┘
              ┌─────────────────┼─────────────────┐
              ▼                 ▼                 ▼
     ┌────────────────┐  ┌────────────┐  ┌──────────────┐
     │  Web Admin     │  │  REST API  │  │  WebSocket   │
     │  React SPA     │  │  /api/*    │  │  /ws and     │
     │  (static)      │  └─────┬──────┘  │  /ws/mobile  │
     └────────────────┘        │         └──────┬───────┘
                               └─────────────┬──┘
                                             ▼
                                ┌──────────────────────┐
                                │   Spring Boot API    │  Java 21
                                │   (single service)   │  internal :8080
                                └──────────┬───────────┘
                                           │
                          ┌────────────────┼────────────────┐
                          ▼                ▼                ▼
                  ┌───────────────┐  ┌──────────┐  ┌────────────────┐
                  │ PostgreSQL 16 │  │ Uploads  │  │ APNs / FCM /   │
                  │ + Flyway mig. │  │ on disk  │  │ Resend SMTP /  │
                  │               │  │ volume   │  │ Stripe         │
                  └───────────────┘  └──────────┘  └────────────────┘

   ┌───────────────┐         ┌───────────────┐         ┌──────────────┐
   │   iOS app     │         │  Android app  │         │  Spectator   │
   │  Swift / NFC  │         │ Kotlin / NFC  │         │  /live/CODE  │
   └───────────────┘         └───────────────┘         └──────────────┘
```

The whole stack is shipped as Docker containers driven by Compose. The reverse proxy is the only thing exposed to the internet. The web admin is a static build served behind nginx. The API is reverse-proxied at `/api`. WebSockets at `/ws` (web) and `/ws/mobile` (phones). Uploaded files live on a shared volume and are served only through authenticated endpoints — they are not public.

The same backend serves all clients. There is no separate "player API" service — player endpoints live in the same app and are role-gated. There are also two distinct WebSocket transports: a STOMP-over-SockJS endpoint for the web admin (because browsers historically benefit from the SockJS fallback), and a raw native WebSocket for the mobile apps (cleaner, fewer moving parts on a phone).

Operationally there are also Stripe (for billing), Resend (for transactional email and operator invites), APNs (Apple push), and FCM (Android push) hanging off the backend. All of those are feature-flagged — none are required to run the app locally.

---

## 4. The domain — learn this first

The whole product is one mental model layered on top of nine concepts. Get these and the rest is detail.

```
Organisation ──owns──► Game ───┬─► Stage          (ordered phases that unlock over time)
                       (state) │
                               ├─► Base           (a physical place + an NFC tag)
                               │   └─ optional fixed Challenge
                               │
                               ├─► Challenge      (text / photo / video / check-in-only)
                               │
                               ├─► Assignment     (which Challenge a Team gets at a Base)
                               │
                               └─► Team ──► Player
                                       │       │
                                       │       └─► Submission     (an answer)
                                       │       └─► CheckIn        (one per base)
                                       │       └─► Location       (live GPS)
                                       │
                                       └─► TeamVariable           (per-team values)
```

### The nine concepts

- **Organisation** — a paid tenant. Owns a set of games. Has a tier, quotas, and a subscription. Operators belong to one or more organisations and have permissions inside each one.
- **Game** — the event. Has a status: `setup` → `live` → `ended` (with allowed reverse transitions). Has a start date, an end date, a name, a description, and a flag that decides whether all teams get the same challenges or different ones.
- **Stage** — an optional ordered phase inside a game. A base can belong to a stage; if it does, players cannot see that base until the stage is active. Stages activate manually, on a schedule, or when a specific base is completed. A game without stages just behaves as one giant stage.
- **Base** — a physical location with latitude / longitude and an NFC tag bound to it. Has a name (operators see it; players do not — see §6) and three behaviour flags: NFC linked, requires presence, hidden. Optionally pins a "fixed challenge" so the base always shows the same challenge regardless of normal assignment rules.
- **Challenge** — a task. Has an answer type (`text`, `file` for photo or video, or `none` for check-in-only). Has points. May auto-validate on text answers. Has rich text content shown when the player arrives, and optional "completion content" shown when they finish (lore, the next clue). Can have operator-only notes that players never see.
- **Team** — a competing group. Has a join code (auto-generated, what players type), a colour, and a list of players. Teams are scoped to one game.
- **Player** — a phone, basically. Identified by `(deviceId, team)`. No password. Display name is visible to operators only.
- **Assignment** — the link between a Base and a Challenge, optionally scoped to a single Team. This is the table that makes a base playable. See §5.
- **Submission** — a team's answer for one base. Has a status: `pending`, `correct`, `incorrect`, `approved`, `rejected`. Carries the answer text or a media reference, optional operator feedback, and an idempotency key so retries from a flaky network do not double-submit.

### Useful supporting concepts

- **CheckIn** — a record that a team has scanned the NFC at a base. There can be at most one per (team, base). It is the gate that opens the challenge.
- **ActivityEvent** — an append-only log of everything important that happens in the game. Powers the activity feed, the audit export, and the WebSocket broadcasts.
- **TeamVariable** — a per-team value, referenced from challenge content with `{{variableName}}`. Lets every team get personalised text, coordinates, code words, etc.
- **GameTag** — a small, game-scoped, named-and-coloured label that operators stick on bases and challenges to organise large games. Players never see them.
- **Resource** — a folder-tree of operator-uploaded files (images, documents) reusable across games inside an organisation.
- **UploadSession** — a chunked, resumable file upload. Photos and videos are too big to send in one shot, so they are split into chunks; the server tracks progress and the client can resume after a network drop.

---

## 5. The core gameplay loop — read this twice

This is the loop that the entire product exists to support.

```
   ┌────────────────────────────────────────────────────────────┐
   │  The team walks to a base.                                 │
   │  A player scans the NFC tag.                               │
   └─────────┬──────────────────────────────────────────────────┘
             ▼
       [check in]   ──► creates CheckIn row + ActivityEvent
             │              + broadcasts on WebSocket
             ▼
       Resolve which challenge this team gets at this base
       (precedence: team-specific assignment > all-teams
        assignment > base's fixed challenge)
             ▼
       Show the challenge to the player
             ▼
       Player submits an answer (text, photo, or video)
             │
             ├─ answerType = none  ────────────────► auto-approved
             │
             ├─ answerType = text and auto-validate
             │     ├─ matches expected (case-insensitive)? → correct
             │     └─ no match?                            → rejected
             │
             └─ answerType = file, or no auto-validate    → pending
                                       │
                          [operator reviews on web]
                                       │
                              approved or rejected
             ▼
       Points awarded on correct/approved.
       ActivityEvent + WebSocket broadcast.
       Player sees status (NOT points) update.
```

A few non-obvious mechanics that govern this loop:

**Assignment precedence.** When a team arrives at a base, the backend picks exactly one challenge for that team. The order is: a team-specific assignment for `(base, this team)`, then an all-teams assignment for `(base, any team)`, then the base's pinned "fixed challenge", and within ties the most recently created wins. The "uniform assignment" flag on a game decides how the initial assignment table is built when the game goes live: uniform means every team gets the same challenge at every base; non-uniform means each team gets a different challenge at each base, drawn from the pool, which is why the backend insists on enough challenges to cover the bases at go-live time.

**Check-in is the gate, not "require presence to submit".** The flag on a base named "require presence to submit" is a UI hint. The actual server-side rule is that you cannot submit at a base where you do not have a check-in row. That is the gate. There is also a per-challenge "require presence to submit" which forces a fresh NFC re-scan at submission time — that one is enforced by the client.

**Auto-validation is text-only.** Photo and video submissions are always reviewed by an operator. Text answers can be auto-graded if the operator turned that on; the comparison is case-insensitive and supports a list of accepted answers. Per-team variables can also be referenced in the expected answer, so the "right answer" can differ per team.

**Hidden bases stay hidden until visited.** A hidden base is invisible on the player's map until the team has checked in. There is no list-hidden-bases endpoint; discovery is the NFC scan itself.

**Stages gate visibility further.** If stages are in use, a base attached to an inactive stage is invisible regardless of "hidden". When a stage activates (manually, on schedule, or by trigger), all the bases attached to it become visible at once.

**Idempotency keys are forever.** Every submission carries a client-generated idempotency key. The unique index on the database ensures a retried submission returns the existing row instead of creating a duplicate. This is the contract that makes offline-first mobile sync safe — change it lightly at your peril.

**Operator rescue actions.** Real events go wrong: a tag breaks, a phone dies, a team reaches the end and the app got stuck. Operators have three reversible rescue tools:
- **Manual check-in** — record a check-in for a team at a base without the NFC scan.
- **Mark completed** — synthesise an approved submission for a (team, base, challenge) triple, awarding the points immediately.
- **Unlock override** — force a hidden / locked base visible to one specific team, regardless of the normal unlock chain. This one is reversible (soft-deleted).

All three are audited with who, when, why, and what changed. They never silently push notifications to the team — they just write the corrected state and let realtime sync deliver it.

---

## 6. The privacy contract that shapes the API

This is the single most important non-obvious rule in the product, and the code is heavily defended around it.

**Operators see operator-oriented metadata. Players see player-oriented metadata. The two never mix on the wire.**

Concretely:

- Players never see **scores, points, leaderboards, or rankings.** Anywhere. Not on their team, not on submissions, not on their own progress.
- Players never see **base names, base descriptions, operator notes, tags, or colours.** Players see the **challenge title** instead, because mentally the player is "doing this challenge", not "at this place doing this challenge".
- Operators see all of the above for the games they have access to.
- Spectators (broadcast view) see leaderboards and an activity feed, but never player identities, device IDs, challenge content, answers, or operator data.

The backend enforces this by serving **structurally different** response shapes to player and operator endpoints — the player response type literally does not have a field for "name" or "score" or "points", so a future regression would fail to compile rather than leak data. There are also runtime tests that walk the serialised JSON to confirm none of those keys appear at any nesting depth on player endpoints. If you ever find yourself adding a field to a response, ask which audience it is for, and never reuse the operator response for a player route.

---

## 7. The game lifecycle

A game is in exactly one of three states at any time.

| State | What it means | What players can do |
|---|---|---|
| **setup** | Operators are still building. | Cannot join, check in, or submit. |
| **live** | The event is running. | Full gameplay enabled. |
| **ended** | The event is over. | Read-only. Cannot check in or submit. Operators can still review pending submissions. |

Allowed transitions: `setup → live`, `live → ended`, and backwards `live → setup`, `ended → live`, `ended → setup`. Going back to `setup` can optionally reset progress; reset does not delete history (that would destroy the audit trail) but archives it, so the game starts visually fresh while the audit export still has the full record.

To go from `setup` to `live`, the game has to pass an eight-point readiness check:

1. At least one base.
2. At least one challenge.
3. At least one team.
4. Every base has an NFC tag linked.
5. Every base has at least one challenge assigned.
6. Every location-bound challenge is assigned to a base that has GPS coordinates.
7. If uniform assignment is on, there are enough unique challenges to cover the bases.
8. Every team variable referenced in any challenge content resolves for every team.

The backend enforces all eight; the web admin shows them as a pre-flight checklist on the game's overview page so the operator knows what is missing before clicking Go Live. The mobile apps just call the API and surface the error — they do not duplicate the checklist.

A separate background scheduler polls every minute and auto-ends games whose end date has passed. Auto-end is silent — it does not push a notification. Players see the game flip to `ended` on their next request or WebSocket event.

---

## 8. Real-time, push, and offline

Three different mechanisms keep everyone's view of the game in sync. Understanding why each one exists is critical.

**Realtime is invalidation; the snapshot is canonical.** The product rule is: a client should always be able to ask the server for the truth. WebSocket events are the fast path that say "something changed, refresh"; a single `GET snapshot` endpoint returns the entire authoritative view of the game, and clients can call it any time — on reconnect, on app foreground, when they suspect they missed an event. Every state-changing event also bumps a monotonically-increasing version number on the game so clients can compare what they last saw against what is current and decide whether to reconcile.

### WebSocket topics

Events are split across three topic families to enforce the privacy contract at the transport layer:

- A **game-wide topic** carries non-sensitive events that anyone in the game (operator, player, spectator) can subscribe to: activity feed entries, location pings, presence, broadcast notifications, game status changes, configuration edits, and stage unlocks.
- An **operator-only topic** carries the full-fat review payload (points, feedback, who reviewed) and leaderboard-change signals. The server rejects player and spectator subscriptions to this topic.
- A **per-team topic** carries a sanitised version of submission status changes — status only, no points, no feedback — for the team's own submissions. A player whose token says they are on team X can only subscribe to team X's topic.

The mobile WebSocket transport applies the same split conceptually, but filters per-message at the server based on the principal that authenticated the handshake.

### Push notifications

Operators can opt in per game to push notifications for new pending submissions, all submission status changes, or check-ins. Players receive operator broadcasts, submission decisions (with feedback) and game status changes. iOS goes through APNs, Android through FCM. Both are feature-flagged off by default — running locally without push works.

### Offline on mobile

The mobile apps are offline-first, because the field reality is "no signal in the woods". Both apps:

- Cache the full game data (bases, challenges, assignments, progress) locally.
- Queue check-ins and submissions to local storage when offline.
- Drain the queue automatically when the network returns, with exponential backoff, capped retries, and idempotency keys so a retry does not duplicate.
- Resume chunked media uploads across app kills, network drops, and reboots — a half-uploaded video stays half-uploaded, not lost, until the player retries the submission, even days later.

There is a deliberate non-negotiable rule on the upload subsystem: the background detector that flags "completed-but-not-linked" uploads is **alert-only**. It never deletes anything, never garbage-collects, never fails a session. Players' work is durable until they recover it.

---

## 9. Authentication and authorisation

The auth model is intentionally split by audience.

**Operator auth** is email + password. Login returns a short-lived (15 minute) access token and a longer (7 day) refresh token; the refresh token is single-use and rotated on every refresh. Sessions cap at 30 days absolute and 5 concurrent refresh tokens per user — older tokens are pruned on overflow. There is brute-force protection: 10 failed logins in a window locks the email for 15 minutes. Passwords can be reset via an emailed link; reset tokens last 1 hour and are capped per user.

**Player auth** is `(joinCode, displayName, deviceId)`. The server returns one long-lived token (7 days). There is no refresh flow — players just re-join if their token expires, which is fine because the join code is the only secret and they have it. The same `(deviceId, team)` always resolves to the same player record, so a player who closes the app and rejoins keeps their identity.

**Token storage**:
- Web admin: access token in memory only (XSS safety), refresh token in localStorage.
- iOS: both tokens in the Keychain.
- Android: encrypted shared preferences.

**Role hierarchy**:
- **Admin** — global, sees and does anything. Used sparingly.
- **Operator** — game-scoped. Can only access games their organisation owns and where they have membership.
- **Player** — team-scoped. Can only call player endpoints for their own team and game.

Authorisation is enforced server-side on every request, and on every WebSocket handshake. If a token is rejected mid-session the WebSocket sends a typed error frame so the client can force a logout cleanly instead of silently disconnecting.

---

## 10. Operator workflow at a glance

Here is what an operator actually does in a typical event lifecycle. This is the user journey worth holding in your head when you read product tickets.

1. **Sign up via invite** — receive an email, click the link, set a password, land in a workspace. If the inviter targeted a specific game, the new operator joins that game's operator roster automatically.
2. **Create or open a game** in the dashboard.
3. **Build the game** in the workspace. Most operators use the **unified Bases & Challenges view**, which presents bases with their pinned challenge as a single card. The legacy split views (separate Bases page, separate Challenges page, separate Assignments page) remain available for advanced workflows: random per-team assignments, team-specific overrides, multi-stage configurations.
4. **Define teams** with names and join codes, optionally upload a CSV / paste a list of teams.
5. **Configure team variables** if the challenges use them. The completeness checker tells the operator which (team, key) pairs are missing.
6. **Define stages** if the event has phases that should unlock over time.
7. **Write the NFC tags** from the iOS or Android operator app — pick a base, write its identifier onto a blank tag, stick the tag at the location.
8. **Verify readiness** — the overview page shows the eight-point go-live checklist. Anything red gets fixed.
9. **Click Go Live.** The game flips state, the WebSocket fans out, and players can join.
10. **Run the event live** from the monitoring surfaces:
    - Live map of bases and team positions.
    - Activity feed of check-ins, submissions, and operator actions.
    - Submission review queue (split-pane: list on the left, detail with photo / video preview and approve/reject controls on the right).
    - Leaderboard.
    - Per-team detail view with progress, rescue actions, and unlock overrides.
    - Operator-to-player notifications, broadcast or per-team.
11. **Rescue stuck teams** with manual check-in, mark completed, or unlock override.
12. **End the game** manually, or let the auto-end scheduler do it at the configured end date.
13. **Export the audit log** as CSV or JSON for incident review and post-mortems. The export is a chronological, actor-attributed log of everything that happened, with optional filters by team, player, operator, action type, time window, and source surface.

---

## 11. The product is multi-tenant and metered

PointFinder is sold as a SaaS. Three things follow from that:

**Organisations and tiers.** Operators belong to an organisation. Each organisation has a tier (with display names like "individual", "base", "high"), which sets quotas: how many active games, how many players per game, how much storage in total. Tiers map to Stripe price IDs; a Stripe webhook keeps the local subscription state in sync.

**Personal workspaces.** An operator who is not part of an organisation has a personal workspace — effectively a one-person organisation with its own quota.

**Quotas are enforced.** The backend rejects creating an active game when the org is at its game cap, rejects new players when the game would exceed its player cap, rejects file uploads when the org is over its storage limit. Quota errors are typed so the UI can surface them clearly. The UI side of "show me my current usage" is still being polished — the data is there in the API but the operator-facing presentation is on the punch list.

**Resources are organisation-wide.** Operators can upload images and documents into a folder tree at the organisation level and reuse them across games (e.g., a logo, a poster, a stock photo bank).

---

## 12. The non-obvious rules — read before you debug

These are the things that have already cost someone an afternoon. Internalise them now.

1. **Players never see scores or points.** Anywhere. This is enforced structurally, not by convention. If you find yourself adding a "score" field to a player response, stop.
2. **Operators see "base names"; players see "challenge titles".** Same physical thing, different labels for different audiences. Do not mix the two.
3. **Refresh tokens are single-use.** Each refresh deletes the old token and issues a new pair. Two tabs racing the refresh will log one of them out unless the client deduplicates — which the production clients do.
4. **The check-in row is the gate to submission**, not the "require presence" flag on the base. The flag is informational.
5. **Auto-validation is text-only**, case-insensitive, and supports multiple acceptable answers per challenge. Photo and video are always operator-reviewed.
6. **The "uniform assignment" flag on a game changes the meaning of go-live readiness.** Non-uniform games need enough unique challenges to cover the bases.
7. **Hidden bases are invisible until visited**, and stages further gate visibility. There is no "list hidden bases" endpoint — discovery is the NFC scan.
8. **Assignment precedence is recency-wins within a tie.** A manual assignment added to a live game will silently override an auto-assignment. Useful, but surprising the first time.
9. **Resetting a game's progress does not delete data.** It archives it. The audit export still sees the archived rows. Live gameplay queries hide them.
10. **Operator rescue actions never push to players.** They write the corrected state and let realtime sync deliver it. If you want to message the team, send a notification separately.
11. **The "needs attention" upload detector is alert-only.** It never deletes, never modifies, never garbage-collects. Player media is durable until the player retries the submission. This is non-negotiable.
12. **The state-version counter is not Hibernate `@Version`.** It is a separate atomic counter on the game row used to invalidate client caches. Confusing the two would change save semantics for the entire game-edit path.
13. **Realtime is invalidation; snapshot is canonical.** A WebSocket disconnection is recoverable: clients foreground the app, hit the snapshot endpoint, and reconcile against the version number. Trust the snapshot, never the local cache.
14. **Idempotency keys are forever.** They are not garbage-collected. That is the property that makes mobile retries safe.
15. **Operator notes, tags, and colours never appear on player endpoints.** The serialised JSON is checked at build time to make sure.
16. **Two WebSocket transports exist for a reason.** The web uses STOMP-over-SockJS for browser compatibility; the mobile apps use a raw native WebSocket because they have no SockJS need and benefit from the simpler protocol. Do not collapse them.
17. **Mobile apps are offline-first.** Anything you change in the submission or check-in API has to remain backwards-compatible with queued actions sitting on a phone that has been in airplane mode for four hours.
18. **The activity feed is the audit spine.** Every meaningful action emits exactly one activity event with a full actor snapshot (display name and device ID at action time). The audit export reads the activity feed as ground truth, not the underlying tables.
19. **Mobile parity is not perfect.** Android trails iOS on a few features (no broadcast view, partial template variable rendering, no "require presence to submit" gate at submission time, no full go-live readiness checklist). The platform implementation matrix is the source of truth — iOS tends to lead, Android follows.
20. **There are admin routes that look like operator routes.** A system admin signed in to the web admin sees a different dashboard than an operator. Do not assume the dashboard you are looking at is "the" dashboard.

---

## 13. Where the project is going

The platform is functional, deployed, and used. Open work falls into three buckets:

**Product polish.** Quotas need a friendly UI (today they are visible only as raw JSON). The system-admin dashboard needs a back-button discipline pass. Personal workspace navigation has a known dead-end. German localisation needs review. Some mobile screens lag iOS — Android's go-live checklist, Android's variable rendering, Android's presence gate.

**Reliability.** The post-pilot wave has hardened the platform with audit foundations, rescue actions, structured logging, accessibility fixes, list virtualisation, and a tag vocabulary unification. Further hardening is ongoing.

**Growth.** App Store and Play Store publication. Public marketing site polish. Onboarding flow for new organisations.

Long-term, the design principle is: **build a unified operator view as an aggregate over the existing model first; do not collapse the underlying base / challenge / assignment model until the product behaviour is proven.** The unified Bases & Challenges view is a presentation-layer aggregate, not a schema change. That principle holds for every future "let's simplify the model" temptation.

---

## 14. A reasonable first week

1. **Day 1** — Read this document twice. Stand up the local stack, seed an admin user, log in to the web admin, create a game, click through every tab.
2. **Day 2** — Build a real game end-to-end on the web. Two bases, two challenges, two teams. Mark it ready, go live, end it. Look at the audit export.
3. **Day 3** — Install the iOS or Android app on a real phone (NFC needs hardware). Write a tag from the operator side, scan it from a player side using a separate device, watch the WebSocket events flow into the web monitor.
4. **Day 4** — Pick one operator rescue action (mark-completed, unlock override, or manual check-in) and follow a check-in / submission / review through every layer: backend, web admin UI, iOS or Android, audit log, push notification.
5. **Day 5** — Read this document a third time and propose corrections to any line you found wrong.

Welcome aboard.
