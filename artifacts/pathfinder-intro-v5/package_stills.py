"""Package matching fallback renders and report optimized branch geometry."""
import json,struct
from pathlib import Path
from PIL import Image
HERE=Path(__file__).resolve().parent
OUT=HERE.parents[1]/'web/public/onboarding'
for name in ['role-choice']+[f'organizer-step-{i}' for i in range(1,7)]:
    Image.open(HERE/(name+'.png')).save(OUT/(name+'.webp'),quality=86)
for branch,asset in [('role-choice','role-choice'),('organizer','organizer-world')]:
    data=(OUT/(asset+'.glb')).read_bytes()
    gltf=json.loads(data[20:20+struct.unpack_from('<I',data,12)[0]])
    report=json.loads((OUT/(branch+'-report.json')).read_text())
    primitives=[p for m in gltf['meshes'] for p in m['primitives']]
    report.update(worldBytes=len(data),drawPrimitives=len(primitives),triangles=sum(gltf['accessors'][p.get('indices',p['attributes']['POSITION'])]['count']//3 for p in primitives if p.get('mode',4)==4),optimized=True)
    (OUT/(branch+'-report.json')).write_text(json.dumps(report,indent=2)+'\n')
