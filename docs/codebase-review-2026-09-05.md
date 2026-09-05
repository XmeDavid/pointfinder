# Consolidated codebase integration review — 2026-09-05

Reviewed the combined, uncommitted platform and feature work in the shared
checkout: route/role boundaries, player answers and recovery, operator auth,
native adapters and capabilities, rich content, workspace/build/deploy paths,
and test coverage. This is an integration review, not proof of every legacy
device journey or a full security audit.

## Fixed during review

1. **High: stale operator requests crossed session boundaries.** A late refresh
   could restore a logged-out operator or replace a newer account, and an old
   401 could replay its request with the next account's token. The operator store
   now versions sessions; refreshes deduplicate within that session, abort on
   identity changes, validate the returned owner and reject stale results/retries.
   Native secure-store operations serialize saves and logout's read-and-clear.
   A transient refresh/network failure preserves the session. Cross-tab account
   changes clear the old access token and query cache.
   Files: `web/src/lib/auth/store.ts`, `web/src/lib/api/client.ts`,
   `web/src/platform/operatorSession.ts`, `web/src/App.tsx`.

2. **Medium: submission results became stale or blocked retry.** The base screen
   kept its local “Saved offline” or “Rejected” result indefinitely, hid the form
   after rejection, and retained the previous base's answer/result when navigating
   directly to another base. Results now follow the durable queue and canonical
   snapshot; rejected answers can be retried. State resets on base/player changes.
   File: `web/src/features/player/BaseScreen.tsx`.

3. **Medium: game/presence checks differed by answer type.** Automatic check-in-only
   submissions ran even in an ended game; photo submissions omitted the required
   native NFC presence confirmation already used for text. Both paths now apply
   their required checks. Retry/answer storage failures are surfaced instead of
   escaping as unhandled promises. Initial load failures expose a retry action.
   File: `web/src/features/player/BaseScreen.tsx`.

4. **Medium: embedded resource files were inert.** The backend enriches file embeds
   with download URLs, but the player renderer only displayed their labels. Safe
   HTTP(S) resource URLs now render as accessible links; native taps open through
   the platform browser rather than replacing the bundled WebView. Executable URL
   schemes remain rejected and markup is sanitized before transformation.
   File: `web/src/features/player/components/RichContent.tsx`.

## Validation

- Baseline: 679 frontend tests, workspace typechecks and lint passed.
- After the auth/player fixes: full frontend suite **689 tests passed**.
- Final focused regression suite, including embedded resources and teammate
  submission updates: **35 tests passed**. These overlap the full suite.
- Final frontend lint passed; browser/native builds each run TypeScript checking.
- E2E fixtures now assert the persisted queued result after reload and verify
  embedded resource links in both frontend targets.
- Combined built-artifact Playwright suite: **12 passed, 4 target-specific skips**.
- Final browser/native builds and both targeted player-route E2E checks passed
  after the last teammate-result correction.
- `git diff --check` passed.

The first E2E run found a stale test expectation: it looked for the answer form
after reloading an already queued answer. The visible state is now consistently
the queued result, and that assertion was updated.

## Still blocking release confidence

- **Backend test compilation remains broken.** Re-running `compileTestJava` with
  Java 21 produced 100 reported errors. This includes obsolete DTO getters and
  tests calling moved `GameService.importGame/exportGame` methods. Production Java
  compilation passes, but the full backend/CI test gate cannot run. Repairing
  those test references remains a separate migration task.
- **Native delivery and device journeys still need verification.** The previous
  Android storage/Keystore process-restart test passed; this review does not rerun
  physical NFC/camera/sharing/location journeys or build iOS. Firebase config is
  still absent. See `native-platform-validation.md` for the release checklist.
- **Product scope remains explicit.** Browser QR scanning and per-challenge
  camera-only policy are not implemented. Browser enforcement of required NFC
  presence needs a defined flow; that confirmation currently applies to native
  submissions. Resource presigned links and uncached
  media require connectivity and can expire while offline.

No commit, production deployment, store release or external configuration change
was performed. All fixes remain with the existing combined changes for review.
