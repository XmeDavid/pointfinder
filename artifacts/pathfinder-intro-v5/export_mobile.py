"""Bake terrain, merge static geometry, and export two self-contained mobile GLBs.

Run after build_scene.py. Never modifies the authored .blend.
"""
import bpy, json, math, sys
from pathlib import Path
from mathutils import Matrix, Vector, noise

HERE=Path(__file__).resolve().parent
OUT=HERE.parents[1]/'web/public/onboarding'
OUT.mkdir(parents=True,exist_ok=True)
branch='role-choice' if '--choice' in sys.argv else 'organizer'
bpy.ops.wm.open_mainfile(filepath=str(HERE/(branch+'.blend')))
scene=bpy.context.scene
world=bpy.data.objects['WORLD | shared continuous diorama']; world.name='PF_World'
compass=bpy.data.objects['COMPASS | quiet dimensional landing hero']; compass.name='PF_Compass'
needle=bpy.data.objects['Faceted compass needle']; needle.name='PF_CompassNeedle'
camera=scene.camera
target=bpy.data.objects['Camera target']
def yup(v): return [round(v.x,6),round(v.z,6),round(-v.y,6)]
camera_frames=[]
for frame in range(1,865):
    scene.frame_set(frame)
    camera_frames.append({'position':yup(camera.matrix_world.translation),'target':yup(target.matrix_world.translation),'width':round(camera.data.ortho_scale,6)})
(OUT/(branch+'-timeline.json')).write_text(json.dumps({'fps':24,'frameStart':1,'frameEnd':864,'holds':[125,301,371,465,580,765,864],'worldFade':[782,814],'camera':camera_frames},separators=(',',':')))

# Bake the actual layered moss/path shader, so mobile keeps the authored terrain.
scene.frame_set(765)
scene.render.engine='CYCLES';scene.cycles.samples=1
scene.render.bake.use_pass_direct=False;scene.render.bake.use_pass_indirect=False;scene.render.bake.use_pass_color=True
terrain_materials={}
for obj in list(world.children_recursive):
    if obj.type!='MESH' or 'blended sandy path' not in obj.name: continue
    mesh=obj.data
    uv=mesh.uv_layers.new(name='TerrainUV')
    for loop in mesh.loops:
        co=mesh.vertices[loop.vertex_index].co
        uv.data[loop.index].uv=((co.x+2.34)/4.68,(co.y+2.34)/4.68)
    mesh.uv_layers.active=uv
    material=obj.active_material.copy();obj.active_material=material
    img=bpy.data.images.new('Baked '+obj.name,width=1024,height=1024,alpha=False)
    image_node=material.node_tree.nodes.new('ShaderNodeTexImage');image_node.image=img
    material.node_tree.nodes.active=image_node
    bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
    bpy.ops.object.bake(type='DIFFUSE',pass_filter={'COLOR'},margin=4)
    clean=bpy.data.materials.new('Terrain baked '+obj.name.split(' | ')[0]);clean.use_nodes=True
    bs=clean.node_tree.nodes.get('Principled BSDF');bs.inputs['Roughness'].default_value=1
    tex=clean.node_tree.nodes.new('ShaderNodeTexImage');tex.image=img
    clean.node_tree.links.new(tex.outputs['Color'],bs.inputs['Base Color'])
    terrain_materials[material.name]=clean
    print('BAKED',obj.name,flush=True)

scene.render.engine='BLENDER_EEVEE'
scene.frame_set(765)
depsgraph=bpy.context.evaluated_depsgraph_get()
clean_materials={}
ramps={}
def clean_material(original):
    if original.name in terrain_materials:return terrain_materials[original.name]
    if original.name in clean_materials:return clean_materials[original.name]
    if original.name.startswith('Character '):
        # Keep the library's packed scarf UV textures and named material colors.
        clean=original.copy();clean.name=original.name+' / mobile'
        clean.node_tree.animation_data_clear()
        clean.node_tree.nodes.get('Principled BSDF').inputs['Alpha'].default_value=1
        clean_materials[original.name]=clean
        return clean
    bs=original.node_tree.nodes.get('Principled BSDF')
    ramp=next((n for n in original.node_tree.nodes if n.type=='VALTORGB'),None)
    # Terrain is baked above; other procedural surfaces retain mottled vertex color.
    use_ramp=ramp is not None
    clean=bpy.data.materials.new(original.name.replace('World fade / ','')+' / mobile');clean.use_nodes=True
    target=clean.node_tree.nodes.get('Principled BSDF')
    target.inputs['Base Color'].default_value=(1,1,1,1) if use_ramp else tuple(bs.inputs['Base Color'].default_value)
    target.inputs['Roughness'].default_value=bs.inputs['Roughness'].default_value
    target.inputs['Metallic'].default_value=bs.inputs['Metallic'].default_value
    target.inputs['Emission Color'].default_value=bs.inputs['Emission Color'].default_value
    target.inputs['Emission Strength'].default_value=bs.inputs['Emission Strength'].default_value
    if use_ramp:
        attr=clean.node_tree.nodes.new('ShaderNodeVertexColor');attr.layer_name='Color'
        clean.node_tree.links.new(attr.outputs['Color'],target.inputs['Base Color'])
        ramps[original.name]=(tuple(ramp.color_ramp.elements[0].color),tuple(ramp.color_ramp.elements[-1].color))
    clean_materials[original.name]=clean
    return clean

def animated(obj):return obj.animation_data is not None and obj.animation_data.action is not None
def optimize(root):
    sources=[o for o in root.children_recursive if o.type in {'MESH','CURVE'} and not o.get('pf_character')]
    groups={}
    for obj in sources:
        anchor=obj if animated(obj) else obj.parent
        while anchor is not root and not animated(anchor):anchor=anchor.parent
        groups.setdefault(anchor,[]).append(obj)
    for anchor,objects in groups.items():
        vertices=[];faces=[];indices=[];uvs=[];colors=[];normals=[];materials=[]
        for obj in objects:
            evaluated=obj.evaluated_get(depsgraph)
            src=evaluated.to_mesh(preserve_all_data_layers=True,depsgraph=depsgraph)
            transform=Matrix.Identity(4);cursor=obj
            while cursor is not anchor:
                transform=cursor.matrix_basis @ transform;cursor=cursor.parent
            normal_matrix=transform.to_3x3().inverted_safe().transposed()
            base=len(vertices)
            vertices.extend([transform@v.co for v in src.vertices])
            for polygon in src.polygons:
                original=src.materials[polygon.material_index] if len(src.materials) else obj.active_material
                mat=clean_material(original)
                if mat not in materials:materials.append(mat)
                faces.append(tuple(base+v for v in polygon.vertices));indices.append(materials.index(mat))
                for loop_index in polygon.loop_indices:
                    loop=src.loops[loop_index];co=src.vertices[loop.vertex_index].co
                    normals.append((normal_matrix @ src.corner_normals[loop_index].vector).normalized())
                    uvs.append(tuple(src.uv_layers.active.data[loop_index].uv) if src.uv_layers.active else (co.x,co.z))
                    if original.name in ramps:
                        lo,hi=ramps[original.name]
                        f=max(0,min(1,.5+noise.noise(co*7)*.5))
                        colors.append(tuple(lo[k]*(1-f)+hi[k]*f for k in range(3))+(1,))
                    else:colors.append((1,1,1,1))
            evaluated.to_mesh_clear()
        data=bpy.data.meshes.new(anchor.name+' geometry');data.from_pydata(vertices,[],faces);data.update()
        for mat in materials:data.materials.append(mat)
        for polygon,index in zip(data.polygons,indices):polygon.material_index=index;polygon.use_smooth=True
        data.normals_split_custom_set(normals)
        layer=data.uv_layers.new(name='UVMap')
        for i,uv in enumerate(uvs):layer.data[i].uv=uv
        attr=data.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='CORNER')
        for value,color in zip(attr.data,colors):value.color=color
        # Static joined surfaces preserve authored object transforms under their animated parent.
        merged=bpy.data.objects.new(anchor.name+' / merged',data);scene.collection.objects.link(merged);merged.parent=anchor
        for obj in objects:
            if obj is anchor:
                # Animated source becomes a transform-only node; its merged mesh is a child.
                obj.data=bpy.data.meshes.new(obj.name+' empty transform') if obj.type=='MESH' else bpy.data.curves.new(obj.name+' empty transform','CURVE')
                for modifier in list(obj.modifiers):obj.modifiers.remove(modifier)
            else:bpy.data.objects.remove(obj,do_unlink=True)
    return len(groups)

# The environment is merged as before. Character skins must retain their
# vertex groups, bone links and UV sets instead of being frozen into geometry.
character_rigs=[o for o in world.children_recursive if o.type=='ARMATURE' and o.get('pf_character')]
character_vertices=0
for rig in character_rigs:
    objects=[o for o in rig.children if o.type=='MESH']
    for obj in objects:
        character_vertices+=len(obj.data.vertices)
        for slot in obj.material_slots:slot.material=clean_material(slot.material)
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:obj.select_set(True)
    bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join()
    joined=bpy.context.object;joined.name=rig.name+'_Skin';joined['pf_character']=True
    if 'Scarf UV' in joined.data.uv_layers:
        joined.data.uv_layers.active=joined.data.uv_layers['Scarf UV']
        joined.data.uv_layers['Scarf UV'].active_render=True
    for layer in list(joined.data.uv_layers):
        if layer.name!='Scarf UV':joined.data.uv_layers.remove(layer)
    print('PRESERVED_SKIN',rig.name,len(joined.data.vertices),flush=True)

world_groups=optimize(world)
# Compass stays a genuinely separate asset with an independently addressable needle.
compass.animation_data_clear();compass.location=(0,0,0);compass.rotation_euler=(0,0,0);compass.scale=(1,1,1)
needle.animation_data_clear();needle.rotation_euler=(0,0,0)
# Keep the needle transform as a separate animated anchor during geometry consolidation.
needle.keyframe_insert(data_path='rotation_euler',frame=1)
optimize(compass)
needle.animation_data_clear()

def export(root,name,animations):
    bpy.ops.object.select_all(action='DESELECT')
    root.select_set(True)
    for obj in root.children_recursive:obj.select_set(True)
    scene.frame_set(1 if animations else 862)
    bpy.ops.export_scene.gltf(filepath=str(OUT/name),export_format='GLB',use_selection=True,
      export_animations=animations,export_animation_mode='SCENE',export_anim_scene_split_object=False,
      export_frame_range=True,export_frame_step=2,export_force_sampling=True,export_optimize_animation_size=True,
      export_apply=False,export_cameras=False,export_lights=False,export_image_format='JPEG',export_jpeg_quality=88,
      export_vertex_color='ACTIVE',export_all_vertex_colors=False,export_extras=True)
    print('EXPORTED',name,(OUT/name).stat().st_size,flush=True)

asset_name='role-choice.glb' if branch=='role-choice' else 'organizer-world.glb'
export(world,asset_name,True)
stats={'branch':branch,'exportObjects':len(scene.objects),'worldMeshGroups':world_groups,'worldBytes':(OUT/asset_name).stat().st_size,'cameraCoordinateSystem':'glTF Y up','terrainTextures':len(terrain_materials),'characterLibrary':'pathfinder-characters-v1','characterRigs':len(character_rigs),'characterBones':[len(r.data.bones) for r in character_rigs],'characterVertices':character_vertices}
(OUT/(branch+'-report.json')).write_text(json.dumps(stats,indent=2))
print('MOBILE_ASSETS_READY',json.dumps(stats),flush=True)
