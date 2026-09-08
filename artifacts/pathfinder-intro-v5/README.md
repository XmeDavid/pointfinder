# Branching PointFinder welcome

The first visit opens a regular participant beside the equipped guide. Accessible
React buttons choose a story; all copy, language selection, navigation, and links
remain in the app. Character artwork is decorative. This introduction does not
create a game or change account roles, permissions, or live game state.

The participant story continues to use the v4 world. The new organizer story has
six manually advanced chapters: plan the game, place bases, attach challenges,
invite teams, monitor play, and review submissions/results. New terrain rises into
place, cards connect to bases, players join, and the results podium appears. Back
reverses the timeline; returning from chapter one or choosing Change role opens
the two-character choice. Both stories fade into the shared independent compass.

## Sources and rebuilding

- `role-choice.blend`: two posed characters on quiet round plinths.
- `organizer.blend`: animated organizer world with three shared 17-bone characters.
- `build_branches.py`: derives both scenes and seven transparent fallback PNGs
  from `../pathfinder-intro-v4/pointfinder-expanding-world.blend`.
- `export_mobile.py`: exports the organizer by default; pass `-- --choice` for
  the opening. Exports camera samples and preserves character skins and scarf UVs.
- `optimize_mobile.sh`: quantizes geometry, packs materials and WebP textures,
  then packages matching stills. Run after fresh exports (it preserves raw copies).

From the repository root, with Blender, Bun, and Python/Pillow installed:

```sh
blender --background --python artifacts/pathfinder-intro-v5/build_branches.py
blender --background --python artifacts/pathfinder-intro-v5/export_mobile.py -- --choice
blender --background --python artifacts/pathfinder-intro-v5/export_mobile.py
PF_BUN=bun sh artifacts/pathfinder-intro-v5/optimize_mobile.sh
```

Outputs live in `web/public/onboarding/`. Choice is 2,838,936 bytes / 98,320
triangles; organizer is 6,245,924 bytes / 307,095 triangles. Only the choice world
and then the selected story load. Returning visitors whose introduction is
completed load the independent compass without either story world. Runtime holds
are 125, 301, 371, 465, 580, and 765, with compass landing at 864 (24 fps).

## Preview and verification

The native-mode welcome at `/` uses persistent completion version 2. Fixtures
at `/dev/visual-system?onboarding=choice` and
`/dev/visual-system?onboarding=1&role=organizer` bypass completion preferences;
steps 1–7 are available. English, Portuguese, and German use the shared catalog.
Reduced motion uses matching stills; graphics failures preserve navigation and
offer retry. Final actions remain the existing join and operator sign-in routes.

`qa/*-validation.json` records glTF validation with zero errors. The warnings
describe nested skinned meshes (two in choice, three in organizer); the Three.js
playback tests check animated bones and reversible holds. Tiny degenerate
triangles from quantization are informational. Browser tests cover branch asset
isolation, completion, role switching, graphics recovery, translations, themes,
and compact layouts. Physical iOS/Android GPU performance still needs device QA.

Verification on 2026-09-08: typecheck and lint passed; 33 focused web tests and
25 shared translation tests passed; browser and native production builds passed.
The full E2E run passed 39 cases, skipped 10 platform-inapplicable cases, and
exposed one German landscape overflow. After the compact-layout CSS fix, both
welcome E2E cases passed, covering that failure and the fallback flow. The two
real-WebGL branch tests passed in the full run. Saved phone screenshots are in
`qa/`. Design-system generation checks passed; the advisory audit retains 19
existing findings, including the documented 3D illustration lighting colors.
