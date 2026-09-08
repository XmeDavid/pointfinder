# PointFinder modular character v2

One uniformed base and a shared 17-bone skeleton, with independent wardrobe items. Authored geometry, materials, accessories and poses were refined in Blender against the supplied character sheet. This is a standalone asset studio; production onboarding has not been replaced.

## Review and customize

From the repository root:

```sh
bun artifacts/pathfinder-modular-v2/serve.ts
```

Open http://127.0.0.1:8745. Swap hair, hat, backpack and scarf; adjust skin/hair colours; play or scrub six poses; export a transparent PNG or a reusable JSON configuration. The art tool requires the repository's installed Three.js dependency in `web/node_modules`. Its interface is English-only and is not a production onboarding UI.

## Files

- `modular-character.blend`: editable source asset, one shared rig, separate asset-marked item collections and a lit review scene.
- `modular-character.glb`: combined library with all wardrobe meshes and six clips. Apply configuration visibility before showing it: all alternatives are included.
- `items/*.glb`: independently exported skinned items with matching bone names and rest transforms.
- `asset-manifest.json`: available items, skeleton and clips.
- `customization.js`: configuration validation and item selection, including automatic hat-compatible hair.
- `render_character.py`: repeatable Blender still generation.
- `source/build_shapes.py`, `assemble.py`: reproducible geometry and library assembly.

Hair supports short, ponytail and none. Both hairstyles have fitted hat variants. Hat and backpack can independently be omitted. Scarves support navy/gold, navy/gold/red and none. The base body is identical across these combinations.

Clips: idle, wave, point, celebrate, phone and walk. The rig is directly poseable in Blender; these are a starting pose library, not a full motion-capture or facial rig. Phone is a holding gesture, without a separate phone prop.

## Rebuild and render

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --python artifacts/pathfinder-modular-v2/source/build_shapes.py
/Applications/Blender.app/Contents/MacOS/Blender --background --python artifacts/pathfinder-modular-v2/assemble.py
/Applications/Blender.app/Contents/MacOS/Blender --background --python artifacts/pathfinder-modular-v2/render_character.py -- --hair ponytail --hat --backpack --scarf tricolor --pose wave --out custom.png
```

Use `--transparent` for cutouts, `--angle 150` for the rear, and `--frame` to select a clip frame. The intermediate source scene builds wardrobe shapes using source configurations; the assembled deliverable consolidates those into one base and one rig.

## Visual refinement

Review renders cover a narrower body, softer jaw, larger vertical eyes, tapered hair locks, relaxed arms, wider boots, fitted hat hair, and a continuous ponytail swept behind the bedroll. Retained review passes document the changes. The final Blender stills are actual rendered geometry, not concept images.

## Reuse boundaries

The combined library already shares one skeleton. When importing standalone item files into an existing character, remap their skin joints by bone name to the existing skeleton; do not add another animated character root. In Three.js, clone animated instances with SkeletonUtils and keep each instance's materials independent when changing colours.

This is a source-quality kit. Mobile decimation, texture compression and device profiling are still required before shipping it in onboarding. The current separate-parts construction works for the included stylized gestures; extreme shoulder/hip poses may need additional skin-weight refinement. The scarf and ponytail do not have cloth/hair simulation.

Validation: 22 configuration tests; real-GLB browser smoke covering module swaps, poses, no-accessory base, config export/rejection, responsive layout and no JavaScript errors. The library contains nine tagged modules, 17 unique joint nodes and six clips.

Scarf refinement: the rear drape now shares its upper boundary with a continuous rolled nape/shoulder path. Back and side review renders (`review-scarf-back.png`, `review-scarf-side.png`) verify the connection. Both scarf variants and the combined/individual exports were rebuilt; the real-GLB browser smoke passed again.
