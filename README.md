# PointFinder

NFC-based gaming platform for scouting organisations (Pathfinders / Desbravadores).
Teams scan NFC tags at physical locations to unlock challenges, while operators manage games and monitor progress in real time.

## Architecture

```
                        ┌──────────────┐
                        │   nginx      │ :80 / :443
                        │  + Certbot   │ TLS termination, rate limiting
                        └──────┬───────┘
              ┌────────────────┼────────────────┐
              ▼                ▼                ▼
     ┌────────────────┐ ┌───────────┐ ┌──────────────┐
     │  Web Admin     │ │  REST API │ │  WebSocket   │
     │  React SPA     │ │  /api/*   │ │  /ws/*       │
     │  (static)      │ └─────┬─────┘ └──────┬───────┘
     └────────────────┘       │               │
                        ┌─────┴───────────────┘
                        ▼
              ┌──────────────────┐
              │  Spring Boot     │ :8080 (internal)
              │  Java 21         │
              └────────┬─────────┘
                       │
              ┌────────┴─────────┐
              │   PostgreSQL 16  │
              │   + Flyway       │
              └──────────────────┘

   ┌───────────────┐          ┌───────────────┐
   │   iOS App     │          │  Android App  │
   │   Swift / NFC │          │  Kotlin / NFC │
   └───────────────┘          └───────────────┘
```

## Repository layout

```
backend/          Spring Boot API (Java 21, Gradle)
web-admin/        React 19 + TypeScript operator dashboard
android-app/      Kotlin multi-module Android app
ios-app/          Swift iOS app (Xcode project)
nginx/            Reverse-proxy config & Dockerfile
e2e/              End-to-end tests (Playwright + Maestro)
scripts/          Utility scripts (e.g. create-admin.sh)
docs/             Design docs, store-submission guides
docker-compose.yml          Production stack
docker-compose.test.yml     CI / local test containers
Makefile                    One-command test runners
```

## Tech stack

| Layer | Stack |
|---|---|
| **Backend** | Spring Boot 3.4.1 · Java 21 · PostgreSQL 16 · Flyway · JWT (jjwt) · WebSocket (STOMP) · Resend SMTP · APNs (Pushy) · FCM (firebase-admin) · Prometheus metrics |
| **Web Admin** | React 19 · TypeScript · Vite 7 · Tailwind CSS 4 · Zustand · TanStack Query · MapLibre GL · TipTap rich-text editor · i18next (EN / PT / DE) · SSR pre-rendering |
| **Android** | Kotlin 2 · Jetpack Compose · Hilt · Retrofit / OkHttp · Room · Google Maps · NFC · Firebase Cloud Messaging |
| **iOS** | Swift · SwiftUI · Core NFC · Core Location · APNs · URLSession |
| **Infra** | Docker Compose · nginx · Let's Encrypt (Certbot) · GitHub Actions CI |

## Getting started

### Prerequisites

- **Docker + Docker Compose** — runs the full stack
- **Java 21** — backend local dev
- **Node.js 22** — web-admin local dev
- **Xcode** — iOS development (macOS only)
- **Android SDK (API 35)** + JDK 17/21 — Android development

### Run the production-like stack locally

```bash
# 1. Create a .env at the repo root with required secrets
#    (see docker-compose.yml for all ${VAR} references)
cp .env.example .env   # if an example exists, otherwise create manually

# 2. Start everything
docker compose up -d

# Services:
#   https://localhost        → web admin
#   https://localhost/api    → REST API
#   wss://localhost/ws       → WebSocket
```

> **Note:** The nginx container expects TLS certificates under `certbot/conf/`.
> For local dev without SSL, run the backend and web-admin individually (see below).

### Run individual services for development

**Backend**
```bash
# Uses application-dev.yml profile (in-memory or local Postgres)
cd backend
./gradlew bootRun
# API at http://localhost:8080
```

**Web Admin**
```bash
cd web-admin
npm install
npm run dev
# Dev server at http://localhost:5173
```

**Android**
```bash
cd android-app
cp .env.example .env
# Set API_BASE_URL and GOOGLE_MAPS_API_KEY
# Open in Android Studio or build from CLI:
./gradlew :app:assembleDebug
```

**iOS**
```bash
open ios-app/dbv-nfc-games.xcodeproj
# Build & run on simulator or device from Xcode
```

## Testing

All test targets are available via the root **Makefile**:

| Command | What it runs |
|---|---|
| `make test-docker` | Backend + web-admin tests in Docker containers |
| `make test-backend-docker` | Backend unit tests only (Docker) |
| `make test-frontend-docker` | Web-admin lint + tests (Docker) |
| `make test-android` | Android unit tests via Gradle on host |
| `make test-ios` | iOS tests via `xcodebuild` on host (macOS) |
| `make test-all` | All of the above |

Override the iOS simulator destination:
```bash
make test-ios IOS_DESTINATION="platform=iOS Simulator,name=iPhone 16"
```

### End-to-end tests

The `e2e/` directory contains Playwright (API + web) and Maestro (mobile) tests.
See [`e2e/README.md`](e2e/README.md) for setup and the full command table.

### CI

GitHub Actions (`.github/workflows/ci.yml`) runs backend, web-admin, and Android checks on every push / PR to `main`.

## Configuration

### Backend environment variables

| Variable | Purpose | Default |
|---|---|---|
| `SPRING_DATASOURCE_URL` | JDBC connection string | — |
| `SPRING_DATASOURCE_PASSWORD` | DB password | — |
| `SPRING_PROFILES_ACTIVE` | `dev` or `prod` | `prod` |
| `JWT_SECRET` | HMAC signing key (≥256 bits) | dev fallback |
| `CORS_ORIGINS` | Comma-separated allowed origins | `http://localhost:5173` |
| `MAIL_ENABLED` | Enable Resend email | `false` |
| `MAIL_PASSWORD` | Resend API key | — |
| `FRONTEND_URL` | Used in email links | `http://localhost:5173` |
| `APNS_ENABLED` | Enable Apple push notifications | `false` |
| `APNS_KEY_PATH` / `APNS_KEY_ID` / `APNS_TEAM_ID` | APNs credentials | — |
| `FCM_ENABLED` | Enable Firebase push notifications | `false` |
| `FCM_CREDENTIALS_PATH` / `FCM_PROJECT_ID` | FCM credentials | — |
| `APP_UPLOADS_PATH` | File upload directory | `/uploads` |

### Web Admin

| Variable | Purpose |
|---|---|
| `VITE_API_URL` | Backend API path (default `/api` in Docker) |
| `VITE_WS_URL` | WebSocket path (default `/ws` in Docker) |

### Android app

Configured via `android-app/.env` — see [`android-app/.env.example`](android-app/.env.example).

## Deployment

1. Populate `.env` at the repo root with production secrets (DB password, JWT secret, mail, push credentials).
2. Place APNs `.p8` key and Firebase service-account JSON under `secrets/`.
3. Set domain names in `init-letsencrypt.sh` and run it once to provision TLS certificates.
4. `docker compose up -d`

The Certbot sidecar auto-renews certificates every 12 h, and nginx reloads every 6 h.

### Domains

Currently configured for **pointfinder.pt** and **pointfinder.ch** in `nginx/nginx.conf` and `docker-compose.yml`.

## Project status

The platform is **functional and deployed** but has open items tracked in the [`TODO`](TODO) file before public launch, including:
- Mobile UX polish (base creation flow, variable editing, NFC write consistency)
- Submission feedback visibility for players
- Localization review (German)
- App Store / Play Store publication

## License

Private project — all rights reserved.