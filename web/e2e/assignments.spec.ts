import { expect, test, type Page } from '@playwright/test'

const user = { id: 'u', name: 'Operator', email: 'operator@example.test', role: 'operator', createdAt: '2026-01-01' }
const token = `header.${Buffer.from(JSON.stringify({ exp: 4102444800 })).toString('base64url')}.signature`

const game = {
  id: 'g', name: 'Reverse route', status: 'setup', description: '', createdBy: 'u', operatorIds: ['u'],
  enforceBaseOrder: true, uniformAssignment: false, broadcastEnabled: false, broadcastCode: null, tileSource: 'osm',
  unlockTrigger: 'CHECK_IN', startDate: null, endDate: null, defaultCheckInMethod: 'QR', defaultCheckInRadiusM: 15,
  tutorialScenario: null, tutorialExpiresAt: null,
}
const bases = ['Old mill', 'Chapel steps', 'Lookout'].map((name, i) => ({
  id: `b${i + 1}`, gameId: 'g', name, description: '', lat: 40 + i / 1000, lng: -8, sequenceNumber: i + 1,
  nfcLinked: true, hidden: false, checkInMethod: 'QR', checkInRadiusM: null,
}))
const challenges = ['Count the arches', 'Photograph the bell', 'Name the peak'].map((title, i) => ({
  id: `c${i + 1}`, gameId: 'g', title, description: '', content: '<p>Go.</p>', completionContent: '',
  answerType: 'text', autoValidate: false, points: 10, locationBound: false, requirePresenceToSubmit: false,
}))
const teams = [
  { id: 'falcons', gameId: 'g', name: 'Falcons', joinCode: 'FALC001', color: '#e07a1f' },
  { id: 'lions', gameId: 'g', name: 'Lions', joinCode: 'LION001', color: '#1f77e0' },
]

type Row = { baseId: string; challengeId: string; teamId?: string | null }

/** A setup game with three bases, three challenges and two teams; assignments are kept in memory. */
async function mockApi(page: Page, state: { rows: Row[]; puts: Row[][] }) {
  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    const method = request.method()
    if (path.startsWith('/api/auth/')) return route.fulfill({ json: { accessToken: token, user } })
    if (path === '/api/workspaces') return route.fulfill({ json: { personal: { tier: 'pro', status: 'active', activeGames: 1 }, organizations: [] } })
    if (path.startsWith('/api/quota/')) return route.fulfill({ json: { limits: { maxActiveGames: null }, usage: { currentActiveGames: 1 } } })
    if (path === '/api/users/me/tutorials') return route.fulfill({ json: [{ scenarioId: 'introduction', status: 'skipped', currentStep: null, gameId: null, startedAt: '2026-09-06T09:00:00Z', completedAt: null }] })
    if (path === '/api/games') return route.fulfill({ json: [game] })
    if (path === '/api/games/g') return route.fulfill({ json: game })
    if (path === '/api/games/g/bases') return route.fulfill({ json: bases })
    if (path === '/api/games/g/challenges') return route.fulfill({ json: challenges })
    if (path === '/api/games/g/teams') return route.fulfill({ json: teams })
    if (path === '/api/games/g/assignments' && method === 'PUT') {
      const body = request.postDataJSON() as { assignments: Row[] }
      state.puts.push(body.assignments)
      state.rows = body.assignments
      return route.fulfill({ json: body.assignments.map((row, i) => ({ id: `a${i}`, gameId: 'g', ...row })) })
    }
    if (path === '/api/games/g/assignments') return route.fulfill({ json: state.rows.map((row, i) => ({ id: `a${i}`, gameId: 'g', ...row })) })
    if (path === '/api/games/g/team-variables/completeness') return route.fulfill({ json: { complete: true, errors: [] } })
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

const key = (rows: Row[]) => rows.map((r) => `${r.baseId}:${r.teamId ?? 'all'}=${r.challengeId}`).sort()

/** Choose a challenge in a grid cell. On a phone the cell lives in the base's sheet. */
async function pickCell(page: Page, baseId: string, column: string, challengeId: string) {
  const cell = page.getByTestId(`assignment-cell-${baseId}-${column}`)
  if (!(await cell.isVisible())) {
    const sheet = page.getByTestId('assignment-base-dialog')
    if (await sheet.isVisible()) await page.getByTestId('assignment-base-done').click()
    await page.getByTestId(`assignment-base-${baseId}`).click()
  }
  await cell.click()
  await page.getByTestId(`challenge-option-${challengeId}`).click()
  await expect(cell).toHaveAttribute('data-value', challengeId)
}

/** Open a cell's picker without choosing (for confirm and refusal flows). */
async function pickCellOpen(page: Page, baseId: string, column: string) {
  const cell = page.getByTestId(`assignment-cell-${baseId}-${column}`)
  if (!(await cell.isVisible())) {
    const sheet = page.getByTestId('assignment-base-dialog')
    if (await sheet.isVisible()) await page.getByTestId('assignment-base-done').click()
    await page.getByTestId(`assignment-base-${baseId}`).click()
  }
  await cell.click()
}

test('two teams walk the same bases with the challenges in reverse order', async ({ page }) => {
  const state = { rows: [] as Row[], puts: [] as Row[][] }
  await mockApi(page, state)
  await login(page)

  await page.goto('/game/g')
  await page.locator('[data-testid="open-content-panel"]:visible').click()
  await expect(page.getByTestId('drawer-tabs')).toBeVisible()
  await page.locator('[data-testid="tab-bases"]:visible').click()
  await page.locator('[data-testid="assignment-grid-btn"]:visible').click()
  await expect(page.getByTestId('assignment-grid')).toBeVisible()

  // Falcons: 1, 2, 3 down the route. Lions: 3, 2, 1.
  const picks: Array<[string, string, string]> = [
    ['b1', 'falcons', 'c1'], ['b2', 'falcons', 'c2'], ['b3', 'falcons', 'c3'],
    ['b1', 'lions', 'c3'], ['b2', 'lions', 'c2'], ['b3', 'lions', 'c1'],
  ]
  for (const [baseId, teamId, challengeId] of picks) await pickCell(page, baseId, teamId, challengeId)

  await expect.poll(() => state.puts.length).toBe(6)
  expect(key(state.rows)).toEqual([
    'b1:falcons=c1', 'b1:lions=c3', 'b2:falcons=c2', 'b2:lions=c2', 'b3:falcons=c3', 'b3:lions=c1',
  ])

  // A challenge a team already meets elsewhere is not offered to that team again.
  const lionsAtB1 = page.getByTestId('assignment-cell-b1-lions')
  if (!(await lionsAtB1.isVisible())) {
    await page.getByTestId('assignment-base-done').click()
    await page.getByTestId('assignment-base-b1').click()
  }
  await lionsAtB1.click()
  await expect(page.getByTestId('challenge-option-c1')).toBeDisabled()
  await expect(page.getByTestId('challenge-option-c2')).toBeDisabled()
  await expect(page.getByTestId('challenge-option-c3')).toBeEnabled()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('assignment-grid-error')).toHaveCount(0)
})

test('an all-teams pick over per-team rows asks first, and a refused write shows why', async ({ page }) => {
  const state = { rows: [{ baseId: 'b1', challengeId: 'c1', teamId: 'falcons' }, { baseId: 'b1', challengeId: 'c3', teamId: 'lions' }] as Row[], puts: [] as Row[][] }
  await mockApi(page, state)
  await login(page)
  await page.goto('/game/g')
  await page.locator('[data-testid="open-content-panel"]:visible').click()
  await page.locator('[data-testid="tab-bases"]:visible').click()
  await page.locator('[data-testid="assignment-grid-btn"]:visible').click()

  await pickCellOpen(page, 'b1', 'all')
  await page.getByTestId('challenge-option-c2').click()
  await expect(page.getByText('Assign to all teams?')).toBeVisible()
  await page.getByTestId('confirm-action-btn').click()
  await expect.poll(() => state.puts.length).toBe(1)
  expect(key(state.rows)).toEqual(['b1:all=c2'])

  await page.route('**/api/games/g/assignments', (route) =>
    route.request().method() === 'PUT'
      ? route.fulfill({ status: 409, json: { status: 409, message: 'raw', code: 'ASSIGNMENT_CHALLENGE_REPEATED' } })
      : route.fallback(),
  )
  await pickCellOpen(page, 'b2', 'all')
  await page.getByTestId('challenge-option-c3').click()
  await expect(page.getByTestId('assignment-grid-error')).toHaveText('A challenge waits at one base for a team, or once for all teams.')
  await expect(page.getByTestId('assignment-cell-b2-all')).toHaveAttribute('data-value', '')
})
