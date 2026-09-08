"""Role-choice and organizer story built from the reusable PointFinder world.
The participant v4 asset is preserved. All interface text remains app-owned.
"""
import bpy, math, random, json, ast
from pathlib import Path
from mathutils import Vector, Matrix
HERE=Path(__file__).resolve().parent
SOURCE=HERE.parent/'pathfinder-intro-v4/pointfinder-expanding-world.blend'
random.seed(41)

def initialize():
    global scene,world,M
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
    scene=bpy.context.scene;scene.frame_set(765)
    world=bpy.data.objects['WORLD | shared continuous diorama']
    colors={'forest':'11251D','earth':'596751','path':'D7D0AD','green':'43CE80','greenDark':'22724F','greenPale':'A3D8AE','ivory':'F1ECD9','bark':'655844','blue':'5689B7','scarfGold':'F0CB5C','signal':'43CE80'}
    M={}
    for name,color in colors.items():
        m=bpy.data.materials.new('Branch / '+name);m.use_nodes=True
        def lin(v):
            v=int(v,16)/255
            return v/12.92 if v<.04045 else ((v+.055)/1.055)**2.4
        m.diffuse_color=(*[lin(color[i:i+2]) for i in (0,2,4)],1)
        bs=m.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=m.diffuse_color;bs.inputs['Roughness'].default_value=.8
        if name=='signal':bs.inputs['Emission Color'].default_value=m.diffuse_color;bs.inputs['Emission Strength'].default_value=.35
        M[name]=m
    # Reuse exactly the established modeling helpers, without executing v3 build.
    tree=ast.parse((HERE.parent/'pathfinder-intro-v3/build_scene.py').read_text())
    names={'empty','finish','cube','sphere','cylinder','mesh','line','ring','billboard','qr','key','pop','hide','move'}
    exec(compile(ast.Module(body=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in names],type_ignores=[]),'world_helpers','exec'),globals())
    for o in list(world.children_recursive)+[world]:
        o.animation_data_clear()
        if o.type=='ARMATURE':
            for b in o.pose.bones:b.rotation_mode='QUATERNION';b.rotation_quaternion=(1,0,0,0);b.location=(0,0,0);b.scale=(1,1,1)
    for m in bpy.data.materials:
        if m.use_nodes:
            m.node_tree.animation_data_clear()
            bs=m.node_tree.nodes.get('Principled BSDF')
            if bs:bs.inputs['Alpha'].default_value=1
    world.location=(0,0,0);world.rotation_euler=(0,0,0);world.scale=(1,1,1)
    scene.render.image_settings.media_type='IMAGE';scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA'
    scene.render.film_transparent=True;scene.render.resolution_percentage=80;scene.eevee.taa_render_samples=32
    bpy.data.objects['Studio backdrop'].hide_render=True
    for c in [scene.camera,scene.camera.parent,bpy.data.objects['Camera target']]:c.animation_data_clear()
    scene.camera.data.animation_data_clear()
    scene.camera.parent.location=(0,0,0);bpy.data.objects['Camera target'].location=(0,0,.7)
    scene.camera.location=(8.8,-12.6,11)
    scene.camera.data.ortho_scale=8

def remove(o):
    for child in list(o.children_recursive):bpy.data.objects.remove(child,do_unlink=True)
    bpy.data.objects.remove(o,do_unlink=True)

def keep_roots(names):
    for o in list(world.children):
        if o.name not in names:remove(o)

def character(root_name,loc,scale=.70):
    root=bpy.data.objects[root_name];root.location=loc;root.rotation_euler=(0,0,0);root.scale=(1,1,1)
    body=root.children[0];body.location=(0,0,0);body.rotation_euler=(0,0,0);body.scale=(1,1,1)
    rig=next(o for o in root.children_recursive if o.type=='ARMATURE')
    rig.location=(0,0,0);rig.scale=(scale,)*3
    for child in list(rig.children):
        if child.type=='EMPTY':remove(child)  # Hand props are not needed here.
    return root,rig

def aim(rig,name,direction):
    p=rig.pose.bones[name];q=(p.tail-p.head).normalized().rotation_difference(Vector(direction).normalized())
    mat=(q@p.matrix.to_quaternion()).to_matrix().to_4x4();mat.translation=p.head;p.matrix=mat
    bpy.context.view_layer.update()

def pose(rig,kind):
    for b in rig.pose.bones:b.rotation_quaternion=(1,0,0,0);b.location=(0,0,0);b.scale=(1,1,1)
    bpy.context.view_layer.update()
    if kind=='point':
        aim(rig,'upper_arm.L',(1,-.25,-.3));aim(rig,'forearm.L',(.5,-.8,.1))
    if kind=='wave':
        aim(rig,'upper_arm.L',(1,0,.15));aim(rig,'forearm.L',(.1,-.1,1))
    if kind=='celebrate':
        for side,s in [(1,'L'),(-1,'R')]:aim(rig,'upper_arm.'+s,(side,0,.7));aim(rig,'forearm.'+s,(side*.1,0,1))

def pose_key(rig,f,kind):
    scene.frame_set(f);pose(rig,kind)
    for b in rig.pose.bones:b.keyframe_insert(data_path='rotation_quaternion',frame=f)

def camkeys(keys):
    rig=scene.camera.parent;target=bpy.data.objects['Camera target']
    for f,loc,width in keys:
        key(rig,'location',f,loc);scene.camera.data.ortho_scale=width;scene.camera.data.keyframe_insert(data_path='ortho_scale',frame=f)

def finalize(name,frames,compass=True):
    if compass:
        key(world,'scale',783,(1,1,1));key(world,'scale',824,(.18,.18,.09));key(world,'scale',848,(.0001,)*3)
        key(world,'rotation_euler',783,(0,0,0));key(world,'rotation_euler',848,(0,0,.5))
        mats={s.material for o in world.children_recursive if o.type in {'MESH','CURVE'} for s in o.material_slots}
        for m in mats:
            a=m.node_tree.nodes.get('Principled BSDF').inputs['Alpha']
            for f,v in [(1,1),(782,1),(798,.48),(814,0),(864,0)]:a.default_value=v;a.keyframe_insert(data_path='default_value',frame=f)
    else:
        # Choice has no compass in its preview; runtime owns the later handoff.
        bpy.data.objects['COMPASS | quiet dimensional landing hero'].hide_render=True
    for action in bpy.data.actions:
        for layer in action.layers:
            for strip in layer.strips:
                for bag in getattr(strip,'channelbags',[]):
                    for fc in bag.fcurves:
                        for k in fc.keyframe_points:k.interpolation='BEZIER';k.handle_left_type=k.handle_right_type='AUTO_CLAMPED'
    scene.frame_start=1;scene.frame_end=864;scene.frame_set(125)
    scene['onboarding_branch']=name
    bpy.ops.wm.save_as_mainfile(filepath=str(HERE/(name+'.blend')))
    for i,f in enumerate(frames,1):
        scene.frame_set(f);scene.render.filepath=str(HERE/(('role-choice' if name=='role-choice' else f'organizer-step-{i}')+'.png'))
        bpy.ops.render.render(write_still=True)

# Two welcoming figures, with no world to distract from the user's choice.
initialize()
keep_roots(['PATHFINDER | lead','PATHFINDER | teammate B'])
for name,x in [('PATHFINDER | lead',-1),('PATHFINDER | teammate B',1)]:
    root,rig=character(name,(x,0,.04),.94)
    root.rotation_euler.z=.09 if x<0 else -.09
    pop(root,1 if x<0 else 10,45)
    pose_key(rig,1,'rest');pose_key(rig,50,'rest');pose_key(rig,88,'wave' if x>0 else 'point');pose_key(rig,125,'wave' if x>0 else 'point')
    cylinder('Role / quiet pedestal',(x,0,0),.60,.065,'forest',world,64)
    ring('Role / pedestal rim',(x,0,.038),.58,.008,'greenDark',world)
scene.camera.location=(0,-10,4.4);bpy.data.objects['Camera target'].location=(0,0,1.25);scene.camera.data.ortho_scale=5.25
finalize('role-choice',[125],False)

# Organizer story: planning the same tangible world the participants will use.
initialize()
keep_roots(['TILE A | expanding terrain','TILE B | expanding terrain','TILE C | expanding terrain','PATHFINDER | lead','PATHFINDER | teammate A','PATHFINDER | teammate B'])
A=bpy.data.objects['TILE A | expanding terrain'];B=bpy.data.objects['TILE B | expanding terrain'];C=bpy.data.objects['TILE C | expanding terrain']
A.location=(-2.4,0,0);B.location=(2.4,0,0);C.location=(2.4,4.8,0)
for tile in [A,B,C]:
    tile.scale=(1,1,1)
    for o in list(tile.children):
        if any(word in o.name for word in ['Base |','First checkpoint','Base destination','Photo subject']):remove(o)
pop(A,1,42);pop(B,168,40);pop(C,230,42)
guide,guide_rig=character('PATHFINDER | teammate B',(-2.9,-.9,.14),.70)
participant,p_rig=character('PATHFINDER | lead',(-3.5,-1.5,.14),.61)
mate,m_rig=character('PATHFINDER | teammate A',(-2.7,-1.65,.14),.60)
pop(guide,18,38);pop(participant,416,32);pop(mate,436,32)
for f,k in [(1,'rest'),(73,'point'),(140,'point'),(172,'rest'),(225,'point'),(310,'point'),(382,'rest'),(428,'wave'),(478,'rest'),(520,'point'),(605,'rest'),(705,'celebrate'),(765,'celebrate')]:pose_key(guide_rig,f,k)
for rig in [p_rig,m_rig]:
    for f,k in [(1,'rest'),(410,'rest'),(449,'wave'),(489,'rest'),(695,'rest'),(730,'celebrate'),(765,'celebrate')]:pose_key(rig,f,k)

# 1. A physical planning board with a route and a stage/calendar pictogram.
plan=billboard('Organizer / plan board',(-1.45,-.55,1.36),world)
cube('Plan / paper',(0,0,0),(1.22,.92,.06),'ivory',.05,plan)
line('Plan / winding route',[(-.43,-.2,.04),(-.17,.10,.04),(.20,-.1,.04),(.42,.22,.04)],.018,'greenDark',plan)
for x,y in [(-.43,-.2),(.20,-.1),(.42,.22)]:cylinder('Plan / location',(x,y,.058),.052,.025,'green',plan)
pop(plan,35,40);hide(plan,145,25)
flag=empty('Organizer / game flag',(-3.85,-.15,.14),world)
cylinder('Flag / mast',(0,0,.65),.025,1.3,'bark',flag)
mesh('Flag / pennant',[(0,0,1.29),(.40,0,1.22),(0,0,1.04)],[(0,1,2)],'green',flag)
pop(flag,56,30)

# 2. Each new base emerges where it will live on the map.
base_locations=[(-.9,-.55),(2.25,-.25),(2.5,4.3)]
bases=[]
for i,(x,y) in enumerate(base_locations):
    base=empty('Organizer / base '+str(i),(x,y,.15),world);bases.append(base)
    cylinder('Base / footing',(0,0,.04),.29,.08,'earth',base)
    cylinder('Base / green face',(0,0,.10),.235,.05,'greenDark',base)
    ring('Base / illuminated rim',(0,0,.135),.245,.013,'greenPale',base)
    cube('Base / tag post',(0,0,.50),(.12,.14,.76),'bark',.018,base)
    plaque=billboard('Base / check-in plaque',(0,-.06,.80),base)
    cube('Base / plaque face',(0,0,0),(.24,.28,.03),'forest',.025,plaque)
    for r in [.04,.075,.11]:line('Base / NFC arcs',[(r*math.cos(j/12*1.8-.9)-.08,r*math.sin(j/12*1.8-.9),.02) for j in range(13)],.006,'ivory',plaque,False)
    pop(base,177+i*35,35)
    pin=billboard('Organizer / map pin '+str(i),(x,y,1.55),world)
    line('Pin / outline',[(0,-.3,.02),(-.17,0,.02),(-.14,.2,.02),(0,.28,.02),(.14,.2,.02),(.17,0,.02),(0,-.3,.02)],.021,'signal',pin)
    pop(pin,188+i*35,24);hide(pin,306,20)

# 3. Challenge cards move from the guide to their linked bases.
for i,base in enumerate(bases):
    x,y=base_locations[i]
    card=billboard('Organizer / linked challenge '+str(i),(-1.6,-.4,1.75),world)
    cube('Challenge / paper',(0,0,0),(.64,.77,.045),'ivory',.038,card)
    cube('Challenge / camera',(0,.13,.037),(.33,.22,.02),'greenDark',.035,card)
    cylinder('Challenge / lens',(0,.13,.055),.067,.02,'ivory',card)
    for yy,ww in [(-.10,.39),(-.23,.28)]:line('Challenge / abstract line',[(-ww/2,yy,.04),(ww/2,yy,.04)],.01,'earth',card,False)
    pop(card,314+i*8,20);move(card,[(314+i*8,(-1.6,-.4,1.7)),(352+i*7,(x+.38,y+.20,1.5))]);hide(card,393,18)
    link=empty('Organizer / link '+str(i),parent=world)
    for j in range(8):
        t=j/7;xx=-1.5+(x+1.5)*t;yy=-.3+(y+.3)*t
        sphere('Challenge / linking bead',(xx,yy,.28),(.036,)*3,'signal',link)
    pop(link,329+i*8,18);hide(link,398,14)

# 4. A team invitation appears while two players join the guide.
invite=billboard('Organizer / team invitation',(-1.25,-.8,1.8),world)
cube('Invite / ivory face',(0,0,0),(.95,1.07,.06),'ivory',.05,invite)
qr(invite,.72,center=(0,.04,.045));pop(invite,410,30);hide(invite,497,18)
for root in [participant,mate]:
    marker=sphere('Team / membership marker',(0,0,1.9),(.085,)*3,'green',root)
    hide(marker,491,16)

# 5. A live control board and moving team markers show progress through bases.
monitor=billboard('Organizer / live board',(.2,.55,2.75),world)
cube('Monitor / panel',(0,0,0),(1.9,1.18,.075),'forest',.055,monitor)
for i in range(3):
    yy=.32-i*.30
    cylinder('Monitor / team dot',(-.71,yy,.05),.055,.025,'greenPale',monitor)
    cube('Monitor / track',(.12,yy,.046),(1.2,.055,.014),'earth',.015,monitor)
    bar=cube('Monitor / advancing progress',(-.40,yy,.062),(1.04,.055,.015),'green',.014,monitor)
    # Scale about the left end, with accompanying translation.
    key(bar,'scale',510,(.05,1,1));key(bar,'scale',571,(.60+i*.14,1,1))
pop(monitor,504,28);hide(monitor,608,18)
for i,(dx,dy) in enumerate([(-.08,0),(.1,.14)]):
    token=empty('Organizer / moving team '+str(i),(-.9,-.55,.2),world)
    cylinder('Team / progress token',(0,0,0),.10,.035,'blue' if i==0 else 'scarfGold',token)
    ring('Team / progress ring',(0,0,.025),.13,.011,'ivory',token)
    pop(token,511+i*7,15);move(token,[(512,(-.9+dx,-.55+dy,.2)),(542,(1.0+dx,-.35+dy,.2)),(569,(2.25+dx,-.25+dy,.2)),(601,(2.5+dx,2.5+dy,.2))]);hide(token,620,20)

# 6. Incoming work, approval and a small results podium.
review=billboard('Organizer / review card',(-1.10,-.6,1.65),world)
cube('Review / submission',(0,0,0),(.84,1.02,.05),'ivory',.045,review)
cube('Review / photo',(0,.20,.04),(.63,.44,.018),'greenDark',.014,review)
for i in range(5):sphere('Review / photo petals',(.085*math.cos(i*math.tau/5),.20+.085*math.sin(i*math.tau/5),.063),(.064,.044,.017),'ivory',review)
pop(review,622,25)
check=empty('Review / approved',parent=review)
line('Review / tick',[(-.18,-.22,.055),(-.06,-.34,.055),(.22,-.03,.055)],.035,'green',check,False)
pop(check,652,22);hide(review,706,22)
podium=empty('Organizer / results podium',(.20,-.7,.14),world)
for x,height in [(-.48,.38),(0,.63),(.48,.26)]:
    bar=cube('Results / rising score',(x,0,height/2),(.40,.42,height),'greenDark',.04,podium)
    pop(bar,690+int(abs(x)*20),32)
    cylinder('Results / medal',(x,0,height+.08),.085,.035,'scarfGold',podium)
cup=empty('Organizer / trophy',(0,0,.75),podium)
cylinder('Trophy / foot',(0,0,0),.13,.055,'scarfGold',cup)
cylinder('Trophy / stem',(0,0,.12),.045,.20,'scarfGold',cup)
sphere('Trophy / bowl',(0,0,.31),(.20,.16,.18),'scarfGold',cup)
for side in [-1,1]:line('Trophy / handle',[(side*.14,0,.39),(side*.29,0,.35),(side*.26,0,.21),(side*.12,0,.19)],.025,'scarfGold',cup)
pop(podium,682,35)
camkeys([(1,(-2.4,0,0),7),(125,(-2.4,0,0),7),(230,(0,.8,0),10.7),(301,(0,1.1,0),11.5),(371,(0,1.1,0),11.5),(430,(-1.5,0,0),8.8),(465,(-1.5,0,0),8.8),(560,(0,1.1,0),11.5),(580,(0,1.1,0),11.5),(680,(-1.3,0,0),8.3),(765,(-1.3,0,0),8.3),(783,(-1.3,0,0),8.3),(864,(.1,1.7,.5),9)])
finalize('organizer',[125,301,371,465,580,765])
print('BRANCH_SCENES_READY',flush=True)
