import { expect, test, type Page } from '@playwright/test'

/**
 * The three advanced tutorials, each on its seeded practice game. The mock
 * API keeps the practice game's state in memory so the coach marks can watch
 * real writes: the unlock link, the assignment grid, the team variable.
 */
const user = { id: 'u', name: 'Operator', email: 'operator@example.test', role: 'operator', createdAt: '2026-01-01' }
const token = `header.${Buffer.from(JSON.stringify({ exp: 4102444800 })).toString('base64url')}.signature`

type Base = { id: string; gameId: string; name: string; description: string; lat: number; lng: number; nfcLinked: boolean; hidden: boolean; checkInMethod: string; checkInRadiusM: null; fixedChallengeId?: string }
type Challenge = Record<string, unknown> & { id: string; title: string; fixedBaseId?: string; unlocksBaseIds: string[]; completionContent: string; locationBound: boolean }
type Row = { baseId: string; challengeId: string; teamId?: string | null }
type State = { game: Record<string, unknown>; bases: Base[]; challenges: Challenge[]; teams: Array<{ id: string; gameId: string; name: string; joinCode: string; color: string }>; rows: Row[]; variables: Record<string, Record<string, string>> }

function game(scenario: string, name: string) {
  return {
    id: 'g', name, status: 'setup', description: '', createdBy: 'u', operatorIds: ['u'], enforceBaseOrder: false, uniformAssignment: false,
    broadcastEnabled: false, broadcastCode: null, tileSource: 'osm', unlockTrigger: 'CHECK_IN', startDate: null, endDate: null,
    defaultCheckInMethod: 'QR', defaultCheckInRadiusM: 15, tutorialScenario: scenario, tutorialExpiresAt: '2026-09-08T09:00:00Z',
  }
}
const base = (id: string, name: string, i: number, extra: Partial<Base> = {}): Base => ({
  id, gameId: 'g', name, description: '', lat: 40 + i / 1000, lng: -8 + i / 1000, nfcLinked: true, hidden: false, checkInMethod: 'QR', checkInRadiusM: null, ...extra,
})
const challenge = (id: string, title: string, extra: Partial<Challenge> = {}): Challenge => ({
  id, gameId: 'g', title, description: '', content: '<p>Go.</p>', completionContent: '', answerType: 'text', autoValidate: false, points: 10,
  locationBound: false, requirePresenceToSubmit: false, unlocksBaseIds: [], ...extra,
})
const team = (id: string, name: string, color: string) => ({ id, gameId: 'g', name, joinCode: `${id.toUpperCase()}001`, color })

async function mockApi(page: Page, scenario: string, state: State) {
  let created = false
  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    const method = request.method()
    const json = (body: unknown, status = 200) => route.fulfill({ status, json: body })
    if (path.startsWith('/api/auth/')) return json({ accessToken: token, user })
    if (path === '/api/workspaces') return json({ personal: { tier: 'pro', status: 'active', activeGames: 1 }, organizations: [] })
    if (path.startsWith('/api/quota/')) return json({ limits: { maxActiveGames: null }, usage: { currentActiveGames: 1 } })
    if (path === '/api/users/me/tutorials') return json(created ? [{ scenarioId: scenario, status: 'in_progress', currentStep: null, gameId: 'g', startedAt: '2026-09-06T09:00:00Z', completedAt: null }] : [])
    if (path.endsWith('/practice-game') && method === 'POST') { created = true; return json(state.game, 201) }
    if (path.startsWith('/api/users/me/tutorials/') && method === 'PUT') return json({ scenarioId: scenario, ...(request.postDataJSON() as object), startedAt: '2026-09-06T09:00:00Z', completedAt: null })
    if (path === '/api/games') return json(created ? [state.game] : [])
    if (path === '/api/games/g') return json(state.game)
    if (path === '/api/games/g/bases') return json(state.bases)
    if (path === '/api/games/g/challenges') return json(state.challenges)
    if (path === '/api/games/g/teams') return json(state.teams)
    const challengeMatch = path.match(/^\/api\/games\/g\/challenges\/([^/]+)$/)
    if (challengeMatch && method === 'PUT') {
      const body = request.postDataJSON() as Partial<Challenge>
      state.challenges = state.challenges.map((c) => (c.id === challengeMatch[1] ? { ...c, ...body, unlocksBaseIds: (body.unlocksBaseIds as string[] | undefined) ?? c.unlocksBaseIds } : c))
      return json(state.challenges.find((c) => c.id === challengeMatch[1]))
    }
    if (challengeMatch) return json(state.challenges.find((c) => c.id === challengeMatch[1]))
    if (path === '/api/games/g/assignments' && method === 'PUT') {
      state.rows = (request.postDataJSON() as { assignments: Row[] }).assignments
      return json(state.rows.map((row, i) => ({ id: `a${i}`, gameId: 'g', ...row })))
    }
    if (path === '/api/games/g/assignments') return json(state.rows.map((row, i) => ({ id: `a${i}`, gameId: 'g', ...row })))
    const varsMatch = path.match(/^\/api\/games\/g\/challenges\/([^/]+)\/team-variables$/)
    if (varsMatch && method === 'PUT') {
      const body = request.postDataJSON() as { variables: Array<{ key: string; teamValues: Record<string, string> }> }
      state.variables = Object.fromEntries(body.variables.map((v) => [v.key, v.teamValues]))
      return json({ variables: body.variables })
    }
    if (varsMatch) return json({ variables: Object.entries(state.variables).map(([key, teamValues]) => ({ key, teamValues })) })
    if (path === '/api/games/g/team-variables') return json({ variables: [] })
    if (path === '/api/games/g/team-variables/completeness') return json({ complete: true, errors: [] })
    return json([])
  })
}

async function login(page: Page) {
  await page.goto('/login')
  await page.getByTestId('login-email').fill(user.email)
  await page.getByTestId('login-password').fill('test-password')
  await page.getByTestId('login-submit').click()
  await expect(page).toHaveURL(/\/dashboard$/)
}

async function startFromLibrary(page: Page, scenario: string) {
  await page.goto('/tutorials')
  await page.getByTestId(`tutorial-start-${scenario}`).click()
  await expect(page).toHaveURL(/\/game\/g/)
}

test('unlock chain: the operator sets the first link and saves it', async ({ page }) => {
  const state: State = {
    game: game('unlock-chain', 'Practice: unlock chain'),
    bases: [
      base('trail', 'Trailhead', 0, { fixedChallengeId: 'c1' }), base('bridge', 'Old bridge', 1, { hidden: true, fixedChallengeId: 'c2' }),
      base('tower', 'Ruined tower', 2, { hidden: true, fixedChallengeId: 'c3' }), base('ford', 'River ford', 3, { hidden: true, fixedChallengeId: 'c4' }),
      base('cache', 'Bonus cache', 4, { hidden: true }), base('summit', 'Summit', 5, { hidden: true }),
    ],
    challenges: [
      challenge('c1', 'Read the trail sign', { fixedBaseId: 'trail', locationBound: true }),
      challenge('c2', 'Count the bridge arches', { fixedBaseId: 'bridge', locationBound: true, unlocksBaseIds: ['tower', 'ford'] }),
      challenge('c3', 'Sketch the tower', { fixedBaseId: 'tower', locationBound: true, unlocksBaseIds: ['cache'] }),
      challenge('c4', 'Cross the ford', { fixedBaseId: 'ford', locationBound: true, unlocksBaseIds: ['summit'] }),
    ],
    teams: [team('scouts', 'Scouts', '#1f77e0')], rows: [], variables: {},
  }
  await mockApi(page, 'unlock-chain', state)
  await login(page)
  await startFromLibrary(page, 'unlock-chain')

  const title = page.getByTestId('tour-bubble-title')
  await expect(title).toHaveText('Only the trailhead shows')
  await page.getByTestId('tour-next').click()
  await expect(title).toHaveText('Open the trailhead challenge')

  await page.locator('[data-testid="challenge-item-c1"]:visible').click()
  await expect(title).toHaveText('Reveal the old bridge')
  await page.getByTestId('unlocks-base-bridge').click()
  await expect(title).toHaveText('Save the link')
  await page.getByTestId('save-challenge').click()
  await expect.poll(() => state.challenges[0].unlocksBaseIds).toEqual(['bridge'])
  await expect(title).toHaveText('A fork')
  await page.getByTestId('tour-next').click()
  await expect(title).toHaveText('A bonus behind them')
  await page.getByTestId('tour-next').click()
  await expect(title).toHaveText('Chain done')
  await expect(page.getByTestId('practice-game-choices')).toBeVisible()
})

test('a different path: both routes are built in the grid', async ({ page }) => {
  const state: State = {
    game: game('different-path', 'Practice: a different path'),
    bases: [base('A', 'Base A · Old mill', 0), base('B', 'Base B · Chapel steps', 1), base('C', 'Base C · Lookout', 2)],
    challenges: [challenge('c1', '1 · Count the arches'), challenge('c2', '2 · Photograph the bell'), challenge('c3', '3 · Name the peak')],
    teams: [team('falcons', 'Falcons', '#e07a1f'), team('lions', 'Lions', '#1f77e0')], rows: [], variables: {},
  }
  await mockApi(page, 'different-path', state)
  await login(page)
  await startFromLibrary(page, 'different-path')

  const title = page.getByTestId('tour-bubble-title')
  await expect(title).toHaveText('Same bases, opposite starts')
  await page.getByTestId('tour-next').click()
  await expect(title).toHaveText('Open Assignments')
  await page.locator('[data-testid="assignment-grid-btn"]:visible').click()
  await expect(title).toHaveText('Falcons: A→1, B→2, C→3')

  for (const [b, c] of [['A', 'c1'], ['B', 'c2'], ['C', 'c3']]) await page.getByTestId(`assignment-cell-${b}-falcons`).selectOption(c)
  await expect(title).toHaveText('Lions: C→1, B→2, A→3')
  for (const [b, c] of [['C', 'c1'], ['B', 'c2'], ['A', 'c3']]) await page.getByTestId(`assignment-cell-${b}-lions`).selectOption(c)
  await expect(title).toHaveText('Tell them where to start')
  await page.getByTestId('tour-next').click()
  await expect(title).toHaveText('Two paths, one game')
})

test('a variable outcome: a team variable used in the completion text', async ({ page }) => {
  const state: State = {
    game: game('variable-outcome', 'Practice: a variable outcome'),
    bases: [base('mill', 'Old mill', 0, { fixedChallengeId: 'c1' }), base('chapel', 'Chapel steps', 1), base('lookout', 'Lookout', 2)],
    challenges: [challenge('c1', 'Count the arches', { fixedBaseId: 'mill', locationBound: true }), challenge('c2', 'Photograph the bell'), challenge('c3', 'Name the peak')],
    teams: [team('falcons', 'Falcons', '#e07a1f'), team('lions', 'Lions', '#1f77e0')],
    rows: [{ baseId: 'chapel', challengeId: 'c2' }, { baseId: 'lookout', challengeId: 'c3' }], variables: {},
  }
  await mockApi(page, 'variable-outcome', state)
  await login(page)
  await startFromLibrary(page, 'variable-outcome')

  const title = page.getByTestId('tour-bubble-title')
  await expect(title).toHaveText('Same words, different destination')
  await page.getByTestId('tour-next').click()
  await expect(title).toHaveText('Open the pinned challenge')
  await page.locator('[data-testid="challenge-item-c1"]:visible').click()
  await expect(title).toHaveText('Name the variable')
  await page.getByTestId('variable-key-input').fill('next')
  await expect(title).toHaveText('Add it')
  await page.getByTestId('add-variable-btn').click()
  await expect(title).toHaveText('One value per team')
  await page.getByTestId('variable-value-next-falcons').fill('the chapel')
  await page.getByTestId('variable-value-next-lions').fill('the lookout')
  await expect(title).toHaveText('Save the values')
  await page.getByTestId('save-variables-btn').click()
  await expect.poll(() => Object.keys(state.variables)).toEqual(['next'])
  await expect(title).toHaveText('Use it in the completion text')
  await page.getByTestId('completion-content').locator('[contenteditable="true"]').click()
  await page.keyboard.type('Good work — go to {{next}}.')
  await expect(title).toHaveText('Save the challenge')
  await page.getByTestId('save-challenge').click()
  await expect(title).toHaveText('Variable done')
})
