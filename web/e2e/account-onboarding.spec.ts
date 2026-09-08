import { expect, test, type BrowserContext, type Page } from '@playwright/test'

/**
 * The account journey around the welcome world, on the browser build:
 * the landing's Get started, the sign-in gate, registration from the email
 * link, the hand-off to the guided first game, and the replay from the
 * tutorials library. The world itself is covered by the native specs; these
 * run with reduced motion so only stills are shown.
 */

const user = { id: 'u', name: 'Operator', email: 'operator@example.test', role: 'operator', createdAt: '2026-01-01' }
const token = `header.${Buffer.from(JSON.stringify({ exp: 4102444800 })).toString('base64url')}.signature`

type Row = { scenarioId: string; status: string; currentStep: string | null; gameId: string | null; startedAt: string; completedAt: string | null }

/** An operator API with a live tutorial-progress table, so writes are visible to later reads. */
async function mockOperatorApi(page: Page, options: { rows?: Row[]; readFails?: boolean } = {}) {
  const rows: Row[] = options.rows ?? []
  const puts: Array<{ scenarioId: string; status: string }> = []
  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    const method = request.method()
    if (path === '/api/auth/invite/tok') return route.fulfill({ json: { email: 'new@example.test' } })
    if (path.startsWith('/api/auth/')) return route.fulfill({ json: { accessToken: token, user } })
    if (path === '/api/workspaces') return route.fulfill({ json: { personal: { tier: 'free', status: 'active', activeGames: 0 }, organizations: [] } })
    if (path.startsWith('/api/quota/')) return route.fulfill({ json: { limits: { maxActiveGames: 10 }, usage: { currentActiveGames: 0 } } })
    if (path === '/api/users/me/tutorials' && method === 'GET') {
      if (options.readFails) return route.fulfill({ status: 500, json: { message: 'boom' } })
      return route.fulfill({ json: rows })
    }
    if (path.startsWith('/api/users/me/tutorials/') && method === 'PUT') {
      const scenarioId = path.split('/').pop()!
      const body = request.postDataJSON() as { status: string; currentStep: string | null; gameId: string | null }
      puts.push({ scenarioId, status: body.status })
      const row: Row = { scenarioId, ...body, startedAt: '2026-09-08T09:00:00Z', completedAt: body.status === 'completed' ? '2026-09-08T09:01:00Z' : null }
      const index = rows.findIndex((r) => r.scenarioId === scenarioId)
      if (index >= 0) rows[index] = row
      else rows.push(row)
      return route.fulfill({ json: row })
    }
    if (path === '/api/games') return route.fulfill({ json: [] })
    return route.fulfill({ json: [] })
  })
  return { rows, puts }
}

async function signIn(page: Page, email = user.email) {
  await page.goto('/login')
  await page.getByTestId('login-email').fill(email)
  await page.getByTestId('login-password').fill('test-password')
  await page.getByTestId('login-submit').click()
}

const experience = (page: Page) => page.getByTestId('onboarding-experience')
const finishChapters = async (page: Page) => {
  for (let step = 0; step < 6; step++) await page.getByTestId('onboarding-next').click()
  await expect(experience(page)).toHaveAttribute('data-step', 'compass')
}
const forgetSession = (context: BrowserContext) => context.clearCookies().then(() => undefined)

test.beforeEach(async ({ page }, info) => {
  test.skip(info.project.name !== 'browser', 'Account flows are verified on the browser build')
  await page.emulateMedia({ reducedMotion: 'reduce' })
})

test('the landing opens the welcome world with no registration in sight, and pricing goes to the organizer gate', async ({ page }) => {
  await page.goto('/')
  const getStarted = page.getByRole('link', { name: 'Get started' }).first()
  await expect(getStarted).toHaveAttribute('href', '/welcome')
  await expect(page.getByRole('link', { name: 'Start free' })).toHaveAttribute('href', '/welcome?role=organizer')
  await getStarted.click()
  await expect(page).toHaveURL(/\/welcome$/)
  await expect(experience(page)).toHaveAttribute('data-step', 'choice')
  await expect(experience(page)).toHaveAttribute('data-mode', 'anonymous')
  await expect(page.locator('.topo-register-transition__card')).toHaveCount(0)
  await page.getByTestId('onboarding-role-organizer').click()
  await expect(experience(page)).toHaveAttribute('data-step', 'gate')
  await page.getByTestId('onboarding-gate-create-account').click()
  await expect(page).toHaveURL(/\/register$/)

  await page.goto('/welcome?role=organizer')
  await expect(experience(page)).toHaveAttribute('data-step', 'gate')
  await expect(page.getByTestId('onboarding-gate-watch')).toBeVisible()
})

test('a sign-in that never decided is offered the tour once; declining lands on the dashboard and is remembered', async ({ page, context }) => {
  const api = await mockOperatorApi(page)
  await signIn(page)
  await expect(page).toHaveURL(/\/welcome$/)
  await expect(experience(page)).toHaveAttribute('data-mode', 'operator')
  await expect(experience(page)).toHaveAttribute('data-step', 'gate')
  await expect(page.getByTestId('onboarding-tour-start')).toBeVisible()
  await page.getByTestId('onboarding-tour-skip').click()
  await expect(page).toHaveURL(/\/dashboard$/)
  await expect.poll(() => api.puts).toEqual([{ scenarioId: 'introduction', status: 'skipped' }])
  // The guided first game keeps its own, separate offer.
  await expect(page.getByTestId('tutorial-welcome-card')).toBeVisible()
  expect(api.rows.map((row) => row.scenarioId)).toEqual(['introduction'])

  // An ordinary sign-in afterwards goes straight to the dashboard.
  await page.evaluate(() => localStorage.clear())
  await forgetSession(context)
  await signIn(page)
  await expect(page).toHaveURL(/\/dashboard$/)
  expect(api.puts).toHaveLength(1)
})

test('taking the tour from the gate hands off to the guided first game exactly once', async ({ page }) => {
  const api = await mockOperatorApi(page)
  await signIn(page)
  await expect(experience(page)).toHaveAttribute('data-step', 'gate')
  await page.getByTestId('onboarding-tour-start').click()
  await expect(experience(page)).toHaveAttribute('data-step', 'plan')
  await finishChapters(page)
  await expect.poll(() => api.puts).toContainEqual({ scenarioId: 'introduction', status: 'completed' })
  await page.getByTestId('onboarding-first-game').click()
  await expect(page).toHaveURL(/\/dashboard$/)
  // The run started on the dashboard: the welcome card steps aside and the first lesson is the create dialog.
  await expect(page.getByTestId('tour-bubble')).toBeVisible()
  await expect(page.getByTestId('tutorial-welcome-card')).toHaveCount(0)
  await expect.poll(() => api.puts.some((put) => put.scenarioId === 'first-game' && put.status === 'in_progress')).toBe(true)

  // Watching again leads only to the dashboard now that the first game has started.
  await page.goto('/welcome?play=organizer')
  await finishChapters(page)
  await expect(page.getByTestId('onboarding-dashboard')).toBeVisible()
  await expect(page.getByTestId('onboarding-first-game')).toHaveCount(0)
})

test('registration from the email link signs in, plays the story, and survives a reload and a second tab', async ({ page, context }) => {
  const api = await mockOperatorApi(page)
  await page.goto('/register/tok')
  await expect(page.locator('#email')).toHaveValue('new@example.test')
  await page.locator('#name').fill('New Operator')
  await page.locator('#password').fill('secret-password')
  await page.locator('#confirm').fill('secret-password')
  await page.getByRole('button', { name: 'Create Account' }).click()
  await expect(page).toHaveURL(/\/welcome\?play=organizer$/)
  await expect(experience(page)).toHaveAttribute('data-mode', 'operator')
  await expect(experience(page)).toHaveAttribute('data-step', 'plan')
  await expect.poll(() => api.puts).toEqual([{ scenarioId: 'introduction', status: 'in_progress' }])

  // A reload keeps the signed-in story; nobody is asked to sign in again.
  await page.reload()
  await expect(experience(page)).toHaveAttribute('data-step', 'plan')
  await expect(page.getByTestId('login-email')).toHaveCount(0)

  // The tab the email link was opened from is signed in too, and goes to the dashboard.
  const other = await context.newPage()
  await mockOperatorApi(other, { rows: api.rows })
  await other.goto('/register/tok')
  await expect(other).toHaveURL(/\/dashboard$/)
  await other.close()

  await finishChapters(page)
  await expect.poll(() => api.puts).toContainEqual({ scenarioId: 'introduction', status: 'completed' })
  await expect(page.getByTestId('onboarding-first-game')).toBeVisible()
})

test('a visitor who watched anonymously is not shown the story again after registering', async ({ page }) => {
  const api = await mockOperatorApi(page)
  await page.goto('/welcome')
  await page.getByTestId('onboarding-role-organizer').click()
  await page.getByTestId('onboarding-gate-watch').click()
  await finishChapters(page)
  await page.getByTestId('onboarding-landing-create-account').click()
  await expect(page).toHaveURL(/\/register$/)
  await page.goto('/register/tok')
  await expect(page.locator('#email')).toHaveValue('new@example.test')
  await page.locator('#name').fill('New Operator')
  await page.locator('#password').fill('secret-password')
  await page.locator('#confirm').fill('secret-password')
  await page.getByRole('button', { name: 'Create Account' }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
  await expect.poll(() => api.puts).toEqual([{ scenarioId: 'introduction', status: 'completed' }])
})

test('the library replays the introduction without downgrading a watched one, and a failed read never blocks sign-in', async ({ page, context }) => {
  const watched: Row = { scenarioId: 'introduction', status: 'completed', currentStep: null, gameId: null, startedAt: '2026-09-08T09:00:00Z', completedAt: '2026-09-08T09:01:00Z' }
  const api = await mockOperatorApi(page, { rows: [watched] })
  await signIn(page)
  await expect(page).toHaveURL(/\/dashboard$/)
  await page.goto('/tutorials')
  await expect(page.getByTestId('tutorial-introduction-status')).toHaveText('Watched')
  await page.getByTestId('tutorial-introduction-watch').click()
  await expect(page).toHaveURL(/\/welcome\?play=organizer$/)
  await expect(experience(page)).toHaveAttribute('data-step', 'plan')
  await page.getByTestId('onboarding-skip').click()
  await expect(experience(page)).toHaveAttribute('data-step', 'compass')
  await page.getByTestId('onboarding-dashboard').click()
  await expect(page).toHaveURL(/\/dashboard$/)
  expect(api.puts).toEqual([])

  await page.evaluate(() => localStorage.clear())
  await forgetSession(context)
  await mockOperatorApi(page, { readFails: true })
  await signIn(page)
  await expect(page).toHaveURL(/\/dashboard$/)
})

 test('Get started fades without moving the map and reveals the welcome world', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.route('**/onboarding/*.glb', (route) => route.abort())
  await page.goto('/')
  await expect(page.locator('.landing-page')).toHaveCSS('transition-property', 'opacity')
  await page.getByRole('link', { name: 'Get started' }).first().click()
  await expect(page.locator('.topo-register-transition')).toHaveCount(0)
  await expect(page).toHaveURL(/\/welcome$/)
  await expect(experience(page)).toHaveCSS('animation-name', 'onboarding-arrive')
  await expect(experience(page)).toHaveCSS('transform', 'none')
  await expect(page.getByTestId('onboarding-role-participant')).toBeVisible()
})
