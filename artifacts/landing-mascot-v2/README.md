# PointFinder landing mascot artwork

The landing page uses the approved PointFinder T-shirts, green cap, navy trousers,
boots and backpacks. The three step dioramas and organizer guide now join the
previously integrated hero. Page layout, marketing colors, pricing and navigation
are preserved. The checkpoint uses the approved NFC plate and engraved logo.

## Source and export

- `source/`: approved clothing edits; `step-checkin-nfc.png` supersedes the QR variant.
- `cutouts/`: selected transparent PNGs, extracted with the built-in image generation tool.
- `cutout-assets.json`: generated source paths, shipping filenames and encoded sizes.
- `prompts.json`, `nfc-edit-prompt.txt`, `extraction-prompts.json`: generation/edit provenance.
- `web/public/landing/illustrated/*-mascot-v2.webp`: 800 px WebPs with real alpha.
  New URLs prevent browsers from reusing the old uniform cutouts. The square guide
  has transparent side margins; CSS preserves its existing portrait layout slot.
- Original scout assets remain in `artifacts/landing-illustrated-v1/source/` and git history.
- The hero, empty forest footer and workspace screenshot are retained.

Integration status: all four replacement cutouts are integrated. Alt text matches
those illustrations in English, Portuguese and German. No pending extraction remains.

## Verification — 2026-09-10

One final pass: browser and native frontend builds (including TypeScript), ESLint,
8 landing-page tests, 25 localization tests, and all 6 homepage Playwright tests passed.
Reviewed mobile and desktop captures in both themes. `review/` retains organizer
section previews; Playwright captures the three step illustrations at 390–1600 px.
