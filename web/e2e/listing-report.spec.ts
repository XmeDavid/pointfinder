import { expect, test } from '@playwright/test'

/**
 * OW-06 smoke: a signed-in account opens an Explore listing, reports it and
 * sees the thanks; the request carries the reason and trimmed details. Runs
 * against both the browser build and the native artifact.
 */
const user = { id: 'u', name: 'Operator', email: 'operator@example.test', role: 'operator', createdAt: '2026-01-01' }
const token = `header.${Buffer.from(JSON.stringify({ exp: 4102444800 })).toString('base64url')}.signature`
const listing = {
  gameId: 'g-coast', title: 'Trilho da costa', summary: 'Follow the cliffs from the harbour to the lighthouse.', place: 'Nazaré',
  lat: null, lng: null, category: 'coast', organizer: 'Escuteiros de Nazaré', contentLanguage: 'pt', gameStatus: 'live',
  admission: 'open', joinable: true, featured: false, startDate: null, endDate: null, publishedAt: '2026-09-01T10:00:00Z',
  distanceKm: null, joined: false, playerId: null,
}

test('a signed-in account reports an Explore listing', async ({ page }, info) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const reports: unknown[] = []
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    if (path.startsWith('/api/auth/')) return route.fulfill({ json: { accessToken: token, user } })
    if (path === '/api/users/me/tutorials') return route.fulfill({ json: [{ scenarioId: 'introduction', status: 'skipped', currentStep: null, gameId: null, startedAt: '2026-09-06T09:00:00Z', completedAt: null }] })
    if (path === '/api/workspaces') return route.fulfill({ json: { personal: { tier: 'free', status: 'active', activeGames: 0 }, organizations: [] } })
    if (path.startsWith('/api/quota/')) return route.fulfill({ json: { limits: { maxActiveGames: 10 }, usage: { currentActiveGames: 0 } } })
    if (path === '/api/explore/games') return route.fulfill({ json: { items: [listing], page: 0, size: 20, total: 1, hasMore: false } })
    if (path === `/api/explore/games/${listing.gameId}/report`) {
      reports.push(route.request().postDataJSON())
      return route.fulfill({ status: 204 })
    }
    return route.fulfill({ json: [] })
  })
  await page.goto('/login')
  await page.getByTestId('login-email').fill(user.email)
  await page.getByTestId('login-password').fill('test-password')
  await page.getByTestId('login-submit').click()
  await expect(page).toHaveURL(/\/dashboard$/)

  await page.getByText(listing.title).first().click()
  const dialog = page.getByRole('dialog')
  await dialog.getByTestId('discovery-report').click()
  await expect(dialog.getByTestId('report-send')).toBeDisabled()
  await dialog.getByRole('radio', { name: 'Unsafe place or activity' }).check()
  await dialog.getByLabel('Details (optional)').fill('  The route crosses the national road.  ')
  await page.screenshot({ path: `test-results/${info.project.name}-listing-report-light.png`, fullPage: true })
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' })
  await page.screenshot({ path: `test-results/${info.project.name}-listing-report-dark.png`, fullPage: true })
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 844 })
    await expect(dialog.getByTestId('report-send')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
  }
  await dialog.getByTestId('report-send').click()
  await expect(dialog.getByRole('status')).toHaveText('Thanks. An administrator will review this listing.')
  expect(reports).toEqual([{ reason: 'unsafe', details: 'The route crosses the national road.' }])
  expect(errors).toEqual([])
})
