# Preview and regression matrix

Canonical scenarios come from `design-system/scenarios.json`: default, selected, disabled, loading, empty, error, offline, queued, stale, destructive, and long localized copy.

| Fixture | Web `/dev/visual-system` | SwiftUI preview | Compose preview |
|---|---:|---:|---:|
| Base route numbering with progress, queued, long copy, disabled | yes | pending | pending |
| Player next/required base, hidden destination, route completed | yes | pending | pending |
| Core controls and feedback | yes | pending | pending |
| Semantic status and sync | yes | pending | pending |
| Player field banners and submission states | pending | yes | yes |
| Player onboarding and QR scanner chrome | partial | n/a | n/a |
| Player location check-in panel: locating, denied, far, near, arrived, claim gating | pending | n/a | n/a |
| Player arrival notice: named base, hidden base found, queued offline | pending | n/a | n/a |
| Player map check-in radius rings and method-aware scan control | pending | n/a | n/a |
| Player map chrome and detail states | pending | yes | yes |
| Operator stats, review cards, and rescue actions | partial | yes | yes |
| Operator setup readiness, resources, and launch | partial | yes | yes |
| Operator game library and workspace switching | partial | yes | yes |
| Operator teams and resource management rows | partial | yes | yes |
| Operator assignments and variable completeness | partial | yes | yes |
| Operator editor context and readiness | partial | yes | yes |
| Results, billing, and admin summaries | partial | n/a | n/a |
| Public broadcast panels and responsive viewer | partial | n/a | n/a |
| Notifications and organization summary | partial | yes | yes |
| Map markers and selection | yes | partial | partial |
| Inspector / sheet shell | yes | pending | pending |
| Light and dark | yes | yes | yes |
| Reduced motion | browser setting | pending | pending |
| Dynamic type / font scale | responsive long copy | scenario matrix | scenario matrix |
| Player live loop | pending | partial | partial |
| Operator command/review/rescue | partial | partial | partial |
| Operator map-centered setup builder | partial | partial | partial |
| Operator game library | partial | partial | partial |
| Operator teams, bases, challenges, and stages | partial | partial | partial |
| Operator assignments and team variables | partial | partial | partial |
| Operator base, challenge, and stage editors | partial | partial | partial |
| Results and public broadcast viewer | partial | n/a | n/a |
| Notifications, organization, billing, and administration | partial | partial | partial |
| Check-in method badges and claim states | yes | pending | n/a |
| Printable QR codes and codes sheet | yes | n/a | n/a |
| Operator check-in radius ring on the location picker | partial | n/a | n/a |
| Operator readiness rows per check-in method | partial | pending | pending |
| Guided tutorial coach bubble, spotlight and collapsed pill | yes | n/a | n/a |
| Operator guided tutorials: welcome card, per-step coach marks, first-game method branches, fixed-route, exploration, practice-game badge and keep/delete closing card | partial | n/a | n/a |
| Operator assignment grid: bases × (all teams + each team) with per-cell challenge pickers, all-teams/per-team conversion, refused-write reason inline; challenge and base assignment sections in both modes | partial | n/a | n/a |
| Operator tutorials, advanced: unlock chain (reveals editor), a different path (grid), a variable outcome (team variables in completion text); progress bar instead of a step counter | partial | n/a | n/a |
| Operator drawer quick filters: stage chips (Bases, only with stages) and tag chips (Bases and Challenges), combined with search, clear control, no-match copy | yes | n/a | n/a |
| Operator assignment grid on phones: base list with per-base sheet; ChallengePicker (searchable, rich rows) in every assignment cell on both layouts | yes | n/a | n/a |

Required screenshot widths for migrated web journeys: 390, 768, 1280, and 1600 pixels. A row moves to `yes` only when its canonical states render without backend data and the relevant accessibility labels are present. Check-in method rows are marked `n/a` for the legacy Swift and Compose apps: those apps keep working for NFC bases only and receive no QR or location UI. Guided tutorials are marked `n/a` for the legacy apps too: the operator tutorial engine ships once in `web/` for the browser and the Tauri shell.
