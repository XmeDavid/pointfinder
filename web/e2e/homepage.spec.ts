import { expect, test, type Page } from '@playwright/test'

/**
 * The public website on the browser build: navigation from a phone and a
 * keyboard, the three languages, both themes, reduced motion, missing images
 * and the promise that the page never scrolls sideways.
 */

const overflowFree = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)

const heading = { en: 'Turn any place into an adventure.', pt: 'Transforma qualquer lugar numa aventura.', de: 'Mach jeden Ort zum Abenteuer.' } as const
const getStarted = { en: 'Get started', pt: 'Começar', de: 'Loslegen' } as const

test.beforeEach(async ({ page }, info) => {
  test.skip(info.project.name !== 'browser', 'The homepage is the browser build; native opens the welcome world')
  await page.emulateMedia({ reducedMotion: 'reduce' })
})

test('stays within the viewport in every language and theme, from a small phone to a wide desktop', async ({ page }) => {
  await page.goto('/')
  for (const width of [320, 390, 768, 1024, 1280, 1600]) {
    await page.setViewportSize({ width, height: 900 })
    for (const dark of [false, true]) {
      await page.evaluate((value) => document.documentElement.classList.toggle('dark', value), dark)
      for (const language of ['en', 'pt', 'de'] as const) {
        // On phones the language picker lives inside the menu.
        if (width < 768) {
          await page.getByTestId('landing-menu-toggle').click()
          await page.getByTestId('landing-menu').getByTestId('landing-language').selectOption(language)
          await page.keyboard.press('Escape')
        } else {
          await page.getByTestId('landing-language').first().selectOption(language)
        }
        await expect(page.getByRole('heading', { level: 1 })).toContainText(heading[language])
        await expect(page.getByRole('link', { name: getStarted[language] }).first()).toBeVisible()
        expect(await overflowFree(page), `${width}px ${dark ? 'dark' : 'light'} ${language}`).toBe(true)
        // Sections keep their width all the way down the page.
        await page.mouse.wheel(0, 20000)
        expect(await overflowFree(page), `${width}px ${dark ? 'dark' : 'light'} ${language} scrolled`).toBe(true)
        await page.mouse.wheel(0, -20000)
      }
    }
  }
})

test('the phone menu opens and closes from the keyboard and reaches every section', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  const toggle = page.getByTestId('landing-menu-toggle')
  const menu = page.getByTestId('landing-menu')
  await expect(menu).toBeHidden()

  await toggle.focus()
  await page.keyboard.press('Enter')
  await expect(menu).toBeVisible()
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await expect(menu.getByRole('link', { name: 'How it works' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(menu).toBeHidden()
  await expect(toggle).toBeFocused()

  await toggle.click()
  await menu.getByRole('link', { name: 'Pricing' }).click()
  await expect(menu).toBeHidden()
  await expect(page.locator('#pricing')).toBeInViewport()
  await expect(page.getByRole('link', { name: 'Start free' })).toHaveAttribute('href', '/welcome?role=organizer')

  // The theme and language live inside the menu on a phone.
  await toggle.click()
  await menu.getByTestId('landing-theme-toggle').click()
  await expect(page.locator('html')).toHaveClass(/dark/)
  await menu.getByTestId('landing-language').selectOption('de')
  await expect(page.getByRole('heading', { level: 1 })).toContainText(heading.de)
  await page.reload()
  await expect(page.locator('html')).toHaveClass(/dark/)
  await expect(page.getByRole('heading', { level: 1 })).toContainText(heading.de)
  await expect(page.locator('html')).toHaveAttribute('lang', 'de')
})

test('a keyboard reaches the skip link, the sections and the welcome world on a desktop', async ({ page }) => {
  await page.goto('/')
  // The app shell renders after its async start; wait for the page before tabbing.
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('#main')).toBeFocused()
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'For organizers' }).focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('#organizers')).toBeInViewport()
  await page.getByTestId('landing-theme-toggle').first().focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('html')).toHaveClass(/dark/)
  await page.getByRole('link', { name: 'Get started' }).first().focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/welcome$/)
  await expect(page.getByTestId('onboarding-experience')).toHaveAttribute('data-step', 'choice')
})

test('reads fine when every image is blocked and no hero motion plays under reduced motion', async ({ page }) => {
  await page.route(/\/(onboarding|landing)\/.*\.(webp|png|svg)$/, (route) => route.abort())
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  // Force lazy artwork to load too, so every failed image collapses.
  for (const section of ['how-it-works', 'organizers', 'pricing']) {
    await page.locator(`#${section}`).scrollIntoViewIfNeeded()
  }
  await expect(page.locator('#how-it-works img')).toHaveCount(0)
  await expect(page.getByTestId('landing-artwork-fallback')).toHaveCount(0)
  await expect(page.locator('.landing-workspace-screen')).toBeHidden()
  await expect(page.getByRole('heading', { name: 'Out in the field. Always in the loop.' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Your next adventure starts here.' })).toBeVisible()
  expect(await page.locator('.landing-reveal').first().evaluate((el) => getComputedStyle(el).animationName)).toBe('none')
  expect(await page.locator('.landing-page').evaluate((el) => getComputedStyle(el).transitionProperty)).toBe('none')
  expect(await overflowFree(page)).toBe(true)
  await page.setViewportSize({ width: 320, height: 568 })
  expect(await overflowFree(page)).toBe(true)
})

test('plays the hero arrival once when motion is allowed', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/')
  expect(await page.locator('.landing-reveal').first().evaluate((el) => getComputedStyle(el).animationName)).toBe('landingReveal')
  await expect(page.locator('.landing-page')).toHaveCSS('transition-property', 'opacity')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
})

test('the hero keeps the whole scene in view and every illustration is the imported artwork', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  const hero = page.getByRole('img', { name: /Three explorers on a forest trail/ })
  await expect(hero).toHaveAttribute('src', '/landing/illustrated/hero.webp')
  await expect(hero).toHaveJSProperty('naturalWidth', 1536)
  for (const width of [320, 390, 639, 640, 768, 1000, 1024, 1280, 1600]) {
    await page.setViewportSize({ width, height: 900 })
    const box = await hero.boundingBox()
    expect(box, `${width}px hero`).not.toBeNull()
    expect(box!.x, `${width}px left edge`).toBe(0)
    expect(box!.width, `${width}px full-width scene`).toBe(width)
    await expect(hero).toHaveCSS('object-position', width >= 768 ? '0% 78%' : '75% 78%')
    const section = await page.locator('.landing-hero').boundingBox()
    expect(box!.y, `${width}px image starts at hero top`).toBeCloseTo(section!.y, 0)
    expect(box!.height, `${width}px image covers hero height`).toBeCloseTo(section!.height, 0)
    if (width < 768) {
      const action = await page.locator('.landing-hero-actions a').first().boundingBox()
      // Keep the actions beneath the faces in the portrait crop.
      expect(action!.y - section!.y, `${width}px actions clear the faces`).toBeGreaterThan(section!.height * 0.65)
    }
    // The scene is 3:2; the visible crop never gets so wide that the characters would be cut.
    expect(box!.width / box!.height, `${width}px hero aspect`).toBeLessThanOrEqual(2.05)
    expect(await overflowFree(page)).toBe(true)
  }
  for (const src of ['step-plan-mascot-v2', 'step-explore-mascot-v2', 'step-checkin-mascot-v2', 'guide-pointing-mascot-v2', 'workspace-preview', 'forest-footer']) {
    const image = page.locator(`img[src="/landing/illustrated/${src}.webp"]`)
    await image.scrollIntoViewIfNeeded()
    await expect(image).toHaveJSProperty('complete', true)
    expect(await image.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
  }
  for (const width of [390, 768, 1280, 1600]) {
    await page.setViewportSize({ width, height: 844 })
    for (const dark of [false, true]) {
      await page.evaluate(value => document.documentElement.classList.toggle('dark', value), dark)
      for (const section of ['how-it-works', 'organizers']) {
        await page.locator(`#${section}`).scrollIntoViewIfNeeded()
        await page.locator(`#${section}`).screenshot({ path: `test-results/mascot-${section}-${width}-${dark ? 'dark' : 'light'}.png`, animations: 'disabled' })
      }
    }
  }
  await expect(page.getByTestId('landing-map-attribution').getByRole('link', { name: 'OpenStreetMap' })).toHaveAttribute('href', 'https://www.openstreetmap.org/copyright')
  await expect(page.getByTestId('landing-map-attribution').getByRole('link', { name: 'CARTO' })).toHaveAttribute('href', 'https://carto.com/attributions')
})
