# Store Submission Checklist

Use before each App Store / Play Store submission to verify compliance.

## Privacy Policy and URLs

- [ ] Privacy policy is live at https://pointfinder.pt/privacy/
- [ ] Privacy policy URL entered in App Store Connect
- [ ] Privacy policy URL entered in Play Console
- [ ] Deletion section accessible at https://pointfinder.pt/privacy/#deletion-request
- [ ] Deletion URL entered in Play Console account deletion field
- [ ] Support URL entered in App Store Connect

## App Store Connect - Privacy Labels

- [ ] All data types from `appstore-connect-privacy.md` declared
- [ ] Tracking set to "No"
- [ ] Data linked to identity flags match actual behavior
- [ ] Reviewer notes include permission explanations

## Google Play Console - Data Safety

- [ ] Data safety form completed per `play-console-data-safety.md`
- [ ] Encryption in transit marked "Yes"
- [ ] User data deletion marked "Yes" with URL
- [ ] Third-party library disclosures match (Firebase, Google Maps)

## In-App Compliance

- [ ] Privacy policy link accessible from player Settings (iOS + Android)
- [ ] Privacy policy link accessible from operator Settings (iOS + Android)
- [ ] Player account deletion works in-app (iOS + Android)
- [ ] One-time permission disclosure shown on first player session
- [ ] Location permission requested and functional
- [ ] Push notification permission requested (Android 13+ runtime)
- [ ] Camera permission works for QR scan and photo capture
- [ ] NFC works for check-in and tag writing
- [ ] Deny paths are non-blocking (app remains usable with reduced features)

## Identity Consistency

- [ ] Publisher name matches across stores and privacy policy
- [ ] Contact email matches across stores and privacy policy
- [ ] App name matches store listing and in-app branding

## Branding and Contact Readiness

- [ ] iOS AppIcon source exists in `ios-app/dbv-nfc-games/Assets.xcassets/AppIcon.appiconset/out-2.png`
- [ ] Android launcher icons exist in `android-app/app/src/main/res/mipmap-*`
- [ ] AndroidManifest uses `@mipmap/ic_launcher` and `@mipmap/ic_launcher_round`
- [ ] Support inbox forwarding for `info@pointfinder.pt` is configured and tested
- [ ] Test email from external sender arrives in the target inbox

## Final Checks

- [ ] App builds and runs on physical device (iOS)
- [ ] App builds and runs on physical device (Android)
- [ ] No crash on first launch
- [ ] Screenshots are current and accurate
- [ ] App description is current
