# PointFinder design system

This directory is the canonical, versioned source for PointFinder's cross-platform field-instrument language.

- `tokens.json`: DTCG-compatible semantic foundations for equal light/dark themes.
- `icons.json`: stable product concepts mapped to Lucide, SF Symbols, and Material.
- `scenarios.json`: shared preview and regression states.
- `brand/pointfinder-mark.svg`: approved master logo; usage and rollout are documented in [brand guidance](../docs/visual-system/brand.md). `scripts/brand.mjs` derives the web path module, favicon SVG and Android vector icons inside `generate.mjs`; `scripts/brand-raster.py` renders the bitmap exports and `scripts/brand-tauri.mjs` rebuilds the Tauri icon sets; both pin their outputs (plus the master and `color.brand` values) in `brand/exports.json`, which `--check` verifies.
- `scripts/generate.mjs`: deterministic checked-in platform adapters.
- `scripts/audit.mjs`: advisory migration audit (`--strict` is opt-in).

Run `npm run generate`, then `npm run check`. Product code imports generated adapters and semantic roles; it never edits generated files or consumes palette values directly.
