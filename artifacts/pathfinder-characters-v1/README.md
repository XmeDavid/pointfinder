# PointFinder character library · first model set

Three actual 3D figurines modeled from the supplied reference, sharing a
17-bone FK skeleton and named materials. This remains the reusable source
library. The welcome animation uses a derivative with reduced geometry and
retargeted story gestures in `artifacts/pathfinder-intro-v4`.

## Open and reuse

- `pointfinder-character-library.blend`: editable source, three character
  collections, individually named clothing/accessory meshes, rigs, pose actions,
  and a separate studio with lighting and camera. Images are packed in the file.
  Character collections are marked as Blender assets. Add this directory as an
  Asset Library to browse them under the `PointFinder/Characters` catalog.
- `pathfinder-short.glb`, `pathfinder-ponytail.glb`, `pathfinder-guide.glb`:
  portable skinned models with six clips each: `idle`, `wave`, `point`,
  `celebrate`, `phone`, `walk`. Clothing/accessories remain separate modules.
- `characters-lineup.png`, `guide-back.png`, `pose-*.png`: actual Blender renders.
- `asset-manifest.json`: per-model module names, dimensions implicit in the
  models, bone count and export sizes. Source is Z up / front -Y; glTF is Y up /
  front +Z. Height is about 2.55 scene units, 2.65 with the hat.

The `phone` clip is a holding gesture; it does not include a phone prop. Hands
are stylized mittens, without individual finger controls. The face uses simple
eyes, with no mouth or facial-expression rig. Walk is a first in-place cycle,
not foot-locked motion capture. Large extreme bends may need corrective shapes.

The guide has a fitted hair variant underneath its removable hat. Backpack and
hat can be hidden independently. Skin and clothing colors are named materials,
and can be edited without remodeling. Scarf stripes use packed UV textures.
The triangle badges are simplified interpretations of the provided artwork.

## Pose in Blender

Select a character's `… • Rig` object, enter Pose Mode, and rotate bones.
`root` positions the character; `hips`, `chest`, `neck`, `head`, and left/right
upper arm, forearm, hand, thigh, shin and foot bones control its pose.
All three models use the same bone names and proportions.

The Action Editor contains `pathfinder-…/wave`, etc. Select the matching action
and its armature slot. The NLA tracks are muted in the source so the file opens
in a relaxed rest pose. Do not enable all tracks at once.

Generate a new illustration without rebuilding the model:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --python artifacts/pathfinder-characters-v1/render_pose.py -- --character ponytail --pose wave --angle 20 --size 1400
```

PNG is transparent by default. Use `--background` for the warm studio floor,
`--angle 180` for a back view, and `--frame` to sample an animation.

## Local interactive studio

```sh
/Users/xmedavid/.bun/bin/bun artifacts/pathfinder-characters-v1/serve.ts
```

Open `http://127.0.0.1:8743`. It loads the actual GLBs into Three.js. Choose a
character, pose, animation frame, skin tone and guide accessories; orbit the
camera and save a PNG. The viewer is an English-only local art-review tool,
separate from the localized product UI. It serves only this asset directory,
the installed Three.js package and generated design tokens on localhost.

## Rebuild

`build_characters.py` generates all meshes, the shared rig, skin weights,
materials, packed scarf textures, animation actions, studio, renders and GLBs.
Run with Blender 5.2. Save manual refinements to a new blend before rebuilding;
the generator replaces its own outputs. Blender lighting and browser lighting
differ; the underlying geometry, skin and textures are the same.

These source-quality exports are around 3–4 MB each. A separate mobile LOD and
material consolidation pass is appropriate when integrating multiple characters
into the onboarding. This library is not yet a mobile performance sign-off.

All three GLBs pass the Khronos glTF Validator with zero errors and zero
warnings; `validation-*.json` contains the reports. Unused UV attributes on
untextured scarf details are informational. Packed scarf textures, a shared
wave pose and accessory visibility were also checked in the Three.js viewer.
