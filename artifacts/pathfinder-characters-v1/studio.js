import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
const $ = id => document.getElementById(id)
const stage = $('stage'), scene = new THREE.Scene()
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap;renderer.toneMapping = THREE.AgXToneMapping
stage.prepend(renderer.domElement)
const camera = new THREE.PerspectiveCamera(32, 1, .01, 100)
camera.position.set(3, 2.4, 6)
const controls = new OrbitControls(camera, renderer.domElement)
controls.target.set(0, 1.32, 0);controls.enableDamping = true;controls.minDistance = 2.7;controls.maxDistance = 10
scene.add(new THREE.HemisphereLight(0xf4f0e5, 0xaaa38b, 2))
function light(x,y,z,intensity,color,size) {const l=new THREE.DirectionalLight(color,intensity);l.position.set(x,y,z);l.castShadow=false;l.shadow.mapSize.set(size,size);scene.add(l)}
light(-3,6,4,3,0xffead2,1024);light(4,3,-3,1.4,0xf4eedc,512)
const contact=document.createElement('canvas');contact.width=contact.height=128;const ctx=contact.getContext('2d');const gradient=ctx.createRadialGradient(64,64,6,64,64,64);gradient.addColorStop(0,'rgba(36,49,40,.3)');gradient.addColorStop(1,'rgba(36,49,40,0)');ctx.fillStyle=gradient;ctx.fillRect(0,0,128,128)
const ground=new THREE.Mesh(new THREE.PlaneGeometry(1.7,1.2),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(contact),transparent:true,depthWrite:false}));ground.rotation.x=-Math.PI/2;ground.position.y=.013;scene.add(ground)
let skinColor='#c99061'
let model, mixer, action, skeleton, playing=false, generation=0, selected='idle', rest=new Map(), clips=[]
const loader=new GLTFLoader()
const names={idle:'Relaxed',wave:'Wave',point:'Point',celebrate:'Celebrate',phone:'Hold a phone',walk:'Walk'}
for(const [key,label] of Object.entries(names)){const b=document.createElement('button');b.textContent=label;b.dataset.pose=key;b.setAttribute('aria-pressed',String(key===selected));b.onclick=()=>choose(key);$('poses').append(b)}
function choose(key){if(!mixer)return;mixer.stopAllAction();model.traverse(o=>{if(o.isBone&&rest.has(o.uuid)){const p=rest.get(o.uuid);o.position.copy(p.p);o.quaternion.copy(p.q);o.scale.copy(p.s)}});const clip=clips.find(c=>c.name===key);action=clip?mixer.clipAction(clip).play():null;selected=key;if(action){action.time=0;mixer.update(0)}$('time').value=0;document.querySelectorAll('[data-pose]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.pose===key)));render()}
function dispose(root){const mats=new Set(),geoms=new Set(),textures=new Set();root.traverse(o=>{if(!o.isMesh)return;geoms.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material]){mats.add(m);for(const v of Object.values(m))if(v?.isTexture)textures.add(v)}});textures.forEach(t=>{t.source.data?.close?.();t.dispose()});mats.forEach(m=>m.dispose());geoms.forEach(g=>g.dispose())}
async function load(){const g=++generation;$('status').textContent='Loading the character…';playing=false;$('play').textContent='Play animation';try{const gltf=await loader.loadAsync(`pathfinder-${$('character').value}.glb`);if(g!==generation){dispose(gltf.scene);return}if(model){mixer.stopAllAction();mixer.uncacheRoot(model);scene.remove(model);dispose(model)}if(skeleton){scene.remove(skeleton);skeleton.geometry.dispose();skeleton.material.dispose()}rest.clear();model=gltf.scene;scene.add(model);model.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;for(const m of Array.isArray(o.material)?o.material:[o.material])if(m.name==='Warm skin')m.color.set(skinColor)}if(o.isBone)rest.set(o.uuid,{p:o.position.clone(),q:o.quaternion.clone(),s:o.scale.clone()})});mixer=new THREE.AnimationMixer(model);clips=gltf.animations;skeleton=new THREE.SkeletonHelper(model);skeleton.visible=$('rig').checked;scene.add(skeleton);const guide=$('character').value==='guide';for(const id of ['hat','pack']){$(id).disabled=!guide;$(id).checked=true}$('download').href=`pathfinder-${$('character').value}.glb`;choose(selected);$('status').textContent='Drag to explore · Six reusable poses · Live 3D';stage.dataset.ready='true'}catch(e){$('status').textContent='Could not load the model. Select a character to retry.';console.error(e)}}
$('character').onchange=load
$('time').oninput=()=>{if(action){action.time=Number($('time').value)*action.getClip().duration;mixer.update(0);render()}}
$('play').onclick=()=>{playing=!playing;$('play').textContent=playing?'Pause animation':'Play animation'}
$('reset').onclick=()=>{playing=false;$('play').textContent='Play animation';choose('rest')}
for(const [id,suffix] of [['hat','hat'],['pack','backpack']])$(id).onchange=()=>{model?.traverse(o=>{if((o.userData.name??o.name).endsWith('/'+suffix))o.visible=$(id).checked});render()}
$('rig').onchange=()=>{if(skeleton)skeleton.visible=$('rig').checked;render()}
for(const [i,color] of ['#e4b88e','#c99061','#946244','#694531'].entries()){const b=document.createElement('button');b.style.background=color;b.setAttribute('aria-label',`Skin tone ${i+1}`);b.setAttribute('aria-pressed',String(i===1));b.onclick=()=>{skinColor=color;model?.traverse(o=>{if(!o.isMesh)return;for(const m of Array.isArray(o.material)?o.material:[o.material])if(m.name==='Warm skin')m.color.set(color)});$('skin').querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));render()};$('skin').append(b)}
$('front').onclick=()=>{camera.position.set(0,1.8,6.5);controls.target.set(0,1.32,0);controls.update()}
$('back').onclick=()=>{camera.position.set(2.5,2.4,-6);controls.target.set(0,1.32,0);controls.update()}
function render(){renderer.render(scene,camera)}
$('save').onclick=()=>{const transparent=$('transparent').checked;ground.visible=!transparent;renderer.setClearColor(0xf4f1e9,transparent?0:1);render();const a=document.createElement('a');a.download=`pointfinder-${$('character').value}-${selected}.png`;a.href=renderer.domElement.toDataURL('image/png');a.click();ground.visible=true;renderer.setClearColor(0,0);render()}
new ResizeObserver(()=>{renderer.setSize(stage.clientWidth,stage.clientHeight);camera.aspect=stage.clientWidth/stage.clientHeight;camera.updateProjectionMatrix();render()}).observe(stage)
let then=0;function tick(now){requestAnimationFrame(tick);const dt=Math.min(.05,(now-then)/1000);then=now;if(document.hidden)return;if(playing&&mixer){mixer.update(dt);if(action)$('time').value=action.time/action.getClip().duration}controls.update();render()}requestAnimationFrame(tick);load()
