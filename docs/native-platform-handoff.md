# Native parity: platform / feature handoff

Platform work owns `web/src/platform`, `web/src/app/player` service infrastructure,
`packages/api`, `packages/game-core`, `mobile`, native plugins, dependency manifests,
and the lockfile. Feature work owns screens, components, feature hooks/tests, and
`packages/i18n`. Both use the legacy Swift/Kotlin apps as read-only references.
Do not register replacement platform implementations inside features.

## Feature-facing contracts

These are the interfaces being implemented by the platform workstream. This file
is the coordination point while the two workstreams proceed independently.

- `@/platform/media`: `pickMedia({ source: 'camera' | 'library', kind?: 'image' | 'video', multiple?: boolean, signal?: AbortSignal }): Promise<File[]>`.
  Call directly from a user gesture. Cancellation returns an empty list. Camera
  and gallery use the system file chooser through the webview, with browser
  fallback. Selected files are not durable until enqueued below.
- `useServices().media.enqueueSubmission({ id, gameId, baseId, challengeId, answer, files: File[], fileUrls?: string[] })`:
  copies files into app-owned storage before durably enqueuing the submission.
  Returns a `PendingSubmission`. Call the existing `queue.sync()` afterward.
  The same queue exposes upload progress in `action.media[]` (`uploadedBytes`,
  `size`, `fileUrl`) and reports changes through `queue.onChange`.
  Local media survives restart; retry uses the same action and media identifiers.
  Discard using `queue.discard(id)`; do not delete files directly from screens.
- `@/platform/qr`: `scanQr({ signal?: AbortSignal }): Promise<string | null>`;
  `qrAvailable(): boolean`; `openScannerSettings(): Promise<void>`.
  Returns the raw QR text for the feature to validate; cancellation returns null.
  Browser camera scanning is unavailable; keep manual code entry available.
- `@/platform/nfc`: existing `scanTag` / `listenForTags`, plus
  `nfcAvailability()`, `cancelNfc()`, `writeTag(t, url)`. A write must be verified
  before the feature calls the existing audited `markNfcLinked` endpoint.
- `@/platform/push`: `pushPermission()`, `requestPushPermission()`,
  `onPushNotification(handler)`, `onPushTap(handler)`. Permission prompts require
  a user gesture; startup only registers when permission is already granted.
  Token rotation and session changes are owned by the runtime integration.
  Treat notification data as untrusted; fetch authorized canonical state before
  rendering it. Feature work owns notification routes/inbox and their copy.
- `@/platform/lifecycle`: `onForeground(handler)` and `isForeground()`.
  Runtime integration resumes synchronization and refreshes active queries.
- `@/platform/share`: `shareFile(file: File): Promise<'shared' | 'downloaded' | 'cancelled'>`.
  Browser uses Web Share when supported, otherwise a download. Native uses the
  system share sheet. Feature work calls this for exports rather than anchors.

Capability failures expose a stable `code` (`unavailable`, `denied`, `busy`, or
`failed`) for localized feature messaging. Queue errors retain `lastErrorCode`;
`MEDIA_NEEDS_RESELECT` means the local source is missing and cannot be retried
without the player supplying it again. No fallback silently submits without media.

## Acceptance and integration

Platform tests cover restart, retry, expired sessions, lost completion responses,
account isolation, permission denial, cancellation, and listener cleanup. Feature
work must connect these contracts and cover the visible states. Browser execution
of native assets does not constitute device verification. Legacy apps remain until
actual Android/iOS journeys are verified. Build/device limitations are recorded
in this document as validation proceeds.

## Feature workstream status (Fable, 2026-09-05)

Working in this checkout at the same time as the platform workstream. Feature files
only: `web/src/features/**`, `web/src/components/**`, `web/src/lib/theme.ts`,
`web/src/lib/api/bases.ts` (added `markNfcLinked`), `packages/i18n`,
`web/src/test/msw/handlers/player.ts` and `web/e2e/operator-mobile.spec.ts`.
Nothing is committed by the feature side; the platform side owns the commit of the
consolidation. Full web suite at last run: 661 tests green, typecheck and lint clean.

Player journeys landed (all wired to the platform contracts that exist now):

- `/join`: QR scan through `@/platform/qr` (permission-denied and unavailable states,
  settings shortcut), join links and bare codes parsed by `features/player/joinCode.ts`,
  permission disclosure shown once on phones (kv key `disclosureSeen`).
- `/base/:baseId`: tag-tap check-in, text answers, check-in-only auto-complete, photo
  answers through `pickMedia` + `useServices().media.enqueueSubmission` (component
  `MediaAnswer`), result card with verdict, feedback, unlocked information
  (`SubmissionResult`), queued/offline outcome, `requirePresenceToSubmit` (tap the tag
  again before sending, native only), and a not-live block on solving.
- `/settings`: language, theme, game/team/profile, progress, notifications permission
  (`@/platform/push`), device id, pending actions, privacy, leave game with unsynced
  warning, GDPR delete via `player.deleteMe`.
- `/inbox`: player notifications, mark-seen, unseen badge on the map header; push taps
  open it (`features/player/PushIntake.tsx`, mounted in `App.tsx` next to `TagIntake`).

Operator on the phone:

- `/game/:id/nfc` (`features/build/NfcTagsPage.tsx`): every base with its link state,
  filters, per-base write through `@/platform/nfc` `writeTag` then the audited
  `PATCH /games/{g}/bases/{b}/nfc-link`. Entry: NFC button in the mobile bottom bar
  when native. Browser shows the explanation instead of write buttons.

Touched outside the feature boundary, on purpose and minimally:

- `web/src/app/player/routes.tsx`: route entries for `/settings` and `/inbox`.
- `web/src/App.tsx`: `PushIntake` mounted beside `TagIntake`; `/game/:id/nfc` route.
- `web/src/test/msw/server.ts`: registers `playerHandlers` first.

Open for the platform side:

- Per-challenge photo source (camera only vs library) is a product decision David
  asked for; needs a backend/API field before the `MediaAnswer` buttons can honour it.
- Upload progress per media item is available in `action.media[]`; the sync banner
  shows queued counts only. A progress bar can be added once a device run confirms
  the numbers move.
- Platform -> Fable, 01:02: first Android APK build passed with the native media
  storage and sharing/lifecycle plugin. Sharing facade is ready.
- Push registration now needs the accompanying backend change: device tokens
  move between player/operator accounts atomically, and DELETE push-token endpoints
  revoke a matching previous registration on logout. Native unregister is added.
  No Firebase google-services.json exists in this checkout, so Android push
  delivery remains a device/configuration validation item.

Phone-width audit (`web/e2e/operator-mobile.spec.ts`, native-shell project, 390×844):
operator dashboard, workspace, NFC page, player settings, inbox and base (dark, PT)
render without sideways scroll or page errors; screenshots in `web/test-results/mobile-*.png`.
The Android debug APK built from the shared frontend installs on the S22, but the phone
is PIN-locked, so the new screens were not exercised on the device by the feature side.
- Platform -> Fable, 01:08: media/QR/NFC/push are wired on your side; thanks.
  I am preparing an Android bridge smoke test with synthetic local records only
  (no production submissions). Please avoid rebuilding/installing the APK while
  that test runs; I will post completion here. The phone stays locked.
- Backend verification found pre-existing record migration errors: production
  call sites still expected builders and one getter; compatibility builders and
  the record accessor are fixed. The full backend test source set has many more
  old getter references, so the new push tests are compiled with a temporary
  focused-source Gradle init script. These limits will be recorded explicitly.
- Photo-source request: please append the exact desired field/options if David
  specified them in your task. I have no direct camera-policy instruction in this
  task's conversation; existing behavior remains camera plus library for now.
- Platform -> Fable, 01:13: Android bridge smoke test COMPLETE. Actual phone verified
  app-owned media, SQLite queue/settings, and Keystore data across force-stop/reopen;
  incomplete commits and invalid paths were rejected. NFC hardware reports enabled.
  All synthetic records were removed. Safe to rebuild/install again.
  This did not unlock the phone, perform live submissions, or validate camera/NFC
  interaction and push delivery. Reproducible script: mobile/scripts/native-storage-smoke.mjs.
- Platform -> Fable, 01:18: native launch intake now uses one bridge per process,
  preventing a cold-start tag/link from reopening on every route change. Tags,
  links, and `onPushTap` accept optional `{ signal: AbortSignal }` for cleanup
  during async attachment. Please add an AbortController to your PushIntake effect
  and pass its signal to onPushTap; abort it during cleanup (or at least guard
  callbacks with `if (disposed) return`). I updated TagIntake on the platform side.
- Platform -> Fable: applied the small PushIntake cleanup change during integration
  (AbortController and disposed guards). No other feature screen changes from me.
  Combined frontend suite now passes: 679 tests across 96 files. All workspace
  typechecks pass. Final browser/native builds and E2E checks are next.
- Platform -> Fable: final integration also routes the four existing export paths
  (ActivityFeed CSV, ResultsOverlay CSV/audit, GameSettingsPanel JSON, TeamDetail QR)
  through lib/exportFile.ts -> platform/shareFile. This replaces only download
  plumbing; feature layouts/copy/test IDs are unchanged.
- Platform -> Fable: the new media E2E found a real reload-state issue in BaseScreen:
  queued work was labelled "Sent. Waiting for the operator to review" after reload.
  I added the existing SyncBanner and gated the sent message on !pendingSync.
  The result card's new "Saved offline" wording also required updating the original
  consolidation E2E assertion; this was a stale expectation, not a queue failure.

## Platform completion (2026-09-05)

The platform implementation and integration pass is complete in this same
checkout. Final checks: 679 frontend tests, 69 shared-package tests, 12 built-
artifact E2E passes (4 target-specific skips), all workspace typechecks, lint,
browser/native builds, Android arm64 debug APK, Rust media test and 5 focused
backend push tests. Design-system check passed; audit has 10 advisory findings.
The final APK was installed on the S22 and passed the synthetic media/SQLite/
Keystore force-stop/reopen test again; all synthetic records were removed.

Current commands, evidence and remaining gates are in
[native-platform-validation.md](native-platform-validation.md). iOS build and
unlocked-device journeys are still required, Firebase configuration is absent,
and the full backend suite has unrelated DTO getter compilation failures.
No production release or commit was made. All feature and platform changes
remain together for review; no separate checkout or frontend copy was created.

## Combined review follow-up (2026-09-05)

The user requested a general check after both workstreams finished. Integration
fixes now cover operator auth races/secure-store ordering, rejected-answer retry,
queue and teammate result updates, base-to-base state reset, live-game checks for
automatic submissions, media presence confirmation and opening embedded resources.
The [review report](codebase-review-2026-09-05.md) records findings and validation.
All changes remain in this checkout; no commit or deployment was made.
