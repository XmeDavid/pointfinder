# Release Readiness Snapshot (2026-02-14)

This file records what was completed in-repo and what still requires manual console/ops execution.

## Completed in repository

- Aligned backend default sender email:
  - `backend/src/main/resources/application.yml` now defaults to `info@pointfinder.pt`
- Added runbooks/checklist updates:
  - `docs/email-routing.md`
  - `docs/store-submission/store-submission-checklist.md` (branding/contact readiness section)
  - `docs/store-submission/publisher-profile.md` (domain decision note)
- Launcher icon note:
  - The temporary launcher icon update was reverted because the image used is not the app logo.
  - Android is currently back to system default icon refs in `android-app/app/src/main/AndroidManifest.xml`.

## Manual actions still required

- Configure and validate real email forwarding for `info@pointfinder.pt` (DNS/provider console).
- Provide final app-logo artwork for iOS/Android launcher icons before store submission.
- Complete store console forms and uploads:
  - App Store Connect
  - Google Play Console
- Run device smoke tests and upload final screenshots/store descriptions.
- Submit builds and monitor review feedback.
