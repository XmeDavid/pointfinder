# iPhone photo follow-up

The device photos exposed states missing from the initial safe-area audit: the
setup checklist, the additional native NFC navigation item, and an empty drawer.

- The phone bar uses equal-width cells and moves language selection into profile.
  The profile menu is portalled outside the rail and constrained to safe areas.
- Setup readiness and the content action stack on phones. The app's flex content
  can shrink to the viewport instead of overflowing horizontally.
- Drawer actions wrap separately from tabs. Bases, challenges, teams, and stages
  use a shared list/detail layout with a phone Back action and a desktop split.
- Router errors use the localized, safe-area-aware reload screen. Map startup
  failures and lost WebGL contexts expose recovery; foreground resumes resize and
  repaint the map. Retrying the map preserves its current camera state.

The photos do not identify the cause of the original module-import failure or
blank map. Recovery is verified; the original iPhone failure is not reproduced.
No native plugin or backend changes are included in this follow-up.

Validation: typecheck, lint, both production builds, focused Vitest (65 distinct
tests across nine files), and three translation-catalog tests passed. Browser
E2E passed its six applicable cases; the final native-artifact run passed eight
applicable cases. The latter includes all seven native navigation items at 360px
and 390px, setup control separation, profile language selection, empty/list/detail
drawer views, a failed map followed by successful retry, and a deliberately
blocked lazy-route import. Existing portrait/landscape safe-area checks also pass.
The native-only navigation presentation is simulated after browser-service
bootstrap; it does not claim device IPC coverage. Design-system generation checks
pass; the advisory audit still reports 10 findings. iPhone verification remains
necessary. Screenshots are generated in `web/test-results/phone-*.png`.
