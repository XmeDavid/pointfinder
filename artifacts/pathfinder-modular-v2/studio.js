import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import {
  SLOTS, SLOT_ORDER, POSES, POSE_LABELS, SKIN_TONES, HAIR_COLORS,
  SKIN_MATERIAL, EAR_MATERIAL, HAIR_MATERIALS,
  defaultConfig, setSlot, visibilityMap, parseConfig, serializeConfig, discoverItems, itemTag,
  hairPalette, skinPalette,
} from './customization.js'

// Optional ?model=items/base-uniform.glb reviews a single module file.
const requested = new URLSearchParams(location.search).get('model')
const MODEL = requested && /^[\w./-]+\.glb$/.test(requested) && !requested.includes('..') ? requested : 'modular-character.glb'
const $ = id => document.getElementById(id)
const stage = $('stage'), scene = new THREE.Scene()

// Renderer, camera, lights: same recipe as the v1 studio.
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
renderer.toneMapping = THREE.AgXToneMapping
stage.prepend(renderer.domElement)
const camera = new THREE.PerspectiveCamera(32, 1, .01, 100)
const controls = new OrbitControls(camera, renderer.domElement)
controls.enableDamping = true; controls.minDistance = 2.7; controls.maxDistance = 10
const VIEWS = { front: [0, 1.8, 6.5], back: [2.5, 2.4, -6], 'three-quarter': [3, 2.4, 6] }
const TARGET = new THREE.Vector3(0, 1.32, 0)
function view(name) { camera.position.set(...VIEWS[name]); controls.target.copy(TARGET); controls.update() }
view('three-quarter')
scene.add(new THREE.HemisphereLight(0xf4f0e5, 0xaaa38b, 2))
function light(x, y, z, intensity, color) { const l = new THREE.DirectionalLight(color, intensity); l.position.set(x, y, z); scene.add(l) }
light(-3, 6, 4, 3, 0xffead2); light(4, 3, -3, 1.4, 0xf4eedc)
const contact = document.createElement('canvas'); contact.width = contact.height = 128
const ctx = contact.getContext('2d'); const gradient = ctx.createRadialGradient(64, 64, 6, 64, 64, 64)
gradient.addColorStop(0, 'rgba(36,49,40,.3)'); gradient.addColorStop(1, 'rgba(36,49,40,0)'); ctx.fillStyle = gradient; ctx.fillRect(0, 0, 128, 128)
const ground = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.2), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(contact), transparent: true, depthWrite: false }))
ground.rotation.x = -Math.PI / 2; ground.position.y = .013; scene.add(ground)

// State.
let config = defaultConfig()
let model = null, mixer = null, action = null, skeletonHelper = null, playing = false
let clips = [], rest = new Map(), items = new Map() // item key -> Object3D[]
let materials = new Map() // material name -> Material[]

// ---------- UI construction ----------
for (const slot of SLOT_ORDER) {
  const def = SLOTS[slot]
  const row = document.createElement('label'); row.className = 'row'
  const span = document.createElement('span'); span.textContent = def.label
  const select = document.createElement('select'); select.id = `slot-${slot}`; select.dataset.slot = slot
  for (const choice of def.choices) { const o = document.createElement('option'); o.value = choice; o.textContent = choice === 'none' ? 'None' : titleCase(choice); select.append(o) }
  select.value = config[slot]
  select.disabled = def.choices.length < 2
  select.onchange = () => { update(setSlot(config, slot, select.value)) }
  row.append(span, select); $('slots').append(row)
}
swatches($('skin'), SKIN_TONES, 'Skin tone', () => config.skin, hex => update({ ...config, skin: hex }))
swatches($('hair-color'), HAIR_COLORS, 'Hair colour', () => config.hairColor, hex => update({ ...config, hairColor: hex }))
for (const key of POSES) { const b = document.createElement('button'); b.type = 'button'; b.textContent = POSE_LABELS[key]; b.dataset.pose = key; b.onclick = () => update({ ...config, pose: key }); $('poses').append(b) }
function swatches(root, colors, label, current, pick) {
  for (const [i, hex] of colors.entries()) {
    const b = document.createElement('button'); b.type = 'button'; b.style.background = hex; b.dataset.color = hex
    b.setAttribute('aria-label', `${label} ${i + 1}`); b.onclick = () => pick(hex); root.append(b)
  }
  root.dataset.sync = '1'; root._current = current
}
function titleCase(s) { return s.replace(/(^|-)([a-z])/g, (_, d, c) => (d ? ' ' : '') + c.toUpperCase()) }

// ---------- Apply config to the scene and controls ----------
function update(next, { keepTime = true } = {}) {
  const poseChanged = next.pose !== config.pose
  config = next
  for (const slot of SLOT_ORDER) $(`slot-${slot}`).value = config[slot]
  for (const root of [$('skin'), $('hair-color')]) for (const b of root.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.color === root._current()))
  document.querySelectorAll('[data-pose]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.pose === config.pose)))
  $('config-text').value = serializeConfig(config)
  if (!model) return
  applyVisibility(); applyColors()
  if (poseChanged || !keepTime) choosePose(config.pose)
  render()
}

function applyVisibility() {
  const map = visibilityMap(config)
  for (const [key, objects] of items) { const on = map[key] ?? true; for (const o of objects) o.visible = on }
}
function applyColors() {
  const skin = skinPalette(config.skin), hair = hairPalette(config.hairColor)
  tint(SKIN_MATERIAL, skin.skin); tint(EAR_MATERIAL, skin.ear)
  tint(HAIR_MATERIALS.base, hair.base); tint(HAIR_MATERIALS.highlight, hair.highlight); tint(HAIR_MATERIALS.shadow, hair.shadow)
}
function tint(name, hex) { for (const m of materials.get(name) ?? []) m.color.set(hex) }

function resetBones() {
  model.traverse(o => { if (o.isBone && rest.has(o.uuid)) { const p = rest.get(o.uuid); o.position.copy(p.p); o.quaternion.copy(p.q); o.scale.copy(p.s) } })
}
function choosePose(key) {
  if (!mixer) return
  mixer.stopAllAction(); resetBones()
  const clip = findClip(key)
  action = clip ? mixer.clipAction(clip).play() : null
  if (action) { action.time = 0; mixer.update(0) }
  $('time').value = 0; $('time').disabled = !action
  if (!action) setPlaying(false)
}
function findClip(key) { return clips.find(c => c.name === key) ?? clips.find(c => c.name.endsWith('/' + key) || c.name.endsWith('_' + key) || c.name.toLowerCase().endsWith(key)) }
function setPlaying(on) { playing = on && !!action; $('play').textContent = playing ? 'Pause' : 'Play'; $('play').setAttribute('aria-pressed', String(playing)) }

// ---------- Loading ----------
function dispose(root) {
  const mats = new Set(), geoms = new Set(), textures = new Set()
  root.traverse(o => { if (!o.isMesh) return; geoms.add(o.geometry); for (const m of Array.isArray(o.material) ? o.material : [o.material]) { mats.add(m); for (const v of Object.values(m)) if (v?.isTexture) textures.add(v) } })
  textures.forEach(t => { t.source?.data?.close?.(); t.dispose() }); mats.forEach(m => m.dispose()); geoms.forEach(g => g.dispose())
}
// Item tags live in glTF extras, which GLTFLoader copies to userData on the
// mesh, or on its parent node/group. Walk up until one is found.
function tagFor(object) {
  for (let o = object; o && o !== model; o = o.parent) { const t = itemTag(o.userData); if (t) return t }
  return null
}
async function load() {
  stage.dataset.state = 'loading'; $('status').textContent = 'Loading the character…'
  try {
    const gltf = await new GLTFLoader().loadAsync(MODEL)
    if (model) { mixer.stopAllAction(); mixer.uncacheRoot(model); scene.remove(model); dispose(model) }
    if (skeletonHelper) { scene.remove(skeletonHelper); skeletonHelper.dispose() }
    rest.clear(); items.clear(); materials.clear()
    model = gltf.scene; scene.add(model)
    const found = []
    model.traverse(o => {
      if (o.isBone) rest.set(o.uuid, { p: o.position.clone(), q: o.quaternion.clone(), s: o.scale.clone() })
      if (!o.isMesh) return
      o.castShadow = o.receiveShadow = true
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) { if (m.map) m.map.anisotropy = renderer.capabilities.getMaxAnisotropy(); if (!materials.has(m.name)) materials.set(m.name, []); materials.get(m.name).push(m) }
      const tag = tagFor(o)
      if (tag) { const key = `${tag.slot}/${tag.id}`; if (!items.has(key)) { items.set(key, []); found.push(tag) } items.get(key).push(o) }
    })
    clips = gltf.animations
    mixer = new THREE.AnimationMixer(model)
    skeletonHelper = new THREE.SkeletonHelper(model); skeletonHelper.visible = $('rig').checked; scene.add(skeletonHelper)
    reportInventory(found)
    update(config, { keepTime: false })
    stage.dataset.state = 'ready'
    $('status').textContent = `Drag to orbit · ${clips.length} clip${clips.length === 1 ? '' : 's'} · ${items.size} tagged module${items.size === 1 ? '' : 's'}`
  } catch (e) {
    stage.dataset.state = 'error'
    $('status').textContent = `Could not load ${MODEL}. The Blender pipeline produces it; put it next to index.html and reload.`
    $('inventory').textContent = 'No model loaded.'
    console.error(e)
  }
}
function reportInventory(found) {
  const r = discoverItems(found)
  const missingClips = POSES.filter(p => !findClip(p))
  const parts = [`${r.present.length}/${r.present.length + r.missing.length} modules tagged`]
  const html = [`<b>${parts.join('')}</b>`]
  if (r.missing.length) html.push(`<br><span class="missing">Missing: ${r.missing.join(', ')}</span>`)
  if (r.unexpected.length) html.push(`<br>Untracked tags: ${r.unexpected.join(', ')}`)
  html.push(`<br>Clips: ${clips.map(c => c.name).join(', ') || 'none'}`)
  if (missingClips.length) html.push(`<br><span class="missing">Missing clips: ${missingClips.join(', ')}</span>`)
  for (const name of [SKIN_MATERIAL, EAR_MATERIAL, ...Object.values(HAIR_MATERIALS)]) if (!materials.has(name)) html.push(`<br><span class="missing">Material not found: ${name}</span>`)
  $('inventory').innerHTML = html.join('')
}

// ---------- Controls ----------
$('time').oninput = () => { if (action) { action.time = Number($('time').value) * action.getClip().duration; mixer.update(0); render() } }
$('play').onclick = () => setPlaying(!playing)
$('reset').onclick = () => { setPlaying(false); if (mixer) { mixer.stopAllAction(); action = null; resetBones(); $('time').value = 0; render() } }
$('rig').onchange = () => { if (skeletonHelper) skeletonHelper.visible = $('rig').checked; render() }
for (const name of Object.keys(VIEWS)) $(name).onclick = () => view(name)

$('save').onclick = () => {
  const transparent = $('transparent').checked
  ground.visible = !transparent; renderer.setClearColor(0xf4f1e9, transparent ? 0 : 1); render()
  const a = document.createElement('a')
  const tags = SLOT_ORDER.filter(s => config[s] !== 'none').map(s => config[s]).join('-')
  a.download = `pointfinder-modular-${tags}-${config.pose}.png`; a.href = renderer.domElement.toDataURL('image/png'); a.click()
  ground.visible = true; renderer.setClearColor(0, 0); render()
}
$('export-json').onclick = () => {
  const blob = new Blob([serializeConfig(config)], { type: 'application/json' })
  const a = document.createElement('a'); a.download = 'pointfinder-character.json'; a.href = URL.createObjectURL(blob); a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
function importText(text) {
  const r = parseConfig(text)
  const list = $('config-errors'); list.replaceChildren()
  for (const e of r.errors) { const li = document.createElement('li'); li.textContent = e; list.append(li) }
  if (r.ok) { update(r.config); $('status').textContent = 'Config applied.' }
  return r.ok
}
$('apply-config').onclick = () => importText($('config-text').value)
$('config-file-button').onclick = () => $('config-file').click()
$('config-file').onchange = async () => { const f = $('config-file').files?.[0]; if (!f) return; $('config-text').value = await f.text(); importText($('config-text').value); $('config-file').value = '' }
$('config-text').addEventListener('keydown', e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') importText($('config-text').value) })

// ---------- Render loop ----------
function render() { renderer.render(scene, camera) }
new ResizeObserver(() => { renderer.setSize(stage.clientWidth, stage.clientHeight); camera.aspect = stage.clientWidth / stage.clientHeight; camera.updateProjectionMatrix(); render() }).observe(stage)
let then = 0
function tick(now) {
  requestAnimationFrame(tick)
  const dt = Math.min(.05, (now - then) / 1000); then = now
  if (document.hidden) return
  if (playing && mixer) { mixer.update(dt); if (action) $('time').value = (action.time % action.getClip().duration) / action.getClip().duration }
  controls.update(); render()
}
requestAnimationFrame(tick)
update(config)
load()

// Exposed for manual poking in the console during art review.
window.pointfinderStudio = { get config() { return config }, update, load, get items() { return items }, get clips() { return clips } }
