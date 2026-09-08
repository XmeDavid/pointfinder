# Illustrated PointFinder landing assets

Marketing uses warm, tactile scout illustrations; working surfaces retain the product's practical map-centered interface. Blue uniforms, navy/gold scarves, evergreen environments and green actions connect the two. Characters are illustrations here, while onboarding continues to use poseable 3D assets.

## Independent layers

| File | Purpose | Replace independently |
| --- | --- | --- |
| `hero.webp` | Complete forest adventure scene; dark left for live copy | Hero illustration |
| `forest-footer.webp` | Empty dark forest with trees and rocks framing the bottom | Background only |
| `guide-pointing.webp` | Transparent guide pointing right | Pose/character only |
| `workspace-preview.webp` | Actual workspace screenshot with fictional data | Product screen only |
| `step-plan.webp` | Transparent planning diorama | First explanation |
| `step-explore.webp` | Transparent team exploration diorama | Second explanation |
| `step-checkin.webp` | Transparent check-in diorama | Third explanation |

Production files live in `web/public/landing/illustrated/`. Original generated PNGs are retained in this directory's `source/`. Do not flatten the lower section into one banner: its background, character and product screen must stay independently replaceable. All page copy, navigation, branding and actions are localized HTML/SVG, not baked into artwork. Illustrated phone/map/card markings are decorative, not functional interfaces or scannable joining codes.

## Generation and updates

Created with the built-in image-generation tool, one image at a time. Exact prompt set: `prompts.json`. The approved user concept supplied style/composition, and the generated hero provided character/style continuity for subsequent cutouts. Alpha is retained in PNG and WebP. `prepare-assets.mjs` performs only format/size conversion, with 88-quality WebP and full alpha quality.

`capture-workspace.mjs` uses Playwright against local Vite at port 5173. It renders the real workspace with fictional game/team/activity fixtures in Costa de Lavos, Portugal, and real map tiles; it does not access a production account. Run again after product changes, then convert the PNG. Preserve visible map attribution when displaying the screenshot. The script uses the existing installed Playwright dependency; conversion uses Sharp from the local bundled runtime. Update those local imports for another machine.

Desktop and phone layouts should compose the same assets at appropriate sizes. Eager-load only the hero; lazy-load lower artwork. Text remains readable against semantic surface colours if images fail.

Demo geography was chosen by the user. Beach reference: https://rmsl.apambiente.pt/content/costa-de-lavos . Keep future screenshot fixtures here, away from personal locations.
