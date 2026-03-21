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

- 22 tables, 27 Flyway migrations in `backend/src/main/resources/db/migration/`
- Flyway runs in validation mode (no auto-DDL) on startup
- Key entities: Game, Base, Challenge, Assignment, Team, Player, Submission, CheckIn, UploadSession, TeamVariable
- Unique constraints: one check-in per team per base, idempotent submissions via idempotency_key

## Localization

Three languages: EN, PT, DE (533 keys each in frontend)
- Frontend: `web-admin/src/i18n/locales/{en,pt,de}.json` — hostname-based detection (pointfinder.pt → PT, pointfinder.ch → DE)
- Android: `android-app/app/src/main/res/values{,-de}/strings.xml`
- iOS: Standard .strings localization

## Real-time Features

- **WebSocket**: Endpoint `/ws` (STOMP protocol, SockJS fallback). Mobile endpoint `/ws/mobile?gameId={uuid}` (native WebSocket).
- **Broadcast topics** (via `/topic/games/{gameId}`):
  - `activity` - submission updates
  - `submission_status` - review decisions
  - `leaderboard` - score changes
  - `location` - team movements
  - `notification` - player notifications
  - `game_status` - lifecycle changes (setup/live/ended)
  - `presence` - operator online status
- **Push notifications**: APNs (iOS) and FCM (Android), disabled by default. Operator notification preferences per game.
- **Offline support**: Both mobile apps queue check-ins and submissions locally. Auto-sync on reconnect with exponential backoff (max 5 retries).

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
- **Chunked uploads**: 8MB default chunk, 16MB max chunk, 48hr session TTL
- **Limits**: 2GB max per file, 3 concurrent sessions per player, 16GB max per game
- **Resumable**: Upload sessions track progress; clients can resume interrupted uploads

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
