#!/bin/sh
set -eu
script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repo_dir=$(CDPATH= cd -- "$script_dir/../.." && pwd)
pf_bun=${PF_BUN:-/Users/xmedavid/.bun/bin/bun}
asset_dir="$repo_dir/web/public/onboarding"
for asset in role-choice organizer-world; do
  cp "$asset_dir/$asset.glb" "$script_dir/$asset.raw.glb"
  "$pf_bun" x @gltf-transform/cli@4.5.0 optimize "$script_dir/$asset.raw.glb" "$asset_dir/$asset.glb" --compress quantize --simplify false --instance false --join-meshes false --texture-compress webp
done
python3 "$script_dir/package_stills.py"
