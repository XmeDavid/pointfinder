import { expect, test, type Page } from '@playwright/test'

type Gltf = { skins?: { joints: number[] }[]; animations?: { channels: { target: { node: number; path: string } }[] }[] }

/** Reads the JSON chunk of a binary glTF served by the app. */
async function readGlb(page: Page, path: string): Promise<Gltf> {
  const asset = await page.request.get(path)
  expect(asset.ok(), path).toBeTruthy()
  const bytes = await asset.body()
  return JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString()) as Gltf
}

const movingJoints = (gltf: Gltf) => new Set((gltf.animations ?? []).flatMap((clip) => clip.channels)
  .filter((channel) => channel.target.path === 'rotation').map((channel) => channel.target.node))

/** Records which world files the page itself fetched, by file name. */
function trackWorlds(page: Page) {
  const requests: string[] = []
  page.on('request', (request) => {
    const match = /\/onboarding\/([^/?]+\.glb)$/.exec(request.url())
    if (match && match[1] !== 'compass.glb') requests.push(match[1])
  })
  return requests
}

const scene = (page: Page) => page.getByTestId('onboarding-scene')
const at = (page: Page, frame: number) => page.waitForFunction(
  (value) => Math.abs(Number(document.querySelector('[data-testid="onboarding-scene"]')?.getAttribute('data-frame')) - value) < .1,
  frame, { timeout: 30_000 },
)
const ready = async (page: Page, branch: string) => {
  await expect(scene(page)).toHaveAttribute('data-branch', branch, { timeout: 30_000 })
  await expect(scene(page)).toHaveAttribute('data-state', 'ready', { timeout: 30_000 })
  await expect(scene(page).locator('canvas')).toBeVisible()
}

test('selecting either role never shows the completed first-step poster while its world loads', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  for (const branch of ['participant', 'organizer']) {
    await page.goto('/welcome')
    await ready(page, 'choice')
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const asset = branch === 'participant' ? '**/onboarding/world.glb' : '**/onboarding/organizer-world.glb'
    await page.route(asset, async (route) => { await gate; await route.continue() })
    try {
      await page.getByTestId(`onboarding-role-${branch}`).click()
      await expect(scene(page)).toHaveAttribute('data-branch', branch)
      await expect(scene(page)).toHaveClass(/invisible/)
      await expect(page.locator('.onboarding-still')).toHaveCount(0)
      await expect(page.getByRole('status')).toHaveText(/Loading/)
    } finally { release() }
    await ready(page, branch)
    await expect(page.locator('.onboarding-still')).toHaveCount(0)
    await page.unroute(asset)
  }
})

test('native onboarding renders the participant GLBs for the participant story, reverses chapters, fades the world and recovers its WebGL context', async ({ page }, info) => {
  test.skip(info.project.name !== 'native-shell', 'The public browser website keeps its existing entry')
  test.setTimeout(180_000)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  const worlds = trackWorlds(page)
  await page.goto('/')
  // The welcome world must contain the reusable, animated character skins,
  // rather than a static bake of the old figures or of a single new pose.
  const gltf = await readGlb(page, '/onboarding/world.glb')
  expect(gltf.skins).toHaveLength(3)
  const moving = movingJoints(gltf)
  for (const skin of gltf.skins ?? []) {
    expect(skin.joints).toHaveLength(17)
    expect(skin.joints.some((joint) => moving.has(joint))).toBeTruthy()
  }
  await ready(page, 'choice')
  await at(page, 125)
  expect(worlds).toEqual(['role-choice.glb'])
  // Role selection starts the real participant world without leaving onboarding.
  worlds.length = 0
  await page.getByTestId('onboarding-role-participant').click()
  await expect(page.getByTestId('onboarding-experience')).toHaveAttribute('data-role', 'participant')
  await ready(page, 'participant')
  await page.getByTestId('onboarding-autoplay').click()
  await expect(page.getByTestId('onboarding-autoplay')).toHaveAttribute('aria-pressed', 'false')
  await at(page, 125)
  await page.getByTestId('onboarding-next').click()
  await at(page, 301)
  await page.getByTestId('onboarding-back').click()
  await at(page, 125)
  for (let step = 0; step < 5; step++) await page.getByTestId('onboarding-next').click()
  await at(page, 765)
  await page.screenshot({ path: 'test-results/live-onboarding-world.png' })
  await page.getByTestId('onboarding-next').click()
  await expect(scene(page)).toHaveAttribute('data-world-opacity', '0.000', { timeout: 15_000 })
  await at(page, 864)
  await page.screenshot({ path: 'test-results/live-onboarding-compass.png' })
  // Only the chosen story's world was fetched, once.
  expect(worlds.filter((file) => file === 'world.glb')).toHaveLength(1)
  expect(worlds).not.toContain('organizer-world.glb')
  expect(worlds).not.toContain('role-choice.glb')

  // The completed story is remembered on the native home.
  worlds.length = 0
  await page.goto('/')
  await expect(page.getByTestId('onboarding-experience')).toHaveAttribute('data-role', 'participant')
  await expect(page.getByTestId('onboarding-experience')).toHaveAttribute('data-step', 'compass')
  await ready(page, 'participant')
  await at(page, 864)
  expect(worlds).not.toContain('organizer-world.glb')
  expect(worlds).not.toContain('role-choice.glb')

  // Exercise genuine GPU context loss rather than replacing the scene component.
  await scene(page).locator('canvas').evaluate((canvas: HTMLCanvasElement) => {
    const gl = canvas.getContext('webgl2')
    gl?.getExtension('WEBGL_lose_context')?.loseContext()
  })
  await expect(scene(page)).toHaveCount(0)
  await expect(page.locator('.onboarding-still')).toBeVisible()
  await expect(page.locator('a[href="/join"]')).toBeVisible()
  await page.locator('.onboarding-status button').click()
  await ready(page, 'participant')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(scene(page)).toHaveCount(0)
  await expect(page.locator('.onboarding-still')).toBeVisible()
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await ready(page, 'participant')
  await expect(page.locator('.onboarding-still')).toHaveCount(0)
  await page.locator('a[href="/join"]').click()
  await expect(page).toHaveURL(/\/join$/)
  await expect(page.locator('[data-testid="onboarding-scene"] canvas')).toHaveCount(0)
})

test('native onboarding renders the organizer world behind the account gate only when chosen, reverses its chapters and switches role without reloading', async ({ page }, info) => {
  test.skip(info.project.name !== 'native-shell', 'The public browser website keeps its existing entry')
  test.setTimeout(180_000)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  const worlds = trackWorlds(page)
  await page.goto('/')
  const gltf = await readGlb(page, '/onboarding/organizer-world.glb')
  const moving = movingJoints(gltf)
  // The organizer world carries at least one animated 17-bone character rig from the shared library.
  expect((gltf.skins ?? []).some((skin) => skin.joints.length === 17 && skin.joints.some((joint) => moving.has(joint)))).toBeTruthy()
  await ready(page, 'choice')
  await at(page, 125)
  await page.getByTestId('onboarding-role-organizer').click()
  await expect(page.getByTestId('onboarding-experience')).toHaveAttribute('data-role', 'organizer')
  await expect(page.getByTestId('onboarding-experience')).toHaveAttribute('data-step', 'gate')
  // The gate already stands in the organizer world, on the first chapter's frame.
  await ready(page, 'organizer')
  await at(page, 125)
  await page.screenshot({ path: 'test-results/live-onboarding-organizer-gate.png' })
  await page.getByTestId('onboarding-gate-watch').click()
  await page.getByTestId('onboarding-autoplay').click()
  await expect(page.getByTestId('onboarding-autoplay')).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByTestId('onboarding-experience')).toHaveAttribute('data-step', 'plan')
  await at(page, 125)
  await page.getByTestId('onboarding-next').click()
  await expect(page.getByTestId('onboarding-experience')).toHaveAttribute('data-step', 'bases')
  await at(page, 301)
  await page.getByTestId('onboarding-next').click()
  await at(page, 371)
  await page.getByTestId('onboarding-back').click()
  await at(page, 301)
  await page.getByTestId('onboarding-back').click()
  await at(page, 125)
  for (let step = 0; step < 5; step++) await page.getByTestId('onboarding-next').click()
  await expect(page.getByTestId('onboarding-experience')).toHaveAttribute('data-step', 'review')
  await at(page, 765)
  await page.screenshot({ path: 'test-results/live-onboarding-organizer-world.png' })
  await page.getByTestId('onboarding-next').click()
  await expect(scene(page)).toHaveAttribute('data-world-opacity', '0.000', { timeout: 15_000 })
  await at(page, 864)
  await expect(page.locator('.onboarding-overlay a').first()).toHaveAttribute('href', '/register')
  await expect(page.locator('.onboarding-overlay a[href="/login"]')).toBeVisible()
  await page.screenshot({ path: 'test-results/live-onboarding-organizer-compass.png' })
  expect(worlds.filter((file) => file === 'organizer-world.glb')).toHaveLength(1)
  expect(worlds).not.toContain('world.glb')

  worlds.length = 0
  await page.reload()
  await expect(page.getByTestId('onboarding-experience')).toHaveAttribute('data-role', 'organizer')
  await expect(page.getByTestId('onboarding-experience')).toHaveAttribute('data-step', 'compass')
  await ready(page, 'organizer')
  await at(page, 864)
  expect(worlds).toEqual([])

  // Replay returns to the choice; the gate and the choice swap worlds without a reload or the participant world.
  await page.getByTestId('onboarding-replay').click()
  await expect(page.getByTestId('onboarding-experience')).toHaveAttribute('data-role', 'choice')
  await ready(page, 'choice')
  await at(page, 125)
  await page.getByTestId('onboarding-role-organizer').click()
  await ready(page, 'organizer')
  await at(page, 125)
  await page.getByTestId('onboarding-change-role').click()
  await expect(page.getByTestId('onboarding-experience')).toHaveAttribute('data-role', 'choice')
  await ready(page, 'choice')
  await at(page, 125)
  expect(worlds).not.toContain('world.glb')
  await page.locator('a[href="/login"]').click()
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.locator('[data-testid="onboarding-scene"] canvas')).toHaveCount(0)
})

test('the story automatically advances after each animation, can pause for rereading, and stops at its landing', async ({ page }, info) => {
  test.setTimeout(120_000)
  const organizer = info.project.name === 'native-shell'
  const branch = organizer ? 'organizer' : 'participant'
  const chapters = organizer ? ['plan', 'bases', 'challenges', 'teams', 'live', 'review'] : ['join', 'map', 'checkin', 'challenge', 'submit', 'explore']
  const experience = page.getByTestId('onboarding-experience')
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/welcome')
  await ready(page, 'choice')
  await at(page, 125)
  await page.waitForTimeout(3000)
  await expect(experience).toHaveAttribute('data-step', 'choice')
  await page.getByTestId(`onboarding-role-${branch}`).click()
  await ready(page, branch)
  if (organizer) {
    await at(page, 125)
    await page.waitForTimeout(3000)
    await expect(experience).toHaveAttribute('data-step', 'gate')
    await page.getByTestId('onboarding-gate-watch').click()
  }
  await expect(page.getByTestId('onboarding-autoplay')).toHaveAttribute('aria-pressed', 'true')
  await expect(experience).toHaveAttribute('data-step', chapters[1], { timeout: 20_000 })
  await page.getByTestId('onboarding-back').click()
  await at(page, 125)
  await expect(page.getByTestId('onboarding-autoplay')).toHaveAttribute('aria-pressed', 'false')
  await page.waitForTimeout(3000)
  await expect(experience).toHaveAttribute('data-step', chapters[0])
  // The extra control must remain reachable with long copy and compact phones.
  await page.setViewportSize({ width: 320, height: 568 })
  for (const language of ['en', 'pt', 'de']) {
    await page.getByRole('combobox').selectOption(language)
    for (const dark of [false, true]) {
      await page.evaluate((value) => document.documentElement.classList.toggle('dark', value), dark)
      await expect(page.getByTestId('onboarding-autoplay')).toBeInViewport({ ratio: 1 })
      await expect(page.getByTestId('onboarding-next')).toBeInViewport({ ratio: 1 })
    }
  }
  await page.screenshot({ path: `test-results/onboarding-autoplay-${branch}.png` })
  await page.getByTestId('onboarding-autoplay').click()
  for (const chapter of chapters.slice(1)) {
    await expect(experience).toHaveAttribute('data-step', chapter, { timeout: 20_000 })
  }
  await expect(experience).toHaveAttribute('data-step', 'compass', { timeout: 20_000 })
  await at(page, 864)
  await page.waitForTimeout(3000)
  await expect(page).toHaveURL(/\/welcome$/)
  await expect(experience).toHaveAttribute('data-step', 'compass')
  await expect(page.getByTestId(organizer ? 'onboarding-landing-create-account' : 'onboarding-download-ios')).toBeVisible()
})
