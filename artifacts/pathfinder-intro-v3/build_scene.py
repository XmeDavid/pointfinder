"""PointFinder expanding-world animation study v3. Text is owned by the app overlay. Run with Blender 5.2 -b --python.

Everything is modeled locally with Blender primitives, meshes and curves.
Photo references inform clothing only; these are generic stylized characters.
"""
import bpy
import math
import random
import json
import sys
from pathlib import Path
from mathutils import Vector

OUT = Path(__file__).resolve().parent
random.seed(17)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene
scene.frame_start, scene.frame_end = 1, 864
scene.render.fps = 24
scene.render.resolution_x, scene.render.resolution_y = 1200, 900
scene.render.resolution_percentage = 100
scene.render.engine = 'BLENDER_EEVEE'
scene.eevee.taa_render_samples = 32
scene.eevee.use_fast_gi = True
scene.render.film_transparent = False
scene.world.color = (0.018, 0.023, 0.021)
scene.view_settings.view_transform = 'AgX'
scene.view_settings.look = 'AgX - Medium High Contrast'
scene.render.image_settings.file_format = 'PNG'

def linear(v):
    return v / 12.92 if v < .04045 else ((v + .055) / 1.055) ** 2.4

def material(name, color, rough=.8, emission=0):
    rgb = tuple(linear(int(color[i:i+2], 16)/255) for i in (0, 2, 4))
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*rgb, 1)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*rgb, 1)
    bsdf.inputs['Roughness'].default_value = rough
    if emission:
        bsdf.inputs['Emission Color'].default_value = (*rgb, 1)
        bsdf.inputs['Emission Strength'].default_value = emission
    return m

M = {k: material(k, v) for k,v in {
    'forest':'11251D', 'floor':'06100A', 'earth':'596751',
    'grass':'879B72', 'grassLight':'A3B58B', 'path':'D7D0AD',
    'green':'43CE80', 'greenDark':'22724F', 'greenPale':'A3D8AE',
    'ivory':'F1ECD9', 'muted':'B1BDAA', 'tree':'436D50',
    'treeLight':'638B5D', 'bark':'655844', 'wood':'C3AD85',
    'roof':'465D50', 'blue':'5689B7', 'blueLight':'75A1C4',
    'navy':'1C2E48', 'scarfNavy':'172B43', 'scarfGold':'F0CB5C',
    'shoe':'27332E', 'hair':'493A2D', 'skin1':'D8A079',
    'skin2':'9C654B', 'skin3':'EDC39D', 'pinBlue':'6BACE2',
}.items()}
M['signal'] = material('Emerald signal', '43CE80', emission=.4)
M['text'] = material('Caption ivory', 'ECEFDF', emission=2)
M['textMuted'] = material('Caption sage', 'BCCBBC', emission=1.5)

def empty(name, loc=(0,0,0), parent=None):
    o = bpy.data.objects.new(name, None)
    scene.collection.objects.link(o)
    o.parent = parent
    o.location = loc
    return o

world = empty('WORLD | shared continuous diorama')

def finish(o, name, mat, parent=None):
    o.name = name
    if mat: o.data.materials.append(M[mat] if isinstance(mat,str) else mat)
    o.parent = parent
    return o

def cube(name, loc, dim, mat, bevel=.04, parent=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = finish(bpy.context.object, name, mat, parent)
    o.scale = dim
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        mod=o.modifiers.new('Soft manufactured edges','BEVEL'); mod.width=bevel; mod.segments=3
        o.modifiers.new('Weighted corner normals','WEIGHTED_NORMAL')
    return o

def sphere(name, loc, scale, mat, parent=None):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=20, ring_count=12, radius=1, location=loc)
    o=finish(bpy.context.object,name,mat,parent); o.scale=scale
    for p in o.data.polygons: p.use_smooth=True
    return o

def cylinder(name, loc, radius, depth, mat, parent=None, vertices=40):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=loc)
    o=finish(bpy.context.object,name,mat,parent)
    mod=o.modifiers.new('Soft rim','BEVEL'); mod.width=min(.035,depth/5,radius/5); mod.segments=2
    o.modifiers.new('Weighted normals','WEIGHTED_NORMAL')
    return o

def mesh(name, vertices, faces, mat, parent=None):
    data=bpy.data.meshes.new(name); data.from_pydata(vertices,[],faces); data.update()
    o=bpy.data.objects.new(name,data); scene.collection.objects.link(o)
    return finish(o,name,mat,parent)

def line(name, points, radius, mat, parent=None, smooth=True):
    data=bpy.data.curves.new(name,'CURVE'); data.dimensions='3D'
    data.resolution_u=16; data.bevel_depth=radius; data.bevel_resolution=3
    sp=data.splines.new('BEZIER' if smooth else 'POLY')
    if smooth:
        sp.bezier_points.add(len(points)-1)
        for p,co in zip(sp.bezier_points,points):
            p.co=co; p.handle_left_type='AUTO'; p.handle_right_type='AUTO'
    else:
        sp.points.add(len(points)-1)
        for p,co in zip(sp.points,points): p.co=(*co,1)
    o=bpy.data.objects.new(name,data); scene.collection.objects.link(o)
    return finish(o,name,mat,parent)

def ring(name, loc, r, tube, mat, parent=None):
    pts=[(loc[0]+r*math.cos(i*math.tau/64),loc[1]+r*math.sin(i*math.tau/64),loc[2]) for i in range(65)]
    return line(name,pts,tube,mat,parent,False)

def text(name, body, loc, size, mat='text', parent=None, align='CENTER'):
    data=bpy.data.curves.new(name,'FONT'); data.body=body; data.size=size
    data.align_x=align; data.align_y='CENTER'; data.extrude=.001
    o=bpy.data.objects.new(name,data); scene.collection.objects.link(o)
    o.location=loc
    return finish(o,name,mat,parent)

def key(o, prop, frame, value):
    setattr(o,prop,value); o.keyframe_insert(data_path=prop,frame=frame)

def pop(o, start, duration=20, size=1):
    key(o,'scale',1,(.0001,)*3)
    key(o,'scale',max(1,start),( .0001,)*3)
    key(o,'scale',start+duration*.72,(size*1.055,)*3)
    key(o,'scale',start+duration,(size,)*3)

def hide(o, start, duration=14):
    key(o,'scale',start,tuple(o.scale))
    key(o,'scale',start+duration,(.0001,)*3)

def move(o, frames):
    for f,co in frames: key(o,'location',f,co)

# ---------------------------------------------------------------------------
# Material work: pigment variation, fine grain and soft terrain / path blending.
# There are intentionally no FONT objects: all tutorial copy lives in the app.
# ---------------------------------------------------------------------------
from mathutils import noise

def texture_material(name, low, high, scale=7, bump=.018):
    m=material(name,low,1)
    nt=m.node_tree; nodes=nt.nodes; links=nt.links
    bsdf=nodes.get('Principled BSDF')
    tex=nodes.new('ShaderNodeTexNoise'); tex.inputs['Scale'].default_value=scale
    tex.inputs['Detail'].default_value=4; tex.inputs['Roughness'].default_value=.7
    coordinates=nodes.new('ShaderNodeTexCoord'); links.new(coordinates.outputs['Object'],tex.inputs['Vector'])
    ramp=nodes.new('ShaderNodeValToRGB')
    for elem,col in zip(ramp.color_ramp.elements,[low,high]):
        elem.color=(*[linear(int(col[i:i+2],16)/255) for i in (0,2,4)],1)
    links.new(tex.outputs['Fac'],ramp.inputs[0]); links.new(ramp.outputs['Color'],bsdf.inputs['Base Color'])
    grain=nodes.new('ShaderNodeTexNoise'); grain.inputs['Scale'].default_value=95; grain.inputs['Detail'].default_value=2
    links.new(coordinates.outputs['Object'],grain.inputs['Vector'])
    normal=nodes.new('ShaderNodeBump'); normal.inputs['Strength'].default_value=.28; normal.inputs['Distance'].default_value=bump
    links.new(grain.outputs['Fac'],normal.inputs['Height']); links.new(normal.outputs['Normal'],bsdf.inputs['Normal'])
    return m

M['rock']=texture_material('Layered earth / mineral grain','4D5140','847F62',5,.045)
M['bark']=texture_material('Weathered bark','514B36','807152',8,.022)
M['timber']=texture_material('Warm weathered timber','817458','B8A581',5,.012)
M['shingle']=texture_material('Individual cedar shingles','5A6250','899075',7,.012)
M['foliage']=texture_material('Matte leaf canopy','345B40','658052',5,.04)
M['foliageLight']=texture_material('Sunlit leaf canopy','526D43','8C995B',6,.03)
M['stone']=texture_material('Rounded limestone','878B6E','C0BD97',8,.016)
M['shirt']=texture_material('Uniform / woven blue cotton','3F709D','608FB6',4,.002)
M['trousers']=texture_material('Uniform / navy cloth','172C43','283C51',4,.002)
M['ground']=material('Terrain / moss and sandy paths','89916A',1)
nt=M['ground'].node_tree; bs=nt.nodes.get('Principled BSDF')
color=nt.nodes.new('ShaderNodeVertexColor'); color.layer_name='TerrainTint'
grain=nt.nodes.new('ShaderNodeTexNoise'); grain.inputs['Scale'].default_value=125; grain.inputs['Detail'].default_value=3
bump=nt.nodes.new('ShaderNodeBump'); bump.inputs['Distance'].default_value=.026; bump.inputs['Strength'].default_value=.28
coords=nt.nodes.new('ShaderNodeTexCoord'); nt.links.new(coords.outputs['Object'],grain.inputs['Vector'])
variation=nt.nodes.new('ShaderNodeTexNoise'); variation.inputs['Scale'].default_value=17; variation.inputs['Detail'].default_value=5; nt.links.new(coords.outputs['Object'],variation.inputs['Vector'])
ramp=nt.nodes.new('ShaderNodeValToRGB'); ramp.color_ramp.elements[0].color=(.29,.25,.18,1); ramp.color_ramp.elements[1].color=(1,1,.86,1)
nt.links.new(variation.outputs['Fac'],ramp.inputs[0])
mix=nt.nodes.new('ShaderNodeMixRGB'); mix.blend_type='MULTIPLY'; mix.inputs[0].default_value=.68; nt.links.new(color.outputs['Color'],mix.inputs[1]); nt.links.new(ramp.outputs['Color'],mix.inputs[2])
nt.links.new(mix.outputs[0],bs.inputs['Base Color']); nt.links.new(grain.outputs['Fac'],bump.inputs['Height']); nt.links.new(bump.outputs['Normal'],bs.inputs['Normal'])
M['grassBlade']=material('Tiny meadow blades','748657',1)
M['grassDry']=material('Dry grass tips','A5A079',1)
M['scarfGold']=material('Uniform / warm yellow scarf','EFC65C',.9)
M['skin1']=material('Skin / warm','CAA17D',.72)
M['skin2']=material('Skin / deep','956B53',.72)
M['skin3']=material('Skin / light','DAB99A',.72)

# Studio camera follows the story; established tiles remain in the same world.
rig=empty('CAMERA RIG | follows the expanding world',(-4.7,-.1,0))
target=empty('Camera target',(0,0,.5),rig)
bpy.ops.object.camera_add(location=(8.8,-12.6,11.0))
camera=bpy.context.object; camera.name='Camera | continuous isometric story'; camera.parent=rig
constraint=camera.constraints.new('TRACK_TO'); constraint.target=target; constraint.track_axis='TRACK_NEGATIVE_Z'; constraint.up_axis='UP_Y'
camera.data.type='ORTHO'; camera.data.ortho_scale=7.5; scene.camera=camera
cube('Studio backdrop',(0,0,-1.01),(200,200,.12),'floor',0)
for name,loc,power,size in [('Soft morning key',(-8,-10,14),2700,7),('Sky fill',(8,-4,12),700,10),('Forest rim',(0,10,14),2100,7)]:
    bpy.ops.object.light_add(type='AREA',location=loc)
    lamp=bpy.context.object; lamp.name=name; lamp.data.energy=power; lamp.data.shape='DISK'; lamp.data.size=size
    lamp.data.color=(1,.91,.76) if name=='Soft morning key' else (.78,.88,1) if name=='Sky fill' else (1,.97,.84)
    lamp.rotation_euler=(Vector((0,1,0))-lamp.location).to_track_quat('-Z','Y').to_euler()

def tint(hex):
    return tuple(linear(int(hex[i:i+2],16)/255) for i in (0,2,4))

PATHS={
 'A':[(-2.35,-.9),(-1.2,-.85),(-.2,-.55),(1.1,-.3),(2.35,-.2)],
 'B':[(-2.35,-.2),(-1.1,-.3),(0,0),(1.2,.15),(2.35,.2)],
 'C':[(-2.35,.2),(-.8,.05),(.1,.35),(.2,1.2),(.1,2.35)],
 'D':[(.1,-2.35),(0,-.8),(-.5,.2),(-1.2,.5),(-2.35,.5)],
 'E':[(2.35,.5),(1,.3),(0,0),(-.7,-.8),(-.7,-2.35)]
}

def path_distance(x,y,route):
    best=100
    for a,b in zip(route,route[1:]):
        dx=b[0]-a[0]; dy=b[1]-a[1]; t=max(0,min(1,((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy)))
        best=min(best,math.hypot(x-a[0]-t*dx,y-a[1]-t*dy))
    return best

def height(x,y,route):
    d=path_distance(x,y,route)
    n=noise.noise(Vector((x*.65,y*.65,3.1)))*.085+noise.noise(Vector((x*2.2,y*2.2,7.2)))*.025
    return .11+n*min(1,max(0,(d-.15)/.55))

tiles={}
def tile(label,center,start):
    root=empty('TILE '+label+' | expanding terrain',(*center,0),world)
    route=PATHS[label]; terrain_seed=ord(label)*13.7; n=97; half=2.34; rad=.30
    verts=[]; colors=[]
    moss=tint('7C8250'); dry=tint('C6B596'); green=tint('4C582B')
    for j in range(n):
        for i in range(n):
            x=-half+2*half*i/(n-1); y=-half+2*half*j/(n-1)
            if abs(x)>half-rad and abs(y)>half-rad:
                dx=abs(x)-(half-rad); dy=abs(y)-(half-rad); length=math.hypot(dx,dy)
                if length>rad: x=math.copysign(half-rad+dx/length*rad,x); y=math.copysign(half-rad+dy/length*rad,y)
            z=height(x,y,route); verts.append((x,y,z))
            d=path_distance(x,y,route)
            patch=noise.noise(Vector((x*2.3,y*2.3,12.8)))
            f=max(0,min(1,(d-.12+patch*.22)/.24))
            bare=max(0,min(.82,(noise.noise(Vector((x*2.6,y*2.6,terrain_seed)))-.03)*2.8)); f*=1-bare
            grass=tuple(green[k]*(.45+patch*.2)+moss[k]*(.55-patch*.2) for k in range(3))
            grain=.90+noise.noise(Vector((x*17,y*17,2)))*.10
            colors.append(tuple((dry[k]*(1-f)+grass[k]*f)*grain for k in range(3)))
    faces=[]
    for j in range(n-1):
        for i in range(n-1):
            a=j*n+i; faces.extend([(a,a+1,a+n+1),(a,a+n+1,a+n)])
    top=mesh('Terrain '+label+' | blended sandy path and moss',verts,faces,'ground',root)
    attr=top.data.color_attributes.new(name='TerrainTint',type='FLOAT_COLOR',domain='POINT')
    for c,v in zip(attr.data,colors): c.color=(*v,1)
    for polygon in top.data.polygons: polygon.use_smooth=True
    boundary=list(range(n))+[j*n+n-1 for j in range(1,n)]+[n*(n-1)+i for i in range(n-2,-1,-1)]+[j*n for j in range(n-2,0,-1)]
    side=[]
    for idx in boundary:
        x,y,z=verts[idx]; side.extend([(x,y,z-.008),(x*.988,y*.988,-.45+noise.noise(Vector((x*2,y*2,9)))*.035)])
    fs=[]
    for i in range(len(boundary)):
        a=i*2; b=((i+1)%len(boundary))*2; fs.append((a,b,b+1,a+1))
    fs.append(tuple(range(1,len(side),2))[::-1])
    wall=mesh('Terrain '+label+' | gently irregular earth edge',side,fs,'rock',root)
    bevel=wall.modifiers.new('Worn earth lip','BEVEL'); bevel.width=.045; bevel.segments=2
    wall.modifiers.new('Weighted normals','WEIGHTED_NORMAL')
    # Hundreds of tiny tufts batched into one mesh per tile.
    gv=[]; gf=[]
    for _ in range(630):
        x=random.uniform(-2.2,2.2); y=random.uniform(-2.2,2.2)
        if path_distance(x,y,route)<.32 or noise.noise(Vector((x*2.6,y*2.6,terrain_seed)))>.03: continue
        for blade in range(3):
            angle=random.uniform(0,math.tau); w=random.uniform(.008,.018); h=random.uniform(.025,.065)
            z=height(x,y,route)+.002; offset=len(gv)
            gv.extend([(x-math.cos(angle)*w,y-math.sin(angle)*w,z),(x+math.cos(angle)*w,y+math.sin(angle)*w,z),(x+math.sin(angle)*h*.25,y+math.cos(angle)*h*.25,z+h)])
            gf.append((offset,offset+1,offset+2))
    mesh('Terrain '+label+' | fine meadow tufts',gv,gf,'grassBlade',root)
    for i in range(18):
        x=random.uniform(-2.15,2.15); y=random.uniform(-2.15,2.15)
        if path_distance(x,y,route)<.35: continue
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2,radius=1,location=(x,y,height(x,y,route)+.025))
        stone=finish(bpy.context.object,'Terrain '+label+' | weathered pebble','stone',root)
        stone.scale=(random.uniform(.06,.16),random.uniform(.06,.13),random.uniform(.04,.10)); stone.rotation_euler[2]=random.uniform(0,math.tau)
        for p in stone.data.polygons: p.use_smooth=True
    # Rise, settle, then stay: the same pieces are never teleported away.
    move(root,[(1,(*center,-2.0)),(start,(*center,-2.0)),(start+34,(*center,.055)),(start+48,(*center,0))])
    pop(root,start,42)
    tiles[label]=root
    return root

A=tile('A',(-4.8,0),1)
B=tile('B',(0,0),146)
C=tile('C',(4.8,0),620)
D=tile('D',(4.8,4.8),672)
E=tile('E',(0,4.8),706)

def tree(name,loc,parent,pine=False,size=1):
    root=empty(name,loc,parent)
    cylinder('Textured tree trunk',(0,0,.55*size),.062*size,1.1*size,'bark',root,16)
    for z in [.35,.65]:
        for angle in [0,2.1,4.2]:
            line('Visible small branch',[(0,0,z*size),(.19*size*math.cos(angle),.19*size*math.sin(angle),(z+.23)*size)],.024*size,'bark',root)
    if pine:
        for j in range(4):
            points=[]; faces=[]; layers=4; sides=22
            for k in range(layers):
                r=(.40-j*.065)*size*(1-k/(layers-1))+.025
                for i in range(sides):
                    ang=i*math.tau/sides; rr=r*(1+.08*math.sin(i*3.7+j))
                    points.append((rr*math.cos(ang),rr*math.sin(ang),(.65+j*.22+k*.19)*size))
            for k in range(layers-1):
                for i in range(sides): a=k*sides+i; b=k*sides+(i+1)%sides; faces.append((a,b,b+sides,a+sides))
            o=mesh('Soft irregular pine layer',points,faces,'foliageLight' if j%2 else 'foliage',root)
            for p in o.data.polygons:p.use_smooth=True
    else:
        for j,(x,y,z,s) in enumerate([(0,0,1.15,.45),(.23,.08,1.22,.3),(-.2,.1,1.28,.34),(.04,-.21,1.31,.32),(0,.02,1.57,.30)]):
            bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=3,radius=1,location=(x*size,y*size,z*size))
            o=finish(bpy.context.object,'Clustered matte canopy','foliageLight' if j%2 else 'foliage',root)
            o.scale=(s*size,s*size,s*1.14*size)
            for v in o.data.vertices: v.co*=1+noise.noise(v.co*5)*.035
            for p in o.data.polygons:p.use_smooth=True
    return root

for label,parent in tiles.items():
    for i,(x,y,s) in enumerate([(-1.9,1.55,.88),(1.65,1.85,.95),(1.9,-1.65,.70),(-1.8,-1.65,.55)]):
        if label=='A' and i==0: continue
        tree('Tile '+label+' / tree '+str(i),(x,y,.12),parent,i%2==0,s)

# Each newly revealed tile has a quiet, recognizable landmark.
M['water']=material('Creek / still deep green water','31594F',.26)
creek=[]; creekfaces=[]
for i in range(55):
    x=-2.34+i*4.68/54; y=1.02+.12*math.sin(x*2.2)
    creek.extend([(x,y-.13,.16),(x,y+.13,.16)])
    if i: a=(i-1)*2; creekfaces.append((a,a+2,a+3,a+1))
mesh('Exploration tile / narrow woodland creek',creek,creekfaces,'water',C)
for side in [-1,1]:
    pts=[(x,1.02+.12*math.sin(x*2.2)+side*.15,.155) for x in [-2.34+i*4.68/54 for i in range(55)]]
    line('Creek bank',pts,.032,'stone',C,False)
for j in range(8):
    cube('Footbridge weathered plank',(.18,.67+j*.10,.21),(.73,.092,.045),'timber',.01,C)
for x in [-.1,.47]: cube('Footbridge support',(x,1.02,.177),(.045,.83,.055),'bark',.008,C)
for i,(x,y,scale) in enumerate([(-1.2,1.45,.43),(-1.6,1.30,.31),(-1.15,1.0,.24)]):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2,radius=1,location=(x,y,.20))
    o=finish(bpy.context.object,'Lookout tile / boulder cluster','rock',D); o.scale=(scale,scale*.75,scale*.6)
    bevel=o.modifiers.new('Weathered rock edges','BEVEL'); bevel.width=.035;bevel.segments=2
for x,y,scale in [(-1.25,.8,.70),(-.7,1.4,.95),(.05,1.65,.76)]: tree('Woodland tile / denser grove',(x,y,.12),E,True,scale)

# A detailed little shelter, a bench, a signpost and tactile base fixtures.
def cabin(parent,loc):
    root=empty('Crafted timber shelter',loc,parent)
    cube('Stone foundation',(0,0,.08),(1.5,1.18,.16),'rock',.08,root)
    cube('Shelter interior',(0,0,.60),(1.25,.95,1.05),'timber',.018,root)
    # Individual front planks and shallow joints catch the key light.
    for i in range(11):
        x=-.6+i*.12
        if abs(x)<.23: continue
        cube('Vertical weathered wall plank',(x,-.5,.65),(.113,.085,1.02),'timber',.012,root)
    for side in [-1,1]:
        for j in range(9): cube('Side wall plank',(side*.655,-.44+j*.11,.65),(.075,.105,1.04),'timber',.01,root)
    cube('Recessed doorway',(0,-.51,.51),(.42,.08,.85),'bark',.02,root)
    for i in range(4): cube('Door board',(-.15+i*.1,-.559,.5),(.094,.025,.82),'timber',.004,root)
    sphere('Door latch',(.125,-.594,.48),(.023,.018,.023),'shoe',root)
    cube('Door lintel',(0,-.55,.97),(.53,.10,.09),'bark',.012,root)
    cube('Porch step',(0,-.77,.065),(.73,.36,.12),'timber',.035,root)
    # Roof is made from shingle-sized plates on two real slopes.
    mesh('Roof underside',[(-.79,-.66,1.13),(0,-.66,1.64),(.79,-.66,1.13),(-.79,.66,1.13),(0,.66,1.64),(.79,.66,1.13)],[(0,1,4,3),(1,2,5,4)],'shingle',root)
    angle=math.atan(.51/.79)
    for side in [-1,1]:
        for row in range(4):
            x=side*(.095+row*.20); z=1.64-abs(x)*.51/.79+.022
            for column in range(7):
                shingle=cube('Individual cedar roof shingle',(x,-.57+column*.188,z+random.uniform(0,.01)),(.265,.18,.027),'shingle',.008,root)
                shingle.rotation_euler[1]=side*angle
        for y in [-.68,.68]: line('Roof edge fascia',[(0,y,1.67),(side*.82,y,1.13)],.035,'bark',root,False)
    cylinder('Ridge timber',(0,0,1.67),.035,1.43,'bark',root).rotation_euler[0]=math.pi/2
    cube('Window recess',(.43,-.55,.73),(.25,.05,.29),'forest',.008,root)
    for x in [.31,.43,.55]: cube('Window mullion',(x,-.587,.73),(.018,.024,.29),'path',.002,root)
    for z in [.59,.73,.87]: cube('Window crosspiece',(.43,-.59,z),(.26,.025,.016),'path',.002,root)
    return root

cabin(A,(-.85,.83,.12))
bench=empty('Meeting-place bench',(.95,.95,.13),A)
for y in [-.14,0,.14]: cube('Bench seat slat',(0,y,.34),(.9,.125,.055),'timber',.012,bench)
for x in [-.32,.32]:
    for y in [-.13,.13]: cube('Bench leg',(x,y,.16),(.065,.07,.3),'bark',.012,bench)

def billboard(name,loc,parent):
    root=empty(name,loc,parent)
    normal=Vector((8.8,-12.6,10.5)).normalized()
    root.rotation_euler=normal.to_track_quat('Z','Y').to_euler()
    return root

def qr(parent,size=.4,center=(0,0,.035)):
    # One batched mesh. An illustrative motif, never a real team invitation.
    verts=[]; faces=[]; n=21; u=size/n
    for y in range(n):
        for x in range(n):
            finder=None
            for fx,fy in [(0,0),(14,0),(0,14)]:
                if fx<=x<fx+7 and fy<=y<fy+7:
                    a,b=x-fx,y-fy; finder=a in [0,6] or b in [0,6] or (2<=a<=4 and 2<=b<=4)
            if finder if finder is not None else random.random()<.42:
                a=len(verts); px=center[0]+(x-10)*u; py=center[1]+(y-10)*u; z=center[2]
                verts.extend([(px-u*.45,py-u*.45,z),(px+u*.45,py-u*.45,z),(px+u*.45,py+u*.45,z),(px-u*.45,py+u*.45,z)])
                faces.append((a,a+1,a+2,a+3))
    return mesh('Illustrative invitation code',verts,faces,'forest',parent)

invite=billboard('Invitation | QR motif',(-4.5,.0,1.35),world)
cube('Invitation face',(0,0,0),(.67,.79,.07),'ivory',.045,invite)
qr(invite,.51,center=(0,.02,.044)); pop(invite,62,24); hide(invite,139,14)

def base(parent,loc,active=False):
    root=empty('Base | tactile marker',loc,parent)
    cylinder('Marker footing',(0,0,.035),.29,.07,'rock',root)
    cylinder('Marker top',(0,0,.092),.23,.055,'greenDark' if active else 'earth',root)
    ring('Marker rim',(0,0,.122),.24,.014,'greenPale' if active else 'path',root)
    return root

base(B,(0,0,.12),True); base(C,(.2,.35,.12)); base(D,(-.5,.2,.12)); base(E,(0,0,.12))
post=empty('First checkpoint | weathered NFC post',(0,0,.12),B)
cube('Weathered post',(0,0,.43),(.17,.18,.86),'timber',.024,post)
tag=billboard('NFC plaque',(0,-.09,.79),post)
cube('Dark tag plate',(0,0,0),(.27,.30,.035),'forest',.035,tag)
for i in range(3):
    pts=[(-.10+(.07+i*.037)*math.cos(a),(.07+i*.037)*math.sin(a),.029) for a in [j/14*1.7-.85 for j in range(15)]]
    line('NFC engraved arc',pts,.007,'ivory',tag,False)

# Pathfinders with deliberately crafted uniforms and a simple articulated rig.
people=[]
def pathfinder(name,loc,skin,longhair=False,size=1):
    root=empty(name,loc,world); body=empty(name+' | walking bounce',parent=root)
    cube('Navy trouser hips',(0,0,.78),(.39,.27,.20),'trousers',.055,body)
    torso=mesh('Tailored blue shirt',[(-.22,-.14,.84),(.22,-.14,.84),(.24,-.145,1.35),(-.24,-.145,1.35),(-.20,.14,.84),(.20,.14,.84),(.24,.14,1.35),(-.24,.14,1.35)],[(0,1,2,3),(4,7,6,5),(0,4,5,1),(3,2,6,7),(0,3,7,4),(1,5,6,2)],'shirt',body)
    mod=torso.modifiers.new('Soft cotton silhouette','BEVEL'); mod.width=.07; mod.segments=4
    torso.modifiers.new('Shirt weighted normals','WEIGHTED_NORMAL')
    for x in [-.12,.12]:
        cube('Blue chest pocket',(x,-.158,1.14),(.136,.021,.135),'blue',.013,body)
        mesh('Pocket flap',[(x-.071,-.174,1.223),(x+.071,-.174,1.223),(x+.060,-.174,1.184),(x,-.174,1.168),(x-.060,-.174,1.184)],[(0,1,2,3,4)],'blueLight',body)
        sphere('Pocket button',(x,-.182,1.196),(.009,.006,.009),'ivory',body)
    line('Shirt center seam',[(0,-.159,.90),(0,-.163,1.26)],.005,'blueLight',body,False)
    for z in [.91,1.0,1.09,1.27]: sphere('Shirt button',(0,-.173,z),(.008,.006,.008),'path',body)
    cylinder('Neck',(0,0,1.42),.073,.15,skin,body)
    # Collar points and a recognizably striped neckerchief with two tails.
    for side in [-1,1]:
        mesh('Folded blue collar',[(side*.04,-.105,1.41),(side*.15,-.13,1.34),(side*.07,-.174,1.29)],[(0,1,2)],'blueLight',body)
    for i in range(20):
        a=i*math.tau/20
        line('Neckerchief alternating stripe',[(.118*math.cos(a+j*.0314),.087*math.sin(a+j*.0314),1.37) for j in range(6)],.025,'scarfGold' if i%2 else 'scarfNavy',body,False)
    for side in [-1,1]:
        tail=empty('Fabric scarf tail',(side*.041,-.19,1.32),body); tail.rotation_euler[1]=side*.12
        mesh('Navy scarf cloth',[(-.026,0,0),(.026,0,0),(.034,-.009,-.30),(-.026,-.009,-.325)],[(0,1,2,3)],'scarfNavy',tail)
        for j in range(5):
            z=-.023-j*.060
            mesh('Yellow diagonal stripe',[(-.027,-.014,z),(.029,-.014,z-.026),(.031,-.014,z-.046),(-.027,-.014,z-.02)],[(0,1,2,3)],'scarfGold',tail)
    sphere('Neckerchief woggle',(0,-.208,1.315),(.038,.031,.05),'timber',body)
    cube('Belt',(0,0,.844),(.4,.29,.052),'shoe',.016,body)
    cube('Belt buckle',(0,-.161,.844),(.052,.018,.041),'path',.007,body)
    sphere('Stylized head',(0,-.005,1.62),(.154,.141,.20),skin,body)
    sphere('Sculpted hair',(0,.015,1.746),(.153,.137,.096),'hair',body)
    for side in [-1,1]:
        sphere('Ear',(side*.148,0,1.62),(.025,.026,.039),skin,body)
        sphere('Quiet eye',(side*.055,-.137,1.655),(.008,.007,.009),'hair',body)
    sphere('Small nose',(0,-.146,1.62),(.020,.019,.028),skin,body)
    if longhair:
        sphere('Back hair',(0,.10,1.59),(.15,.105,.17),'hair',body)
        sphere('Low ponytail',(.025,.2,1.52),(.085,.085,.14),'hair',body)
    legs=[]; arms=[]
    for side in [-1,1]:
        leg=empty('Trouser hip '+str(side),(side*.105,0,.78),body)
        bpy.ops.mesh.primitive_cone_add(vertices=24,radius1=.079,radius2=.102,depth=.63,location=(0,0,-.31))
        o=finish(bpy.context.object,'Dark navy trouser leg','trousers',leg)
        bevel=o.modifiers.new('Rounded trouser cuffs','BEVEL'); bevel.width=.026; bevel.segments=3
        for p in o.data.polygons:p.use_smooth=True
        line('Trouser outer seam',[(side*.096,0,-.09),(side*.087,0,-.50)],.003,'navy',leg,False)
        cube('Cargo pocket',(side*.097,.005,-.22),(.018,.13,.18),'navy',.014,leg)
        boot=empty('Boot',(0,-.044,-.674),leg)
        cube('Boot sole',(0,-.024,-.006),(.186,.30,.04),'shoe',.027,boot)
        sphere('Rounded boot upper',(0,-.025,.045),(.091,.146,.07),'bark',boot)
        for y in [-.05,0,.04]: line('Boot lace',[(-.035,y,.103),(.035,y,.103)],.003,'path',boot,False)
        legs.append(leg)
        arm=empty('Shoulder '+str(side),(side*.268,0,1.29),body)
        cylinder('Blue sleeve',(0,0,-.15),.079,.29,'shirt',arm,24)
        cylinder('Rolled blue cuff',(0,0,-.286),.084,.058,'blueLight',arm,24)
        lower=empty('Elbow',(0,0,-.31),arm); lower.rotation_euler[0]=-.20
        cylinder('Forearm',(0,0,-.085),.050,.18,skin,lower,20)
        sphere('Hand',(0,-.012,-.2),(.054,.049,.073),skin,lower)
        arms.append(arm)
        if side==1:
            cube('Phone',(0,-.04,-.217),(.122,.033,.21),'shoe',.017,lower)
            cube('Phone glass',(0,-.06,-.217),(.102,.008,.174),'pinBlue',.01,lower)
            sphere('Thumb',(-.045,-.037,-.20),(.018,.022,.035),skin,lower)
    root.scale=(size,)*3
    people.append((root,body,legs,arms))
    return people[-1]

hero=pathfinder('PATHFINDER | lead',(-4.7,-.95,.13),'skin1',False,.86)
mate=pathfinder('PATHFINDER | teammate A',(-5.43,-.76,.13),'skin2',True,.83)
mate2=pathfinder('PATHFINDER | teammate B',(-5.12,-1.52,.13),'skin3',False,.80)
for i,p in enumerate(people):
    pop(p[0],45+i*10,26,[.86,.83,.80][i])
    key(p[3][1],'rotation_euler',76,(0,0,0)); key(p[3][1],'rotation_euler',105,(-.85,0,0)); key(p[3][1],'rotation_euler',139,(-.85,0,0))

def walk(person,start,end,coords,angle):
    root,body,legs,arms=person
    for f,xy in coords:key(root,'location',f,(*xy,.13))
    key(root,'rotation_euler',start-12,tuple(root.rotation_euler))
    key(root,'rotation_euler',start,(0,0,angle)); key(root,'rotation_euler',end-5,(0,0,angle)); key(root,'rotation_euler',end,(0,0,0))
    for f in range(start,end+1,5):
        phase=(f-start)/24*math.tau; amount=math.sin(phase)*.32 if start<f<end else 0
        for side,leg in enumerate(legs):key(leg,'rotation_euler',f,(amount*(-1 if side else 1),0,0))
        for side,arm in enumerate(arms):key(arm,'rotation_euler',f,(amount*(.6 if side else -.6),0,0))
        key(body,'location',f,(0,0,abs(math.sin(phase))*.023 if start<f<end else 0))

walk(hero,191,296,[(191,(-4.7,-.95)),(231,(-3,-.58)),(267,(-1.7,-.42)),(296,(-.58,-.62))],1.88)
walk(mate,201,306,[(201,(-5.43,-.76)),(246,(-3.4,-.44)),(281,(-2,-.52)),(306,(-1.2,-.72))],1.88)
walk(mate2,211,311,[(211,(-5.12,-1.52)),(251,(-3.4,-1)),(287,(-1.9,-1)),(311,(-.96,-1.24))],1.88)

# Draw the map route gently, then remove it once it has served its purpose.
route_root=empty('Guidance | active route',parent=world)
for i in range(24):
    t=i/23; x=-4.5+t*4.20; y=-.55+t*.35
    dash=cube('Active route dash',(x,y,.145),(.083,.03,.014),'signal',.01,route_root)
    pop(dash,164+i*3,13)
pop(route_root,151,1); hide(route_root,309,14)

mapcard=billboard('Map | pictorial only',(-2.3,.35,2.15),world)
cube('Pictorial map card',(0,0,0),(1.02,.72,.05),'ivory',.055,mapcard)
line('Map route',[(-.35,-.16,.034),(-.08,.08,.034),(.33,.13,.034)],.019,'greenDark',mapcard)
for x,y in [(-.35,-.16),(.33,.13)]:cylinder('Map endpoint',(x,y,.04),.054,.018,'green',mapcard)
pop(mapcard,180,25); hide(mapcard,280,18)

# A sculpted map pin points to the same physical base the team is approaching.
pin=billboard('Base destination | raised pin',(0,0,1.72),B)
outline=[(0,-.46,.02),(-.30,-.02,.02),(-.26,.31,.02),(0,.44,.02),(.26,.31,.02),(.30,-.02,.02),(0,-.46,.02)]
line('Pin outline',outline,.035,'signal',pin)
ring('Pin center',(0,.10,.02),.13,.025,'greenPale',pin)
pop(pin,190,24); hide(pin,310,18)

# Check-in alternatives are pictograms, with explanation entirely in HTML/app UI.
choices=billboard('Check-in choices | NFC / QR / location icons',(0,.15,1.94),world)
for x in [-.65,0,.65]:cube('Icon tile',(x,0,0),(.54,.53,.05),'forest',.065,choices)
for i in range(3):
    line('NFC alternative',[(-.80+(.11+i*.055)*math.cos(a),(.11+i*.055)*math.sin(a),.035) for a in [j/16*1.9-.95 for j in range(17)]],.008,'ivory',choices,False)
qr(choices,.37,center=(0,0,.034))
cylinder('QR ivory backing',(0,0,.029),.245,.004,'ivory',choices,4).rotation_euler[2]=math.pi/4
ring('Location area icon',(.65,0,.035),.16,.014,'greenPale',choices)
cylinder('Location dot',(.65,0,.04),.05,.012,'green',choices)
pop(choices,327,24); hide(choices,392,16)
area=ring('Check-in location radius',(0,0,.145),.78,.016,'signal',B); pop(area,334,27); hide(area,397,14)
key(hero[3][1],'rotation_euler',316,(0,0,0)); key(hero[3][1],'rotation_euler',344,(-1.24,0,0)); key(hero[3][1],'rotation_euler',385,(-1.24,0,0)); key(hero[3][1],'rotation_euler',410,(-.4,0,0))

task=billboard('Challenge | unlettered camera card',(-.1,.15,1.92),world)
cube('Challenge paper',(0,0,0),(1.0,1.22,.052),'ivory',.065,task)
cube('Camera glyph body',(0,.18,.048),(.51,.33,.025),'greenDark',.042,task)
cylinder('Camera glyph lens',(0,.18,.070),.10,.022,'ivory',task)
cube('Camera glyph finder',(-.10,.35,.046),(.17,.10,.025),'greenDark',.014,task)
for y,w in [(-.12,.54),(-.27,.65),(-.42,.43)]:line('Abstract challenge line',[(-w/2,y,.045),(w/2,y,.045)],.013,'grass',task,False)
pop(task,413,30); move(task,[(413,(-.1,.15,1.05)),(446,(-.1,.15,1.92)),(483,(-.1,.15,1.98)),(510,(-.1,.15,1.92))]); hide(task,510,18)

# A flowering shrub gives the photo task a visible subject on this tile.
subject=empty('Photo subject | small meadow flowers',(-.9,1.0,.14),B)
for i in range(7):
    x=random.uniform(-.2,.2);y=random.uniform(-.15,.15);z=random.uniform(.18,.34)
    line('Flower stem',[(x,y,0),(x+.03,y,z)],.007,'tree',subject)
    for k in range(5):sphere('Tiny ivory petal',(x+.035*math.cos(k*math.tau/5),y+.035*math.sin(k*math.tau/5),z),(.033,.022,.014),'ivory',subject)
    sphere('Flower center',(x,y,z+.014),(.018,.018,.012),'scarfGold',subject)
for person in [hero,mate]:
    key(person[0],'rotation_euler',515,(0,0,0));key(person[0],'rotation_euler',542,(0,0,-2.75))
    key(person[3][1],'rotation_euler',515,(-.4,0,0));key(person[3][1],'rotation_euler',544,(-1.50,0,0));key(person[3][1],'rotation_euler',567,(-1.50,0,0));key(person[3][1],'rotation_euler',598,(-.5,0,0))
answer=billboard('Submission | photo travelling to the base',(-.6,-.1,1.75),world)
cube('Photo border',(0,0,0),(.72,.58,.035),'ivory',.028,answer)
cube('Photo image',(0,.04,.024),(.61,.40,.013),'greenDark',.008,answer)
for i in range(5):sphere('Photo flower petal',(.07*math.cos(i*math.tau/5),.04+.07*math.sin(i*math.tau/5),.04),(.06,.045,.013),'ivory',answer)
cylinder('Photo flower heart',(0,.04,.055),.035,.009,'scarfGold',answer)
pop(answer,556,18);move(answer,[(556,(-.6,-.1,1.7)),(578,(-.3,-.1,2.1)),(598,(0,0,.85))]);hide(answer,590,17)

# Reveal a connected landscape, with a second walk across a real tile boundary.
walk(hero,661,746,[(661,(-.58,-.62)),(691,(1.5,-.17)),(721,(3.2,-.28)),(746,(4.15,-.28))],1.64)
walk(mate,671,756,[(671,(-1.2,-.72)),(706,(1.3,-.66)),(736,(3.2,-.8)),(756,(3.8,-.9))],1.64)
walk(mate2,681,766,[(681,(-.96,-1.24)),(716,(1.5,-.99)),(746,(3.2,-1.25)),(766,(4.15,-1.28))],1.64)
for i in range(18):
    t=i/17
    dash=cube('Route into new tiles',(.3+t*4.55,.04+t*.22,.145),(.085,.028,.014),'signal',.01,world)
    pop(dash,643+i*3,16)
signal=ring('Next base | active arrival',(5,.35,.15),.47,.019,'signal',world);pop(signal,675,24)

# Camera transitions are restrained and eased, following new terrain as it opens.
move(rig,[(1,(-4.7,-.15,0)),(140,(-4.7,-.15,0)),(195,(-3.5,-.1,0)),(291,(-.3,-.1,0)),(608,(-.3,-.1,0)),(663,(1.5,.2,0)),(748,(.1,1.7,0)),(784,(.1,1.7,0)),(835,(.1,1.7,0))])
for frame,value in [(1,7.5),(140,7.5),(203,9.5),(295,7.6),(608,7.6),(692,12.6),(758,19.2),(790,19.2),(851,9.0),(864,9.0)]:
    camera.data.ortho_scale=value;camera.data.keyframe_insert(data_path='ortho_scale',frame=frame)

# Finale: all copy, including the product title and CTA, belongs to the overlay.
# Fade only the world materials; the independent compass keeps its own materials.
world_materials={}
for obj in world.children_recursive:
    if not hasattr(obj.data,'materials'): continue
    for slot in obj.material_slots:
        original=slot.material
        if original is None: continue
        if original.name not in world_materials:
            faded=original.copy(); faded.name='World fade / '+original.name
            faded.surface_render_method='DITHERED'
            alpha=faded.node_tree.nodes.get('Principled BSDF').inputs['Alpha']
            for f,value in [(1,1),(782,1),(798,.48),(814,0),(864,0)]:
                alpha.default_value=value;alpha.keyframe_insert(data_path='default_value',frame=f)
            world_materials[original.name]=faded
        slot.material=world_materials[original.name]


key(world,'scale',783,(1,1,1)); key(world,'scale',824,(.18,.18,.09));key(world,'scale',848,(.0001,.0001,.0001))
key(world,'rotation_euler',783,(0,0,0));key(world,'rotation_euler',848,(0,0,.5))
compass=billboard('COMPASS | quiet dimensional landing hero',(.1,1.7,1.0),None)
cylinder('Compass case',(0,0,0),1.70,.12,'forest',compass,96)
ring('Compass fine rim',(0,0,.075),1.66,.012,'greenPale',compass)
for i in range(48):
    a=i*math.tau/48;r=1.38 if i%12==0 else 1.48 if i%4==0 else 1.53
    line('Compass dial tick',[(1.57*math.sin(a),1.57*math.cos(a),.08),(r*math.sin(a),r*math.cos(a),.08)],.011 if i%12==0 else .006,'greenPale' if i%12==0 else 'greenDark',compass,False)
needle=empty('Faceted compass needle',parent=compass)
for name,vertices,mat in [
 ('North light',[(0,1.30,.09),(-.19,0,.09),(0,0,.24)],'green'),
 ('North shade',[(0,1.30,.09),(0,0,.24),(.19,0,.09)],'greenDark'),
 ('South light',[(0,-1.15,.09),(.19,0,.09),(0,0,.24)],'greenDark'),
 ('South shade',[(0,-1.15,.09),(0,0,.24),(-.19,0,.09)],'earth')]:mesh(name,vertices,[(0,1,2)],mat,needle)
cylinder('Small pivot',(0,0,.225),.064,.06,'scarfGold',compass)
pop(compass,800,49)
for f,z in [(800,-1.8),(841,-.22),(855,-.35),(864,-.31)]:key(needle,'rotation_euler',f,(0,0,z))

CHAPTERS=[
 {'id':'join','start':1,'hold':125,'end':144},
 {'id':'map','start':145,'hold':301,'end':312},
 {'id':'checkin','start':313,'hold':371,'end':408},
 {'id':'challenge','start':409,'hold':465,'end':504},
 {'id':'submit','start':505,'hold':580,'end':600},
 {'id':'explore','start':601,'hold':765,'end':783},
 {'id':'compass','start':784,'hold':862,'end':864}
]
for c in CHAPTERS:scene.timeline_markers.new(c['id'],frame=c['start'])
for action in bpy.data.actions:
    for layer in action.layers:
        for strip in layer.strips:
            for bag in getattr(strip,'channelbags',[]):
                for fc in bag.fcurves:
                    for point in fc.keyframe_points:
                        point.interpolation='BEZIER';point.handle_left_type='AUTO_CLAMPED';point.handle_right_type='AUTO_CLAMPED'
scene.frame_set(465)
bpy.ops.object.select_all(action='DESELECT')
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=='VIEW_3D':
            area.spaces.active.region_3d.view_perspective='CAMERA'
            area.spaces.active.region_3d.view_camera_zoom=12
            area.spaces.active.overlay.show_overlays=False
            area.spaces.active.shading.type='MATERIAL'
scene.render.filepath=str(OUT/'participant-world.mp4')
scene.render.image_settings.media_type='VIDEO';scene.render.image_settings.file_format='FFMPEG'
scene.render.ffmpeg.format='MPEG4';scene.render.ffmpeg.codec='H264';scene.render.ffmpeg.constant_rate_factor='HIGH';scene.render.ffmpeg.ffmpeg_preset='GOOD';scene.render.ffmpeg.gopsize=12;scene.render.ffmpeg.audio_codec='NONE'
scene['copy_owner']='All text, languages, controls and chapter progression belong to the app overlay. This scene has no font objects.'
scene['chapters_json']=json.dumps(CHAPTERS)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'pointfinder-expanding-world.blend'))
(OUT/'chapters.json').write_text(json.dumps(CHAPTERS,indent=2))
assert not any(o.type=='FONT' for o in scene.objects)
print('V2_READY',len(scene.objects),'objects; NO baked text',flush=True)
if '--preview' in sys.argv:
    scene.render.image_settings.media_type='IMAGE';scene.render.image_settings.file_format='PNG'
    for frame,name in [(125,'01-meeting-place'),(301,'02-find-base'),(371,'03-check-in'),(465,'04-challenge'),(580,'05-submit'),(765,'06-expanding-world'),(862,'07-compass')]:
        scene.frame_set(frame);scene.render.filepath=str(OUT/(name+'.png'));bpy.ops.render.render(write_still=True)
elif '--render' in sys.argv:bpy.ops.render.render(animation=True)
