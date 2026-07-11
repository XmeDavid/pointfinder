# Design-system instructions

- `tokens.json`, `icons.json`, and `scenarios.json` are canonical. Generated files are read-only.
- Use DTCG `$type`/`$value` token objects and semantic names. Do not add product-facing palette names.
- Run `npm run generate` and `npm run check` after source changes.
- A semantic change must map to web, SwiftUI, and Compose in the same commit.
- Record temporary exceptions in `decisions.md` with owner and resolution.
