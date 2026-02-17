# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PointFinder is an NFC-based gaming platform for scouting organizations. Teams scan physical NFC tags at bases to complete challenges, with real-time monitoring by operators.

**Live URLs**: https://pointfinder.pt, https://pointfinder.ch

## Architecture

```
dbvnfc/
├── backend/         # Spring Boot 3.4.1 + Java 21 API
├── web-admin/       # React 19 + TypeScript admin panel
├── android-app/     # Kotlin Android app (modular architecture)
├── ios-app/         # Swift iOS app (native NFC)
├── nginx/           # Reverse proxy & SSL termination
└── docker-compose.yml
```

**Core entities**: Game → Bases (NFC locations) → Assignments → Challenges. Teams complete challenges via submissions reviewed by operators.

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

- **Backend**: Spring Boot 3.4.1, PostgreSQL 16, Flyway, JWT auth, WebSocket (STOMP), APNs/FCM push
- **Frontend**: React 19, Vite, TypeScript, Tailwind CSS, Zustand, React Query, Leaflet maps, i18next
- **Android**: Kotlin, Jetpack Compose, Hilt DI, Room, Retrofit, Firebase Cloud Messaging
- **iOS**: Swift, Core NFC, Core Location

## Database

Migrations in `backend/src/main/resources/db/migration/` (Flyway auto-applies on startup).

## Localization

Three languages supported: EN, PT, DE
- Frontend: `web-admin/src/i18n/locales/{en,pt,de}.json`
- Android: `android-app/app/src/main/res/values{,-de}/strings.xml`

## Real-time Features

- WebSocket endpoint: `/ws` (STOMP protocol)
- Activity feed broadcasts submission updates to operators
- Push notifications via APNs (iOS) and FCM (Android)

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

## File Upload

Files stored in Docker volume `uploads:/uploads`. Configure max size in backend application.yml.

## Documentation

Additional runbooks in `docs/`:
- `submission-feedback-flow.md` - Operator feedback handling
- `nfc-tag-rewrite-runbook.md` - NFC tag management procedures
- `localization-review.md` - Multi-language support status
