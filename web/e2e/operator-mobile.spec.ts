import { expect, test, type Page } from '@playwright/test'

/**
 * Phone-width audit of the shared app in the native shell: operator dashboard and
 * workspace, and the player settings/inbox/base screens. Screenshots land in
 * test-results/mobile-*.png; assertions guard the basics (no sideways scroll,
 * primary controls visible, nothing thrown).
 */
const user = { id: 'u', name: 'Operator', email: 'operator@example.test', role: 'operator', createdAt: '2026-01-01' }
const token = `header.${Buffer.from(JSON.stringify({ exp: 4102444800 })).toString('base64url')}.signature`
const game = { id: 'g', name: 'Operator forest game', status: 'live', description: '', createdAt: '2026-01-01', createdBy: 'u', operatorIds: ['u'], uniformAssignment: true, broadcastEnabled: false, broadcastCode: null, tileSource: 'osm', unlockTrigger: 'CHECK_IN', startDate: null, endDate: null }
const bases = [
  { id: 'b1', gameId: 'g', name: 'Oak tree', description: '', lat: 40.09, lng: -8.87, nfcLinked: true, nfcToken: 'tok1', hidden: false, fixedChallengeId: null },
  { id: 'b2', gameId: 'g', name: 'Old mill', description: '', lat: 40.091, lng: -8.871, nfcLinked: false, nfcToken: 'tok2', hidden: false, fixedChallengeId: null },
]
const player = { kind: 'player', token: 'header.eyJ0ZWFtSWQiOiJ0In0.signature', playerId: 'p', teamId: 't', gameId: 'g', displayName: 'Scout', teamName: 'Falcons', teamColor: '#22c55e', gameName: 'Forest game', gameStatus: 'live' }
const snapshot = { stateVersion: 1, serverTime: '2026-09-05T00:00:00Z', game: { id: 'g', name: 'Forest game', status: 'live' }, team: { id: 't', name: 'Falcons', memberCount: 4 }, progress: [{ baseId: 'b1', status: 'checked_in', challengeTitle: 'Find the clue', lat: 40.09, lng: -8.87, nfcLinked: true, challengeId: 'c' }], submissions: [], uploadSessions: [] }
const data = { gameStatus: 'live', bases: [bases[0]], challenges: [{ id: 'c', title: 'Find the clue', description: 'Look near the roots', answerType: 'text', content: '<p>What is carved on the trunk?</p>', completionContent: '' }], assignments: [{ id: 'a', baseId: 'b1', challengeId: 'c', teamId: null }], progress: [] }
const notifications = [{ id: 'n1', gameId: 'g', message: 'Lunch at the chapel at 12:30. Bring your water bottles and the team flag, we take the photo there.', targetTeamId: null, sentAt: '2026-09-05T10:00:00Z', sentBy: 'u' }]

async function noSidewaysScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
}

const safeProfiles = [
  { name: 'iphone', width: 390, height: 844, top: 59, bottom: 34, left: 0, right: 0 },
  { name: 'android-buttons', width: 390, height: 844, top: 24, bottom: 48, left: 0, right: 0 },
  { name: 'iphone-landscape', width: 844, height: 390, top: 0, bottom: 21, left: 59, right: 59 },
]

async function simulateSafeArea(page: Page, profile: typeof safeProfiles[number]) {
  await page.setViewportSize({ width: profile.width, height: profile.height })
  await page.evaluate((p) => {
    for (const edge of ['top', 'right', 'bottom', 'left'] as const) {
      document.documentElement.style.setProperty(`--native-safe-${edge}`, `${p[edge]}px`)
    }
  }, profile)
}

async function expectSafeControls(page: Page, selector: string, profile: typeof safeProfiles[number]) {
  const controls = page.locator(selector)
  expect(await controls.count()).toBeGreaterThan(0)
  for (const control of await controls.all()) {
    if (!await control.isVisible()) continue
    // The desktop rail can scroll on short landscape windows.
    if (await control.evaluate((element) => !!element.closest('.operator-rail'))) await control.scrollIntoViewIfNeeded()
    const box = await control.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.y).toBeGreaterThanOrEqual(profile.top)
    expect(box!.y + box!.height).toBeLessThanOrEqual(profile.height - profile.bottom + 1)
    expect(box!.x).toBeGreaterThanOrEqual(profile.left)
    expect(box!.x + box!.width).toBeLessThanOrEqual(profile.width - profile.right + 1)
  }
}

test('operator dashboard, workspace and NFC page fit a phone', async ({ page }, info) => {
  test.skip(info.project.name !== 'native-shell', 'Phone audit runs against the native artifact project')
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    if (path.startsWith('/api/auth/')) return route.fulfill({ json: { accessToken: token, user } })
    if (path === '/api/workspaces') return route.fulfill({ json: { personal: { tier: 'free', status: 'active', activeGames: 1 }, organizations: [] } })
    if (path.startsWith('/api/quota/')) return route.fulfill({ json: { limits: { maxActiveGames: 10 }, usage: { currentActiveGames: 1 } } })
    if (path === '/api/games/g') return route.fulfill({ json: game })
    if (path === '/api/games') return route.fulfill({ json: [game] })
    if (path === '/api/games/g/bases') return route.fulfill({ json: bases })
    return route.fulfill({ json: [] })
  })
  await page.goto('/login')
  await page.getByTestId('login-email').fill(user.email)
  await page.getByTestId('login-password').fill('test-password')
  await page.getByTestId('login-submit').click()
  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(page.getByText(game.name)).toBeVisible()
  await page.screenshot({ path: 'test-results/mobile-operator-dashboard.png', fullPage: true })
  await noSidewaysScroll(page)

  await page.goto('/game/g')
  await expect(page.getByTestId('icon-rail-mobile')).toBeVisible()
  await page.waitForTimeout(1500)
  await page.screenshot({ path: 'test-results/mobile-operator-workspace.png' })
  await noSidewaysScroll(page)

  // Exercise the actual built layout with nonzero insets; a phone viewport alone
  // does not emulate a notch or system navigation bar in desktop Chromium.
  for (const profile of safeProfiles) {
    await simulateSafeArea(page, profile)
    await page.emulateMedia({ colorScheme: profile.name === 'android-buttons' ? 'dark' : 'light', reducedMotion: 'reduce' })
    // Operator theme is an explicit saved preference, independent of the OS theme.
    await page.evaluate((dark) => {
      localStorage.setItem('pointfinder-theme', dark ? 'dark' : 'light')
      window.dispatchEvent(new StorageEvent('storage', { key: 'pointfinder-theme' }))
    }, profile.name === 'android-buttons')
    await expectSafeControls(page, '[data-testid="icon-rail-mobile"] button, [data-testid="icon-rail-desktop"] button, .workspace-controls > div:first-child button', profile)
    const map = await page.getByTestId('map-wrapper').boundingBox()
    expect(map!.y).toBe(0)
    expect(map!.height).toBe(profile.height)
    const canvas = await page.locator('.maplibregl-canvas').boundingBox()
    expect(canvas!.y).toBe(0)
    expect(canvas!.height).toBe(profile.height)
    const nav = page.getByTestId(profile.width < 768 ? 'icon-rail-mobile' : 'icon-rail-desktop')
    await nav.getByRole('button', { name: 'Review', exact: true }).click()
    await expect(page.getByTestId('review-overlay')).toBeVisible()
    const review = await page.getByTestId('review-overlay').boundingBox()
    expect(review!.y).toBeGreaterThanOrEqual(profile.top)
    expect(review!.y + review!.height).toBeLessThanOrEqual(profile.height - profile.bottom - (profile.width < 768 ? 56 : 0))
    await nav.getByRole('button', { name: 'Build', exact: true }).click()
    await expect(page.getByTestId('review-overlay')).toHaveCount(0)
    expect(await page.evaluate(() => !!document.elementFromPoint(innerWidth / 2, innerHeight / 2)?.closest('.maplibregl-map'))).toBe(true)
    await page.screenshot({ path: `test-results/safe-area-operator-${profile.name}.png` })
  }
  await simulateSafeArea(page, safeProfiles[0])
  await page.getByTestId('open-content-panel').click()
  await expect(page.getByTestId('slide-drawer')).toBeVisible()
  await expectSafeControls(page, '[data-testid="drawer-tabs"] button', safeProfiles[0])

  await page.goto('/game/g/nfc')
  await expect(page.getByTestId('nfc-tags-page')).toBeVisible()
  await expect(page.getByTestId('nfc-base-b2')).toBeVisible()
  await page.screenshot({ path: 'test-results/mobile-operator-nfc.png', fullPage: true })
  await noSidewaysScroll(page)
  expect(errors).toEqual([])
})

test('player settings, inbox and base fit a phone in both themes and in Portuguese', async ({ context, page }, info) => {
  test.skip(info.project.name !== 'native-shell', 'Phone audit runs against the native artifact project')
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await context.addInitScript((auth) => localStorage.setItem('pf.auth', JSON.stringify(auth)), player)
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/data')) return route.fulfill({ json: data })
    if (path.endsWith('/notifications')) return route.fulfill({ json: notifications })
    if (path.endsWith('/unseen-count')) return route.fulfill({ json: { count: 1 } })
    if (route.request().method() === 'POST') return route.fulfill({ status: 204, body: '' })
    return route.fulfill({ json: snapshot })
  })
  await page.goto('/settings')
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Leave Game' })).toBeVisible()
  await page.screenshot({ path: 'test-results/mobile-player-settings.png', fullPage: true })
  await noSidewaysScroll(page)

  await page.goto('/')
  await expect(page.getByTestId('player-settings-btn')).toBeVisible()
  for (const profile of safeProfiles) {
    await simulateSafeArea(page, profile)
    await page.emulateMedia({ colorScheme: profile.name === 'android-buttons' ? 'dark' : 'light', reducedMotion: 'reduce' })
    await expectSafeControls(page, '[data-testid="player-settings-btn"], [data-testid="player-inbox-btn"], button[aria-label="My location"]', profile)
    const map = await page.locator('.maplibregl-map').boundingBox()
    expect(map).toMatchObject({ x: 0, y: 0, width: profile.width, height: profile.height })
    // Bottom controls must also clear the home indicator / Android buttons.
    const bottom = await page.locator('.safe-gutter').last().locator('button').last().boundingBox()
    expect(bottom).not.toBeNull()
    expect(bottom!.y + bottom!.height).toBeLessThanOrEqual(profile.height - profile.bottom - 12)
    await page.screenshot({ path: `test-results/safe-area-player-${profile.name}.png` })
  }
  await simulateSafeArea(page, safeProfiles[0])

  await page.goto('/inbox')
  await expect(page.getByText(/Lunch at the chapel/)).toBeVisible()
  await page.screenshot({ path: 'test-results/mobile-player-inbox.png', fullPage: true })
  await noSidewaysScroll(page)

  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/base/b1')
  await expect(page.getByRole('heading', { level: 1, name: 'Find the clue' })).toBeVisible()
  await page.screenshot({ path: 'test-results/mobile-player-base-dark.png', fullPage: true })
  await noSidewaysScroll(page)

  await page.evaluate(() => localStorage.setItem('pointfinder-lang', 'pt'))
  await page.goto('/settings')
  await expect(page.getByRole('heading', { name: 'Definições' })).toBeVisible()
  await page.screenshot({ path: 'test-results/mobile-player-settings-pt.png', fullPage: true })
  await noSidewaysScroll(page)
  expect(errors).toEqual([])
})
