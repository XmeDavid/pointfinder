"""Render a reusable transparent illustration from the authored character library.
Blender --background --python render_pose.py -- --character ponytail --pose wave
"""
import bpy, argparse, sys, math
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parent
p=argparse.ArgumentParser()
p.add_argument('--character',choices=['short','ponytail','guide'],default='short')
p.add_argument('--pose',choices=['idle','wave','point','celebrate','phone','walk'],default='wave')
p.add_argument('--frame',type=int,default=13)
p.add_argument('--angle',type=float,default=15,help='Camera orbit in degrees; 180 shows the back')
p.add_argument('--size',type=int,default=1400)
p.add_argument('--output',default=None)
p.add_argument('--background',action='store_true')
args=p.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'pointfinder-character-library.blend'))
key='pathfinder-'+args.character
for c in bpy.data.collections:
    if c.name.startswith('pathfinder-'):c.hide_render=c.name!=key
rig=bpy.data.objects[key+' • Rig'];rig.location=(0,0,0);rig.rotation_euler=(0,0,0)
for tr in rig.animation_data.nla_tracks:tr.mute=True
rig.animation_data.action=bpy.data.actions[key+'/'+args.pose]
s=bpy.context.scene;s.frame_set(args.frame)
cam=s.camera;a=math.radians(args.angle);cam.location=(7*math.sin(a),-7*math.cos(a),3.3)
cam.rotation_euler=(Vector((0,0,1.34))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=3.25
s.render.resolution_x=s.render.resolution_y=args.size;s.render.resolution_percentage=100
s.render.film_transparent=not args.background
bpy.data.objects['Studio floor'].hide_render=not args.background
s.render.image_settings.color_mode='RGBA';s.eevee.taa_render_samples=96
s.render.filepath=str(Path(args.output).resolve() if args.output else ROOT/f'{args.character}-{args.pose}-transparent.png')
bpy.ops.render.render(write_still=True)
