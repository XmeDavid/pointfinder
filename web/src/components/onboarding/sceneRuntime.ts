import {
  AgXToneMapping, AnimationMixer, Color, DirectionalLight, Group, HemisphereLight,
  LoopOnce, Mesh, MeshStandardMaterial, Object3D, OrthographicCamera, PCFSoftShadowMap,
  PlaneGeometry, Scene, ShadowMaterial, SkinnedMesh, SRGBColorSpace, Vector3, WebGLRenderer,
  type AnimationAction, type Material, type Skeleton, type Texture,
} from 'three'
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js'
import { isForeground, onAppVisibility } from '@/platform/lifecycle'
import { watchDeviceOrientation } from '@/platform/orientation'
import { AUTHORED_FPS, compassAmount, HANDOFF_FRAME, SENSOR_FRAME, unwrapHeading, worldOpacity } from './sceneMath'
import { createSceneMotion } from './sceneMotion'
import { createResolutionGovernor, drawDue } from './scenePerformance'

type CameraFrame = { position: [number, number, number]; target: [number, number, number]; width: number }
type Timeline = { fps: number; frameStart: number; frameEnd: number; camera: CameraFrame[] }
type Options = { branch?: 'choice' | 'participant' | 'organizer'; targetFrame: number; reducedMotion: boolean; onReady: () => void; onError: () => void }
export interface SceneRuntime { setTarget: (frame: number, reducedMotion: boolean) => void; dispose: () => void }
const assets = `${import.meta.env.BASE_URL}onboarding/`
const scratch = new Vector3()
const cameraPosition = new Vector3()
const cameraTarget = new Vector3()

function disposeModel(root: Object3D) {
  const geometries = new Set<Mesh['geometry']>()
  const materials = new Set<Material>()
  const textures = new Set<Texture>()
  const skeletons = new Set<Skeleton>()
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return
    if (object instanceof SkinnedMesh) skeletons.add(object.skeleton)
    geometries.add(object.geometry)
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      materials.add(material)
      for (const value of Object.values(material)) {
        if (value && typeof value === 'object' && 'isTexture' in value && value.isTexture) textures.add(value as Texture)
      }
    }
  })
  textures.forEach((texture) => {
    texture.dispose()
    const image: unknown = texture.source.data
    if (typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap) image.close()
  })
  materials.forEach((material) => material.dispose())
  geometries.forEach((geometry) => geometry.dispose())
  skeletons.forEach((skeleton) => skeleton.dispose())
}

/** Owns a single WebGL context. GLB animation time can move in either direction. */
export function createSceneRuntime(host: HTMLDivElement, options: Options): SceneRuntime {
  const branch = options.branch ?? 'participant'
  const worldFile = branch === 'choice' ? 'role-choice.glb' : branch === 'organizer' ? 'organizer-world.glb' : 'world.glb'
  const timelineFile = branch === 'choice' ? 'role-choice-timeline.json' : branch === 'organizer' ? 'organizer-timeline.json' : 'timeline.json'
  const renderer = new WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' })
  const governor = createResolutionGovernor(window.devicePixelRatio || 1)
  renderer.setPixelRatio(governor.pixelRatio)
  renderer.outputColorSpace = SRGBColorSpace
  renderer.toneMapping = AgXToneMapping
  renderer.toneMappingExposure = 1
  renderer.setClearColor(0, 0)
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = PCFSoftShadowMap
  renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;pointer-events:none'
  renderer.domElement.setAttribute('aria-hidden', 'true')
  host.append(renderer.domElement)
  host.dataset.state = 'loading'
  host.dataset.branch = branch

  const scene = new Scene()
  const camera = new OrthographicCamera(-4, 4, 4, -4, .05, 100)
  scene.add(new HemisphereLight(new Color('#e4ecf0'), new Color('#67634a'), 1.4))
  const light = new DirectionalLight(new Color('#fff0d4'), 2.6)
  light.position.set(-8, 14, 10)
  light.castShadow = true
  light.shadow.mapSize.set(1024, 1024)
  light.shadow.camera.left = light.shadow.camera.bottom = -13
  light.shadow.camera.right = light.shadow.camera.top = 13
  light.shadow.camera.near = .5
  light.shadow.camera.far = 45
  light.shadow.normalBias = .03
  light.shadow.bias = -.0002
  scene.add(light, light.target)
  const rim = new DirectionalLight(new Color('#e4f1e9'), 1.3)
  rim.position.set(0, 12, -12)
  scene.add(rim)
  const shadowMaterial = new ShadowMaterial({ opacity: .07, transparent: true, depthWrite: false })
  const shadow = new Mesh(new PlaneGeometry(80, 80), shadowMaterial)
  shadow.rotation.x = -Math.PI / 2
  shadow.position.y = -.49
  shadow.receiveShadow = true
  scene.add(shadow)

  const compassRig = new Group()
  const compassTilt = new Group()
  const compassFace = new Group()
  // Blender's XY compass becomes XZ in glTF; face it toward the camera.
  compassFace.rotation.x = Math.PI / 2
  compassRig.add(compassTilt)
  compassTilt.add(compassFace)
  scene.add(compassRig)
  const abort = new AbortController()
  const loader = new GLTFLoader()
  let disposed = false
  let failed = false
  let ready = false
  let raf = 0
  let previous = 0
  let previousRender = 0
  let previousDrewWorld = false
  const motion = createSceneMotion(options.targetFrame, options.reducedMotion)
  let timeline: Timeline | undefined
  let world: Object3D | undefined
  let compass: Object3D | undefined
  let needle: Object3D | undefined
  let mixer: AnimationMixer | undefined
  let action: AnimationAction | undefined
  let worldRequest: Promise<void> | undefined
  const worldMaterials: MeshStandardMaterial[] = []
  let worldTransparent = false
  let worldOpacityApplied = 1
  let mixerTime = -1
  const animatedScaleNodes: Object3D[] = []
  let stopSensors: (() => void) | undefined
  let measuredHeading = 0
  let heading = 0
  let measuredPitch = 0
  let measuredRoll = 0
  let pitch = 0
  let roll = 0
  let sensorAt = -Infinity
  let width = 1
  let height = 1
  let stageWidth = 1
  let stageHeight = 1
  let centerX = .5
  let centerY = .3

  const fail = () => {
    if (disposed || failed) return
    failed = true
    host.dataset.state = 'error'
    cancelAnimationFrame(raf)
    raf = 0
    stopSensors?.()
    stopSensors = undefined
    abort.abort()
    options.onError()
  }
  const lost = (event: Event) => { event.preventDefault(); fail() }
  renderer.domElement.addEventListener('webglcontextlost', lost)

  const load = async (file: string): Promise<GLTF> => {
    const response = await fetch(assets + file, { signal: abort.signal })
    if (!response.ok) throw new Error(`Could not load ${file}`)
    const gltf = await loader.parseAsync(await response.arrayBuffer(), assets)
    if (disposed || failed) { disposeModel(gltf.scene); throw new Error('Scene disposed') }
    return gltf
  }

  const loadWorld = () => {
    if (worldRequest) return worldRequest
    worldRequest = Promise.all([
      load(worldFile),
      fetch(assets + timelineFile, { signal: abort.signal }).then(async (response) => {
        if (!response.ok) throw new Error('Could not load timeline')
        const data: Timeline = await response.json()
        if (data.camera.length !== 864 || data.fps !== 24) throw new Error('Invalid scene timeline')
        return data
      }),
    ]).then(([gltf, data]) => {
      if (disposed || failed) { disposeModel(gltf.scene); return }
      timeline = data
      world = gltf.scene
      world.traverse((object) => {
        if (!(object instanceof Mesh)) return
        object.castShadow = true
        object.receiveShadow = true
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
          if (!(material instanceof MeshStandardMaterial) || worldMaterials.includes(material)) continue
          // Every authored material is double sided. Transparent double-sided materials render
          // twice per mesh in three.js unless forced to one pass, and transparency itself is only
          // needed while the world fades; setWorldTransparency toggles it around that window.
          material.transparent = false
          material.forceSinglePass = true
          worldMaterials.push(material)
        }
      })
      mixer = new AnimationMixer(world)
      if (gltf.animations.length) {
        for (const track of gltf.animations[0].tracks) {
          if (!track.name.endsWith('.scale')) continue
          const name = track.name.slice(0, -6)
          const node = world.getObjectByName(name) ?? world.getObjectByProperty('uuid', name)
          if (node) animatedScaleNodes.push(node)
        }
        action = mixer.clipAction(gltf.animations[0])
        action.setLoop(LoopOnce, 1)
        action.clampWhenFinished = true
        action.play()
      }
      scene.add(world)
      // Worlds loaded after the first paint (role choice to a story) warm their shaders here.
      if (ready) warmWorldPrograms()
      wake()
    })
    return worldRequest
  }

  /** Switching transparency changes the shader program; both variants are compiled once
   * at load (see warmWorldPrograms), so later toggles only look them up. */
  function setWorldTransparency(transparent: boolean) {
    if (worldTransparent === transparent) return
    worldTransparent = transparent
    for (const material of worldMaterials) {
      material.transparent = transparent
      material.needsUpdate = true
    }
  }

  function warmWorldPrograms() {
    if (!world || !worldMaterials.length) return
    setWorldTransparency(true)
    // Warming is an optimization only: without it the fade compiles its shaders on first use.
    try { renderer.compile(scene, camera) } catch { /* fall back to lazy compilation */ }
    setWorldTransparency(false)
  }

  function applyPixelRatio(ratio: number) {
    renderer.setPixelRatio(ratio)
    host.dataset.pixelRatio = ratio.toFixed(2)
  }

  function sensors() {
    const active = ready && !motion.reduced && isForeground() && motion.frame >= SENSOR_FRAME && motion.towardCompass
    if (active && !stopSensors) {
      stopSensors = watchDeviceOrientation((pose) => {
        if (pose.heading !== null) measuredHeading = unwrapHeading(measuredHeading, pose.heading)
        measuredPitch = Math.max(-25, Math.min(25, pose.pitch))
        measuredRoll = Math.max(-25, Math.min(25, pose.roll))
        sensorAt = performance.now()
      })
    } else if (!active && stopSensors) {
      stopSensors()
      stopSensors = undefined
    }
  }

  function pose(dt: number, now: number) {
    const frame = motion.frame
    const reduced = motion.reduced
    const amount = compassAmount(frame)
    const cameraTime = motion.cameraFrame
    const index = Math.max(0, Math.min(863, Math.floor(cameraTime) - 1))
    const a = timeline?.camera[index]
    const b = timeline?.camera[Math.min(index + 1, 863)]
    const fraction = cameraTime - Math.floor(cameraTime)
    const position = a ? cameraPosition.set(...a.position) : cameraPosition.set(8.9, 11, 10.9)
    const target = a ? cameraTarget.set(...a.target) : cameraTarget.set(.1, .5, -1.7)
    if (a && b) {
      position.lerp(scratch.set(...b.position), fraction)
      target.lerp(scratch.set(...b.target), fraction)
    }
    camera.position.copy(position)
    camera.lookAt(target)
    // Fit the reference 4:3 camera within the actual space left by the DOM copy.
    const referenceWidth = (a && b ? a.width + (b.width - a.width) * fraction : 9) * (1 - amount * .42)
    const viewWidth = referenceWidth * Math.max(1, (stageWidth / stageHeight) / (4 / 3)) * (width / stageWidth)
    const viewHeight = viewWidth * height / width
    const x = (.5 - centerX) * viewWidth
    const y = (centerY - .5) * viewHeight
    camera.left = -viewWidth / 2 + x
    camera.right = viewWidth / 2 + x
    camera.top = viewHeight / 2 + y
    camera.bottom = -viewHeight / 2 + y
    camera.updateProjectionMatrix()

    const opacity = worldOpacity(frame)
    if (world && mixer) {
      world.visible = opacity > .001
      if (world.visible) {
        const time = (motion.storyFrame - 1) / AUTHORED_FPS
        if (time !== mixerTime) {
          mixerTime = time
          if (action) { action.enabled = true; action.paused = false }
          mixer.setTime(time)
          // A zero-scale pop animation still incurs GPU work unless it is hidden.
          // Only authored animated transforms qualify, never glTF quantization scales.
          for (const node of animatedScaleNodes) node.visible = Math.max(Math.abs(node.scale.x), Math.abs(node.scale.y), Math.abs(node.scale.z)) > .0005
        }
        setWorldTransparency(opacity < 1)
        if (opacity !== worldOpacityApplied) {
          worldOpacityApplied = opacity
          for (const material of worldMaterials) material.opacity = opacity
        }
      }
    }
    shadow.visible = !!world && opacity > .001
    shadowMaterial.opacity = opacity * .07
    renderer.shadowMap.autoUpdate = !!world && opacity > .001
    compassRig.visible = amount > .001 && !!compass
    compassRig.position.copy(target)
    compassRig.quaternion.copy(camera.quaternion)
    compassRig.scale.setScalar(amount)
    const fresh = now - sensorAt < 2000
    const ease = 1 - Math.exp(-9 * dt)
    heading += (measuredHeading - heading) * ease
    pitch += ((fresh ? measuredPitch : 0) - pitch) * ease
    roll += ((fresh ? measuredRoll : 0) - roll) * ease
    // Subtle physical tilt belongs to the case; only the needle follows heading.
    const idleTilt = fresh || reduced ? 0 : Math.sin(now / 3500) * .045
    compassTilt.rotation.set(-.08 + pitch * Math.PI / 180 * .4 + idleTilt, .04 - roll * Math.PI / 180 * .4 + idleTilt * .5, 0)
    if (needle) needle.rotation.y = reduced ? 0 : heading * Math.PI / 180
    const frameLabel = frame.toFixed(2)
    if (host.dataset.frame !== frameLabel) host.dataset.frame = frameLabel
    const opacityLabel = opacity.toFixed(3)
    if (host.dataset.worldOpacity !== opacityLabel) host.dataset.worldOpacity = opacityLabel
  }

  function tick(now: number) {
    raf = 0
    if (disposed || failed || !isForeground()) return
    const dt = previous ? (now - previous) / 1000 : 1 / 30
    // The first frame after a world draw arrives late exactly when that draw was expensive.
    if (previousDrewWorld && previous) {
      const ratio = governor.sample(now - previousRender)
      if (ratio !== undefined) applyPixelRatio(ratio)
    }
    previousDrewWorld = false
    previous = now
    if ((motion.towardCompass || world) && ready) motion.advance(dt)
    sensors()
    // 30 fps drawing with a measured pixel ratio keeps this decorative screen modest on phones.
    const draw = drawDue(now, previousRender)
    if (draw) {
      pose(Math.min(.05, (now - previousRender) / 1000), now)
      renderer.render(scene, camera)
      previousRender = now
      previousDrewWorld = !!world?.visible
    }
    if (!draw || !motion.settled || (motion.frame >= SENSOR_FRAME && !motion.reduced)) raf = requestAnimationFrame(tick)
  }

  function wake() {
    if (!disposed && !failed && !raf && isForeground()) {
      previous = 0
      raf = requestAnimationFrame(tick)
    }
  }

  function resize() {
    const rect = host.getBoundingClientRect()
    width = Math.max(1, rect.width)
    height = Math.max(1, rect.height)
    const experience = host.closest('.onboarding-experience')
    const overlay = experience?.querySelector('.onboarding-overlay')?.getBoundingClientRect()
    const header = experience?.querySelector('.onboarding-header')?.getBoundingClientRect()
    const headerBottom = Math.max(24, (header?.bottom ?? rect.top + 64) - rect.top)
    const landscape = width >= 640 && height <= 520
    if (landscape) {
      stageWidth = width * .49
      stageHeight = Math.max(160, height - headerBottom)
      centerX = .25
      centerY = (headerBottom + stageHeight / 2) / height
    } else {
      stageWidth = width * .96
      const end = Math.min(height * .65, (overlay?.top ?? rect.top + height * .6) - rect.top + 12)
      stageHeight = Math.max(150, end - headerBottom)
      centerX = .5
      centerY = (headerBottom + stageHeight / 2) / height
    }
    renderer.setSize(width, height, false)
    wake()
  }
  const observer = new ResizeObserver(resize)
  observer.observe(host)
  const experience = host.closest('.onboarding-experience')
  for (const element of experience?.querySelectorAll('.onboarding-overlay,.onboarding-header') ?? []) observer.observe(element)
  const stopVisibility = onAppVisibility((active) => {
    sensors()
    if (active) wake()
    else { cancelAnimationFrame(raf); raf = 0 }
  })
  const timeout = window.setTimeout(() => { if (!ready) fail() }, 25000)
  resize()
  void Promise.all([
    load('compass.glb').then((gltf) => {
      compass = gltf.scene
      needle = compass.getObjectByName('PF_CompassNeedle')
      if (!needle) { disposeModel(compass); compass = undefined; throw new Error('Missing compass needle') }
      compassFace.add(compass)
    }),
    motion.towardCompass ? Promise.resolve() : loadWorld(),
  ]).then(() => {
    if (disposed || failed) return
    ready = true
    window.clearTimeout(timeout)
    host.dataset.pixelRatio = governor.pixelRatio.toFixed(2)
    pose(1 / 30, performance.now())
    renderer.render(scene, camera)
    warmWorldPrograms()
    host.dataset.state = 'ready'
    options.onReady()
    wake()
  }).catch(fail)

  return {
    setTarget(next, reducedMotion) {
      motion.setTarget(next, reducedMotion)
      if (motion.target < HANDOFF_FRAME && !worldRequest) void loadWorld().catch(fail)
      sensors()
      resize()
    },
    dispose() {
      disposed = true
      abort.abort()
      window.clearTimeout(timeout)
      cancelAnimationFrame(raf)
      observer.disconnect()
      stopVisibility()
      stopSensors?.()
      mixer?.stopAllAction()
      if (world) { mixer?.uncacheRoot(world); disposeModel(world) }
      if (compass) disposeModel(compass)
      shadow.geometry.dispose()
      shadowMaterial.dispose()
      light.shadow.map?.dispose()
      renderer.domElement.removeEventListener('webglcontextlost', lost)
      renderer.renderLists.dispose()
      renderer.dispose()
      renderer.forceContextLoss()
      renderer.domElement.remove()
    },
  }
}
