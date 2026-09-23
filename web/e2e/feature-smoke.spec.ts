import { expect, test, type Page } from '@playwright/test'
import { expectSection } from './drawerSections'

/**
 * Smoke coverage for the September feature slices on the browser build and the
 * native artifact: a choice question authored and answered (OW-34), a document
 * read first and then edited (OW-08), and Results reached from Monitor (OW-32).
 */
const user = { id: 'u', name: 'Organizer', email: 'organizer@example.test', role: 'operator', createdAt: '2026-01-01' }
const token = `header.${Buffer.from(JSON.stringify({ sub: 'u', exp: 4102444800 })).toString('base64url')}.signature`
const player = { kind: 'player', token: 'header.eyJ0ZWFtSWQiOiJ0In0.signature', playerId: 'p', teamId: 't', gameId: 'g', displayName: 'Scout', teamName: 'Falcons', teamColor: '#22c55e', gameName: 'Forest game', gameStatus: 'live' }

function operatorGame(status: 'setup' | 'live') {
  return { id: 'g', name: 'Feature trail', status, description: '', createdAt: '2026-01-01', createdBy: 'u', operatorIds: ['u'], uniformAssignment: true, broadcastEnabled: false, broadcastCode: null, tileSource: 'osm', unlockTrigger: 'CHECK_IN', startDate: null, endDate: null, orgId: null }
}

async function operatorFixture(page: Page, status: 'setup' | 'live' = 'setup') {
  const state = {
    challenge: { id: 'c1', gameId: 'g', title: 'Which tree?', description: '', content: '<p>Look around the clearing.</p>', completionContent: '', answerType: 'text', autoValidate: false, correctAnswer: [], points: 10, locationBound: false, tagIds: [], unlocksBaseIds: [], createdAt: '2026-01-01' } as Record<string, unknown>,
    document: { id: 'd1', orgId: null, gameId: 'g', folderId: null, type: 'document', name: 'Safety briefing', contentType: 'text/html', content: '<p>Stay on the marked paths.</p>', sizeBytes: 31, sharedWithPlayers: false, downloadUrl: null, createdBy: 'u', createdByName: 'Organizer', createdAt: '2026-09-01T10:00:00Z', updatedAt: '2026-09-01T10:00:00Z' } as Record<string, unknown>,
    documentSaves: [] as Array<Record<string, unknown>>,
  }
  const base = { id: 'b1', gameId: 'g', name: 'Clearing', description: '', lat: 40.09, lng: -8.87, nfcLinked: true, nfcToken: 'tok1', hidden: false, fixedChallengeId: 'c1', checkInMethod: 'NFC', checkInRadiusM: null, tagIds: [] }
  await page.route('https://tiles.openfreemap.org/**', route => route.fulfill({ json: { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#e8eee8' } }] } }))
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname
    const method = route.request().method()
    if (path.startsWith('/api/auth/')) return route.fulfill({ json: { accessToken: token, refreshToken: 'test-refresh', user } })
    if (path === '/api/users/me') return route.fulfill({ json: user })
    if (path === '/api/users/me/tutorials') return route.fulfill({ json: [{ scenarioId: 'first-game', status: 'skipped', currentStep: null, gameId: null }, { scenarioId: 'introduction', status: 'skipped', currentStep: null, gameId: null }] })
    if (path === '/api/workspaces') return route.fulfill({ json: { personal: { tier: 'free', status: 'active', activeGames: 1 }, organizations: [] } })
    if (path.startsWith('/api/quota/')) return route.fulfill({ json: { limits: { maxActiveGames: 10 }, usage: { currentActiveGames: 1 } } })
    if (path === '/api/games') return route.fulfill({ json: [operatorGame(status)] })
    if (path === '/api/games/g') return route.fulfill({ json: operatorGame(status) })
    if (path.endsWith('/bases')) return route.fulfill({ json: [base] })
    if (path.endsWith('/bases/b1')) return route.fulfill({ json: base })
    if (path.endsWith('/challenges')) return route.fulfill({ json: [state.challenge] })
    if (path.endsWith('/challenges/c1')) {
      if (method === 'PUT') {
        const body = route.request().postDataJSON() as Record<string, unknown>
        // The server assigns ids to new options, as ChoiceGrading does.
        const options = (body.choiceOptions as Array<Record<string, unknown>> | undefined)?.map((o, i) => ({ ...o, id: o.id ?? `o${i + 1}` }))
        state.challenge = { ...state.challenge, ...body, ...(options ? { choiceOptions: options } : {}) }
      }
      return route.fulfill({ json: state.challenge })
    }
    if (path.endsWith('/teams')) return route.fulfill({ json: [{ id: 't1', gameId: 'g', name: 'Falcons', color: '#22c55e', joinCode: 'FALCONS', playerCount: 2 }] })
    if (path.endsWith('/assignments')) return route.fulfill({ json: [{ id: 'a1', gameId: 'g', baseId: 'b1', challengeId: 'c1', teamId: null }] })
    if (path.endsWith('/team-variables/completeness')) return route.fulfill({ json: { complete: true, errors: [] } })
    if (path.endsWith('/team-variables')) return route.fulfill({ json: { variables: [] } })
    if (path === '/api/games/g/resources') return route.fulfill({ json: [state.document] })
    if (path === '/api/resources/d1') {
      if (method === 'PUT') {
        const body = route.request().postDataJSON() as Record<string, unknown>
        state.documentSaves.push(body)
        state.document = { ...state.document, ...body, updatedAt: '2026-09-23T10:00:00Z' }
      }
      return route.fulfill({ json: state.document })
    }
    return route.fulfill({ json: [] })
  })
  await page.goto('/login')
  await page.getByTestId('login-email').fill(user.email)
  await page.getByTestId('login-password').fill('test-password')
  await page.getByTestId('login-submit').click()
  await expect(page).toHaveURL(/\/dashboard$/)
  await page.goto('/game/g')
  return state
}

/** Build's shortcuts open the content panel straight at a section (OW-36). */
async function openContent(page: Page, section: 'bases' | 'documents') {
  await page.getByTestId(`build-shortcut-${section}`).click()
  await expectSection(page, section === 'bases' ? 'Bases' : 'Documents', section)
}

test('an organizer turns a challenge into a single-choice question', async ({ page }) => {
  const state = await operatorFixture(page)
  await openContent(page, 'bases')
  await page.getByTestId('base-item-b1').click()
  await page.getByTestId('open-linked-challenge-btn').click()
  await page.getByTestId('answer-type-single_choice').click()
  const editor = page.getByTestId('choice-options-editor')
  await expect(editor).toBeVisible()
  await page.getByTestId('choice-option-text-0').fill('Oak')
  await page.getByTestId('choice-option-text-1').fill('Pine')
  await page.getByTestId('choice-option-correct-0').check()
  await expect.poll(() => state.challenge.answerType).toBe('single_choice')
  await expect.poll(() => state.challenge.choiceOptions).toEqual([
    expect.objectContaining({ text: 'Oak', correct: true }),
    expect.objectContaining({ text: 'Pine', correct: false }),
  ])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
})

test('a document opens to be read, then edits and saves back to reading', async ({ page }, info) => {
  const state = await operatorFixture(page)
  await openContent(page, 'documents')
  await page.getByTestId('resource-open-d1').click()
  const viewer = page.getByTestId('resource-viewer')
  await expect(viewer.getByText('Stay on the marked paths.')).toBeVisible()
  await expect(viewer.getByTestId('resource-viewer-title-input')).toHaveCount(0)
  await page.screenshot({ path: `test-results/${info.project.name}-document-viewer.png` })
  await viewer.getByTestId('resource-viewer-edit').click()
  await viewer.getByTestId('resource-viewer-title-input').fill('Safety briefing v2')
  await viewer.getByTestId('resource-viewer-save').click()
  await expect(viewer.getByTestId('resource-viewer-title-input')).toHaveCount(0)
  await expect(viewer.getByRole('heading', { name: 'Safety briefing v2' })).toBeVisible()
  expect(state.documentSaves).toEqual([expect.objectContaining({ name: 'Safety briefing v2', content: '<p>Stay on the marked paths.</p>' })])
})

test('Results open from Monitor and return to it', async ({ page }) => {
  await operatorFixture(page, 'live')
  const monitor = page.locator('[data-testid="icon-rail-mobile"]:visible, [data-testid="icon-rail-desktop"]:visible').getByRole('button', { name: 'Monitor', exact: true })
  await monitor.click()
  await page.getByTestId('mode-results').click()
  await expect(page.getByTestId('results-overlay')).toBeVisible()
  await expect(monitor).toHaveAttribute('aria-pressed', 'true')
  await page.getByTestId('results-back-to-monitor').click()
  await expect(page.getByTestId('results-overlay')).toHaveCount(0)
  await expect(page.getByTestId('stats-bar')).toBeVisible()
})

test('a player answers a single-choice question once', async ({ context, page }) => {
  const submissions: Array<Record<string, unknown>> = []
  const challenge = { id: 'c1', title: 'Which tree?', answerType: 'single_choice', content: '<p>Which tree grows by the mill?</p>', options: [{ id: 'o-oak', text: 'Oak' }, { id: 'o-pine', text: 'Pine' }] }
  const base = { id: 'b1', gameId: 'g', lat: 40.09, lng: -8.87, nfcLinked: true, hidden: false, fixedChallengeId: 'c1' }
  let checkedIn = false
  const progress = () => [{ baseId: 'b1', challengeTitle: challenge.title, challengeId: 'c1', lat: base.lat, lng: base.lng, nfcLinked: true, status: submissions.length ? 'completed' : checkedIn ? 'checked_in' : 'not_visited', checkedInAt: checkedIn ? '2026-09-05T10:00:00Z' : null }]
  await context.addInitScript(auth => localStorage.setItem('pf.auth', JSON.stringify(auth)), player)
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname
    const method = route.request().method()
    if (method === 'POST' && path.includes('check-in')) {
      checkedIn = true
      return route.fulfill({ json: { checkInId: 'ci-b1', baseId: 'b1', checkedInAt: '2026-09-05T10:00:00Z', challenge } })
    }
    if (method === 'POST' && path.endsWith('/submissions')) {
      const body = route.request().postDataJSON() as Record<string, unknown>
      submissions.push(body)
      return route.fulfill({ json: { id: 's1', teamId: 't', challengeId: 'c1', baseId: 'b1', answer: '', status: 'correct', submittedAt: '2026-09-05T10:05:00Z' } })
    }
    if (path.endsWith('/data')) return route.fulfill({ json: { gameStatus: 'live', unlockTrigger: 'CHECK_IN', bases: [base], challenges: [challenge], assignments: [{ id: 'a1', baseId: 'b1', challengeId: 'c1', teamId: null }], progress: progress() } })
    if (path.endsWith('/snapshot')) return route.fulfill({ json: { stateVersion: submissions.length + 1, serverTime: '2026-09-05T10:00:00Z', game: { id: 'g', name: 'Forest game', status: 'live' }, team: { id: 't', name: 'Falcons', memberCount: 3 }, progress: progress(), submissions: [], uploadSessions: [] } })
    return route.fulfill({ json: [] })
  })
  await page.goto('/base/b1?token=proof-1')
  const send = page.getByTestId('player-choice-submit-btn')
  await expect(send).toBeDisabled()
  await expect(page.getByRole('textbox')).toHaveCount(0)
  await page.getByRole('radio', { name: 'Oak' }).check()
  await send.click()
  await expect(page.getByTestId('player-submission-status')).toContainText('Correct')
  expect(submissions).toEqual([expect.objectContaining({ baseId: 'b1', challengeId: 'c1', selectedOptionIds: ['o-oak'] })])
})
