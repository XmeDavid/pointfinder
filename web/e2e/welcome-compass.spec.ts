import { expect, test, type Page } from '@playwright/test'

const experience = (page: Page) => page.getByTestId('onboarding-experience')
const register = (page: Page) => page.locator('.onboarding-overlay a[href="/register"]')
const login = (page: Page) => page.locator('.onboarding-overlay a[href="/login"]')
const join = (page: Page) => page.locator('.onboarding-overlay a[href="/join"]')

test('native welcome opens on a role choice, plays the participant story before joining, gates organizers on an account and remembers the completed story', async ({ page }, info) => {
  test.skip(info.project.name !== 'native-shell', 'The browser home remains the public website')
  // Static fallback checks do not depend on the CI graphics driver.
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await expect(experience(page)).toHaveAttribute('data-role', 'choice')
  await expect(experience(page)).toHaveAttribute('data-step', 'choice')
  await expect(experience(page)).toHaveAttribute('data-mode', 'anonymous')
  await expect(experience(page)).toHaveAttribute('data-motion', 'reduced')
  await expect(experience(page).locator('canvas')).toHaveCount(0)
  await expect(page.locator('.onboarding-still')).toHaveAttribute('src', '/onboarding/stories/participant-map.webp')
  await expect(page.getByTestId('onboarding-role-participant')).toBeVisible()
  await expect(page.getByTestId('onboarding-role-organizer')).toBeVisible()
  await expect(join(page)).toBeVisible()
  await expect(login(page)).toBeVisible()
  await expect(page.getByTestId('onboarding-skip')).toHaveCount(0)

  // Participating starts the story; joining remains an explicit action.
  await page.getByTestId('onboarding-role-participant').click()
  await expect(experience(page)).toHaveAttribute('data-step', 'join')
  await join(page).click()
  await expect(page).toHaveURL(/\/join$/)
  await expect(experience(page)).toHaveCount(0)
  await page.goto('/')
  await expect(experience(page)).toHaveAttribute('data-step', 'choice')

  // Organizing offers an account, a sign-in, or watching first; no registration before watching.
  await page.getByTestId('onboarding-role-organizer').click()
  await expect(experience(page)).toHaveAttribute('data-role', 'organizer')
  await expect(experience(page)).toHaveAttribute('data-step', 'gate')
  await expect(page.locator('.onboarding-still')).toHaveAttribute('src', '/onboarding/stories/organizer-bases.webp')
  await expect(page.getByTestId('onboarding-gate-create-account')).toHaveAttribute('href', '/register')
  await expect(login(page)).toBeVisible()
  await expect(page.getByTestId('onboarding-gate-watch')).toBeVisible()
  await page.getByTestId('onboarding-change-role').click()
  await expect(experience(page)).toHaveAttribute('data-step', 'choice')
  await page.reload()
  // Choosing alone is never remembered.
  await expect(experience(page)).toHaveAttribute('data-step', 'choice')

  await page.getByTestId('onboarding-role-organizer').click()
  await page.getByTestId('onboarding-gate-watch').click()
  await expect(experience(page)).toHaveAttribute('data-step', 'plan')
  await expect(page.getByTestId('onboarding-next')).toHaveText(/Continue/)
  await expect(page.getByTestId('onboarding-back')).toBeEnabled()
  await page.getByTestId('onboarding-back').click()
  await expect(experience(page)).toHaveAttribute('data-step', 'choice')
  await page.getByTestId('onboarding-role-organizer').click()
  await page.getByTestId('onboarding-gate-watch').click()
  await page.getByTestId('onboarding-next').click()
  await expect(experience(page)).toHaveAttribute('data-step', 'teams')
  await expect(page.getByTestId('onboarding-next')).toHaveText(/Continue/)
  await page.getByTestId('onboarding-skip').click()
  await expect(experience(page)).toHaveAttribute('data-step', 'compass')
  await expect(experience(page)).toHaveAttribute('data-role', 'organizer')
  await expect(page.locator('.onboarding-still')).toHaveAttribute('src', '/onboarding/stories/organizer-live.webp')
  // The organizer landing leads with an account and keeps sign-in as the alternative.
  await expect(page.locator('.onboarding-overlay a').first()).toHaveAttribute('href', '/register')
  await expect(login(page)).toBeVisible()
  await expect(join(page)).toHaveCount(0)
  await page.reload()
  await expect(experience(page)).toHaveAttribute('data-role', 'organizer')
  await expect(experience(page)).toHaveAttribute('data-step', 'compass')

  for (const width of [390, 768, 1280, 1600]) {
    await page.setViewportSize({ width, height: 844 })
    for (const dark of [false, true]) {
      await page.evaluate((value) => document.documentElement.classList.toggle('dark', value), dark)
      await expect(register(page)).toBeInViewport({ ratio: 1 })
      await expect(login(page)).toBeInViewport({ ratio: 1 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.screenshot({ path: `test-results/onboarding-${width}-${dark ? 'dark' : 'light'}.png` })
    }
  }
  await page.setViewportSize({ width: 320, height: 568 })
  await page.getByTestId('onboarding-replay').click()
  await expect(experience(page)).toHaveAttribute('data-step', 'choice')
  for (const language of ['en', 'pt', 'de']) {
    await page.getByRole('combobox').selectOption(language)
    await expect(page.getByTestId('onboarding-role-participant')).toBeInViewport({ ratio: 1 })
    await expect(page.getByTestId('onboarding-role-organizer')).toBeInViewport({ ratio: 1 })
    await expect(join(page)).toBeInViewport({ ratio: 1 })
    await expect(login(page)).toBeInViewport({ ratio: 1 })
    await page.screenshot({ path: `test-results/onboarding-choice-320-${language}.png` })
    await page.getByTestId('onboarding-role-organizer').click()
    await expect(page.getByTestId('onboarding-gate-create-account')).toBeInViewport({ ratio: 1 })
    await expect(login(page)).toBeInViewport({ ratio: 1 })
    await expect(page.getByTestId('onboarding-gate-watch')).toBeInViewport({ ratio: 1 })
    await page.screenshot({ path: `test-results/onboarding-gate-320-${language}.png` })
    await page.getByTestId('onboarding-gate-watch').click()
    for (let step = 0; step < 3; step++) {
      await expect(experience(page)).toHaveAttribute('data-role', 'organizer')
      // Long translations scroll on short phones; every action stays reachable.
      for (const control of [join(page), login(page), page.getByTestId('onboarding-next'), page.getByTestId('onboarding-change-role')]) {
        await control.scrollIntoViewIfNeeded()
        await expect(control).toBeInViewport({ ratio: 0.99 })
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.getByTestId('onboarding-next').click()
    }
    await expect(experience(page)).toHaveAttribute('data-step', 'compass')
    await expect(register(page)).toBeInViewport({ ratio: 1 })
    await page.screenshot({ path: `test-results/onboarding-landing-320-${language}-organizer.png` })
    await page.getByTestId('onboarding-replay').click()
    await expect(experience(page)).toHaveAttribute('data-step', 'choice')
  }
  // The participant story itself is reachable directly (the map offers it after joining).
  await page.goto('/welcome?play=participant')
  await expect(experience(page)).toHaveAttribute('data-role', 'participant')
  await expect(experience(page)).toHaveAttribute('data-step', 'join')
  await expect(page.locator('.onboarding-still')).toHaveAttribute('src', '/onboarding/stories/participant-join.webp')
  for (let step = 0; step < 4; step++) {
    // Browser scrolling rounds fractional CSS pixels at the viewport boundary.
    await join(page).scrollIntoViewIfNeeded()
    await expect(join(page)).toBeInViewport({ ratio: 0.99 })
    await login(page).scrollIntoViewIfNeeded()
    await expect(login(page)).toBeInViewport({ ratio: 0.99 })
    await page.getByTestId('onboarding-next').scrollIntoViewIfNeeded()
    await expect(page.getByTestId('onboarding-next')).toBeInViewport({ ratio: 0.99 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.getByTestId('onboarding-next').click()
  }
  await expect(experience(page)).toHaveAttribute('data-step', 'compass')
  await expect(page.locator('.onboarding-overlay a').first()).toHaveAttribute('href', '/join')
  await page.screenshot({ path: 'test-results/onboarding-landing-320-participant.png' })

  // Landscape phones keep the copy beside the world with scrolling available for long copy.
  await page.setViewportSize({ width: 740, height: 360 })
  await page.getByTestId('onboarding-replay').click()
  await expect(experience(page)).toHaveAttribute('data-step', 'choice')
  await page.getByTestId('onboarding-role-organizer').click()
  await expect(page.getByTestId('onboarding-gate-watch')).toBeVisible()
  await page.getByTestId('onboarding-gate-watch').click()
  await expect(page.getByTestId('onboarding-next')).toBeVisible()
  await expect(join(page)).toBeVisible()
  await page.screenshot({ path: 'test-results/onboarding-landscape.png' })
  await page.getByTestId('onboarding-change-role').click()
  await expect(page.getByTestId('onboarding-role-organizer')).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })

  await page.context().setOffline(true)
  await page.getByTestId('onboarding-role-organizer').click()
  await page.getByTestId('onboarding-gate-watch').click()
  await expect(page.getByTestId('onboarding-next')).toBeEnabled()
  await page.context().setOffline(false)
  await join(page).click()
  await expect(page).toHaveURL(/\/join$/)
  await expect(experience(page)).toHaveCount(0)
  await page.goto('/')
  await login(page).click()
  await expect(page.getByTestId('login-email')).toBeVisible()
})

test('native introduction stays usable when illustrations fail', async ({ page }, info) => {
  test.skip(info.project.name !== 'native-shell', 'The browser home remains the public website')
  await page.route('**/onboarding/**', (route) => route.abort())
  await page.goto('/')
  await expect(experience(page)).toHaveAttribute('data-step', 'choice')
  await expect(join(page)).toBeVisible()
  await page.getByTestId('onboarding-role-organizer').click()
  await expect(experience(page)).toHaveAttribute('data-step', 'gate')
  await expect(page.getByTestId('onboarding-gate-create-account')).toBeVisible()
  await page.getByTestId('onboarding-gate-watch').click()
  await expect(experience(page)).toHaveAttribute('data-step', 'plan')
  await page.getByTestId('onboarding-next').click()
  await expect(experience(page)).toHaveAttribute('data-step', 'teams')
  await page.getByTestId('onboarding-skip').click()
  await expect(register(page)).toBeVisible()
  await expect(login(page)).toBeVisible()
  await page.getByTestId('onboarding-replay').click()
  await page.getByTestId('onboarding-role-participant').click()
  await expect(experience(page)).toHaveAttribute('data-step', 'join')
  await join(page).click()
  await expect(page).toHaveURL(/\/join$/)
})

 test('participant role plays the story and ends with platform-specific actions', async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/welcome')
  await page.getByTestId('onboarding-role-participant').click()
  await expect(experience(page)).toHaveAttribute('data-step', 'join')
  for (let chapter = 0; chapter < 4; chapter++) await page.getByTestId('onboarding-next').click()
  await expect(experience(page)).toHaveAttribute('data-step', 'compass')
  if (info.project.name === 'native-shell') {
    await expect(join(page)).toHaveAttribute('href', '/join')
    await expect(page.getByTestId('onboarding-download-ios')).toHaveCount(0)
  } else {
    for (const viewport of [{ width: 320, height: 568 }, { width: 740, height: 360 }, { width: 1280, height: 800 }]) {
      await page.setViewportSize(viewport)
      for (const language of ['en', 'pt', 'de']) {
        await page.getByRole('combobox').selectOption(language)
        await page.getByTestId('onboarding-download-ios').scrollIntoViewIfNeeded()
        await expect(page.getByTestId('onboarding-download-ios')).toBeInViewport({ ratio: 1 })
        await page.getByTestId('onboarding-download-android').scrollIntoViewIfNeeded()
        await expect(page.getByTestId('onboarding-download-android')).toBeInViewport({ ratio: 1 })
      }
    }
    await expect(page.getByTestId('onboarding-download-ios')).toHaveAttribute('href', 'https://apps.apple.com/app/pointfinder/id6759060734')
    await expect(page.getByTestId('onboarding-download-android')).toHaveAttribute('href', 'https://play.google.com/store/apps/details?id=com.prayer.pointfinder')
    await expect(join(page)).toHaveCount(0)
  }
})
