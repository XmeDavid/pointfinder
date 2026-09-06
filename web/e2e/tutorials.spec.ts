import { expect, test, type Page } from '@playwright/test'

const user = { id: 'u', name: 'Operator', email: 'operator@example.test', role: 'operator', createdAt: '2026-01-01' }
const token = `header.${Buffer.from(JSON.stringify({ exp: 4102444800 })).toString('base64url')}.signature`

type MockGame = Record<string, unknown> & { id: string; status: string }

function newGame(name: string): MockGame {
  return {
    id: 'g1',
    name,
    status: 'setup',
    description: '',
    createdBy: 'u',
    operatorIds: ['u'],
    uniformAssignment: false,
    broadcastEnabled: false,
    broadcastCode: null,
    tileSource: 'osm',
    unlockTrigger: 'CHECK_IN',
    enforceBaseOrder: false,
    startDate: null,
    endDate: null,
    defaultCheckInMethod: 'NFC',
    defaultCheckInRadiusM: 15,
  }
}

async function mockOperatorApi(page: Page, games: MockGame[]) {
  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    const method = request.method()

    if (path.startsWith('/api/auth/')) return route.fulfill({ json: { accessToken: token, user } })
    if (path === '/api/workspaces') {
      return route.fulfill({ json: { personal: { tier: 'free', status: 'active', activeGames: games.length }, organizations: [] } })
    }
    if (path.startsWith('/api/quota/')) {
      return route.fulfill({ json: { limits: { maxActiveGames: 10 }, usage: { currentActiveGames: games.length } } })
    }
    if (path === '/api/games' && method === 'POST') {
      const body = request.postDataJSON() as { name?: string }
      const game = newGame(body.name ?? 'Tutorial game')
      games.push(game)
      return route.fulfill({ status: 201, json: game })
    }
    if (path === '/api/games') return route.fulfill({ json: games })
    if (path === '/api/games/g1') return route.fulfill({ json: games[0] ?? newGame('Tutorial game') })
    if (path === '/api/games/g1/team-variables/completeness') return route.fulfill({ json: { complete: true, errors: [] } })
    return route.fulfill({ json: [] })
  })
}

async function login(page: Page) {
  await page.goto('/login')
  await page.getByTestId('login-email').fill(user.email)
  await page.getByTestId('login-password').fill('test-password')
  await page.getByTestId('login-submit').click()
  await expect(page).toHaveURL(/\/dashboard$/)
}

test('the welcome card starts the guided first game and the coach marks follow the operator', async ({ page }, info) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const games: MockGame[] = []
  await mockOperatorApi(page, games)
  await login(page)

  // 1 — the empty personal dashboard offers the tutorial
  const card = page.getByTestId('tutorial-welcome-card')
  await expect(card).toBeVisible()
  await expect(page.getByTestId('tutorial-welcome-skip')).toBeVisible()
  await page.screenshot({ path: `test-results/${info.project.name}-tutorial-welcome-light.png`, fullPage: true })

  // 2 — Start spotlights the create-game button
  await page.getByTestId('tutorial-welcome-start').click()
  await expect(page.getByTestId('tour-spotlight')).toBeVisible()
  await expect(page.getByTestId('tour-bubble-title')).toHaveText('Start with a game')
  await expect(card).toHaveCount(0)

  // 3 — creating the game moves the run into the workspace and onto the readiness pill
  await page.locator('[data-testid="create-game-btn"]:visible').click()
  await page.getByTestId('game-name-input').fill('Tutorial game')
  await page.getByTestId('game-save-btn').click()
  await expect(page).toHaveURL(/\/game\/g1$/)
  await expect(page.getByTestId('map-wrapper')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId('tour-bubble-title')).toHaveText('Your readiness checklist')

  // 4 — Got it advances to the map step
  await page.getByTestId('tour-next').click()
  await expect(page.getByTestId('tour-bubble-title')).toHaveText('Place your first base')
  await expect(page.getByTestId('tour-spotlight')).toBeVisible()

  // 5 — the scrim never blocks: the content panel still opens under the spotlight
  await page.locator('[data-testid="open-content-panel"]:visible').click()
  await expect(page.getByTestId('drawer-tabs')).toBeVisible()
  await expect(page.getByTestId('tour-bubble')).toBeVisible()

  // 6 — at phone width the bubble is a full-width sheet. The map fills the
  // screen, so the sheet sits at the top and leaves the bottom controls free.
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByTestId('tour-bubble')).toHaveAttribute('data-variant', 'sheet')
  await expect(page.getByTestId('tour-bubble')).toHaveAttribute('data-side', 'top')
  const viewport = page.viewportSize()!
  const box = await page.getByTestId('tour-bubble').boundingBox()
  expect(box).not.toBeNull()
  const safeTop = await page.evaluate(() =>
    Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--safe-top')) || 0,
  )
  expect(box!.y).toBeGreaterThanOrEqual(safeTop - 1)
  expect(box!.y).toBeLessThanOrEqual(safeTop + 1)
  expect(Math.round(box!.width)).toBe(viewport.width)
  expect(box!.height).toBeLessThanOrEqual(viewport.height * 0.45 + 1)
  await page.screenshot({ path: `test-results/${info.project.name}-tutorial-sheet-390.png`, fullPage: true })

  // 7 — dark theme and reduced motion render the same states
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' })
  await expect(page.getByTestId('tour-bubble')).toBeVisible()
  await page.screenshot({ path: `test-results/${info.project.name}-tutorial-sheet-390-dark.png`, fullPage: true })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)

  expect(errors).toEqual([])
})

test('skipping the welcome card hides it without starting a run', async ({ page }) => {
  const games: MockGame[] = []
  await mockOperatorApi(page, games)
  await login(page)

  await expect(page.getByTestId('tutorial-welcome-card')).toBeVisible()
  await page.getByTestId('tutorial-welcome-skip').click()
  await expect(page.getByTestId('tutorial-welcome-card')).toHaveCount(0)
  await expect(page.getByTestId('tour-spotlight')).toHaveCount(0)
  await expect(page.getByTestId('tour-bubble')).toHaveCount(0)
  await expect(page.getByTestId('tour-pill')).toHaveCount(0)
})
