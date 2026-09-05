import { expect, test } from '@playwright/test'

const player = { kind: 'player', token: 'header.eyJ0ZWFtSWQiOiJ0In0.signature', playerId: 'p', teamId: 't', gameId: 'g', displayName: 'Scout', teamName: 'Falcons', teamColor: '#22c55e', gameName: 'Forest game', gameStatus: 'live' }
const snapshot = { stateVersion: 1, serverTime: '2026-09-05T00:00:00Z', game: { id: 'g', name: 'Forest game', status: 'live' }, team: { id: 't', name: 'Falcons' }, progress: [{ baseId: 'b', status: 'checked_in', challengeTitle: 'Oak tree', lat: 40, lng: -8, nfcLinked: true }], submissions: [], uploadSessions: [] }
const data = { bases: [{ id: 'b', name: 'Oak tree', lat: 40, lng: -8, nfcLinked: true, fixedChallengeId: 'c' }], challenges: [{ id: 'c', title: 'Find the clue', description: 'Look near the roots', answerType: 'text', content: '<div data-type="file-embed" data-resource-name="Clue.pdf" data-resource-url="https://files.example.test/clue.pdf">Clue.pdf</div>', completionContent: '' }], assignments: [], progress: [] }

test('both targets expose the same operator login and player join screens', async ({ page }, info) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  if (info.project.name === 'native-shell') await expect(page.getByRole('link', { name: 'Join a game', exact: true })).toBeVisible()
  else await expect(page).toHaveTitle('PointFinder')
  await page.goto('/login')
  await expect(page.getByTestId('login-email')).toBeVisible()
  await expect(page.getByTestId('login-password')).toBeVisible()
  await page.goto('/join?code=FOREST')
  await expect(page.getByRole('heading', { name: 'Join your team' })).toBeVisible()
  await expect(page.getByLabel('Team code')).toHaveValue('FOREST')
  await page.screenshot({ path: `test-results/${info.project.name}-join-light.png`, fullPage: true })
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' })
  await expect(page.locator('html')).toHaveClass(/dark/)
  await expect(page.getByRole('button', { name: 'Join', exact: true })).toBeDisabled()
  await page.screenshot({ path: `test-results/${info.project.name}-join.png`, fullPage: true })
  if (info.project.name === 'browser') {
    for (const width of [390, 768, 1600]) {
      await page.setViewportSize({ width, height: 844 })
      await page.screenshot({ path: `test-results/player-join-dark-${width}.png`, fullPage: true })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    }
    for (const language of ['pt', 'de']) {
      await page.evaluate((lng) => localStorage.setItem('pointfinder-lang', lng), language)
      await page.setViewportSize({ width: 390, height: 844 })
      await page.reload()
      await expect(page.locator('html')).toHaveAttribute('lang', language)
      await expect(page.locator('form input').first()).toBeVisible()
      await page.screenshot({ path: `test-results/player-join-${language}.png`, fullPage: true })
    }
  }
  expect(errors).toEqual([])
})

test('player screens share the same feature and keep operator routes protected', async ({ context, page }) => {
  await context.addInitScript((auth) => localStorage.setItem('pf.auth', JSON.stringify(auth)), player)
  await page.route('**/api/**', (route) => route.fulfill({ json: route.request().url().endsWith('/data') ? data : snapshot }))
  await page.goto('/base/b')
  await expect(page.getByRole('heading', { name: 'Find the clue' })).toBeVisible()
  await expect(page.getByRole('textbox')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Clue.pdf' })).toHaveAttribute('href', 'https://files.example.test/clue.pdf')
  await page.goto('/dashboard')
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByTestId('login-email')).toHaveCount(0)
})

test('browser player submissions survive an offline reload and sync after reconnect', async ({ context, page }, info) => {
  test.skip(info.project.name !== 'browser', 'Native persistence is SQLite and requires a device runtime.')
  let online = true
  const submissions: unknown[] = []
  await context.addInitScript((auth) => localStorage.setItem('pf.auth', JSON.stringify(auth)), player)
  await page.route('**/api/**', async (route) => {
    if (!online) return route.abort('internetdisconnected')
    if (route.request().method() === 'POST') {
      submissions.push(route.request().postDataJSON())
      return route.fulfill({ json: { id: 'submission', status: 'submitted' } })
    }
    return route.fulfill({ json: route.request().url().endsWith('/data') ? data : snapshot })
  })
  await page.goto('/base/b')
  await expect(page.getByRole('heading', { name: 'Find the clue' })).toBeVisible()
  await page.evaluate(async () => { await navigator.serviceWorker.ready })
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)
  online = false
  await context.setOffline(true)
  await page.getByRole('textbox').fill('The oak has five branches')
  await page.getByRole('button', { name: 'Send answer', exact: true }).click()
  await expect(page.getByTestId('player-submission-status')).toHaveText('Saved offline')
  await page.reload()
  await expect(page.getByTestId('player-submission-status')).toHaveText('Saved offline')
  await page.goto('/list')
  await expect(page.getByText('1 action waiting to sync').first()).toBeVisible()
  await page.waitForTimeout(2200)
  online = true
  await context.setOffline(false)
  await expect.poll(() => submissions.length, { timeout: 40_000 }).toBe(1)
  expect(submissions[0]).toMatchObject({ answer: 'The oak has five branches', idempotencyKey: expect.any(String) })
  await expect(page.getByText('1 action waiting to sync')).toHaveCount(0)
  await page.reload()
  await expect(page.getByText('1 action waiting to sync')).toHaveCount(0)
})

test('operator login opens the shared dashboard and workspace, including the former mobile URL', async ({ page }) => {
  const user = { id: 'u', name: 'Operator', email: 'operator@example.test', role: 'operator', createdAt: '2026-01-01' }
  const token = `header.${Buffer.from(JSON.stringify({ exp: 4102444800 })).toString('base64url')}.signature`
  const game = { id: 'g', name: 'Operator forest game', status: 'setup', description: '', createdAt: '2026-01-01', createdBy: 'u', operatorIds: ['u'], uniformAssignment: true, broadcastEnabled: false, broadcastCode: null, tileSource: 'osm', unlockTrigger: 'COMPLETED', startDate: null, endDate: null }
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    if (path.startsWith('/api/auth/')) return route.fulfill({ json: { accessToken: token, user } })
    if (path === '/api/workspaces') return route.fulfill({ json: { personal: { tier: 'free', status: 'active', activeGames: 1 }, organizations: [] } })
    if (path.startsWith('/api/quota/')) return route.fulfill({ json: { limits: { maxActiveGames: 10 }, usage: { currentActiveGames: 1 } } })
    if (path === '/api/games/g') return route.fulfill({ json: game })
    if (path === '/api/games') return route.fulfill({ json: [game] })
    return route.fulfill({ json: [] })
  })
  await page.goto('/login')
  await page.getByTestId('login-email').fill(user.email)
  await page.getByTestId('login-password').fill('test-password')
  await page.getByTestId('login-submit').click()
  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(page.getByText(game.name)).toBeVisible()
  await expect(page.getByTestId('create-game-btn')).toBeVisible()
  await page.goto('/operator/games/g')
  await expect(page).toHaveURL(/\/game\/g$/)
  await expect(page.getByText(game.name)).toBeVisible()
  await expect(page.getByTestId('workspace-error')).toHaveCount(0)
})

test('a tag link survives joining and leads to its base', async ({ page }) => {
  const baseId = '00000000-0000-0000-0000-000000000001'
  await page.route('**/api/**', async (route) => {
    if (route.request().url().endsWith('/auth/player/join')) return route.fulfill({ json: {
      token: player.token, player: { id: 'p', displayName: 'Scout' }, team: { id: 't', name: 'Falcons', color: '#22c55e' }, game: { id: 'g', name: 'Forest game', status: 'live' },
    } })
    if (route.request().url().endsWith('/data')) return route.fulfill({ json: { ...data, bases: [{ ...data.bases[0], id: baseId }] } })
    return route.fulfill({ json: { ...snapshot, progress: [{ ...snapshot.progress[0], baseId }] } })
  })
  await page.goto(`/tag/${baseId}?t=tag-proof`)
  await expect(page).toHaveURL(/\/join$/)
  await page.getByLabel('Team code').fill('FOREST')
  await page.getByLabel('Your name').fill('Scout')
  await page.getByRole('button', { name: 'Join', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/base/${baseId}\\?token=tag-proof$`))
  await expect(page.getByRole('heading', { name: 'Find the clue' })).toBeVisible()
})
