# PointFinder real-time onboarding

This revision is integrated into the native/Tauri welcome screen. The public
website and operator workspace retain their existing entry flows. Review the
live experience in the app or at `/dev/visual-system?onboarding=1` through `=7`.

## Authored scene and delivery assets

`pointfinder-expanding-world.blend` is the editable Blender source with an
independent compass root and needle. The world materials now fade from frame
782 to 814; the compass finishes appearing at 849. Original v2 remains intact.

`web/public/onboarding/world.glb` contains the animated participant world.
Static geometry is consolidated by animated parent; actual terrain color is
baked to five textures. Other procedural materials become colored PBR geometry.
The final optimization palettes materials and quantizes geometry, preserving
animation and avoiding a runtime WASM decoder. Rendering therefore differs
slightly from Blender, particularly indirect lighting and micro-surface detail.

`web/public/onboarding/compass.glb` is an independently loadable compass. Its
`PF_CompassNeedle` node rotates about local Y. North is local -Z; the display
rig turns the compass toward the camera. The app rotates only the needle with
magnetic heading, and applies restrained pitch/roll to the case. Browser and
unavailable-sensor fallback gently tilts the case; it does not invent a heading.

`timeline.json` stores the sampled isometric camera, zoom and chapter holds.
glTF animation and the camera are evaluated at the same reversible frame time.
The runtime fades the world independently; Skip fades the current pose instead
of playing unseen chapters. The complete world becomes invisible once faded.

The renderer is lazy loaded. Returning users request only the ~103 KB compass;
the ~5.4 MB world is loaded when the introduction is used. The review budget is
30 fps, DPR capped at 1.5, a 1024 shadow map, and no postprocessing pipeline.
Tiny hidden pop-animation objects stop drawing, settled world chapters stop
requesting frames, and app background/unmount stops sensors and animation.

`step-1.webp` through `step-7.webp` are transparent, Blender-rendered resting
poses used while loading, for reduced motion, and if WebGL/assets fail. They
are illustrative; the app still owns all language, actions and game state.

## Rebuild

From the repository root:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python artifacts/pathfinder-intro-v3/build_scene.py
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python artifacts/pathfinder-intro-v3/export_mobile.py
sh artifacts/pathfinder-intro-v3/optimize_mobile.sh
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python artifacts/pathfinder-intro-v3/render_fallbacks.py
```

Convert the seven generated RGBA PNGs to the corresponding public WebP assets
at quality 86 using Pillow. Blender 5.2 and glTF Transform 4.5.0 were used.
Save manual Blender edits under another filename before rebuilding, because
the generator deliberately replaces its own source output.

## Practical validation boundary

Browser/native-shell builds, real WebGL playback, chapter controls, fade timing,
fallback, reduced motion, localization and heading direction math are checked
locally. Physical iOS/Android compass accuracy, battery use, heat and frame rate
still require device testing. The bridge supplies magnetic north, not
location-corrected geographic true north. No location permission was added.
The participant introduction is a teaching illustration; actual check-in,
submission approval, game unlocks and permissions remain app/domain-owned.
