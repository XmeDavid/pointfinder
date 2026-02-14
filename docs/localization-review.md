# Localization Review Notes

Date: 2026-02-14

## Automated checks run

### Web Admin locale parity

- Compared key sets for:
  - `web-admin/src/i18n/locales/en.json`
  - `web-admin/src/i18n/locales/pt.json`
  - `web-admin/src/i18n/locales/de.json`
- Result: no missing or extra keys in `pt` and `de` compared to `en`.

### Android locale parity

- Compared Android `values` vs `values-de` in:
  - `android-app/core/i18n/src/main/res`
  - `android-app/app/src/main/res`
- Result:
  - `core`: parity OK
  - `app`: 7 missing German keys were found and added.

## String fixes applied

Added missing German strings in:

- `android-app/app/src/main/res/values-de/strings.xml`
  - `label_remaining`
  - `label_challenge_assignment`
  - `label_fixed_challenge`
  - `label_randomly_assigned`
  - `label_random_not_started`
  - `label_answer_type`
  - `label_pts`

## Manual reviewer checklist

The following still needs native-speaker/tester sign-off in staging/real devices:

1. Validate German copy tone and terminology consistency across iOS, Android, and Web Admin.
2. Validate string length on small screens (especially cards, badges, and dialogs).
3. Validate pluralized strings in real scenarios (`1`, `2`, and larger counts).
4. Validate map/submission screens where dynamic values are interpolated.
5. Capture any approved wording changes and apply in all relevant locale files.
