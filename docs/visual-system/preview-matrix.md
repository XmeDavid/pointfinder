# Preview and regression matrix

Canonical scenarios come from `design-system/scenarios.json`: default, selected, disabled, loading, empty, error, offline, queued, stale, destructive, and long localized copy.

| Fixture | Web `/dev/visual-system` | SwiftUI preview | Compose preview |
|---|---:|---:|---:|
| Core controls and feedback | yes | pending | pending |
| Semantic status and sync | yes | pending | pending |
| Player field banners and submission states | pending | yes | yes |
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

Required screenshot widths for migrated web journeys: 390, 768, 1280, and 1600 pixels. A row moves to `yes` only when its canonical states render without backend data and the relevant accessibility labels are present.
