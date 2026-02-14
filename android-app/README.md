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
   - `API_BASE_URL`: Your API server URL (defaults to https://desbravadores.dev)
   - `GOOGLE_MAPS_API_KEY`: Your Google Maps API key (get from [Google Cloud Console](https://console.cloud.google.com/google/maps-apis))

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
./backend/gradlew -p android-app :core:model:test :core:data:test :app:assembleDebug
```
