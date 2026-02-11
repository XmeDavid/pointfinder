# Android Companion App

This project contains the Android companion implementation for player and operator parity.

## Tooling Requirements

- JDK 17 or 21 (recommended)
- Android SDK with API 35
- Android build tools compatible with AGP 8.7.x

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
