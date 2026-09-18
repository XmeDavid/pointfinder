import { expect, test, type Page } from '@playwright/test'

const user = { id: 'u', name: 'Organizer', email: 'organizer@example.test', role: 'operator', createdAt: '2026-01-01' }
const token = `header.${Buffer.from(JSON.stringify({ sub: 'u', exp: 4102444800 })).toString('base64url')}.signature`
const game = { id: 'g', name: 'Old favorite trail', status: 'setup', description: '', createdAt: '2026-01-01', createdBy: 'u', operatorIds: ['u'], uniformAssignment: true, broadcastEnabled: false, broadcastCode: null, tileSource: 'osm', unlockTrigger: 'CHECK_IN', startDate: null, endDate: null, orgId: null }
const newerGame = { ...game, id: 'g2', name: 'Newly created trail', createdAt: '2026-09-01' }
const base = { id: 'b1', gameId: 'g', name: 'Oak tree', description: '', lat: 40.09, lng: -8.87, nfcLinked: true, nfcToken: 'tok1', hidden: false, fixedChallengeId: 'c1', checkInMethod: 'NFC', checkInRadiusM: null, tagIds: [] }
const challenge = { id: 'c1', gameId: 'g', title: 'Find the oak', description: 'Look for the carved sign', content: '<p>Follow the trail to the old oak tree.</p>', completionContent: '', answerType: 'text', autoValidate: true, correctAnswer: ['FOX'], points: 10, locationBound: false, tagIds: [], unlocksBaseIds: [], createdAt: '2026-01-01' }
const team = { id: 't1', gameId: 'g', name: 'Falcons', color: '#22c55e', joinCode: 'FALCONS', playerCount: 1 }

async function fixture(page: Page, options: { noTeams?: boolean; failLaunch?: boolean; failCompleteness?: boolean; playingStatus?: 'live' | 'ended' } = {}) {
  const state = {
    games: [{ ...newerGame }, { ...game }], challenge: { ...challenge },
    teams: options.noTeams ? [] : [team],
    failLaunch: options.failLaunch ?? false, failCompleteness: options.failCompleteness ?? false,
    launches: 0,
  }
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname
    const method = route.request().method()
    if (path.startsWith('/api/auth/')) return route.fulfill({ json: { accessToken: token, refreshToken: 'test-refresh', user } })
    if (path === '/api/account/organizer-session') return route.fulfill({ json: { accessToken: token, refreshToken: 'test-organizer-refresh', user } })
    if (path === '/api/users/me') return route.fulfill({ json: user })
    if (path === '/api/account/me') return route.fulfill({ json: { user, participations: [] } })
    if (path === '/api/users/me/tutorials') return route.fulfill({ json: [{ scenarioId: 'first-game', status: 'skipped', currentStep: null, gameId: null }] })
    if (path === '/api/workspaces') return route.fulfill({ json: { personal: { tier: 'free', status: 'active', activeGames: 2 }, organizations: [] } })
    if (path.startsWith('/api/quota/')) return route.fulfill({ json: { limits: { maxActiveGames: 10 }, usage: { currentActiveGames: 2 } } })
    if (path === '/api/games/playing/snapshot') return route.fulfill({ json: {
      stateVersion: 1, serverTime: '2026-09-12T20:00:00Z',
      game: { id: 'playing', name: 'Active playing trail', status: options.playingStatus ?? 'live' },
      team: { id: 't', name: 'Falcons' }, progress: [], submissions: [], uploadSessions: [],
    } })
    if (path === '/api/games') return route.fulfill({ json: state.games })
    if (/^\/api\/games\/g2?$/.test(path)) {
      const found = state.games.find(item => path.endsWith('/' + item.id))
      return found ? route.fulfill({ json: found }) : route.fulfill({ status: 404, json: { message: 'Game not found' } })
    }
    if (path === '/api/games/g/status') {
      state.launches++
      if (state.failLaunch) return route.fulfill({ status: 409, json: { message: 'Game changed; check setup again' } })
      state.games = state.games.map(item => item.id === 'g' ? { ...item, status: 'live' } : item)
      return route.fulfill({ json: state.games.find(item => item.id === 'g') })
    }
    if (/\/bases$/.test(path)) return route.fulfill({ json: [base] })
    if (path.endsWith('/bases/b1')) return route.fulfill({ json: base })
    if (/\/challenges$/.test(path)) return route.fulfill({ json: [state.challenge] })
    if (path.endsWith('/challenges/c1')) {
      if (method === 'PUT') state.challenge = { ...state.challenge, ...route.request().postDataJSON() }
      return route.fulfill({ json: state.challenge })
    }
    if (path.endsWith('/teams')) return route.fulfill({ json: state.teams })
    if (path.endsWith('/assignments')) return route.fulfill({ json: [{ id: 'a1', gameId: 'g', baseId: 'b1', challengeId: 'c1', teamId: null }] })
    if (path.endsWith('/team-variables/completeness')) return state.failCompleteness
      ? route.fulfill({ status: 503, json: { message: 'Variables unavailable' } })
      : route.fulfill({ json: { complete: true, errors: [] } })
    if (path.endsWith('/team-variables')) return route.fulfill({ json: { variables: [{ key: 'color', teamValues: { t1: 'green' } }, { key: 'code', teamValues: { t1: 'FOX' } }] } })
    return route.fulfill({ json: [] })
  })
  return state
}

async function login(page: Page) {
  await page.goto('/login')
  await page.getByTestId('login-email').fill(user.email)
  await page.getByTestId('login-password').fill('test-password')
  await page.getByTestId('login-submit').click()
  await expect(page).toHaveURL(/\/dashboard$/)
}

async function openWorkspace(page: Page, id = 'g') {
  await page.goto(`/game/${id}`)
  await expect(page.getByTestId('readiness-indicator')).toBeVisible()
}

async function openChallenge(page: Page) {
  await openWorkspace(page)
  if (await page.getByTestId('open-content-panel').isVisible()) await page.getByTestId('open-content-panel').click()
  await page.getByTestId('tab-bases').click()
  await page.getByTestId('base-item-b1').click()
  await page.getByTestId('open-linked-challenge-btn').click()
  await expect(page.getByTestId('challenge-title-input')).toHaveValue(challenge.title)
}

async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
  await page.evaluate(value => {
    localStorage.setItem('pointfinder-theme', value)
    window.dispatchEvent(new StorageEvent('storage', { key: 'pointfinder-theme', newValue: value }))
  }, theme)
  await expect.poll(() => page.locator('html').evaluate(root => root.classList.contains('dark'))).toBe(theme === 'dark')
}

test('challenge metadata and accepted answers precede instructions and retain values when checking is disabled', async ({ page }) => {
  const state = await fixture(page)
  await login(page)
  await openChallenge(page)
  const ordered = await page.getByTestId('challenge-detail').evaluate(root => {
    const description = root.querySelector('[data-testid="challenge-description"]')!
    const toggle = root.querySelector('[data-testid="auto-validate-toggle"]')!
    const answers = root.querySelector('[data-testid="correct-answer-input"]')!
    const instructions = root.querySelector('[data-testid="challenge-content"]')!
    return [description, toggle, answers].every(node => !!(node.compareDocumentPosition(instructions) & Node.DOCUMENT_POSITION_FOLLOWING))
  })
  expect(ordered).toBe(true)
  await page.getByTestId('auto-validate-toggle').click()
  await expect(page.getByTestId('correct-answer-input')).toHaveCount(0)
  await expect.poll(() => state.challenge.autoValidate).toBe(false)
  expect(state.challenge.correctAnswer).toEqual(['FOX'])
  await page.getByTestId('auto-validate-toggle').click()
  await expect(page.getByTestId('correct-answer-input')).toContainText('FOX')
  await expect.poll(() => state.challenge.autoValidate).toBe(true)
})

test('readiness lists only blockers and opens the affected editor', async ({ page }) => {
  await fixture(page, { noTeams: true })
  await login(page)
  await openWorkspace(page)
  if (!await page.getByTestId('readiness-checklist').isVisible()) await page.getByTestId('readiness-toggle').click()
  await expect(page.getByTestId('check-pass')).toHaveCount(0)
  await expect(page.getByTestId('check-fail')).toHaveCount(1)
  await expect(page.getByTestId('go-live-btn')).toHaveCount(0)
  await page.getByTestId('check-fail').click()
  await expect(page.getByTestId('tab-teams')).toBeVisible()
})

test('accepted answers support variable suggestions, chip editing and pointer selection', async ({ page }) => {
  const state = await fixture(page)
  await login(page)
  await openChallenge(page)
  const input = page.getByTestId('chip-add-input')
  await input.fill('{{co')
  await expect(page.getByTestId('chip-suggestions')).toBeVisible()
  await page.getByTestId('variable-suggestion-code').click()
  await expect(input).toHaveValue('{{code}}')
  await input.press('Enter')
  await expect(page.getByTestId('chip-edit-1')).toHaveText('{{code}}')
  await page.getByTestId('chip-edit-0').click()
  await page.getByTestId('chip-edit-input').fill('WOLF')
  await page.getByTestId('chip-edit-input').press('Enter')
  await expect(page.getByTestId('chip-edit-0')).toHaveText('WOLF')
  await expect.poll(() => state.challenge.correctAnswer).toEqual(['WOLF', '{{code}}'])
  await input.fill('{{col')
  await input.press('ArrowDown')
  await input.press('Enter')
  await expect(input).toHaveValue('{{color}}')
  await page.getByTestId('save-challenge').click()
  await expect.poll(() => state.challenge.correctAnswer).toEqual(['WOLF', '{{code}}', '{{color}}'])
})

test('ready games expose Go live directly and failed launches can be retried', async ({ page }) => {
  const state = await fixture(page, { failLaunch: true })
  await login(page)
  await openWorkspace(page)
  await expect(page.getByTestId('go-live-btn')).toBeVisible()
  await expect(page.getByTestId('readiness-checklist')).toHaveCount(0)
  await expect(page.getByTestId('readiness-toggle')).toHaveCount(0)
  await page.getByTestId('go-live-btn').click()
  await expect(page.getByTestId('readiness-indicator').getByRole('alert')).toBeVisible()
  expect(state.games.find(item => item.id === 'g')!.status).toBe('setup')
  state.failLaunch = false
  await page.getByTestId('go-live-btn').click()
  await expect.poll(() => state.games.find(item => item.id === 'g')!.status).toBe('live')
  await expect(page.getByTestId('readiness-indicator')).toHaveCount(0)
  expect(state.launches).toBe(2)
})

test('unavailable readiness data cannot launch and can be retried', async ({ page }) => {
  const state = await fixture(page, { failCompleteness: true })
  await login(page)
  await openWorkspace(page)
  const readiness = page.getByTestId('readiness-indicator')
  await expect(readiness.getByRole('button', { name: /retry/i })).toBeVisible({ timeout: 20_000 })
  await expect(page.getByTestId('go-live-btn')).toHaveCount(0)
  expect(state.launches).toBe(0)
  state.failCompleteness = false
  await readiness.getByRole('button', { name: /retry/i }).click()
  await expect(page.getByTestId('go-live-btn')).toBeVisible()
})

test('Home continues the last opened game, survives reload, and ignores deleted games', async ({ page }, info) => {
  const state = await fixture(page)
  await login(page)
  await openWorkspace(page, 'g2')
  await openWorkspace(page, 'g')
  await page.goto('/dashboard')
  await expect(page.getByRole('heading', { name: game.name, exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: game.name, exact: true })).toBeVisible()
  for (const width of [390, 768, 1280, 1600]) {
    await page.setViewportSize({ width, height: 1000 })
    for (const theme of ['light', 'dark'] as const) {
      await setTheme(page, theme)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      await page.screenshot({ path: `test-results/${info.project.name}-continue-organizing-${width}-${theme}.png`, animations: 'disabled' })
    }
  }
  await page.getByTestId('continue-organizing-btn').click()
  await expect(page).toHaveURL(/\/game\/g$/)
  await expect(page.getByTestId('readiness-indicator')).toBeVisible()
  await page.goto('/dashboard')
  state.games = state.games.filter(item => item.id !== 'g')
  await page.reload()
  await expect(page.getByRole('heading', { name: game.name, exact: true })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: newerGame.name, exact: true })).toBeVisible()
})

test('active play takes priority over organizing history on Home', async ({ page }) => {
  await fixture(page)
  await login(page)
  await openWorkspace(page)
  await page.evaluate(() => localStorage.setItem('pf.auth', JSON.stringify({
    kind: 'player', token: 'header.eyJ0ZWFtSWQiOiJ0In0.signature', playerId: 'p', teamId: 't', gameId: 'playing',
    displayName: 'Scout', teamName: 'Falcons', teamColor: '#22c55e', gameName: 'Active playing trail', gameStatus: 'live',
  })))
  await page.goto('/dashboard')
  await expect(page.getByRole('heading', { name: 'Active playing trail', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: game.name, exact: true })).toHaveCount(0)
})

test('a freshly ended playing game yields Home continuation to organizing', async ({ page }) => {
  await fixture(page, { playingStatus: 'ended' })
  await login(page)
  await openWorkspace(page)
  await page.evaluate(() => localStorage.setItem('pf.auth', JSON.stringify({
    kind: 'player', token: 'header.eyJ0ZWFtSWQiOiJ0In0.signature', playerId: 'p', teamId: 't', gameId: 'playing',
    displayName: 'Scout', teamName: 'Falcons', teamColor: '#22c55e', gameName: 'Active playing trail', gameStatus: 'live',
  })))
  await page.goto('/dashboard')
  await expect(page.getByRole('heading', { name: game.name, exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Active playing trail', exact: true })).toHaveCount(0)
})

test('editing screens fit phones and desktops in both themes', async ({ page }, info) => {
  await fixture(page)
  await login(page)
  await openChallenge(page)
  for (const width of [390, 768, 1280, 1600]) {
    await page.setViewportSize({ width, height: 1000 })
    for (const theme of ['light', 'dark'] as const) {
      await setTheme(page, theme)
      await expect(page.getByTestId('challenge-description')).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      await page.screenshot({ path: `test-results/${info.project.name}-organizing-editor-${width}-${theme}.png`, animations: 'disabled' })
    }
  }
  for (const language of ['pt', 'de']) {
    await page.evaluate(value => localStorage.setItem('pointfinder-lang', value), language)
    await page.setViewportSize({ width: 390, height: 1000 })
    await openChallenge(page)
    await expect(page.locator('html')).toHaveAttribute('lang', language)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
    await page.screenshot({ path: `test-results/${info.project.name}-organizing-editor-${language}.png`, animations: 'disabled' })
  }
})
