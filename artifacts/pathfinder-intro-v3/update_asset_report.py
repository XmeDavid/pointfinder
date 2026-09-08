"""Record sizes and geometry counts from the final, optimized delivery assets."""
import json
import struct
from pathlib import Path

assets = Path(__file__).resolve().parents[2] / "web/public/onboarding"
report_path = assets / "asset-report.json"
report = json.loads(report_path.read_text())
for name in ("world", "compass"):
    data = (assets / f"{name}.glb").read_bytes()
    length, chunk_type = struct.unpack_from("<II", data, 12)
    assert chunk_type == 0x4E4F534A, "Expected glTF JSON chunk"
    scene = json.loads(data[20:20 + length])
    primitives = [p for mesh in scene["meshes"] for p in mesh["primitives"]]
    report[f"{name}Bytes"] = len(data)
    report[f"{name}DrawPrimitives"] = len(primitives)
    report[f"{name}Triangles"] = sum(
        scene["accessors"][p.get("indices", p["attributes"]["POSITION"])]["count"] // 3
        for p in primitives if p.get("mode", 4) == 4
    )
report["optimizer"] = "glTF Transform 4.5.0; palette, quantize, WebP; no mesh simplification"
report["runtimeDecoder"] = "native glTF / no WASM"
report_path.write_text(json.dumps(report, indent=2) + "\n")
