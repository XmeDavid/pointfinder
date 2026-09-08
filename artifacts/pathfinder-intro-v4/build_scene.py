"""Retarget the reusable character library into the existing onboarding story.
Preserves v3 camera, world, controls, chapter timing and compass handoff.
"""
import bpy, math, json
from pathlib import Path
from mathutils import Vector, Matrix

HERE=Path(__file__).resolve().parent
LIB=HERE.parent/'pathfinder-characters-v1/pointfinder-character-library.blend'
bpy.ops.wm.open_mainfile(filepath=str(HERE.parent/'pathfinder-intro-v3/pointfinder-expanding-world.blend'))
scene=bpy.context.scene
world=bpy.data.objects['WORLD | shared continuous diorama']
cast=[('PATHFINDER | lead','short','C99061'),('PATHFINDER | teammate A','ponytail','946244'),('PATHFINDER | teammate B','guide','E4B88E')]

def lin(h):
    x=int(h,16)/255
    return x/12.92 if x<.04045 else ((x+.055)/1.055)**2.4

def aim(rig,name,direction):
    p=rig.pose.bones[name]
    q=(p.tail-p.head).normalized().rotation_difference(Vector(direction).normalized())
    mat=(q@p.matrix.to_quaternion()).to_matrix().to_4x4();mat.translation=p.head
    p.matrix=mat;bpy.context.view_layer.update()

def phone(rig):
    # A reusable prop attached to the hand bone, so check-in and photo gestures
    # keep the device with the character through the whole animation.
    parent=bpy.data.objects.new('PF_PhoneSocket',None);scene.collection.objects.link(parent)
    parent.parent=rig;parent.parent_type='BONE';parent.parent_bone='hand.L'
    # Bone-parent space Y follows the finger direction; the phone rests across it.
    parent.location=(0,-.055,-.06)
    parent.rotation_euler=(math.radians(90),0,0)
    for name,dim,loc,color in [('Phone case',(.115,.027,.21),(0,0,0),'202E36'),('Phone display',(.095,.008,.172),(0,-.018,.006),'79AAB7')]:
        bpy.ops.mesh.primitive_cube_add(size=1)
        o=bpy.context.object;o.name='PF_'+name.replace(' ','_');o.parent=parent;o.location=loc;o.scale=dim
        bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
        mod=o.modifiers.new('Rounded phone','BEVEL');mod.width=.012 if name=='Phone case' else .005;mod.segments=3
        o.modifiers.new('Phone normals','WEIGHTED_NORMAL')
        m=bpy.data.materials.new(o.name);m.use_nodes=True;m.diffuse_color=(*[lin(color[i:i+2]) for i in (0,2,4)],1)
        bs=m.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=m.diffuse_color;bs.inputs['Roughness'].default_value=.5
        o.data.materials.append(m);o['pf_character']=True

report=[]
for old_name,variant,tone in cast:
    scene.frame_set(1)
    root=bpy.data.objects[old_name]
    body=next(o for o in root.children if 'walking bounce' in o.name)
    controls={}
    for suf,side in [('R',-1),('L',1)]:
        controls['leg.'+suf]=next(o for o in body.children if o.name.startswith('Trouser hip '+str(side)))
        controls['arm.'+suf]=next(o for o in body.children if o.name.startswith('Shoulder '+str(side)))
    motion=[]
    for f in range(1,865):
        scene.frame_set(f);motion.append({key:o.rotation_euler.x for key,o in controls.items()})
    old_descendants=list(body.children_recursive)
    with bpy.data.libraries.load(str(LIB),link=False) as (source,dest):dest.collections=['pathfinder-'+variant]
    collection=dest.collections[0];scene.collection.children.link(collection)
    rig=next(o for o in collection.objects if o.type=='ARMATURE')
    rig.name='PF_Character_'+variant;rig.animation_data_clear();rig.parent=body
    rig.location=(0,0,0);rig.rotation_euler=(0,0,0);rig.scale=(.70,)*3
    for b in rig.pose.bones:b.rotation_mode='QUATERNION';b.rotation_quaternion=(1,0,0,0);b.location=(0,0,0);b.scale=(1,1,1)
    # Source-level LOD keeps the new silhouettes and rig but trims fine topology.
    replacements={}
    for o in list(collection.objects):
        if o.type!='MESH':continue
        o['pf_character']=True
        bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
        mod=o.modifiers.new('Welcome screen LOD','DECIMATE')
        mod.ratio=.48 if o['part_group'] in ['hair','body'] else .7
        bpy.ops.object.modifier_apply(modifier=mod.name)
        for slot in o.material_slots:
            original=slot.material
            if original.name not in replacements:
                m=original.copy();m.name='Character '+variant+' / '+original.name
                if original.name.startswith(('Warm skin','Ear warmth')):
                    rgb=[lin(tone[i:i+2]) for i in (0,2,4)]
                    if original.name.startswith('Ear warmth'):rgb=[c*.8 for c in rgb]
                    m.diffuse_color=(*rgb,1);m.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(*rgb,1)
                alpha=m.node_tree.nodes.get('Principled BSDF').inputs['Alpha']
                for f,value in [(1,1),(782,1),(798,.48),(814,0),(864,0)]:
                    alpha.default_value=value;alpha.keyframe_insert(data_path='default_value',frame=f)
                replacements[original.name]=m
            slot.material=replacements[original.name]
    # Sample old movement controls onto the new shared skeleton, independently
    # from root movement and the existing walking bounce.
    names=['upper_arm.L','upper_arm.R','forearm.L','forearm.R','thigh.L','thigh.R','shin.L','shin.R','foot.L','foot.R']
    for f in list(range(1,865,3))+[864]:
        scene.frame_set(f)
        for b in rig.pose.bones:b.rotation_quaternion=(1,0,0,0);b.location=(0,0,0);b.scale=(1,1,1)
        bpy.context.view_layer.update()
        for suf in ['R','L']:
            arm=motion[f-1]['arm.'+suf];leg=motion[f-1]['leg.'+suf]
            for name,angle in [('thigh.'+suf,leg),('shin.'+suf,leg+max(0,leg)*.6),('foot.'+suf,leg*.25),('upper_arm.'+suf,arm*.72),('forearm.'+suf,arm*1.12-.10)]:
                rest=rig.data.bones[name].tail_local-rig.data.bones[name].head_local
                aim(rig,name,Matrix.Rotation(angle,3,'X')@rest)
        for name in names:rig.pose.bones[name].keyframe_insert(data_path='rotation_quaternion',frame=f)
    rig.animation_data.action.name='PF_story_'+variant
    for layer in rig.animation_data.action.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                for fc in bag.fcurves:
                    for k in fc.keyframe_points:k.interpolation='LINEAR'
    for o in old_descendants:bpy.data.objects.remove(o,do_unlink=True)
    scene.frame_set(1);phone(rig)
    rig['pf_character']=True;rig['source_library']=str(LIB.name)
    report.append({'role':old_name,'model':variant,'bones':len(rig.data.bones),'sourceScale':.70})
    print('RETARGETED',variant,flush=True)

scene.frame_set(125)
scene['character_library']='pathfinder-characters-v1 / shared 17-bone rigs'
scene['character_cast']=json.dumps(report)
bpy.ops.object.select_all(action='DESELECT')
bpy.ops.wm.save_as_mainfile(filepath=str(HERE/'pointfinder-expanding-world.blend'))
(HERE/'character-cast.json').write_text(json.dumps(report,indent=2)+'\n')
print('WELCOME_CAST_READY',flush=True)
