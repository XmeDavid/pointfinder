"""Reusable PointFinder figurines, modeled and rigged in Blender from reference.
Run: Blender --background --python build_characters.py
Front = -Y, up = +Z, metres. No image planes or AI-generated geometry.
"""
import bpy, math, random, json
from pathlib import Path
from mathutils import Vector, Matrix

OUT = Path(__file__).resolve().parent
random.seed(26)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
S = bpy.context.scene
S.render.engine = 'BLENDER_EEVEE'
S.eevee.taa_render_samples = 64
S.eevee.use_fast_gi = True
S.render.resolution_x = 1600
S.render.resolution_y = 1200
S.render.resolution_percentage = 100
S.render.image_settings.file_format = 'PNG'
S.render.fps = 24
S.view_settings.view_transform = 'AgX'
S.view_settings.look = 'AgX - Medium High Contrast'
S.world.color = (.22, .22, .22)

def material(name, hex, rough=.68, metal=0):
    def lin(x):
        x=int(x,16)/255
        return x/12.92 if x<.04045 else ((x+.055)/1.055)**2.4
    color=tuple(lin(hex[i:i+2]) for i in (0,2,4))
    m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value=(*color,1)
    p.inputs['Roughness'].default_value=rough
    p.inputs['Metallic'].default_value=metal
    return m

M={k:material(k,v) for k,v in {
    'Cotton blue':'487EB1','Cuff blue':'5C91C2','Blue seam':'39648E',
    'Trouser navy':'202E46','Trouser seam':'29394F','Scarf navy':'17283F',
    'Scarf gold':'F2C568','Scarf red':'B84042','Warm skin':'D6A477',
    'Ear warmth':'C28D66','Hair chestnut':'503429','Hair highlight':'57392D',
    'Hair shadow':'3D2821','Eyes':'201A13','Leather':'8C7150',
    'Leather seam':'6A5540','Sole':'30332E','Belt':'393C38',
    'Buckle':'A49D88','Ivory':'F7E8CB','Badge orange':'E77837',
    'Canvas olive':'666049','Canvas edge':'514D3A','Canvas light':'7A7256',
    'Hat navy':'243249','Hat band':'1C293E','Ground':'D5CDBD',
    'Screen':'78A5AD',
}.items()}
M['Ground'].node_tree.nodes.get('Principled BSDF').inputs['Emission Color'].default_value=M['Ground'].diffuse_color
M['Ground'].node_tree.nodes.get('Principled BSDF').inputs['Emission Strength'].default_value=.28
M['Buckle'].node_tree.nodes.get('Principled BSDF').inputs['Metallic'].default_value=.55

stripe_materials={}
def striped_fabric(guide,side,turns,diagonal):
    key=(guide,side,turns,diagonal)
    if key in stripe_materials:return stripe_materials[key]
    m=material('Woven scarf / '+str(key),'17283F')
    img=bpy.data.images.new('Scarf bands / '+str(key),width=512,height=512,alpha=False)
    # Bake clean diagonal boundaries into a small portable base-colour texture.
    cols=[M[n].diffuse_color[:3] for n in ['Scarf navy','Scarf gold','Scarf red']]
    srgb=lambda x:12.92*x if x<.0031308 else 1.055*x**(1/2.4)-.055
    cols=[tuple(srgb(x) for x in c) for c in cols]
    pixels=[]
    for j in range(512):
        for i in range(512):
            phase=(j/512*turns+i/512*diagonal*side)%1
            c=cols[1 if phase<.27 else 2 if guide and phase<.43 else 0]
            pixels.extend((*c,1))
    img.pixels.foreach_set(pixels);img.pack()
    tex=m.node_tree.nodes.new('ShaderNodeTexImage');tex.image=img
    uv=m.node_tree.nodes.new('ShaderNodeUVMap');uv.uv_map='Scarf UV'
    m.node_tree.links.new(uv.outputs['UV'],tex.inputs['Vector'])
    m.node_tree.links.new(tex.outputs['Color'],m.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])
    stripe_materials[key]=m
    return m

def grid_uv(o,cols,rows):
    uv=o.data.uv_layers.new(name='Scarf UV')
    for p in o.data.polygons:
        for li in p.loop_indices:
            vi=o.data.loops[li].vertex_index
            uv.data[li].uv=((vi%(cols+1))/cols,(vi//(cols+1))/rows)

current=None
parts=[]
def finish(o,name,mat,bone='chest',group='uniform'):
    o.name=name
    for c in list(o.users_collection): c.objects.unlink(o)
    current.objects.link(o)
    o.data.materials.append(M[mat])
    o['bind_bone']=bone; o['part_group']=group
    parts.append(o)
    return o

def sphere(name,loc,scale,mat,bone='chest',group='uniform',segments=28,rings=18):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments,ring_count=rings,location=loc)
    o=finish(bpy.context.object,name,mat,bone,group); o.scale=scale
    for p in o.data.polygons:p.use_smooth=True
    return o

def box(name,loc,scale,mat,bevel=.025,bone='chest',group='uniform'):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc)
    o=finish(bpy.context.object,name,mat,bone,group); o.scale=scale
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    b=o.modifiers.new('Soft tailored edge','BEVEL'); b.width=bevel;b.segments=4
    o.modifiers.new('Corner normals','WEIGHTED_NORMAL')
    return o

def mesh(name,verts,faces,mat,bone='chest',group='uniform',smooth=True):
    d=bpy.data.meshes.new(name);d.from_pydata(verts,[],faces);d.update()
    o=bpy.data.objects.new(name,d);current.objects.link(o)
    finish(o,name,mat,bone,group)
    for p in d.polygons:p.use_smooth=smooth
    return o

def tube(name,points,radius,mat,bone='chest',group='uniform',smooth=True):
    d=bpy.data.curves.new(name,'CURVE');d.dimensions='3D';d.resolution_u=10
    d.bevel_depth=radius;d.bevel_resolution=3
    s=d.splines.new('BEZIER' if smooth else 'POLY')
    if smooth:
        s.bezier_points.add(len(points)-1)
        for p,co in zip(s.bezier_points,points):p.co=co;p.handle_left_type=p.handle_right_type='AUTO'
    else:
        s.points.add(len(points)-1)
        for p,co in zip(s.points,points):p.co=(*co,1)
    o=bpy.data.objects.new(name,d);current.objects.link(o)
    return finish(o,name,mat,bone,group)

def loft(name,rings,mat,bone='chest',group='uniform',n=32,exponent=1):
    # z, center x/y, half width/depth. Superellipse sections soften clothing.
    verts=[]
    for z,x,y,rx,ry in rings:
        for i in range(n):
            a=math.tau*i/n;c=math.cos(a);s=math.sin(a)
            verts.append((x+rx*math.copysign(abs(c)**exponent,c),y+ry*math.copysign(abs(s)**exponent,s),z))
    faces=[tuple(reversed(range(n)))]
    for j in range(len(rings)-1):
        for i in range(n):faces.append((j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i))
    faces.append(tuple((len(rings)-1)*n+i for i in range(n)))
    return mesh(name,verts,faces,mat,bone,group)

def panel(name,pts,mat,bone='chest',group='uniform',thick=.012,bevel=.009):
    o=mesh(name,pts,[tuple(range(len(pts)))],mat,bone,group,False)
    s=o.modifiers.new('Fabric thickness','SOLIDIFY');s.thickness=thick
    b=o.modifiers.new('Soft edge','BEVEL');b.width=bevel;b.segments=3
    o.modifiers.new('Panel normals','WEIGHTED_NORMAL')
    return o

def emblem(name,center,size,bone='chest',group='uniform',side=False):
    c=Vector(center)
    # Front-facing inverted triangle, or outward-facing sleeve patch.
    for fac,mat,offset in [(1,'Ivory',0),(.78,'Badge orange',.006),(.42,'Ivory',.012),(.23,'Scarf gold',.018)]:
        pts=[]
        for x,z in [(-.5,.34),(.5,.34),(0,-.55)]:
            delta=Vector((offset if side else x*size*fac, x*size*fac if side else -offset,z*size*fac))
            pts.append(tuple(c+delta))
        panel(name+' / '+mat,pts,mat,bone,group,.007,.004)

def head_shape():
    verts=[]; n=48; rows=28
    for j in range(rows+1):
        t=-math.pi/2+math.pi*j/rows
        # Smooth squircle face, flattened forehead and cheeks.
        for i in range(n):
            a=math.tau*i/n
            sx=lambda v,e:math.copysign(abs(v)**e,v)
            verts.append((.355*sx(math.cos(t),.78)*sx(math.cos(a),.88),
                          -.018+.294*sx(math.cos(t),.78)*sx(math.sin(a),.83),
                          2.075+.345*sx(math.sin(t),.95)))
    faces=[]
    for j in range(rows):
        for i in range(n):faces.append((j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i))
    return mesh('Face / rounded silhouette',verts,faces,'Warm skin','head','body')

def hair_cap():
    verts=[];n=48;rows=20
    for j in range(rows+1):
        for i in range(n):
            p=math.tau*i/n
            # Hairline rises over the face and falls to the nape at the back.
            front=max(0,-math.sin(p)); back=max(0,math.sin(p))
            t=(1.63-.43*front+.43*back)*j/rows
            verts.append((.368*math.sin(t)*math.cos(p),.007+.304*math.sin(t)*math.sin(p),2.17+.30*math.cos(t)))
    faces=[]
    for j in range(rows):
        for i in range(n):faces.append((j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i))
    return mesh('Hair / fitted cap',verts,faces,'Hair chestnut','head','hair')

def hair(style):
    hair_cap()
    if style=='short':
        for i,(x,y,z,sx,sy,sz,ang) in enumerate([
            (-.24,-.16,2.32,.16,.14,.13,-.5),(-.08,-.23,2.35,.18,.13,.14,-.6),
            (.13,-.22,2.36,.17,.13,.13,.55),(.28,-.12,2.30,.115,.13,.14,.5),
            (-.21,.01,2.43,.15,.14,.115,-.4),(-.035,-.01,2.46,.17,.15,.12,-.3),
            (.16,.03,2.43,.16,.13,.13,.3),(-.19,.20,2.34,.15,.14,.14,-.3),
            (.03,.22,2.36,.17,.14,.13,.5),(.24,.17,2.33,.13,.13,.13,.4),
            (-.30,-.15,2.20,.073,.09,.14,-.35),(.30,-.15,2.20,.071,.09,.14,.3)]):
            o=sphere('Hair / sculpted lock %02d'%i,(x,y,z),(sx,sy,sz),'Hair chestnut' if i%3 else 'Hair highlight','head','hair')
            o.rotation_euler[1]=ang
            for v in o.data.vertices:
                tip=(v.co.z+1)/2
                v.co.x *= .35+.65*tip**.4
                v.co.y *= .72+.28*tip
                v.co.z *= .68
                v.co.x *= 1.12
    else:
        for i,(x,y,z,sx,sy,sz,ang) in enumerate([
            (-.115,-.22,2.30,.19,.13,.225,.7),(.17,-.20,2.31,.17,.125,.24,-.5),
            (-.325,-.07,2.08,.045,.12,.25,-.13),(.326,-.06,2.1,.047,.1,.23,.18)]):
            o=sphere('Hair / swept panel %02d'%i,(x,y,z),(sx,sy,sz),'Hair chestnut','head','hair');o.rotation_euler[1]=ang
        sphere('Hair / ponytail tie',(.08,.295,2.31),(.12,.08,.11),'Hair shadow','head','hair')
        o=sphere('Hair / ponytail upper',(.10,.395,2.20),(.17,.16,.30),'Hair chestnut','head','hair');o.rotation_euler[0]=-.22
        o=sphere('Hair / ponytail curl',(.12,.40,1.93),(.145,.16,.22),'Hair chestnut','head','hair');o.rotation_euler[0]=.45
        # Restrained part lines: sculpted, not individual strands.
        for side in [-1,1]:
            tube('Hair / part seam',[(side*.025,-.23,2.46),(side*.12,-.307,2.38),(side*.25,-.29,2.24)],.003,'Hair shadow','head','hair')

def scarf(guide):
    # The drape grows directly from the rolled nape/shoulder edge. Its upper
    # boundary shares the roll's path, so the back and front read as one cloth.
    def drape(u, t):
        top=Vector((.245*u,.20-.06*u*u,1.80-.045*u*u))
        apex=Vector((0,.27,1.465))
        p=top.lerp(apex,t)
        p.y += .025*math.sin(math.pi*t)
        return tuple(p)
    cols=32;rows=24
    verts=[drape(i/cols*2-1,j/rows) for j in range(rows) for i in range(cols+1)]
    faces=[]
    for j in range(rows-1):
        for i in range(cols):
            a=j*(cols+1)+i;faces.append((a,a+1,a+cols+2,a+cols+1))
    apex=len(verts);verts.append(drape(0,1))
    for i in range(cols):faces.append(((rows-1)*(cols+1)+i,(rows-1)*(cols+1)+i+1,apex))
    o=mesh('Neckerchief / continuous back drape',verts,faces,'Scarf navy',group='scarf')
    sol=o.modifiers.new('Folded cloth thickness','SOLIDIFY');sol.thickness=.014
    for side in [-1,1]:
        edge=[Vector(drape(side,j/32)) + Vector((0,.012,0)) for j in range(33)]
        tube('Neckerchief / gold back hem '+str(side),edge,.010,'Scarf gold',group='scarf',smooth=False)
        if guide:
            edge=[Vector(drape(side*.96,j/32)) + Vector((0,.020,0)) for j in range(33)]
            tube('Neckerchief / red back hem '+str(side),edge,.006,'Scarf red',group='scarf',smooth=False)
    for side in [-1,1]:
        # Rolled scarf from nape to the woggle, with diagonal woven bands.
        path=[Vector((0,.20,1.80)),Vector((side*.13,.183,1.787)),Vector((side*.245,.14,1.755)),Vector((side*.235,-.02,1.77)),Vector((side*.21,-.17,1.71)),Vector((side*.14,-.241,1.64)),Vector((0,-.267,1.59))]
        pts=[]
        for k in range(len(path)-1):
            for j in range(12):pts.append(path[k].lerp(path[k+1],j/12))
        pts.append(path[-1]);n=24;verts=[];faces=[];mats=[]
        for j,p in enumerate(pts):
            tangent=(pts[min(j+1,len(pts)-1)]-pts[max(0,j-1)]).normalized()
            u=tangent.cross(Vector((0,1,0))).normalized();v=tangent.cross(u).normalized()
            for i in range(n+1):verts.append(tuple(p+.034*(u*math.cos(i*math.tau/n)+v*math.sin(i*math.tau/n))))
        for j in range(len(pts)-1):
            for i in range(n):
                faces.append((j*(n+1)+i,j*(n+1)+i+1,(j+1)*(n+1)+i+1,(j+1)*(n+1)+i))
                phase=(j/12+i/n*.7)%1
                mats.append(1 if phase<.28 else 2 if guide and phase<.44 else 0)
        o=mesh('Neckerchief / striped shoulder '+str(side),verts,faces,'Scarf navy',group='scarf')
        o.data.materials.clear();o.data.materials.append(striped_fabric(guide,1,4,.7));grid_uv(o,n,len(pts)-1)
        # Thin softly rounded ribbon tails with modeled diagonal stripe boundaries.
        verts=[];faces=[];mi=[];rows=48;cols=8
        for j in range(rows+1):
            t=j/rows
            for i in range(cols+1):
                u=i/cols-.5
                x=side*(.035+.01*math.sin(t*math.pi))+u*.057*(1-.45*max(0,(t-.86)/.14))
                z=1.58-.42*t-.015*u*side
                verts.append((x,-.281-.008*math.sin(t*math.pi)-.01*(1-4*u*u),z))
        for j in range(rows):
            for i in range(cols):
                faces.append((j*(cols+1)+i,j*(cols+1)+i+1,(j+1)*(cols+1)+i+1,(j+1)*(cols+1)+i))
                phase=(j/rows*4.3+i/cols*.48*side)%1
                mi.append(1 if phase<.27 else 2 if guide and phase<.43 else 0)
        o=mesh('Neckerchief / striped tail '+str(side),verts,faces,'Scarf navy',group='scarf')
        o.data.materials.clear();o.data.materials.append(striped_fabric(guide,side,4,.48));grid_uv(o,cols,rows)
        sol=o.modifiers.new('Cloth thickness','SOLIDIFY');sol.thickness=.012
    emblem('Neckerchief / triangular woggle',(0,-.311,1.582),.12,group='scarf')

def boots(side,suffix):
    x=side*.177;b='foot.'+suffix
    box('Boot / rubber sole '+suffix,(x,-.076,.075),(.286,.446,.12),'Sole',.047,b,'boots')
    box('Boot / leather upper '+suffix,(x,-.072,.163),(.268,.414,.16),'Leather',.066,b,'boots')
    box('Boot / ankle '+suffix,(x,.015,.24),(.233,.245,.13),'Leather',.045,b,'boots')
    box('Boot / tongue '+suffix,(x,-.118,.247),(.125,.15,.022),'Leather seam',.013,b,'boots')
    for j in range(3):
        y=-.155+j*.042;z=.236+j*.013
        tube('Boot / crossed lace '+suffix,[(x-.047,y,z),(x+.047,y+.029,z+.007)],.006,'Belt',b,'boots',False)
        tube('Boot / crossed lace '+suffix,[(x+.047,y,z),(x-.047,y+.029,z+.007)],.006,'Belt',b,'boots',False)
    tube('Boot / toe seam '+suffix,[(x-.114,-.23,.17),(x,-.26,.205),(x+.114,-.23,.17)],.0035,'Leather seam',b,'boots')
    for sign in [-1,1]:
        for j in range(4):
            box('Boot / tread '+suffix,(x+sign*.135,-.21+j*.088,.068),(.012,.029,.026),'Leather seam',.003,b,'boots')

def backpack():
    box('Pack / main canvas bag',(0,.34,1.43),(.58,.285,.61),'Canvas olive',.075,group='backpack')
    box('Pack / lid',(0,.366,1.727),(.60,.315,.13),'Canvas light',.055,group='backpack')
    box('Pack / front pocket',(0,.502,1.335),(.38,.11,.27),'Canvas olive',.035,group='backpack')
    box('Pack / pocket flap',(0,.565,1.464),(.40,.039,.075),'Canvas light',.015,group='backpack')
    for side in [-1,1]:
        box('Pack / side pocket',(side*.31,.345,1.32),(.13,.225,.26),'Canvas olive',.035,group='backpack')
        tube('Pack / shoulder strap',[(side*.22,.34,1.71),(side*.30,.10,1.77),(side*.29,-.17,1.64),(side*.28,-.22,1.35),(side*.25,.05,1.14),(side*.23,.31,1.2)],.030,'Canvas edge',group='backpack')
        box('Pack / leather closure',(side*.126,.57,1.44),(.045,.035,.29),'Canvas edge',.008,group='backpack')
        box('Pack / buckle',(side*.126,.597,1.40),(.064,.025,.065),'Belt',.009,group='backpack')
    # Bedroll cylinder with visible concentric folds at each end.
    o=sphere('Pack / rolled blanket',(0,.355,1.887),(.42,.132,.132),'Canvas light',group='backpack')
    for side in [-1,1]:
        for radius in [.09,.061,.03]:
            pts=[(side*.415,.355+radius*math.cos(i*math.tau/48),1.887+radius*math.sin(i*math.tau/48)) for i in range(49)]
            tube('Pack / blanket spiral',pts,.008,'Canvas edge',group='backpack',smooth=False)
        pts=[(side*.23,.355+.135*math.cos(i*math.tau/48),1.887+.135*math.sin(i*math.tau/48)) for i in range(49)]
        tube('Pack / roll strap',pts,.023,'Canvas edge',group='backpack',smooth=False)
    # Back-facing patch.
    o=panel('Pack / patch backing',[(-.055,.569,1.352),(.055,.569,1.352),(0,.57,1.25)],'Ivory',group='backpack')
    panel('Pack / orange patch',[(-.037,.583,1.338),(.037,.583,1.338),(0,.584,1.268)],'Badge orange',group='backpack')

def hat():
    loft('Hat / curved brim',[(2.323,0,0,.46,.38),(2.338,0,0,.505,.408),(2.36,0,0,.49,.402),(2.369,0,0,.35,.30)],'Hat navy','head','hat',64)
    loft('Hat / crown',[(2.346,0,0,.329,.287),(2.38,0,0,.332,.286),(2.61,0,0,.30,.26),(2.637,0,0,.275,.24),(2.642,0,0,.08,.07)],'Hat navy','head','hat',64)
    loft('Hat / ribbon',[(2.365,0,0,.333,.29),(2.414,0,0,.326,.284)],'Hat band','head','hat',64)
    emblem('Hat / front patch',(0,-.286,2.52),.112,'head','hat')
    for x in [-.23,.23]:sphere('Hat / vent stud',(x,-.2,2.435),(.009,.006,.009),'Buckle','head','hat')

def body(style,guide):
    head_shape()
    sphere('Neck',(0,0,1.792),(.112,.112,.13),'Warm skin','neck','body')
    for side in [-1,1]:
        sphere('Ear',(side*.353,-.004,2.048),(.067,.053,.099),'Warm skin','head','body')
        sphere('Ear / inner',(side*.387,-.038,2.05),(.016,.011,.042),'Ear warmth','head','body')
        sphere('Eye',(side*.108,-.313,2.085),(.020,.006,.058),'Eyes','head','face',20,12)
    hair(style)
    loft('Shirt / tailored torso',[(1.043,0,0,.265,.168),(1.075,0,0,.288,.185),(1.22,0,0,.30,.20),(1.48,0,0,.32,.219),(1.63,0,0,.337,.204),(1.70,0,0,.30,.176),(1.775,0,0,.126,.104)],'Cotton blue',n=48,exponent=.84)
    box('Trousers / hips',(0,0,1.014),(.579,.359,.196),'Trouser navy',.062,'hips')
    box('Belt',(0,-.005,1.075),(.585,.378,.063),'Belt',.021,'hips')
    box('Belt / buckle',(0,-.204,1.074),(.082,.028,.058),'Buckle',.008,'hips')
    box('Belt / inset',(0,-.222,1.074),(.05,.006,.031),'Belt',.003,'hips')
    for x in [-.235,-.12,.12,.235]:box('Belt / trouser loop',(x,-.190,1.077),(.026,.025,.093),'Trouser navy',.006,'hips')
    box('Shirt / button placket',(0,-.216,1.35),(.032,.015,.40),'Cuff blue',.005)
    for z in [1.135,1.27,1.405,1.525]:sphere('Shirt / button',(0,-.229,z),(.009,.005,.009),'Blue seam')
    for side in [-1,1]:
        x=side*.172
        box('Shirt / chest pocket',(x,-.216,1.443),(.183,.035,.168),'Cotton blue',.021)
        panel('Shirt / pointed pocket flap',[(x-.096,-.239,1.53),(x+.096,-.239,1.53),(x+.086,-.25,1.484),(x,-.255,1.465),(x-.086,-.25,1.484)],'Cuff blue')
        sphere('Pocket / button',(x,-.262,1.49),(.008,.005,.008),'Blue seam')
        tube('Pocket / hem',[(x-.073,-.238,1.422),(x-.073,-.239,1.381),(x+.073,-.239,1.381),(x+.073,-.238,1.422)],.0025,'Blue seam',smooth=False)
        panel('Shirt / collar',[(side*.055,-.105,1.798),(side*.188,-.15,1.739),(side*.103,-.249,1.635),(side*.033,-.20,1.709)],'Cuff blue')
        suffix='L' if side==1 else 'R';arm='upper_arm.'+suffix;fore='forearm.'+suffix;thigh='thigh.'+suffix;shin='shin.'+suffix
        loft('Shirt / sleeve '+suffix,[(1.317,side*.505,0,.116,.131),(1.37,side*.495,0,.122,.139),(1.50,side*.45,0,.13,.151),(1.63,side*.378,0,.15,.163),(1.685,side*.334,0,.085,.11)],'Cotton blue',arm,n=32)
        loft('Shirt / rolled cuff '+suffix,[(1.315,side*.506,0,.118,.131),(1.327,side*.507,0,.13,.145),(1.385,side*.492,0,.128,.146),(1.396,side*.487,0,.12,.139)],'Cuff blue',arm,n=32)
        sphere('Arm / elbow '+suffix,(side*.508,0,1.318),(.086,.09,.115),'Warm skin',fore,'body')
        loft('Arm / forearm '+suffix,[(1.047,side*.532,-.02,.070,.075),(1.10,side*.53,-.015,.074,.08),(1.25,side*.518,-.002,.084,.088),(1.34,side*.508,0,.087,.09)],'Warm skin',fore,'body')
        sphere('Hand / mitten '+suffix,(side*.533,-.018,1.005),(.085,.078,.112),'Warm skin','hand.'+suffix,'body')
        sphere('Hand / thumb '+suffix,(side*.465,-.05,1.039),(.041,.05,.062),'Warm skin','hand.'+suffix,'body')
        loft('Trousers / leg '+suffix,[(.235,side*.177,0,.121,.125),(.265,side*.177,0,.132,.142),(.45,side*.177,0,.133,.149),(.65,side*.177,0,.139,.156),(.87,side*.174,0,.149,.164),(1.015,side*.164,0,.16,.166)],'Trouser navy',thigh,n=32,exponent=.8)
        loft('Trousers / rolled hem '+suffix,[(.244,side*.177,0,.132,.142),(.29,side*.177,0,.136,.145),(.301,side*.177,0,.132,.14)],'Trouser seam',shin,n=32,exponent=.8)
        box('Trousers / cargo pocket '+suffix,(side*.307,-.006,.81),(.046,.20,.21),'Trouser seam',.02,thigh)
        box('Trousers / cargo flap '+suffix,(side*.331,-.006,.91),(.022,.209,.056),'Trouser navy',.01,thigh)
        tube('Trousers / outer seam '+suffix,[(side*.31,.06,.87),(side*.308,.06,.7)],.0025,'Trouser seam',thigh)
        tube('Trousers / shin seam '+suffix,[(side*.306,.055,.61),(side*.297,.055,.33)],.0025,'Trouser seam',shin)
        boots(side,suffix)
        if side==1:emblem('Sleeve / Pathfinder patch',(.553,-.092,1.505),.105,arm,side=True)
    scarf(guide)
    if guide:backpack();hat()

def skeleton(name):
    d=bpy.data.armatures.new(name+' skeleton');r=bpy.data.objects.new(name+' • Rig',d);current.objects.link(r)
    bpy.context.view_layer.objects.active=r;r.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
    spec=[('root',(0,0,0),(0,0,.2),None),('hips',(0,0,1.025),(0,0,1.18),'root'),('chest',(0,0,1.18),(0,0,1.73),'hips'),('neck',(0,0,1.73),(0,0,1.84),'chest'),('head',(0,0,1.84),(0,0,2.43),'neck')]
    for side,suf in [(1,'L'),(-1,'R')]:
        spec.extend([
            ('upper_arm.'+suf,(side*.334,0,1.67),(side*.51,0,1.33),'chest'),
            ('forearm.'+suf,(side*.51,0,1.33),(side*.531,-.02,1.065),'upper_arm.'+suf),
            ('hand.'+suf,(side*.531,-.02,1.065),(side*.533,-.025,.945),'forearm.'+suf),
            ('thigh.'+suf,(side*.177,0,1.025),(side*.177,0,.65),'hips'),
            ('shin.'+suf,(side*.177,0,.65),(side*.177,0,.235),'thigh.'+suf),
            ('foot.'+suf,(side*.177,0,.235),(side*.177,-.25,.13),'shin.'+suf)])
    for name,h,t,parent in spec:
        b=d.edit_bones.new(name);b.head=h;b.tail=t
        if parent:b.parent=d.edit_bones[parent]
    bpy.ops.object.mode_set(mode='OBJECT');r.select_set(False);r.show_in_front=True;d.display_type='OCTAHEDRAL'
    r['asset_description']='Poseable PointFinder figurine; shared 17-bone FK rig. Front -Y / up +Z.'
    return r

def bind(rig):
    # Weld the exposed hand/forearm into a continuous skin surface before rigging.
    for suf in ['L','R']:
        items=[o for o in parts if o['part_group']=='body' and o['bind_bone'] in ['forearm.'+suf,'hand.'+suf]]
        bpy.ops.object.select_all(action='DESELECT')
        for o in items:o.select_set(True)
        bpy.context.view_layer.objects.active=items[0];bpy.ops.object.join()
        skin=bpy.context.object;skin.name='Arm / continuous skin '+suf;skin['bind_bone']='forearm.'+suf
        for o in items[1:]:parts.remove(o)
        bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
        rem=skin.modifiers.new('Continuous rounded skin','REMESH');rem.mode='VOXEL';rem.voxel_size=.010
        bpy.ops.object.modifier_apply(modifier=rem.name)
        sm=skin.modifiers.new('Soften sculpt','SMOOTH');sm.factor=1;sm.iterations=4
        bpy.ops.object.modifier_apply(modifier=sm.name)
        for p in skin.data.polygons:p.use_smooth=True
    tail=[o for o in parts if o.get('part_group')=='hair' and ('ponytail upper' in o.name or 'ponytail curl' in o.name)]
    if tail:
        bpy.ops.object.select_all(action='DESELECT')
        for o in tail:o.select_set(True)
        bpy.context.view_layer.objects.active=tail[0];bpy.ops.object.join()
        o=bpy.context.object;o.name='Hair / ponytail flow'
        for old in tail[1:]:parts.remove(old)
        bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
        rem=o.modifiers.new('Continuous ponytail silhouette','REMESH');rem.mode='VOXEL';rem.voxel_size=.009
        bpy.ops.object.modifier_apply(modifier=rem.name)
        sm=o.modifiers.new('Soft ponytail transition','SMOOTH');sm.factor=1;sm.iterations=5
        bpy.ops.object.modifier_apply(modifier=sm.name)
        for face in o.data.polygons:face.use_smooth=True
    for o in parts:
        bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
        if o.type=='CURVE':bpy.ops.object.convert(target='MESH')
        for mod in list(o.modifiers):
            bpy.ops.object.modifier_apply(modifier=mod.name)
        bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
        if 'guide' in rig.name and o['part_group']=='hair':
            # A separate fitted hair variant clears the hat, with no crown clipping.
            for v in o.data.vertices:
                v.co.x*=.97;v.co.y*=.98
                if v.co.z>2.32:v.co.z=2.32+(v.co.z-2.32)*.35
        bone=o['bind_bone']
        vg=o.vertex_groups.new(name=bone)
        vg.add(list(range(len(o.data.vertices))),1,'REPLACE')
        if o.name.startswith('Trousers / leg '):
            shin='shin.'+bone.split('.')[-1];v2=o.vertex_groups.new(name=shin)
            for v in o.data.vertices:
                w=max(0,min(1,(.735-v.co.z)/.17))
                vg.add([v.index],1-w,'REPLACE');v2.add([v.index],w,'REPLACE')
        if o.name.startswith('Arm / continuous skin '):
            hand='hand.'+bone.split('.')[-1];v2=o.vertex_groups.new(name=hand)
            for v in o.data.vertices:
                w=max(0,min(1,(1.10-v.co.z)/.08))
                vg.add([v.index],1-w,'REPLACE');v2.add([v.index],w,'REPLACE')
        o.parent=rig
        arm=o.modifiers.new('PointFinder skin','ARMATURE');arm.object=rig
    bpy.ops.object.select_all(action='DESELECT')

def reset(rig):
    for p in rig.pose.bones:p.rotation_mode='QUATERNION';p.rotation_quaternion=(1,0,0,0);p.location=(0,0,0);p.scale=(1,1,1)
    bpy.context.view_layer.update()

def aim(rig,name,direction):
    p=rig.pose.bones[name]
    # Parallel transport the inherited orientation: avoids twisting the wrist
    # when a forearm turns through 180 degrees for a wave.
    q=(p.tail-p.head).normalized().rotation_difference(Vector(direction).normalized())
    mat=(q@p.matrix.to_quaternion()).to_matrix().to_4x4();mat.translation=p.head
    p.matrix=mat
    bpy.context.view_layer.update()

def pose(rig,name,phase=0):
    reset(rig)
    if name=='wave':
        aim(rig,'upper_arm.L',(1,0,.15));aim(rig,'forearm.L',(.1,-.10,1));aim(rig,'hand.L',(.12+phase*.2,0,1))
        aim(rig,'head',(-.08,0,1))
    elif name=='point':
        aim(rig,'upper_arm.L',(1,-.3,.1));aim(rig,'forearm.L',(1,-.1,.2));aim(rig,'hand.L',(1,0,.2));aim(rig,'head',(.12,-.15,1))
    elif name=='celebrate':
        for side,suf in [(1,'L'),(-1,'R')]:
            aim(rig,'upper_arm.'+suf,(side,0,.8));aim(rig,'forearm.'+suf,(side*.1,0,1));aim(rig,'hand.'+suf,(side*.1,0,1))
        aim(rig,'head',(0,.07,1))
    elif name=='walk':
        a=math.sin(phase*math.tau)*.42
        for side,suf in [(1,'L'),(-1,'R')]:
            aim(rig,'thigh.'+suf,(0,side*a,-1));aim(rig,'shin.'+suf,(0,side*a+max(0,side*a)*1.1,-1))
            aim(rig,'upper_arm.'+suf,(side*.18,-side*a*.6,-1))
        rig.pose.bones['root'].location.z=.025*abs(math.sin(phase*math.tau))
    elif name=='phone':
        aim(rig,'upper_arm.L',(.22,-.18,-1));aim(rig,'forearm.L',(-.18,-1,.28));aim(rig,'hand.L',(-.1,-1,.45));aim(rig,'head',(0,-.15,1))
    elif name=='idle':
        for side,suf in [(1,'L'),(-1,'R')]:
            aim(rig,'upper_arm.'+suf,(side*.24,0,-1))
            aim(rig,'forearm.'+suf,(side*.02,-.05,-1))
        rig.pose.bones['chest'].scale=(1+phase*.005,1+phase*.005,1+phase*.004)
    bpy.context.view_layer.update()

def animations(rig):
    rig.animation_data_create()
    for name in ['idle','wave','point','celebrate','phone','walk']:
        rig.animation_data.action=None
        length=48 if name in ['walk','idle'] else 36
        for f in range(1,length+2,3):
            t=(f-1)/length
            pose(rig,name,t if name=='walk' else math.sin(t*math.tau))
            for b in rig.pose.bones:
                for prop in ['rotation_quaternion','location','scale']:b.keyframe_insert(data_path=prop,frame=f)
        a=rig.animation_data.action;a.name=rig.name.split(' •')[0]+'/'+name;a.use_fake_user=True
        rig.animation_data.action=None
        tr=rig.animation_data.nla_tracks.new();tr.name=name
        strip=tr.strips.new(name,1,a);tr.mute=True
    reset(rig)

def refine_proportions(rig, objects):
    def shape(co):
        blend=max(0,min(1,(co.z-1.72)/.18))
        co.x *= .87*(1-blend)+.93*blend
        co.y *= .96
    for o in objects:
        for v in o.data.vertices:
            shape(v.co)
            if o.get('part_group')=='boots':
                center=(.177*.87)*(1 if v.co.x>0 else -1)
                v.co.x=center+(v.co.x-center)*1.08
            if 'Hair / ponytail flow' in o.name:
                v.co.y += max(0,2.4-v.co.z)*.9
    bpy.context.view_layer.objects.active=rig
    rig.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    for b in rig.data.edit_bones:
        h=b.head.copy();t=b.tail.copy();shape(h);shape(t);b.head=h;b.tail=t
    bpy.ops.object.mode_set(mode='OBJECT');rig.select_set(False)

characters=[]
for key,style,guide in [('pathfinder-short','short',False),('pathfinder-ponytail','ponytail',False),('pathfinder-guide','short',True)]:
    current=bpy.data.collections.new(key);S.collection.children.link(current);parts=[]
    body(style,guide);rig=skeleton(key);bind(rig);refine_proportions(rig,parts);animations(rig)
    current.asset_mark();current.asset_data.description='Poseable PointFinder figurine with blue uniform, shared skeleton and modular accessories.'
    current.asset_data.catalog_id='bfbe4b59-00dd-430c-82b6-eaf0d071c433'
    characters.append((key,rig,list(parts),current))

# Studio is separate from all reusable characters.
current=bpy.data.collections.new('Studio • not exported');S.collection.children.link(current);parts=[]
floor=box('Studio floor',(0,0,-.075),(200,200,.12),'Ground',.01,'root','studio')
def area(name,loc,energy,color,size):
    d=bpy.data.lights.new(name,'AREA');d.energy=energy;d.color=color;d.shape='DISK';d.size=size
    o=bpy.data.objects.new(name,d);current.objects.link(o);o.location=loc;o.rotation_euler=(Vector((0,0,1.2))-o.location).to_track_quat('-Z','Y').to_euler()
area('Key / large softbox',(-3,-4,7),650,(1,.95,.88),5)
area('Fill / cool card',(4,-2,4),400,(.76,.87,1),4)
area('Rim / warm edge',(1,4,6),750,(1,.96,.88),3.5)
camdata=bpy.data.cameras.new('Portrait camera');cam=bpy.data.objects.new('Portrait camera',camdata);current.objects.link(cam);S.camera=cam;camdata.type='ORTHO'
def camera(loc,target,ortho):
    cam.location=loc;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();camdata.ortho_scale=ortho
def stage_all():
    for i,(key,rig,objs,col) in enumerate(characters):
        rig.location=( (i-1)*1.55,0,0);rig.rotation_euler=(0,0,-.10)
        col.hide_render=False;reset(rig)
stage_all();camera((0,-10,2.8),(0,0,1.3),5.0)
S.frame_start=1;S.frame_end=49;S.frame_set(1)
for key,rig,objs,col in characters:reset(rig)
bpy.ops.object.select_all(action='DESELECT');characters[0][1].select_set(True);bpy.context.view_layer.objects.active=characters[0][1]
for screen in bpy.data.screens:
    for area_ in screen.areas:
        if area_.type=='VIEW_3D':area_.spaces.active.region_3d.view_perspective='CAMERA'
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'pointfinder-character-library.blend'))
S.render.filepath=str(OUT/'characters-lineup.png');bpy.ops.render.render(write_still=True)

print('SHAPES_READY',flush=True)
