# Native platform parity: implementation and validation

Follow-up: backend test compilation has been repaired; see
[backend test migration](backend-test-repair-2026-09-05.md) for current results
and the iOS build-wrapper correction.

Recorded 2026-09-05. Platform and feature work share the same checkout and the
[handoff contract](native-platform-handoff.md). The legacy applications remain
the reference for device journeys; this is not a declaration of store-release parity.

## Implemented

- Photos/videos selected through the system chooser are copied into durable
  app-owned storage before the submission is queued: IndexedDB Blobs in browsers,
  committed local files plus SQLite queue records in Tauri. Upload chunks and
  completion checkpoints survive retry and restart. Stable media keys recover
  lost start/completion responses, and the submission retains its idempotency key.
  Completed/discarded actions clean up their media; old unreferenced files are pruned.
- Replay runs at application scope on reconnect, foreground and a 15-second
  timer, honoring retry backoff. Failed check-ins hold dependent submissions.
  Queue ownership and async auth revision checks prevent old work or responses
  from crossing into a newly signed-in player's session.
- Native QR permissions/scanning, verified NFC writing, foreground-aware location,
  buffered cold-launch NFC/deep-link/push intake and listener cancellation use
  shared platform facades. Browser paths retain manual entry and explicit
  unavailable behavior where hardware capabilities do not exist.
- Push registration follows permission, token and account changes. Registration
  moves a device token between player/operator owners transactionally; matching
  DELETE endpoints revoke the old binding without deleting a newer token.
  Logout also unregisters locally. Failed offline revocation is best effort;
  backend authorization and subsequent token rebinding remain authoritative.
- Native exports use Android's share chooser or iOS's activity sheet. Browser
  exports use Web Share where supported, otherwise download. Existing activity,
  results, settings and QR export handlers use this shared path. On Android,
  `shared` means the chooser was launched, not that a receiving app delivered it.
- Android backup/transfer excludes app data. Camera/video capture has the required
  native usage descriptions, and Firebase setup is optional at build time.

Fable's feature changes are integrated in this checkout: media answers/results,
QR join, settings, inbox, push navigation, mobile operator navigation and NFC
management. Integration also fixes the base screen's queued-after-reload state
and async push-listener cleanup.

## Automated checks

- Full frontend Vitest: **679 tests, 96 files passed**.
- Shared packages: **24 API, 42 game-core and 3 localization tests passed**.
- All workspace TypeScript checks and frontend ESLint passed.
- Built-artifact Playwright: **12 passed, 4 intentionally skipped** (two
  phone-only checks omit the browser project, and two browser offline checks
  omit the native artifact project).
- Browser and native production builds passed. Android arm64 debug APK passed
  and was installed on the attached Samsung S22.
- Rust shell check and the real-filesystem media commit/path test passed.
- Design-system generation check passed; audit has 10 advisory findings.
- Focused backend push service/request validation: **5 tests passed**;
  production Java compilation passed after repairing existing DTO record-builder
  compatibility and one stale getter reference.

The browser media E2E saves a real PNG offline, reloads from the service worker,
loses the response after the server completes the upload, reloads again, then
verifies one final submission, no duplicate upload, and local media cleanup.
The built-artifact suite also covers text replay, role boundaries, operator
workspace/navigation, phone-width layouts and localized player screens. Running
the native artifact in Chromium verifies the frontend only, not native hardware.

From the repository root:

```sh
bun run typecheck
bun run --cwd web lint
bun run --cwd web test
bun run --cwd packages/api test
bun run --cwd packages/game-core test
bun run --cwd packages/i18n test
bun run build
bun run build:native
bun run --cwd web test:e2e
cargo check --manifest-path mobile/src-tauri/Cargo.toml
cargo test --manifest-path mobile/src-tauri/Cargo.toml --lib media::tests
make design-system-check
make design-system-audit
```

The full backend test source set still fails compilation on unrelated getters
left behind by an earlier DTO-to-record migration. The new backend tests were
run with this temporary Gradle init file to restrict test source compilation:

```groovy
allprojects {
    afterEvaluate {
        if (plugins.hasPlugin('java')) {
            sourceSets.test.java.setIncludes([
                '**/PushTokenServiceTest.java',
                '**/UpdatePushTokenRequestTest.java'
            ])
        }
    }
}
```

Save it outside the repo, then run with Java 21:

```sh
backend/gradlew -p backend -I /tmp/pointfinder-focused-tests.gradle test \
  --tests '*PushTokenServiceTest' --tests '*UpdatePushTokenRequestTest'
```

These tests mock JDBC and verify ownership/locking SQL; they do not substitute
for PostgreSQL integration. Local Docker access is blocked by socket permissions.

## Android process-restart smoke test

The actual device passed media byte reads, SQLite queue/settings, and Android
Keystore persistence across force-stop/reopen. Incomplete media commits and
invalid paths were rejected. NFC reported available and enabled. Synthetic
records were deleted afterward. This used the debug WebView bridge while the
phone remained locked; no live game action or account credential was changed.

Reproduce using the debug APK and an authorized ADB device. Forward its current
WebView process socket to a local port, then:

```sh
adb shell pidof com.prayer.pointfinder
adb forward tcp:34977 localabstract:webview_devtools_remote_<PID>
node mobile/scripts/native-storage-smoke.mjs stage 34977
adb shell am force-stop com.prayer.pointfinder
adb shell am start -n com.prayer.pointfinder/.MainActivity
# Query the new PID and replace the forwarding target before verification.
adb forward tcp:34977 localabstract:webview_devtools_remote_<NEW_PID>
node mobile/scripts/native-storage-smoke.mjs verify 34977
adb forward --remove tcp:34977
```

The script stages isolated IDs and keeps their identifiers in a temporary file
(`PF_NATIVE_SMOKE_STATE` overrides its path). Verification cleans up those IDs
and removes that file. If interrupted, retain the file and rerun verification.

## Remaining release gates

- Build and exercise iOS on macOS/Xcode. Swift implementations have not been
  compiled or run in this Linux environment.
- On unlocked Android and iOS devices, validate camera/gallery/video selection,
  permission denial/settings recovery, sharing, NFC read/write/cold start, QR,
  location foreground/background transitions and killed-process game recovery.
  Camera/library uses the WebView system file chooser; verify actual device
  media formats and large-file behavior. No HEIC conversion was added.
- Supply the deployment's Firebase configuration and APNs setup, then validate
  foreground/background/killed-app delivery, token rotation and account switches.
  No `google-services.json` is present in this checkout.
- Deploy the backend token ownership/revocation changes before native rollout;
  run database integration and the backend-integrated journey suite after fixing
  the existing backend test compilation failures.
- Per-challenge camera-only versus library policy needs an agreed backend field;
  the current feature offers both. Upload progress checkpoints exist, but the
  feature currently displays queue state rather than a per-file progress bar.
- Finish signing/store checks and web hosting path migration described in
  [frontend consolidation](frontend-consolidation.md). No production deployment
  or store release was performed by this work.
