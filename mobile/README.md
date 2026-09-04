# PointFinder mobile (Tauri 2)

One codebase for the player and operator apps on iOS and Android. Ships under
the existing store identities: `com.prayer.pointfinder` on both platforms.

Status: spike. `src/App.tsx` is a checklist screen that exercises every native
capability with its pass criterion written next to it.

## Layout

```
mobile/                      this app (React + Vite front end, Tauri shell)
  src-tauri/                 Rust shell, tauri.conf.json, capabilities, gen/ projects
  src-tauri/Info.ios.plist   iOS usage strings, merged into the generated Info.plist
  src-tauri/Entitlements.plist  NFC, push, associated domains
packages/tauri-plugin-pointfinder-nfc    own NFC plugin (Kotlin, Swift, Rust, TS)
packages/tauri-plugin-pointfinder-push   own push plugin (FCM, APNs)
```

Official plugins in use: `deep-link` (universal links and app links for
`/tag/` and `/dashboard` on both hosts), `geolocation`, `os`, `opener`.

## Toolchains

Everything is user-local, nothing under `/usr`. Export before building:

```bash
export PATH="$HOME/.cargo/bin:$HOME/.bun/bin:$PATH"
export JAVA_HOME="$HOME/.jdks/temurin-21"
export ANDROID_HOME="$HOME/Android/Sdk"
export NDK_HOME="$HOME/Android/Sdk/ndk/27.2.12479018"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"
```

iOS builds run on the Mac, which has Xcode, Rust with the iOS targets, Bun,
and `xcodegen` under `~/.local/bin`.

## Commands

```bash
bun install                                   # from the repo root, links the local plugins
bun run typecheck                             # front end
cargo check --manifest-path src-tauri/Cargo.toml   # Rust shell and plugins, desktop target
bun run tauri dev                             # desktop window, native calls report unavailable
bun run tauri android dev                     # device or emulator via adb
bun run tauri android build --debug --target aarch64 --apk
bun run tauri ios dev                         # Mac only
```

## Identity and release

`tauri.conf.json` holds the identifier, version 1.0.0, Android `versionCode`
20 and iOS `bundleVersion` 20. The published apps are at 19, so the first
Tauri release must ship at 20 or higher on both.

Android release signing reads `src-tauri/gen/android/keystore.properties`,
which points at the existing upload keystore. Never commit it.

Firebase: place `google-services.json` in `src-tauri/gen/android/app/` and
apply the Google Services Gradle plugin in `gen/android/app/build.gradle.kts`.
Without it the app runs and `register()` reports `unavailable`.

## Things the generator does not know

The generated Android manifest carries an `NDEF_DISCOVERED` intent filter for
both tag hosts so a tap can cold-start the app. Re-running `tauri android init`
would drop it. Keep customisations in `tauri.conf.json`, the two plist files,
and the plugins wherever possible.

## Mac tooling notes

Tauri's iOS init insists on three Homebrew packages. The Mac has no Homebrew and
no passwordless sudo, so they are satisfied user-locally under `~/.local/bin`:

- `xcodegen`: real release binary, used to generate the Xcode project.
- `pod`: a stub. CocoaPods does not install on the system Ruby 2.6, and the
  plugins are Swift packages, so nothing needs pods. Replace with a real
  install if a plugin ever needs CocoaPods.
- `idevicesyslog`: a stub. It only streams device logs for `tauri ios dev`.
  Use the Xcode console for device logs until libimobiledevice is installed.

The generated project reads its entitlements from
`gen/apple/pointfinder-mobile_iOS/pointfinder-mobile_iOS.entitlements`. The
source of truth is `src-tauri/Entitlements.plist`; copy it over after any
`tauri ios init`. The deep-link plugin adds the associated domains on its own
at build time.
