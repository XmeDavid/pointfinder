import { expect, test, type Page } from '@playwright/test'

const user = { id: 'u', name: 'Organizer', email: 'organizer@example.test', role: 'operator', createdAt: '2026-01-01' }
const token = `header.${Buffer.from(JSON.stringify({ sub: 'u', exp: 4102444800 })).toString('base64url')}.signature`
const game = { id: 'g', name: 'Recovery game', status: 'setup', description: '', createdAt: '2026-01-01', createdBy: 'u', operatorIds: ['u'], uniformAssignment: true, broadcastEnabled: false, broadcastCode: null, tileSource: 'osm', unlockTrigger: 'CHECK_IN', startDate: null, endDate: null }
const initialBase = { id: 'b1', gameId: 'g', name: 'Oak tree', description: '', lat: 40.09, lng: -8.87, nfcLinked: true, nfcToken: 'tok1', hidden: false, fixedChallengeId: null, checkInMethod: 'NFC', checkInRadiusM: null, tagIds: [] }
const initialChallenge = { id: 'c1', gameId: 'g', title: 'Oak challenge', description: '', content: '', completionContent: '', answerType: 'none', autoValidate: false, correctAnswer: [], points: 0, locationBound: false, tagIds: [], unlocksBaseIds: [], createdAt: '2026-01-01' }

async function fixture(page: Page, options: { linked?: boolean; failSave?: boolean; loseCreateResponse?: boolean; role?: string } = {}) {
  const state = {
    base: { ...initialBase },
    failSave: options.failSave ?? false,
    writes: [] as string[],
    createKeys: [] as (string | undefined)[],
    challenges: options.linked ? [{ ...initialChallenge }] : [] as typeof initialChallenge[],
    assignments: options.linked ? [{ id: 'a1', gameId: 'g', baseId: 'b1', challengeId: 'c1', teamId: null }] : [] as { id: string; gameId: string; baseId: string; challengeId: string; teamId: null }[],
  }
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname
    const method = route.request().method()
    const currentUser = { ...user, role: options.role ?? user.role }
    if (path.startsWith('/api/auth/')) return route.fulfill({ json: { accessToken: token, refreshToken: 'test-refresh', user: currentUser } })
    if (path === '/api/account/organizer-session') return currentUser.role === 'participant'
      ? route.fulfill({ status: 403, json: { code: 'ORGANIZER_ROLE_REQUIRED', message: 'Organizer role required' } })
      : route.fulfill({ json: { accessToken: token, refreshToken: 'test-organizer-refresh', user: currentUser } })
    if (path === '/api/users/me') return route.fulfill({ json: currentUser })
    if (path === '/api/account/me') return route.fulfill({ json: { user: currentUser, participations: [] } })
    if (path === '/api/users/me/tutorials') return route.fulfill({ json: [{ scenarioId: 'first-game', status: 'skipped', currentStep: null, gameId: null }] })
    if (path === '/api/workspaces') return route.fulfill({ json: { personal: { tier: 'free', status: 'active', activeGames: 1 }, organizations: [] } })
    if (path.startsWith('/api/quota/')) return route.fulfill({ json: { limits: { maxActiveGames: 10 }, usage: { currentActiveGames: 1 } } })
    if (path === '/api/games') return route.fulfill({ json: [game] })
    if (path === '/api/games/g') return route.fulfill({ json: game })
    if (path === '/api/games/g/bases') return route.fulfill({ json: [state.base] })
    if (path === '/api/games/g/bases/b1') {
      if (method === 'PUT') {
        state.writes.push('base')
        if (state.failSave) return route.fulfill({ status: 503, json: { message: 'Save unavailable', retryable: true } })
        state.base = { ...state.base, ...route.request().postDataJSON() }
      }
      return route.fulfill({ json: state.base })
    }
    if (path === '/api/games/g/challenges') {
      if (method === 'POST') {
        state.writes.push('challenge')
        const key = route.request().postDataJSON().idempotencyKey ?? route.request().headers()['idempotency-key']
        const replay = key && state.createKeys.includes(key)
        state.createKeys.push(key)
        if (replay) return route.fulfill({ json: state.challenges[0] })
        const challenge = { ...initialChallenge, ...route.request().postDataJSON() }
        state.challenges.push(challenge)
        if (options.loseCreateResponse && state.createKeys.length === 1) return route.abort('connectionclosed')
        return route.fulfill({ json: challenge })
      }
      return route.fulfill({ json: state.challenges })
    }
    if (path === '/api/games/g/challenges/c1') {
      if (method === 'PUT') state.challenges[0] = { ...state.challenges[0], ...route.request().postDataJSON() }
      return route.fulfill({ json: state.challenges[0] })
    }
    if (path === '/api/games/g/assignments') {
      if (method === 'POST') {
        state.writes.push('assignment')
        const assignment = { id: 'a1', gameId: 'g', teamId: null, ...route.request().postDataJSON() }
        state.assignments.push(assignment)
        return route.fulfill({ json: assignment })
      }
      return route.fulfill({ json: state.assignments })
    }
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

async function openBase(page: Page) {
  await page.goto('/game/g')
  await expect(page.locator('[data-testid="open-content-panel"]:visible, [data-testid="drawer-tabs"]:visible').first()).toBeVisible()
  if (!await page.getByTestId('base-name-input').isVisible()) {
    if (await page.getByTestId('open-content-panel').isVisible()) await page.getByTestId('open-content-panel').click()
    await page.getByTestId('tab-bases').click()
    if (!await page.getByTestId('base-name-input').isVisible()) await page.getByTestId('base-item-b1').click()
  }
  await expect(page.getByTestId('base-name-input')).toBeVisible()
}

test('saves base edits before creating and linking its challenge', async ({ page }) => {
  const state = await fixture(page)
  await login(page)
  await openBase(page)
  await page.getByTestId('base-name-input').fill('Oak with the carved sign')
  await page.getByTestId('create-empty-challenge-btn').click()
  await expect(page.getByTestId('challenge-detail')).toBeVisible()
  expect(state.base.name).toBe('Oak with the carved sign')
  expect(state.writes.indexOf('base')).toBeLessThan(state.writes.indexOf('challenge'))
  expect(state.writes.indexOf('challenge')).toBeLessThan(state.writes.indexOf('assignment'))
  expect(state.challenges).toHaveLength(1)
})

test('saves base edits before opening an existing linked challenge', async ({ page }) => {
  const state = await fixture(page, { linked: true })
  await login(page)
  await openBase(page)
  await page.getByTestId('base-name-input').fill('New name before opening')
  await page.getByTestId('open-linked-challenge-btn').click()
  await expect(page.getByTestId('challenge-title-input')).toHaveValue('Oak challenge')
  expect(state.base.name).toBe('New name before opening')
})

test('valid base and challenge edits save in the background', async ({ page }) => {
  const state = await fixture(page, { linked: true })
  await login(page)
  await openBase(page)
  await page.getByTestId('base-name-input').fill('Saved without leaving the editor')
  await expect.poll(() => state.base.name).toBe('Saved without leaving the editor')
  await page.getByTestId('open-linked-challenge-btn').click()
  await page.getByTestId('challenge-title-input').fill('A safely saved challenge')
  await expect.poll(() => state.challenges[0].title).toBe('A safely saved challenge')
  await page.reload()
  await openBase(page)
  await page.getByTestId('open-linked-challenge-btn').click()
  await expect(page.getByTestId('challenge-title-input')).toHaveValue('A safely saved challenge')
})

test('a failed save keeps the base draft through reload and allows retry', async ({ page }, info) => {
  const state = await fixture(page, { failSave: true })
  await login(page)
  await openBase(page)
  await page.getByTestId('base-name-input').fill('Draft survives interruption')
  await page.getByTestId('create-empty-challenge-btn').click()
  await expect.poll(() => state.writes.filter(write => write === 'base').length).toBeGreaterThan(0)
  await expect(page.getByTestId('base-name-input')).toHaveValue('Draft survives interruption')
  expect(state.challenges).toHaveLength(0)
  await page.reload()
  await openBase(page)
  await expect(page.getByTestId('base-name-input')).toHaveValue('Draft survives interruption')
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 844 })
    for (const colorScheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' })
      await page.evaluate(theme => {
        localStorage.setItem('pointfinder-theme', theme)
        window.dispatchEvent(new StorageEvent('storage', { key: 'pointfinder-theme', newValue: theme }))
      }, colorScheme)
      await expect.poll(() => page.locator('html').evaluate(root => root.classList.contains('dark'))).toBe(colorScheme === 'dark')
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      await page.screenshot({ path: `test-results/${info.project.name}-recovered-draft-${width}-${colorScheme}.png`, animations: 'disabled' })
    }
  }
  state.failSave = false
  await page.getByTestId('create-empty-challenge-btn').click()
  await expect(page.getByTestId('challenge-detail')).toBeVisible()
  expect(state.base.name).toBe('Draft survives interruption')
})

test('a lost creation response can be retried after reload with the same operation key', async ({ page }) => {
  const state = await fixture(page, { loseCreateResponse: true })
  await login(page)
  await openBase(page)
  await page.getByTestId('create-empty-challenge-btn').click()
  await expect(page.getByTestId('assignment-error')).toBeVisible()
  expect(state.challenges).toHaveLength(1)
  expect(state.createKeys[0]).toBeTruthy()
  await page.reload()
  await openBase(page)
  await page.getByTestId('create-empty-challenge-btn').click()
  await expect(page.getByTestId('challenge-detail')).toBeVisible()
  expect(state.challenges).toHaveLength(1)
  expect(new Set(state.createKeys).size).toBe(1)
  expect(state.assignments).toHaveLength(1)
})

for (const role of ['operator', 'participant']) {
  test(`player account entry preserves ${role} organizing permissions`, async ({ page }) => {
    await fixture(page, { role })
    await page.goto('/join/account?mode=signIn&next=/dashboard')
    await page.getByTestId('account-email').fill(user.email)
    await page.getByTestId('account-password').fill('test-password')
    await page.getByTestId('account-submit').click()
    await expect(page).toHaveURL(/\/dashboard$/)
    const organize = page.getByRole('link', { name: 'Organize', exact: true })
    if (role === 'operator') {
      await expect(organize.first()).toBeVisible()
      await organize.first().click()
      await expect(page.getByTestId('create-game-btn')).toBeVisible()
      await expect(page.getByText(game.name).first()).toBeVisible()
    } else {
      await expect(organize).toHaveCount(0)
      await page.goto('/game/g')
      await expect(page).toHaveURL(/\/(?:dashboard|login)?$/)
      await expect(page.getByTestId('open-content-panel')).toHaveCount(0)
    }
  })
}
