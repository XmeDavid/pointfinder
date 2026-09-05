# PointFinder frontend

One React/Vite application for browsers and the Tauri iOS/Android shell. Player
and operator workflows share routes, canonical components, translations and
platform services. `mobile/` embeds this project's native build.

Run `bun install` from the repository root, then:

```sh
bun run dev
bun run build
bun run build:native
bun run storybook
bun run --cwd web test
bun run --cwd web test:e2e
```

[Architecture and rollout](../docs/frontend-consolidation.md) ·
[Visual system](../docs/visual-system/README.md)
