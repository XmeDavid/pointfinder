# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PointFinder is an NFC-based gaming platform for scouting organizations. Teams scan physical NFC tags at bases to complete challenges, with real-time monitoring by operators.

**Live URLs**: https://pointfinder.pt, https://pointfinder.ch

## Architecture

```
dbvnfc/
├── backend/         # Spring Boot 3.4.13 + Java 21 API
├── web-admin/       # React 19 + TypeScript admin panel
├── android-app/     # Kotlin Android app (modular architecture)
├── ios-app/         # Swift iOS app (native NFC)
├── nginx/           # Reverse proxy & SSL termination
└── docker-compose.yml
```

**Core entities**: Game → Bases (NFC locations) → Assignments → Challenges. Teams complete challenges via submissions reviewed by operators.

## Game Lifecycle

States: `setup` → `live` → `ended` (can revert to setup or live from ended)

**Go-live readiness checklist** (enforced by backend):
1. Game has at least one base
2. Game has at least one challenge
3. Game has at least one team
4. All bases have NFC tags linked
5. All assignments are valid (base + challenge exist)
6. Location-bound assignments have bases with coordinates
7. Team variables are complete (if used)

**Core flow**: Teams scan NFC tags at bases → check in → complete assigned challenges → submit answers (text/photo/video) → operators review submissions → points awarded

## Build & Test Commands

### Root Makefile
```bash
make test-all               # Run all test suites
make test-docker           # Backend + frontend tests in Docker
make test-backend-docker   # Backend tests only
make test-frontend-docker  # Frontend lint + tests
make test-android          # Android unit tests + assemble
make test-ios              # iOS tests (requires macOS)
```

### Backend
```bash
cd backend
./gradlew bootRun          # Start dev server (port 8080)
./gradlew test             # Run tests
./gradlew build            # Build JAR
```

### Frontend
```bash
cd web-admin
npm install
npm run dev                # Vite dev server (port 5173)
npm run build              # Production build
npm run lint               # ESLint
npm run test               # Vitest
```

### Android
```bash
cd android-app
./gradlew :app:assembleDebug
./gradlew :core:model:test     # Run specific module tests
./gradlew :core:data:test
./gradlew :core:network:test
```

### Docker
```bash
docker-compose up -d       # Start full stack
```

## Key Technologies

- **Backend**: Spring Boot 3.4.13, Java 21, PostgreSQL 16, Flyway, JWT auth (HS256, 15-min access / 7-day refresh), WebSocket (STOMP), APNs/FCM push
- **Frontend**: React 19, Vite, TypeScript, Tailwind CSS, Zustand (auth store), React Query (30s staleTime), MapLibre GL maps, i18next (EN/PT/DE, hostname-based detection)
- **Android**: Kotlin, Jetpack Compose, Hilt DI, Room (SQLCipher encrypted), Retrofit, FCM, MapLibre GL, offline queue with WorkManager sync
- **iOS**: Swift, SwiftUI, Core NFC (read/write), Core Location, URLSessionWebSocketTask, APNs, Keychain, offline queue with SyncEngine, async/await Actors

## Authentication

- **Operator**: Email/password login → access token (15 min) + refresh token (7 days). Auto-refresh on 401.
- **Player**: Join code + display name → single JWT (7 days). Device-ID based identification.
- **Roles**: ADMIN, OPERATOR (game-scoped), PLAYER (team-scoped)
- **Storage**: Backend JWT (HS256). Frontend: access token in-memory, refresh in localStorage. Android: EncryptedSharedPreferences. iOS: Keychain.

## Database

- 24 tables, 42 Flyway migrations in `backend/src/main/resources/db/migration/`
- Flyway runs in validation mode (no auto-DDL) on startup
- Key entities: Game, Base, Challenge, Assignment, Team, Player, Submission, CheckIn, UploadSession, TeamVariable, GameTag, BaseUnlockOverride, AuditEvent
- Post-pilot additions: game_tags table (V40), base_unlock_overrides table (V36), audit_event table (V36)
- Unique constraints: one check-in per team per base, idempotent submissions via idempotency_key, case-insensitive tag label per game

## Localization

Three languages: EN, PT, DE (533 keys each in frontend)
- Frontend: `web-admin/src/i18n/locales/{en,pt,de}.json` — hostname-based detection (pointfinder.pt → PT, pointfinder.ch → DE)
- Android: `android-app/app/src/main/res/values{,-de}/strings.xml`
- iOS: Standard .strings localization

## Real-time Features

- **WebSocket endpoints**:
  - `/ws` (legacy, STOMP + SockJS fallback) for web-admin
  - `/ws-native` (raw STOMP, no SockJS) for mobile clients
  - `/ws/mobile?gameId={uuid}` (native WebSocket, iOS/Android)
  - Custom endpoint via `VITE_WS_URL` environment variable (web-admin build arg)
- **STOMP authentication**: Uses bearer JWT in `Authorization` header. On auth failure, server sends STOMP ERROR frame with `error-code: WS_ACCESS_DENIED` header; clients must force logout and re-authenticate.
- **Broadcast topics** (via `/topic/games/{gameId}`):
  - `activity` - submission updates
  - `submission_status` - review decisions
  - `leaderboard` - score changes
  - `location` - team movements
  - `notification` - player notifications
  - `game_status` - lifecycle changes (setup/live/ended)
  - `presence` - operator online status
- **Error codes**: Machine-readable error responses with codes (e.g., `WS_ACCESS_DENIED`, `MARK_COMPLETED_REQUIRES_CHECKIN`). See `docs/api-reference.md` for full ErrorCode reference.
- **Push notifications**: APNs (iOS) and FCM (Android), disabled by default. Operator notification preferences per game.
- **Offline support**: Both mobile apps queue check-ins and submissions locally. Auto-sync on reconnect with exponential backoff (max 5 retries).
- **JWT refresh**: Access tokens (15 min) auto-refresh before expiry using stored refresh tokens (7 days). Transparent to clients; no user action required.

## Android Module Structure

```
android-app/
├── app/              # Navigation, DI setup
├── core/
│   ├── model/        # DTOs, domain models
│   ├── network/      # Retrofit/OkHttp
│   ├── data/         # Repositories, Room
│   ├── platform/     # NFC/location/push
│   └── i18n/         # Locale management
└── feature/
    ├── auth/         # Authentication
    ├── player/       # Player gameplay
    └── operator/     # Operator monitoring
```

## iOS App Structure

```
ios-app/dbv-nfc-games/
├── App/              # AppDelegate, root ContentView
├── Components/       # Shared UI components
├── Features/
│   ├── Auth/         # WelcomeView, PlayerJoinView, OperatorLoginView
│   ├── CheckIn/      # Check-in flow
│   ├── Map/          # Map views
│   ├── Notifications/ # Notification views
│   ├── Operator/     # OperatorHomeView, game management
│   ├── Settings/     # Settings views
│   └── Solve/        # Challenge solving
├── Navigation/       # Navigation management
├── Services/         # APIClient (actor), NFC read/write, Location, Push, OfflineQueue, SyncEngine, MobileRealtimeClient
├── Models/           # DTOs matching backend responses
└── Utils/            # Utility helpers
```

## File Upload

- Storage: Docker volume at `/uploads`, served through authenticated API endpoints (not static nginx)
- **Chunked uploads**: 8MB default chunk, 16MB max chunk, 24hr session TTL
- **Limits**: 2GB max per file, 3 concurrent sessions per player, 16GB max per game
- **Resumable**: Upload sessions track progress; clients can resume interrupted uploads
- See `docs/resumable-media-upload-rollout.md` for complete feature details

## Post-pilot Reliability Workstream

The post-pilot wave (31 commits, 2026-04-01 to 2026-04-08) hardened the platform with operator rescue actions, structured logging, accessibility fixes, performance wins, and tag vocabulary unification.

### Operator Rescue Actions

Three reversible operator actions to unblock stuck teams during live games:

1. **Manual check-in** (`POST /games/{gameId}/teams/{teamId}/bases/{baseId}/manual-checkin`): Operator bypasses player NFC scan. Creates check-in record without requiring submission. Emits audit event `MANUAL_CHECKIN`. Error codes: `MANUAL_CHECKIN_ALREADY_CHECKED_IN` (idempotent, safe to retry).

2. **Mark completed** (`POST /games/{gameId}/teams/{teamId}/bases/{baseId}/mark-completed`): Operator marks a challenge as completed without requiring submission. Must have prior check-in. Awards points immediately. Emits audit event `MARK_COMPLETED`. Error codes: `MARK_COMPLETED_REQUIRES_CHECKIN`, `MARK_COMPLETED_ALREADY_COMPLETED`.

3. **Unlock override** (`POST /games/{gameId}/teams/{teamId}/bases/{baseId}/unlock-override` / `DELETE` to remove): Operator grants/revokes visibility of locked bases. Reversible (soft-delete preserves history). Both create and remove emit audit events. Visible in operator UX as per-base toggles on team detail.

All rescue actions are:
- **Audited**: Emitted as structured audit events with operator ID, timestamp, action type
- **Visible**: Activity feed shows rescue actions with operator attribution
- **Reversible**: Operators can undo unlock overrides; manual check-in and mark-completed create idempotent records

See `docs/api-reference.md` sections "Manual Check-in", "Mark Completed", "Unlock Override" for endpoint details and error codes.

### Game Tags

Game-scoped tag vocabulary replaces per-item tags and colors:

- **Per-game limit**: 50 tags max per game (enforced by `GameTagService.MAX_TAGS_PER_GAME`)
- **Creation**: Tags can optionally specify color (hex); if omitted, a randomized color from a 16-hue palette is assigned
- **Case-insensitive duplicates**: Tag labels are case-insensitive; duplicate creation rejected with error code `TAG_LABEL_DUPLICATE`
- **In-use protection**: Tags cannot be deleted if linked to bases or challenges; error code `TAG_IN_USE`
- **Color accessibility**: Operator-chosen colors are checked for readability via `getReadableTextColor()` WCAG luminance helper; this ensures text on colored tag backgrounds is readable
- **Mobile parity**: iOS and Android both have ManageTagsScreen (Kotlin Compose / SwiftUI) for full CRUD

See `docs/business-logic.md` "Game Tags" section for vocabulary details; `docs/api-reference.md` tags endpoints for API contract.

### Base↔Challenge Navigation

Operators can navigate between linked bases and challenges via cross-navigation UI:

- **Hook**: `useLinkedCounterpart` (web-admin) resolves base→challenges and challenge→bases via assignments
- **Card affordances**: Base and challenge list cards show "Linked [N] challenge(s)" / "Linked [N] base(s)" with click-through
- **Deep linking**: `?edit={id}` URL parameter auto-opens the linked resource in edit dialog (dirty-state warning if unsaved changes)
- **Visibility**: Linkages are displayed on list cards and in edit dialogs to improve operator workflow

### NFC Hardware State Handling

Mobile apps now block check-in when NFC is unavailable:

- **iOS**: `NFCTagReaderSession.readingAvailable` is checked on view appear; if false, check-in screen shows "NFC is turned off" with settings link
- **Android**: `NfcAdapter` state is checked via `isEnabled()` and `ACTION_NFC_SETTINGS` intent is provided for quick access
- **Operator impact**: If all players are blocked, operator can use manual check-in rescue action to proceed

### Accessibility & Performance

- **Accessibility**: High-severity dialog, form, and screen reader fixes across operator surface (Wave 3a)
- **Performance**: List virtualization on submissions/activity via react-window; lazy-load xlsx; memoization on operator monitoring views; RealtimeHealthWidget now WebSocket-invalidated instead of polled
- **Audit export**: CSV export includes structured audit events with formula injection protection (neutralized by prefixing formulas with `'`)

### Operator Logging

Every rescue action, tag CRUD, audit export, and game status change is logged at INFO level with contextual fields (gameId, operator, action, result). Auth failures logged at WARN. Enables troubleshooting and compliance audits.

See `docs/api-reference.md` "Error Codes" appendix and `docs/business-logic.md` "Audit Trail" for full reference.

## E2E Testing

End-to-end tests live in `e2e/` and run against a local Docker-backed E2E stack by default.

```bash
cd e2e
cp .env.example .env       # Default template targets local Docker stack
npm install
npx playwright install chromium

./run.sh smoke             # Local API smoke test (critical path)
./run.sh api               # Local stack + full API test suite
./run.sh web               # Local stack + web UI tests (Playwright)
./run.sh ios               # iOS Maestro flows
./run.sh android           # Android Maestro flows
./run.sh all               # Everything: API + web + iOS + Android
./run.sh parity            # Check scenario coverage across layers
./run.sh cleanup           # Delete orphaned E2E games
./run.sh local:up          # Start local Docker E2E stack
./run.sh local:down        # Stop local Docker E2E stack
```

**Architecture:** Runner-owned lifecycle (`setup.ts` → tests → `cleanup.ts`). Two-tier fixtures: persistent main game (cross-layer continuity) + throwaway games (destructive tests). Parity registry in `scenarios.json` ensures API/web/mobile coverage stays in sync.

**Test IDs:** Web uses `data-testid`, iOS uses `accessibilityIdentifier`, Android uses `Modifier.testTag()` — all share the same naming convention (e.g. `login-email`, `create-game-btn`).

See `e2e/README.md` for full documentation.

## Documentation

Additional documentation in `docs/`:
- `api-reference.md` - Complete REST API endpoint reference
- `business-logic.md` - Game lifecycle, validation rules, cross-platform behavior
- `infrastructure.md` - Docker, nginx, CI/CD, environment variables
- `realtime-and-mobile.md` - WebSocket, push notifications, offline sync, NFC
- `resumable-media-upload-rollout.md` - Chunked upload feature details
- `gap-analysis.md` - Cross-platform feature gap analysis
