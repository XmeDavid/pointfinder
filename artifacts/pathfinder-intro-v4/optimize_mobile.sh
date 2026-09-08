#!/bin/sh
set -eu
script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repo_dir=$(CDPATH= cd -- "$script_dir/../.." && pwd)
pf_bun=${PF_BUN:-/Users/xmedavid/.bun/bin/bun}
asset_dir="$repo_dir/web/public/onboarding"
cp "$asset_dir/world.glb" "$script_dir/world.raw.glb"
cp "$asset_dir/compass.glb" "$script_dir/compass.raw.glb"
"$pf_bun" x @gltf-transform/cli@4.5.0 optimize "$script_dir/world.raw.glb" "$asset_dir/world.glb" --compress quantize --simplify false --instance false --join-meshes false --texture-compress webp
"$pf_bun" x @gltf-transform/cli@4.5.0 optimize "$script_dir/compass.raw.glb" "$asset_dir/compass.glb" --compress quantize --simplify false --flatten false --join false --prune false --palette false --texture-compress false
python3 "$script_dir/update_asset_report.py"
