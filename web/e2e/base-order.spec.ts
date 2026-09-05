import { expect, test } from '@playwright/test'

const player = { kind: 'player', token: 'header.eyJ0ZWFtSWQiOiJ0In0.signature', playerId: 'p', teamId: 't', gameId: 'g', displayName: 'Scout', teamName: 'Falcons', teamColor: '#22c55e', gameName: 'Forest game', gameStatus: 'live' }

test('operator enables order in settings, saves a shared route, and retains it when disabled', async ({ page }, info) => {
  const user = { id: 'u', name: 'Operator', email: 'operator@example.test', role: 'operator', createdAt: '2026-01-01' }
  const token = `header.${Buffer.from(JSON.stringify({ exp: 4102444800 })).toString('base64url')}.signature`
  let game = { id: 'g', name: 'Ordered forest game', status: 'setup', description: '', createdBy: 'u', operatorIds: ['u'], enforceBaseOrder: false, uniformAssignment: false, broadcastEnabled: false, broadcastCode: null, tileSource: 'osm', unlockTrigger: 'CHECK_IN', startDate: null, endDate: null }
  let bases = ['Forest entrance beside the old wooden footbridge', 'Old bridge', 'Lookout'].map((name, i) => ({ id: `b${i + 1}`, gameId: 'g', name, description: '', lat: 40 + i / 1000, lng: -8, nfcLinked: true, hidden: false }))
  const saved: string[][] = []
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    if (path.startsWith('/api/auth/')) return route.fulfill({ json: { accessToken: token, user } })
    if (path === '/api/workspaces') return route.fulfill({ json: { personal: { tier: 'free', status: 'active', activeGames: 1 }, organizations: [] } })
    if (path.startsWith('/api/quota/')) return route.fulfill({ json: { limits: { maxActiveGames: 10 }, usage: { currentActiveGames: 1 } } })
    if (path === '/api/games/g') {
      if (route.request().method() === 'PUT') game = { ...game, ...route.request().postDataJSON() }
      return route.fulfill({ json: game })
    }
    if (path === '/api/games') return route.fulfill({ json: [game] })
    if (path === '/api/games/g/bases/reorder') {
      const { ids } = route.request().postDataJSON() as { ids: string[] }
      saved.push(ids)
      bases = ids.map((id) => bases.find((b) => b.id === id)!)
      return route.fulfill({ status: 204 })
    }
    if (path === '/api/games/g/bases') return route.fulfill({ json: bases.map((b, i) => ({ ...b, sequenceNumber: game.enforceBaseOrder ? i + 1 : null })) })
    return route.fulfill({ json: [] })
  })
  await page.goto('/login')
  await page.getByTestId('login-email').fill(user.email)
  await page.getByTestId('login-password').fill('test-password')
  await page.getByTestId('login-submit').click()
  await expect(page).toHaveURL(/\/dashboard$/)
  await page.goto('/game/g')
  await page.locator('[data-testid="settings-btn"]:visible').click()
  const settings = page.getByTestId('game-settings-panel')
  await settings.getByRole('switch', { name: 'Enforce base order' }).click()
  await expect(settings.getByRole('switch', { name: 'Enforce base order' })).toBeChecked()
  await expect.poll(() => game.enforceBaseOrder).toBe(true)
  await settings.getByRole('button', { name: 'Arrange route' }).click()
  await page.getByRole('button', { name: 'Arrange route', exact: true }).click()
  const editor = page.getByTestId('base-route-editor')
  await editor.getByRole('button', { name: 'Move Old bridge up' }).click()
  expect(saved).toEqual([])
  await page.screenshot({ path: `test-results/${info.project.name}-base-route-editor-light.png`, fullPage: true })
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' })
  await page.screenshot({ path: `test-results/${info.project.name}-base-route-editor-dark.png`, fullPage: true })
  if (info.project.name === 'browser') {
    for (const width of [390, 768, 1280, 1600]) {
      await page.setViewportSize({ width, height: 844 })
      await expect(editor).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
      await page.screenshot({ path: `test-results/base-route-editor-dark-${width}.png`, fullPage: true })
    }
    await page.setViewportSize({ width: 1280, height: 800 })
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
  await editor.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(editor).toHaveCount(0)
  expect(saved).toEqual([['b2', 'b1', 'b3']])
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  await page.locator('[data-testid="settings-btn"]:visible').click()
  await settings.getByRole('switch', { name: 'Enforce base order' }).click()
  await expect(settings.getByRole('switch', { name: 'Enforce base order' })).not.toBeChecked()
  await expect.poll(() => game.enforceBaseOrder).toBe(false)
  expect(bases.map((b) => b.id)).toEqual(['b2', 'b1', 'b3'])
  await expect(settings.getByRole('button', { name: 'Arrange route' })).toHaveCount(0)
})

test('ordered visits explain an early scan and advance before challenge completion', async ({ context, page }, info) => {
  const checked = new Set<string>()
  const scans: string[] = []
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const bases = [1, 2, 3].map((n) => ({ id: `b${n}`, gameId: 'g', sequenceNumber: n, lat: 40 + n / 1000, lng: -8, nfcLinked: true, hidden: false, fixedChallengeId: `c${n}` }))
  const challenges = bases.map((b, i) => ({ id: `c${i + 1}`, title: `Team Falcon challenge ${i + 1}`, answerType: 'text', content: '<p>Find the clue for your team.</p>' }))
  const progress = () => bases.map((b, i) => ({ baseId: b.id, sequenceNumber: b.sequenceNumber, challengeTitle: challenges[i].title, challengeId: challenges[i].id, lat: b.lat, lng: b.lng, nfcLinked: true, status: checked.has(b.id) ? 'checked_in' : 'not_visited', checkedInAt: checked.has(b.id) ? '2026-09-05T10:00:00Z' : null }))
  const next = () => bases.find((b) => !checked.has(b.id))?.sequenceNumber ?? null
  await context.addInitScript((auth) => localStorage.setItem('pf.auth', JSON.stringify(auth)), player)
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    if (route.request().method() === 'POST' && path.includes('check-in')) {
      const base = bases.find((b) => path.includes(`/bases/${b.id}/`))
      if (!base) return route.fulfill({ status: 404, json: {} })
      scans.push(base.id)
      if (!checked.has(base.id) && base.sequenceNumber !== next()) return route.fulfill({ status: 400, json: { code: 'PREVIOUS_BASE_REQUIRED', message: `Visit Base ${next()} first`, errors: { nextRequiredBaseNumber: String(next()) } } })
      checked.add(base.id)
      return route.fulfill({ json: { checkInId: `ci-${base.id}`, baseId: base.id, checkedInAt: '2026-09-05T10:00:00Z', challenge: challenges[base.sequenceNumber - 1] } })
    }
    if (path.endsWith('/data')) return route.fulfill({ json: { gameStatus: 'live', enforceBaseOrder: true, nextRequiredBaseNumber: next(), bases, challenges, assignments: bases.map((b, i) => ({ id: `a${i}`, baseId: b.id, challengeId: challenges[i].id, teamId: 't' })), progress: progress() } })
    if (path.endsWith('/snapshot')) return route.fulfill({ json: { stateVersion: checked.size + 1, serverTime: '2026-09-05T10:00:00Z', game: { id: 'g', name: 'Forest game', status: 'live', enforceBaseOrder: true, nextRequiredBaseNumber: next() }, team: { id: 't', name: 'Falcons', memberCount: 3 }, progress: progress(), submissions: [], uploadSessions: [] } })
    return route.fulfill({ json: [] })
  })

  await page.goto('/base/b3?token=proof-3')
  await expect(page.getByText('Visit Base 1 first').first()).toBeVisible()
  await expect(page.getByRole('link', { name: 'Show Base 1' }).first()).toBeVisible()
  expect(scans).toEqual([])
  await page.screenshot({ path: `test-results/${info.project.name}-base-order-blocked-light.png`, fullPage: true })
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' })
  await page.screenshot({ path: `test-results/${info.project.name}-base-order-blocked-dark.png`, fullPage: true })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)

  await page.goto('/base/b1?token=proof-1')
  await expect(page.getByRole('textbox')).toBeVisible()
  await expect.poll(() => scans).toEqual(['b1'])
  // No answer has been sent: a base check-in alone advances the shared route.
  await page.goto('/base/b2?token=proof-2')
  await expect(page.getByRole('textbox')).toBeVisible()
  await expect.poll(() => scans).toEqual(['b1', 'b2'])
  await expect(page.getByText('Visit Base 1 first')).toHaveCount(0)
  expect(errors).toEqual([])
})
