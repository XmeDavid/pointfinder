# Landing mascot clothing replacement

Built-in image generation edited each original character illustration separately, using the user's three-outfit lineup as clothing reference. The page layout, colors, copy, pricing and interaction design stay unchanged.

- `source/hero.png`: cream/green-cap main mascot, rust-shirt companion and charcoal-shirt background explorer. Imported to the existing hero WebP.
- `source/step-plan.png`, `source/step-explore.png`, `source/step-checkin.png`, `source/guide-pointing.png`: generated replacements awaiting genuine alpha extraction before import. The generator painted checkerboards despite transparency instructions; these are not usable transparent assets yet.
- `source/step-checkin-nfc.png`: approved checkpoint revision with an NFC tap plate and the canonical PointFinder mark engraved into the post. This supersedes the QR variant for eventual integration. Background extraction remains pending. `nfc-edit-prompt.txt` records the edit instructions.
- The original forest footer and real workspace screenshot contain no uniforms and remain unchanged.
- `prompts.json`: generation instructions. Original artwork is preserved in `../landing-illustrated-v1/source/`.

Integration status: only the hero is imported into the website. The four cutouts are saved source artwork awaiting background removal; the NFC revision is the selected check-in source. Alt text for the still-displayed original cutouts stays unchanged until replacement.
