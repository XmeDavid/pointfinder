# Release and store checklist

Consolidated 2026-09-12. These are verification gates, not claims that a build was tested today. Record the release commit/image, platform, device/OS, date, result and evidence when running a group. Keep captures in ignored artifacts or the release record, not a growing docs archive.

## App and store presentation

- Refresh `feature-graphic.png`: it still has the former compass logo and NFC-only strapline. Use the [canonical brand](../visual-system/brand.md), then check current store dimensions/content requirements at submission time.
- Inspect launcher icons on real iOS/Android home screens and the store preview, including masks, small sizes and supported appearance variants. Generated assets are not device sign-off.
- Refresh store screenshots/copy for the actual shipped account, player and organizer flows. Check localized listing text, privacy/support links, permission disclosures and reviewer access against current app behavior. Do not imply solo/persistent games or other roadmap features are available.

## Hardware and complete journeys

- Identity: guest join → claim → another phone recovery; conflicting team/account; sign-out vs leave vs delete; account and player expiry/refresh; operator entering through player sign-in. Confirm no dropped pending actions or unintended permission changes.
- Offline/media: check in and submit offline; restart/force-stop; resume upload after network loss/session expiry; replay once, in dependency order; disk-full/missing-media/retry/discard states. Verify photo, gallery, multiple selection, video, cancellation and denied/restricted permissions. Assess HEIC and large files explicitly.
- Field: NFC read/write, QR scan, cold/warm tag or link launch, GPS accuracy/permission denial, automatic arrival, dwell and claim fallback, hidden-base discovery, ordered route and prerequisite rejection. Foreground-only arrival is the supported scope. Test browser features over trusted HTTPS; HTTP LAN is not evidence for secure browser APIs.
- Push: real APNs/FCM delivery, foreground/background, token rotation, two phones, account/game switching and logout. Ignored provider config is normal; verify installed-build/environment configuration without committing secrets.
- Native UI: iOS notch/home indicator, Android gesture/three-button navigation, landscape, keyboard, Dynamic Type/font scale, screen readers, long EN/PT/DE text, both themes and reduced motion. Include mobile organizing and player documents/QR save/share, not only the map.
- End-to-end game: join/setup/live/ended; two operators reviewing concurrently; rejected retry; manual rescue and audit; end with pending reviews/offline work; live XP, final placement, reset/reopen, account recovery and deleted history. Confirm actor attribution preserves team-wide credit and player APIs do not expose game points.

Use [mobile build instructions](../../mobile/README.md), [web checks](../../web/README.md), the [preview matrix](../visual-system/preview-matrix.md), and focused backend/frontend/E2E commands from the root guide. The old isolated Android storage test and browser inset simulations do not close these complete journey gates. Keep legacy apps until replacement device parity is evidenced.

## Delivery and recovery

- Check current immutable release provenance and migration state against [HA operations](../../deploy/ha/OPERATIONS.md); use the existing [application acceptance](../../deploy/ha/application-acceptance.md) for multi-node changes. Fresh restore/failover/native-reconnect drills are operational work, not implied by healthy replicas.
- For the landing/cache follow-up (OW-16), verify normal `sw.js` URLs and HTML agree on both public domains, `sw.js` is not immutable, stable public assets revalidate, and missing images return 404 rather than SPA HTML. Release reviewed nginx changes and purge affected edge URLs only if still needed. Old browser-cache entries may need new asset filenames. Let installed workers activate through their normal update lifecycle; do not wipe account data or queued actions.
- Run a representative venue rehearsal with several phones, patchy network and offline reconnection. Verify operator recovery and that each queued action is either confirmed or visibly actionable. Do not promise that restarting all services automatically restores every client action.
