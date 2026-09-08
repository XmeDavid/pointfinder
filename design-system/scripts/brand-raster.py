#!/usr/bin/env python3
"""Raster exports of the approved PointFinder mark.

Reads design-system/brand/pointfinder-mark.svg (never modified) and tokens.json,
renders the platform launcher, touch and favicon bitmaps with CairoSVG + Pillow,
and pins every output by sha256 in design-system/brand/exports.json so
`node design-system/scripts/generate.mjs --check` can detect drift against the
master. Tauri desktop/iOS/Android sets are then produced and pinned from the
exported sources with `node design-system/scripts/brand-tauri.mjs`.

Usage: python3 design-system/scripts/brand-raster.py
On macOS the script re-executes itself with DYLD_FALLBACK_LIBRARY_PATH so the
Homebrew cairo library resolves; no other setup is required.
"""
from __future__ import annotations

import hashlib
import io
import json
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MASTER = ROOT / "design-system/brand/pointfinder-mark.svg"
TOKENS = ROOT / "design-system/tokens.json"
EXPORTS_DIR = ROOT / "design-system/brand/exports"
MANIFEST = ROOT / "design-system/brand/exports.json"

# Placement contract shared with brand.mjs: mark frame is 512 units, solid bounds 380 with 66 inset.
FRAME = 512
ANDROID_VIEWPORT_DP = 108
ANDROID_MARK_DP = 68            # mirrors ANDROID_ADAPTIVE in brand.mjs
TILE_MARK_SCALE = 0.8           # the 512 frame scaled to 80% of a launcher tile
DESKTOP_CORNER = 0.2237         # macOS/Windows rounded-square presentation
LEGACY_CORNER = 0.18            # pre-adaptive Android launcher bitmap corners
ANDROID_DENSITIES = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}


def _import_renderers():
    try:
        import cairosvg  # noqa: F401
        from PIL import Image  # noqa: F401
    except OSError:
        if sys.platform == "darwin" and not os.environ.get("DYLD_FALLBACK_LIBRARY_PATH"):
            env = dict(os.environ, DYLD_FALLBACK_LIBRARY_PATH="/opt/homebrew/lib:/usr/local/lib")
            os.execve(sys.executable, [sys.executable, *sys.argv], env)
        raise
    import cairosvg
    from PIL import Image, ImageDraw
    return cairosvg, Image, ImageDraw


cairosvg, Image, ImageDraw = _import_renderers()


def read_master() -> tuple[str, str]:
    svg = MASTER.read_text(encoding="utf-8")
    if 'viewBox="0 0 512 512"' not in svg:
        raise SystemExit("unexpected master viewBox")
    paths = re.findall(r'<path\b[^>]*\bd="([^"]+)"', svg)
    if len(paths) != 1:
        raise SystemExit(f"master must contain exactly one path, found {len(paths)}")
    return re.sub(r"\s+", " ", paths[0]).strip(), hashlib.sha256(MASTER.read_bytes()).hexdigest()


def brand_tokens() -> dict:
    tokens = json.loads(TOKENS.read_text(encoding="utf-8"))
    return {theme: {role: token["$value"] for role, token in tokens["color"][theme]["brand"].items()} for theme in ("light", "dark")}


def render(svg: str, size: int):
    png = cairosvg.svg2png(bytestring=svg.encode("utf-8"), output_width=size, output_height=size)
    return Image.open(io.BytesIO(png)).convert("RGBA")


def mark_svg(path: str, fill: str, view_box: str = "0 0 512 512") -> str:
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{view_box}"><path fill="{fill}" d="{path}"/></svg>'


def mark_on_transparent(path: str, fill: str, size: int, mark_fraction: float):
    """The full 512 frame scaled to `mark_fraction` of the canvas, centered."""
    pad = (1 - mark_fraction) / 2 * FRAME / mark_fraction
    view = f"{-pad} {-pad} {FRAME + 2 * pad} {FRAME + 2 * pad}"
    return render(mark_svg(path, fill, view), size)


def rounded_mask(size: int, radius_fraction: float):
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, size - 1, size - 1], radius=int(round(size * radius_fraction)), fill=255)
    return mask


def circle_mask(size: int):
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, size - 1, size - 1], fill=255)
    return mask


def tile(path: str, tokens: dict, size: int, mask=None, mark_fraction: float = TILE_MARK_SCALE):
    """Reversed treatment: the white mark on the forest-green brand tile; masked corners stay transparent."""
    base = Image.new("RGBA", (size, size), tokens["light"]["tile"])
    fg = mark_on_transparent(path, tokens["light"]["onTile"], size, mark_fraction)
    base.alpha_composite(fg)
    if mask is not None:
        out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        out.paste(base, (0, 0), mask)
        return out
    return base.convert("RGB")  # App Store and touch icons must not carry an alpha channel


def save_png(image, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    image.save(target, format="PNG", optimize=True)


def main() -> None:
    path, master_hash = read_master()
    tokens = brand_tokens()
    written: list[Path] = []

    def put(image, relative: str, **kwargs) -> None:
        target = ROOT / relative
        if relative.endswith(".ico"):
            target.parent.mkdir(parents=True, exist_ok=True)
            image.save(target, format="ICO", **kwargs)
        else:
            save_png(image, target)
        written.append(target)

    # Browser: favicon.ico from the same tight crop favicon.svg uses (solid bounds + 20 units of clear space).
    favicon_view = "46 46 420 420"
    favicon_sizes = [16, 32, 48]
    favicons = [render(mark_svg(path, tokens["light"]["mark"], favicon_view), s) for s in favicon_sizes]
    put(favicons[-1], "web/public/favicon.ico", sizes=[(s, s) for s in favicon_sizes], append_images=favicons[:-1])
    put(tile(path, tokens, 180), "web/public/apple-touch-icon.png")

    # Legacy iOS asset catalog: one opaque 1024 tile; iOS applies its own mask.
    put(tile(path, tokens, 1024), "ios-app/dbv-nfc-games/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png")

    # Legacy Android: adaptive foreground bitmaps plus pre-adaptive launcher bitmaps per density.
    for density, factor in ANDROID_DENSITIES.items():
        fg_size = int(ANDROID_VIEWPORT_DP * factor)
        put(mark_on_transparent(path, tokens["light"]["onTile"], fg_size, ANDROID_MARK_DP / ANDROID_VIEWPORT_DP),
            f"android-app/app/src/main/res/mipmap-{density}/ic_launcher_foreground.png")
        legacy = int(48 * factor)
        put(tile(path, tokens, legacy, rounded_mask(legacy, LEGACY_CORNER)), f"android-app/app/src/main/res/mipmap-{density}/ic_launcher.png")
        put(tile(path, tokens, legacy, circle_mask(legacy)), f"android-app/app/src/main/res/mipmap-{density}/ic_launcher_round.png")

    # Tauri sources: `tauri icon` derives desktop (.icns/.ico/.png), iOS and Android sets from these.
    put(tile(path, tokens, 1024, rounded_mask(1024, DESKTOP_CORNER)), "design-system/brand/exports/pointfinder-app-icon-1024.png")
    put(mark_on_transparent(path, tokens["light"]["onTile"], 1024, ANDROID_MARK_DP / ANDROID_VIEWPORT_DP),
        "design-system/brand/exports/pointfinder-android-foreground-1024.png")
    put(Image.new("RGBA", (1024, 1024), tokens["light"]["tile"]), "design-system/brand/exports/pointfinder-android-background-1024.png")
    tauri_manifest = ROOT / "design-system/brand/exports/tauri-icon.json"
    tauri_manifest.write_text(json.dumps({
        "default": "pointfinder-app-icon-1024.png",
        "bg_color": tokens["light"]["tile"],
        "android_bg": "pointfinder-android-background-1024.png",
        "android_fg": "pointfinder-android-foreground-1024.png",
        "android_fg_scale": 100,
        "android_monochrome": "pointfinder-android-foreground-1024.png",
    }, indent=2) + "\n", encoding="utf-8")
    written.append(tauri_manifest)

    import PIL
    manifest = {
        "source": {"file": "design-system/brand/pointfinder-mark.svg", "sha256": master_hash, "brandTokens": tokens},
        "tools": {"python": sys.version.split()[0], "cairosvg": cairosvg.__version__, "pillow": PIL.__version__},
        "placement": {"tileMarkScale": TILE_MARK_SCALE, "androidMarkDp": ANDROID_MARK_DP, "faviconViewBox": favicon_view},
        "files": {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(written)},
    }
    MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    for p in written:
        print(f"exported {p.relative_to(ROOT)}")
    print(f"pinned {len(written)} files in {MANIFEST.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
