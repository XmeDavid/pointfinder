import { expect, test } from '@playwright/test'

test('saved photos survive offline reload and a lost upload completion response', async ({ page, context }, info) => {
  test.skip(info.project.name !== 'browser', 'Native storage is verified separately through Android IPC.')
  const auth = { kind: 'player', token: 'player', playerId: 'p', teamId: 't', gameId: 'g', displayName: 'Scout', teamName: 'Team', teamColor: '', gameName: 'Game', gameStatus: 'live' }
  const photo = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jD1kAAAAASUVORK5CYII=', 'base64')
  let online = true
  let completed = false
  let mediaKey = ''
  let starts = 0
  let chunks = 0
  const submissions: Array<{ fileUrls: string[]; idempotencyKey: string }> = []
  const session = () => ({ sessionId: 'upload', gameId: 'g', mediaItemKey: mediaKey, contentType: 'image/png', totalSizeBytes: photo.length, chunkSizeBytes: 1024, totalChunks: 1, uploadedChunks: chunks ? [0] : [], status: completed ? 'completed' : 'active', fileUrl: completed ? '/files/photo.png' : null, expiresAt: '2099-01-01T00:00:00Z' })
  await context.addInitScript((value) => localStorage.setItem('pf.auth', JSON.stringify(value)), auth)
  await page.route('**/api/**', async (route) => {
    if (!online) return route.abort('internetdisconnected')
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/uploads/sessions') && route.request().method() === 'POST') {
      starts++
      mediaKey = route.request().postDataJSON().mediaItemKey
      return route.fulfill({ json: session() })
    }
    if (path.endsWith('/chunks/0')) {
      expect(route.request().postDataBuffer()).toEqual(photo)
      chunks++
      return route.fulfill({ json: session() })
    }
    if (path.endsWith('/upload/complete')) {
      completed = true
      // The server committed the file, but the client never received its URL.
      online = false
      return route.abort('internetdisconnected')
    }
    if (path.endsWith('/uploads/sessions/upload')) return route.fulfill({ json: session() })
    if (path.endsWith('/submissions') && route.request().method() === 'POST') {
      submissions.push(route.request().postDataJSON())
      return route.fulfill({ json: { id: 'submission', status: 'submitted' } })
    }
    if (path.endsWith('/data')) return route.fulfill({ json: {
      bases: [{ id: 'b', name: 'Base', fixedChallengeId: 'c', nfcLinked: true }],
      challenges: [{ id: 'c', title: 'Take a photo', answerType: 'file', description: '', content: '', completionContent: '' }], assignments: [], progress: [],
    } })
    if (path.endsWith('/snapshot')) return route.fulfill({ json: {
      stateVersion: 1, game: { id: 'g', name: 'Game', status: 'live' }, team: { id: 't' },
      progress: [{ baseId: 'b', challengeTitle: 'Take a photo', status: 'checked_in', nfcLinked: true }], submissions: [], uploadSessions: [],
    } })
    return route.fulfill({ json: path.endsWith('/unseen-count') ? { count: 0 } : [] })
  })
  await page.goto('/base/b')
  await expect(page.getByTestId('player-media-library-btn')).toBeVisible()
  await page.evaluate(async () => { await navigator.serviceWorker.ready })
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true)
  online = false
  await context.setOffline(true)
  const chooser = page.waitForEvent('filechooser')
  await page.getByTestId('player-media-library-btn').click()
  await (await chooser).setFiles({ name: 'photo.png', mimeType: 'image/png', buffer: photo })
  await page.getByTestId('player-media-submit-btn').click()
  await expect(page.getByTestId('player-submission-status')).toHaveText('Saved offline')
  await page.reload()
  await expect(page.getByText('1 action waiting to sync').first()).toBeVisible()
  await page.waitForTimeout(2200)
  online = true
  await context.setOffline(false)
  // Reload can retry while offline and extend the backoff. Recovery runs on the
  // app-level 15-second timer when the online event precedes the next due time.
  await expect.poll(() => completed, { timeout: 35_000 }).toBe(true)
  expect(submissions).toHaveLength(0)
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByText('1 action waiting to sync').first()).toBeVisible()
  await page.waitForTimeout(4200)
  online = true
  await context.setOffline(false)
  await expect.poll(() => submissions.length, { timeout: 35_000 }).toBe(1)
  expect(submissions[0]).toMatchObject({ fileUrls: ['/files/photo.png'], idempotencyKey: expect.any(String) })
  expect(starts).toBe(1)
  expect(chunks).toBe(1)
  await expect(page.getByText('1 action waiting to sync')).toHaveCount(0)
  const mediaCount = await page.evaluate(() => new Promise<number>((resolve, reject) => {
    const request = indexedDB.open('pointfinder', 2)
    request.onsuccess = () => {
      const db = request.result
      const count = db.transaction('media').objectStore('media').count()
      count.onsuccess = () => { resolve(count.result); db.close() }
      count.onerror = () => reject(count.error)
    }
  }))
  expect(mediaCount).toBe(0)
})
