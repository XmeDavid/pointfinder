import { expect, test, type Page } from '@playwright/test'
const experience = (page: Page) => page.getByTestId('onboarding-experience')
const image = (page: Page) => page.locator('.onboarding-still')
const ready = async (page: Page) => {
  await expect(image(page)).toBeVisible()
  await expect(page.getByTestId('onboarding-scene')).toHaveAttribute('data-state', 'ready')
}

test('four illustrated steps stay manual, support dots and keyboard, and never request a 3D scene', async ({ page }) => {
  const worlds: string[] = []
  page.on('request', r => { if (/\.glb(?:\?|$)|OnboardingScene.*\.js/.test(r.url())) worlds.push(r.url()) })
  await page.goto('/welcome'); await ready(page)
  await page.getByTestId('onboarding-role-participant').click(); await ready(page)
  await page.waitForTimeout(2500)
  await expect(experience(page)).toHaveAttribute('data-step', 'join')
  await expect(page.getByTestId('onboarding-autoplay')).toHaveCount(0)
  await page.getByTestId('onboarding-dot-3').focus(); await page.keyboard.press('Enter')
  await expect(experience(page)).toHaveAttribute('data-step', 'checkin')
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused()
  await page.getByTestId('onboarding-back').click(); await expect(experience(page)).toHaveAttribute('data-step', 'map')
  await page.getByTestId('onboarding-dot-4').click(); await page.getByTestId('onboarding-next').click()
  await expect(experience(page)).toHaveAttribute('data-step', 'compass')
  await expect(page.locator('canvas')).toHaveCount(0)
  expect(worlds).toEqual([])
})

test('horizontal swipes navigate, vertical gestures and canceled pointers do not', async ({ page }) => {
  await page.goto('/welcome'); await page.getByTestId('onboarding-role-participant').click()
  const story = page.locator('.onboarding-story')
  const gesture = async (dx: number, dy: number, cancel = false) => {
    await story.dispatchEvent('pointerdown', { pointerId: 1, pointerType: 'touch', isPrimary: true, clientX: 200, clientY: 200 })
    await story.dispatchEvent(cancel ? 'pointercancel' : 'pointerup', { pointerId: 1, pointerType: 'touch', isPrimary: true, clientX: 200 + dx, clientY: 200 + dy })
  }
  await gesture(-100, 10); await expect(experience(page)).toHaveAttribute('data-step', 'map')
  await gesture(-10, 100); await expect(experience(page)).toHaveAttribute('data-step', 'map')
  await gesture(-100, 0, true); await expect(experience(page)).toHaveAttribute('data-step', 'map')
  await gesture(100, 0); await expect(experience(page)).toHaveAttribute('data-step', 'join')
})

test('blocked artwork is recoverable and never blocks joining or story progression', async ({ page }) => {
  await page.route('**/onboarding/stories/**', r => r.abort())
  await page.goto('/welcome'); await expect(page.getByRole('status')).toContainText('Illustration unavailable')
  await page.getByTestId('onboarding-role-participant').click(); await page.getByTestId('onboarding-next').click()
  await expect(experience(page)).toHaveAttribute('data-step', 'map')
  await page.unroute('**/onboarding/stories/**')
  await page.getByRole('button', { name: 'Retry image' }).click(); await ready(page)
  await page.getByTestId('onboarding-skip').click(); await expect(experience(page)).toHaveAttribute('data-step', 'compass')
})

test('both stories fit phones and desktop without covering artwork; all languages and themes', async ({ page }, info) => {
  test.setTimeout(120000)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/welcome'); await page.getByTestId('onboarding-role-participant').click()
  for (const width of [320, 390, 768, 1280, 1600]) {
    await page.setViewportSize({ width, height: width === 320 ? 568 : 844 })
    for (const language of ['en', 'pt', 'de']) {
      await page.getByRole('combobox').selectOption(language)
      for (const dark of [false, true]) {
        await page.evaluate(d => document.documentElement.classList.toggle('dark', d), dark)
        await ready(page)
        const art = await page.getByTestId('onboarding-scene').boundingBox()
        const copy = await page.locator('.onboarding-overlay').boundingBox()
        expect(art && copy && (art.y + art.height <= copy.y + 1 || art.x + art.width <= copy.x)).toBeTruthy()
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
        await expect(page.getByTestId('onboarding-next')).toBeVisible()
        if (language === 'en') await page.screenshot({ path: `test-results/story-${info.project.name}-${width}${dark ? '-dark' : ''}.png`, fullPage: true, animations: 'disabled' })
      }
    }
  }
  await page.setViewportSize({ width: 844, height: 390 })
  await page.getByTestId('onboarding-change-role').click(); await page.getByTestId('onboarding-role-organizer').click()
  await page.getByTestId('onboarding-gate-watch').click()
  for (const chapter of ['plan', 'teams', 'live']) {
    await expect(experience(page)).toHaveAttribute('data-step', chapter); await ready(page); await page.getByTestId('onboarding-next').click()
  }
  await expect(page.getByTestId('onboarding-landing-create-account')).toBeVisible()
})
