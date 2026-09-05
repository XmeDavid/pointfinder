# PointFinder mobile (Tauri 2)

One codebase for the player and operator apps on iOS and Android. Ships under
the existing store identities: `com.prayer.pointfinder` on both platforms.

The frontend lives entirely in `../web`: shared player and operator routes, UI,
translations and platform adapters. This directory has no React source or Vite
configuration. Tauri starts `web` on port 1420 and embeds `web/dist-native`.

See [frontend architecture and rollout](../docs/frontend-consolidation.md).
See [native platform validation](../docs/native-platform-validation.md) for the
implemented capabilities, device smoke test and remaining release checks.

## Layout

```text
mobile/src-tauri/             Rust shell, permissions, signing and generated projects
web/src/                     the application for browser and mobile
packages/tauri-plugin-*/      NFC, push, secure-store, sharing and lifecycle plugins
```

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
bun run --cwd ../web typecheck                # shared front end
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

Firebase: place the environment's `google-services.json` in
`src-tauri/gen/android/app/`. The Google Services Gradle plugin is applied
automatically when that file (or a configured build-type copy) exists.
Without it the app runs and `register()` reports `unavailable`.

## Things the generator does not know

The Xcode "Build Rust Code" phase calls `scripts/ios-xcode-build.sh` to locate
Bun/Rust when Xcode starts from Finder and to run from the mobile workspace.
Keep this phase in both `gen/apple/project.yml` and the generated `.xcodeproj`
after regenerating the iOS project. Start device builds with `bun run tauri ios dev`
from this directory, so Tauri prepares the frontend and native dependencies.

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
