"""Render a configuration of the same character; no duplicated character models.
Blender --background --python render_character.py -- --hair ponytail --hat --backpack --scarf tricolor --pose wave
"""
import bpy, argparse, sys, math
from pathlib import Path
from mathutils import Vector
OUT=Path(__file__).resolve().parent
p=argparse.ArgumentParser()
p.add_argument('--hair',choices=['none','short','ponytail'],default='short')
p.add_argument('--hat',action='store_true');p.add_argument('--backpack',action='store_true')
p.add_argument('--scarf',choices=['none','gold','tricolor'],default='gold')
p.add_argument('--pose',choices=['rest','idle','wave','point','celebrate','phone','walk'],default='idle')
p.add_argument('--angle',type=float,default=20);p.add_argument('--frame',type=int,default=12)
p.add_argument('--out',default='review-final.png');p.add_argument('--transparent',action='store_true')
a=p.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
bpy.ops.wm.open_mainfile(filepath=str(OUT/'modular-character.blend'))
rig=bpy.data.objects['PointFinder / Shared rig']
selected={('base','uniform'),('hair',a.hair+('-hat' if a.hat and a.hair!='none' else '')),('scarf',a.scarf)}
if a.hat:selected.add(('hat','ranger'))
if a.backpack:selected.add(('backpack','canvas'))
for o in bpy.data.objects:
    if 'item_slot' in o:
        visible=(o['item_slot'],o['item_id']) in selected
        o.hide_render=not visible;o.hide_set(not visible)
    elif a.transparent and o.get('part_group')=='studio':o.hide_render=True
if a.pose!='rest':
    track=next(t for t in rig.animation_data.nla_tracks if t.name==a.pose)
    action=track.strips[0].action
    rig.animation_data.action=action
    rig.animation_data.action_slot=action.slots[0]
scene=bpy.context.scene;scene.frame_set(a.frame)
angle=math.radians(a.angle)
cam=scene.camera;cam.location=(8*math.sin(angle),-8*math.cos(angle),2.65)
cam.rotation_euler=(Vector((0,0,1.33))-cam.location).to_track_quat('-Z','Y').to_euler()
cam.data.ortho_scale=3.12
scene.render.film_transparent=a.transparent
scene.render.resolution_x=1000;scene.render.resolution_y=1100
scene.render.filepath=str(OUT/a.out)
bpy.ops.render.render(write_still=True)
print('CONFIGURATION_RENDERED', vars(a), flush=True)
