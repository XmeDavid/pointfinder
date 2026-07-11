# PointFinder design system

This directory is the canonical, versioned source for PointFinder's cross-platform field-instrument language.

- `tokens.json`: DTCG-compatible semantic foundations for equal light/dark themes.
- `icons.json`: stable product concepts mapped to Lucide, SF Symbols, and Material.
- `scenarios.json`: shared preview and regression states.
- `scripts/generate.mjs`: deterministic checked-in platform adapters.
- `scripts/audit.mjs`: advisory migration audit (`--strict` is opt-in).

Run `npm run generate`, then `npm run check`. Product code imports generated adapters and semantic roles; it never edits generated files or consumes palette values directly.
