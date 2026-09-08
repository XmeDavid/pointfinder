"""Assemble authored shapes into one rig with interchangeable wardrobe items.
Run Blender --background --python assemble.py. Shapes are authored in source/build_shapes.py.
"""
import bpy, json
from pathlib import Path
from mathutils import Vector

OUT = Path(__file__).resolve().parent
bpy.ops.wm.open_mainfile(filepath=str(OUT/'source/pointfinder-character-library.blend'))
scene = bpy.context.scene
rig = bpy.data.objects['pathfinder-short • Rig']
rig.location = (0, 0, 0); rig.rotation_euler = (0, 0, 0)
library = bpy.data.collections.new('PointFinder / Modular character')
scene.collection.children.link(library)
items = {}

def register(objects, slot, identity, duplicate=False):
    collection = bpy.data.collections.new(f'{slot} / {identity}')
    library.children.link(collection)
    collection.asset_mark()
    collection.asset_data.description = f'PointFinder {slot}: {identity}; shared 17-bone binding'
    meshes = []
    for source in objects:
        o = source.copy() if duplicate else source
        if duplicate: o.data = source.data.copy()
        else:
            for c in list(o.users_collection): c.objects.unlink(o)
        collection.objects.link(o)
        o.parent = rig
        o.matrix_parent_inverse.identity()
        for modifier in o.modifiers:
            if modifier.type == 'ARMATURE': modifier.object = rig
        o['item_slot'] = slot; o['item_id'] = identity
        meshes.append(o)
    items[(slot, identity)] = meshes
    return meshes

def grouped(character, group):
    return [o for o in bpy.data.collections[character].objects if o.type == 'MESH' and o.get('part_group') == group]

# Import wardrobe shapes first, before relocating the source base objects.
register(grouped('pathfinder-ponytail', 'hair'), 'hair', 'ponytail', True)
register(grouped('pathfinder-guide', 'hair'), 'hair', 'short-hat', True)
register(grouped('pathfinder-guide', 'hat'), 'hat', 'ranger', True)
register(grouped('pathfinder-guide', 'backpack'), 'backpack', 'canvas', True)
register(grouped('pathfinder-guide', 'scarf'), 'scarf', 'tricolor', True)
fitted = register(grouped('pathfinder-ponytail', 'hair'), 'hair', 'ponytail-hat', True)
for o in fitted:
    if 'ponytail' in o.name: continue
    for v in o.data.vertices:
        v.co.x *= .97; v.co.y *= .98
        if v.co.z > 2.32: v.co.z = 2.32 + (v.co.z - 2.32) * .35
register(grouped('pathfinder-short', 'hair'), 'hair', 'short')
register(grouped('pathfinder-short', 'scarf'), 'scarf', 'gold')
register([o for o in list(bpy.data.collections['pathfinder-short'].objects) if o.type == 'MESH'], 'base', 'uniform')
for c in list(rig.users_collection): c.objects.unlink(rig)
library.objects.link(rig)
rig.name = 'PointFinder / Shared rig'
keep = {rig} | {o for meshes in items.values() for o in meshes}
for o in list(bpy.data.objects):
    if o not in keep and o.type not in {'CAMERA', 'LIGHT'} and o.get('part_group') != 'studio': bpy.data.objects.remove(o, do_unlink=True)
for name in ['pathfinder-short','pathfinder-ponytail','pathfinder-guide']:
    c = bpy.data.collections.get(name)
    if c: bpy.data.collections.remove(c)
for track in rig.animation_data.nla_tracks:
    track.mute = True
    for strip in track.strips: strip.action.name = track.name

def configure(hair='short', hat=False, backpack=False, scarf='gold'):
    selected = {('base','uniform'), ('hair',hair + ('-hat' if hat and hair != 'none' else '')), ('scarf',scarf)}
    if hat: selected.add(('hat','ranger'))
    if backpack: selected.add(('backpack','canvas'))
    for item, meshes in items.items():
        for o in meshes:
            o.hide_render = item not in selected
            o.hide_set(item not in selected)

configure()
cam = scene.camera
cam.location = (3,-8,2.8)
cam.rotation_euler = (Vector((0,0,1.33))-cam.location).to_track_quat('-Z','Y').to_euler()
cam.data.ortho_scale = 3.1
scene.render.resolution_x = 1000; scene.render.resolution_y = 1100
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'modular-character.blend'))
scene.render.filepath = str(OUT/'review-three-quarter.png')
bpy.ops.render.render(write_still=True)

# Join only within an item for economical, individually selectable glTF meshes.
modules = []
for (slot, identity), objects in items.items():
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects: o.hide_set(False); o.hide_render=False; o.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    o = bpy.context.object; o.name = f'{slot}/{identity}'
    o['item_slot']=slot; o['item_id']=identity
    for uv in list(o.data.uv_layers):
        if slot != 'scarf' or uv.name != 'Scarf UV': o.data.uv_layers.remove(uv)
    if slot == 'scarf' and 'Scarf UV' in o.data.uv_layers:
        o.data.uv_layers.active = o.data.uv_layers['Scarf UV']
        o.data.uv_layers['Scarf UV'].active_render = True
    modules.append(o)

def export(path, meshes, animations):
    bpy.ops.object.select_all(action='DESELECT')
    rig.select_set(True)
    for o in meshes: o.select_set(True)
    bpy.context.view_layer.objects.active=rig
    bpy.ops.export_scene.gltf(filepath=str(path), export_format='GLB', use_selection=True,
        export_extras=True, export_animations=animations, export_animation_mode='NLA_TRACKS',
        export_skins=True, export_yup=True, export_apply=False)

export(OUT/'modular-character.glb', modules, True)
(OUT/'items').mkdir(exist_ok=True)
for o in modules: export(OUT/'items'/f"{o['item_slot']}-{o['item_id']}.glb", [o], o['item_slot']=='base')
manifest={'version':2,'rig':{'bones':[b.name for b in rig.data.bones], 'forward':'glTF +Z', 'up':'glTF +Y'},
    'library':'modular-character.glb','default':{'hair':'short','hat':'none','backpack':'none','scarf':'gold'},
    'items':[{'slot':o['item_slot'],'id':o['item_id'],'file':f"items/{o['item_slot']}-{o['item_id']}.glb",'vertices':len(o.data.vertices)} for o in modules],
    'poses':[t.name for t in rig.animation_data.nla_tracks]}
(OUT/'asset-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print('MODULAR_LIBRARY_READY', flush=True)
