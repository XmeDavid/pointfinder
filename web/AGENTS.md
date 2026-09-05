# Web UI scope

Read the root guide and `docs/visual-system/web-tailwind.md`. Use generated variables through semantic Tailwind roles and canonical components in `src/components`. Screens orchestrate; they do not reproduce badges, panels, markers, focus, or status styling. Lucide meanings come from the semantic catalog. Preserve routes and `data-testid` values. Add `/dev/visual-system` fixtures for new reusable states. Verify `npm run typecheck`, `npm run lint`, focused Vitest, and a production build.

This is the only frontend. Player and operator features run in browser and Tauri. Use `src/platform` for native capabilities; keep native plugin imports inside that boundary. Components and Storybook live here, not in another workspace. Translations come from `packages/i18n`; player copy uses the `playerApp` key prefix. Build both `bun run build` and `bun run build:native`, and run `bun run test:e2e` after user-facing changes.
