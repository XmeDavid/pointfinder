# Welcome scene · reusable character integration

The native welcome animation now uses all three models from
`artifacts/pathfinder-characters-v1`: short hair, ponytail, and the equipped
guide. Each retains the shared 17-bone skeleton. The existing v3 camera,
chapter holds, world expansion and independent compass handoff are preserved.

`build_scene.py` loads the v3 scene and the character library, reduces fine
geometry for the welcome view, transfers the original walking and interaction
gestures onto the new skeletons, and attaches a phone prop to each left hand.
Root movement and the original walking bounce remain separate from joint poses.
The output is the editable `pointfinder-expanding-world.blend` in this directory.

`export_mobile.py` consolidates the environment, bakes the terrain and preserves
the three character skins and their scarf UV textures. All animation is exported
into one reversible glTF scene clip. `optimize_mobile.sh` palettes materials,
quantizes geometry and converts textures to WebP without a runtime decoder.
It records final counts in `web/public/onboarding/asset-report.json`.

The packaged world is about 8.1 MB, with 390,531 triangles and 140 draw
primitives. The separate compass remains about 103 KB; returning users still
load only the compass. These figures describe this export, not a physical-phone
performance guarantee. Device performance remains to be checked.

## Rebuild

From the repository root, in order:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --python artifacts/pathfinder-intro-v4/build_scene.py
/Applications/Blender.app/Contents/MacOS/Blender --background --python artifacts/pathfinder-intro-v4/export_mobile.py
sh artifacts/pathfinder-intro-v4/optimize_mobile.sh
/Applications/Blender.app/Contents/MacOS/Blender --background --python artifacts/pathfinder-intro-v4/render_fallbacks.py
```

Convert the seven RGBA resting-pose PNGs to the corresponding
`web/public/onboarding/step-N.webp` at quality 86. They cover loading, reduced
motion and graphics failure, so those paths show the same new characters.
Save manual source edits under another name before running the generators.

The runtime disposes bone textures along with meshes when unloading the scene.
The real-WebGL E2E verifies three animated 17-bone skins, forward/backward
chapters, the final fade, remembered compass entry, context-loss recovery and
reduced-motion switching. Blender chapter renders and real browser playback
are inspected separately to catch conversion differences.

The optimized world passes glTF validation with zero errors. Its three nested
skin nodes produce the standard non-root-skin warning; their movement is carried
by the joint hierarchy and was checked in the actual Three.js welcome renderer.
See `qa/gltf-validation.json` for the complete report.
