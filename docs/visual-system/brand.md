# PointFinder Brand

## Decision and adoption status

The original pointer, path, and light mark was selected on 2026-09-08.
The canonical artwork is [pointfinder-mark.svg](../../design-system/brand/pointfinder-mark.svg).
Its geometry is approved. The wider light-beam experiments were rejected.

This document records the identity and the integration contract. The first
rollout (2026-09-09) implemented the shared web component, the generated exports,
the browser favicon set, and the launcher assets for Tauri and the maintained
legacy iOS/Android applications. Device-level verification of the native
launcher assets is still open; see “Integration status” below.

## Meaning

Faith is at the heart of PointFinder's identity, expressed with warmth and
openness to people outside the faith community. The mark brings together:

- The compass pointer: direction, purposeful exploration, and setting out.
- The winding path: discovery and growth through shared real-world experience.
- The guiding light: God's guidance and Christian hope.
- The two sides of the path: fellowship and making the journey together.

Preserve the original light proportions and curved transitions. Do not lengthen
the side beams to make an explicit cross, add an external star, or surround the
mark with a compass dial. Meaning informs the identity; it does not require
extra symbols or a religious explanation in every product flow.

## One master mark

Use the same upright silhouette, path, and light across player, operator, and
public surfaces. Keep the SVG's aspect ratio and transparent negative space.
Do not redraw the mark per screen, substitute a library navigation icon, distort,
rotate, outline, or add detail to the official logo.

The master is a single filled path with a 512 × 512 viewBox. Its solid bounds
are 380 × 380, with 66 units of inset on each side. Preserve this default inset
for ordinary UI use; launcher exports need their own platform-safe placement.
Consider visible artwork size as well as SVG element size during review.

The implemented presentation formats use this same mark:

- Mark alone for compact brand placements.
- Mark beside the text “PointFinder” for introductions, headers, and footers.
- One-color positive and reversed treatments for contrasting backgrounds.
- Platform icon exports with suitable background, padding, masks, and layers.

No separate detailed or simplified logo is currently approved. Start with the
master at all sizes. Inspect favicon-size rasterizations at actual display size;
if the path or light closes up, propose a documented optical correction for that
specific size. Do not invent a small-size variant independently in a component.
Larger marketing compositions can use richer surroundings while preserving the
mark itself. Supporting illustrations are separate assets.

## Color and accessibility

The master retains its selected forest green, `#174A32`, as an artwork color.
This is not a new UI palette or a permission to hard-code that color in screens.
The semantic brand roles live in `design-system/tokens.json` under
`color.{light,dark}.brand` and reach the web as `text-brand`, `bg-brand-tile`
and `text-brand-tile-foreground`:

| Role | Light | Dark | Use |
| --- | --- | --- | --- |
| `brand.mark` | `#174a32` | `#eef4ef` | One-color mark on the theme canvas: positive on light, reversed on dark |
| `brand.tile` | `#174a32` | `#174a32` | Launcher and entry-point tile behind the reversed mark |
| `brand.onTile` | `#ffffff` | `#ffffff` | The reversed mark on the tile |

Existing primary and success colors were not changed to match the artwork.

Check logo visibility on light, dark, photographic, and app-icon backgrounds.
The path and light must show the background through the SVG, including in a
reversed treatment. Avoid shadows, glow, gradients, and independent recoloring
of parts inside the mark.

Give a standalone informative image the accessible name “PointFinder”. When
the adjacent wordmark or the containing link already names the brand, hide the
mark from assistive technology to avoid duplicate announcements. Inline reuse
must avoid duplicate title/description IDs from the source SVG. Preserve
localized navigation labels and existing link destinations. Brand motion must
respect reduced motion and must not imply loading, sync, or directional state.

## Intended placements

| Surface | Intended treatment |
| --- | --- |
| Public header and footer | Mark with PointFinder text; compact mark where space requires it |
| Sign-in, join, welcome | Consistent identity near the entry point, with role and primary action remaining clear |
| Operator shell | Small, stable brand placement in shell navigation |
| Player settings/about | Brand identity without taking space from field actions |
| Browser tabs | Favicon derived from the master, checked at 16 and 32 px |
| Native launcher and store assets | Same mark, exported for each platform's presentation requirements |
| Existing launch surfaces | Static identity; do not add a delay to show the logo |
| Public social previews, printable NFC signs, exports | Mark with readable PointFinder attribution and sufficient clear space |

Do not use the brand mark for team/base pins, a live heading indicator,
navigation arrows, scan actions, or success/loading status. These remain domain
icons with their existing meanings. A functional compass and onboarding compass
illustration are not automatically branding replacements.

## Generated derivations

Every checked-in copy of the mark is derived from the master by tooling; none
is hand-edited.

| Output | Producer | Drift check |
| --- | --- | --- |
| `web/src/generated/brandMark.ts` (path, viewBox, source hash, brand roles) | `make design-system-generate` | byte comparison in `generate.mjs --check` |
| `web/public/favicon.svg` (solid bounds + 20 units of clear space; light and dark tab treatments) | `make design-system-generate` | byte comparison |
| Legacy Android adaptive icon: `drawable/ic_launcher_foreground.xml` vector, `mipmap-anydpi-v26/*.xml` with monochrome layer, `pf_brand_*` colors | `make design-system-generate` | byte comparison |
| `web/public/favicon.ico` (16/32/48), `web/public/apple-touch-icon.png`, legacy iOS `AppIcon-1024.png`, legacy Android mipmap bitmaps, Tauri source PNGs in `design-system/brand/exports/` | `python3 design-system/scripts/brand-raster.py` (CairoSVG + Pillow) | sha256 of each file and of the master, plus the `color.brand` token values used, pinned in `design-system/brand/exports.json` and verified by `generate.mjs --check` |
| `mobile/src-tauri/icons/*`, `mobile/src-tauri/gen/apple/.../AppIcon.appiconset`, `mobile/src-tauri/gen/android/.../mipmap-*` and adaptive XML | `node design-system/scripts/brand-tauri.mjs` (runs `tauri icon` on the pinned `tauri-icon.json`) | sha256 of every output pinned under `tauri` in `exports.json`, verified by `generate.mjs --check`; ICNS entries are sorted without changing image data to make the macOS container deterministic |

`make brand-export` runs the raster step and the Tauri step in order; changing the master or a `color.brand` token without rerunning both fails the check. Placement
constants are mirrored in the two scripts: launcher tiles scale the 512-unit frame
to 80% of the tile, and the Android adaptive foreground scales it to 68 dp of
the 108 dp viewport so the pointer's circumscribed circle (≈475 units) stays
inside the 66 dp safe zone. Launcher assets use the reversed treatment (white
mark on the `brand.tile` green); iOS receives an opaque tile and applies its
own mask, macOS/Windows receive a rounded tile, and Android composes the
transparent foreground over a solid background with the same foreground as the
themed-icon monochrome layer.

Small-size finding (2026-09-09): at 32 px the path and light stay open; at
16 px the winding path partially closes and the mark reads as the pointer
silhouette with a faint path. No 16 px variant was introduced; an optical
correction for that single size remains a documented proposal, not a component
decision.

## Web component

`web/src/components/brand/` exports `BrandMark`, `BrandLockup` (mark plus the
localized `common.appName` wordmark) and `BrandTile` (reversed mark on the
brand tile at the launcher placement). `tone="brand"` uses the semantic brand
color; `tone="current"` inherits the surrounding text color for reversed use on
evergreen and photographic bands. A standalone mark is an image named
“PointFinder”; pass `decorative` when adjacent text or the containing link
already names the brand. The component emits no ids, titles or descriptions, so
inline reuse cannot duplicate them. Fixtures: Storybook `Brand/BrandMark` and
the `/dev/visual-system` “Brand mark, lockup, tile and small sizes” section.

## Integration status

Done in the first rollout:

- Public header, hero note, footer, FAQ, privacy page, sign-in, register, join
  by invitation, forgot/reset password, native join, welcome world header and
  its static loading fallback, dashboard heading, operator rail, player settings.
  Routes, labels, localization, test IDs and layout behavior were preserved;
  functional compass, map and navigation icons were left in place.
- Browser tabs: SVG favicon with light/dark treatment, ICO fallback and touch
  icon, referenced from `web/index.html` and the static privacy and tag pages.
- Tauri desktop, iOS and Android icon sets; legacy iOS `AppIcon` (default
  appearance) and legacy Android adaptive, round, legacy and monochrome icons.

Open, with limits recorded honestly:

- Native launcher assets have been generated and compiled with platform tools
  where available, but not yet inspected on a device home screen or in
  TestFlight/Play listings. Do not claim native adoption until that check runs.
- Legacy iOS dark and tinted appearance slots remain unassigned; iOS falls back
  to the default icon. Adding them requires a decision on a dark tile value.
- The public broadcast pages keep their live-signal icon beside the product
  name; that icon means “live”, which the brand mark must not imply.
- Printable NFC signs, social previews and exports have not yet adopted the mark.

Platform export requirements should be checked when implementing:
[Apple app icons](https://developer.apple.com/design/human-interface-guidelines/app-icons)
and [Android adaptive icons](https://developer.android.com/develop/ui/compose/system/icon_design_adaptive).
