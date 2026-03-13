# PointFinder Android App

Android companion app for the PointFinder NFC gaming platform, providing player and operator functionality.

## Tooling Requirements

- JDK 17 or 21 (recommended)
- Android SDK with API 35
- Android build tools compatible with AGP 8.7.x

## Setup

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Update the `.env` file with your configuration:
   - `API_BASE_URL_DEBUG`: API URL for debug builds (defaults to http://10.0.2.2:8080)
   - `API_BASE_URL_RELEASE`: API URL for release builds (defaults to https://pointfinder.pt)

## Project Structure

- `app` - application shell, navigation, DI wiring
- `core:model` - shared DTO/domain models
- `core:network` - Retrofit/OkHttp API stack
- `core:data` - repositories, Room cache/queue, sync worker
- `core:platform` - NFC/location/push/connectivity adapters
- `core:i18n` - locale manager
- `feature:auth` - auth/onboarding screens
- `feature:player` - player screens and flows
- `feature:operator` - operator screens and flows

## Build and Test

From repository root:

```bash
make test-android
```

Direct Gradle call:

```bash
./android-app/gradlew -p android-app :core:model:test :core:data:test :core:network:test :app:assembleDebug
```
