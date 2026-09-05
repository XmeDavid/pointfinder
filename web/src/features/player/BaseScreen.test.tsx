import { describe, expect, it, vi } from 'vitest'
import { act, screen, waitFor } from '@testing-library/react'
import { useNavigate } from 'react-router-dom'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import { renderPlayer } from '@/features/player/test/renderPlayer'
import BaseScreen from './BaseScreen'

const NOT_VISITED = { baseId: 'b1', challengeTitle: 'The old mill', lat: 40.09, lng: -8.87, nfcLinked: true, status: 'not_visited', checkedInAt: null, challengeId: 'c1', submissionStatus: null }

/** Stateful fixture: a check-in moves the base to checked_in, like the real server. */
function progressOverride(initial: Array<Record<string, unknown>>, gameStatus: 'setup' | 'live' | 'ended' = 'live', answerType = 'text', presence = false) {
  let progress = initial
  server.use(
    http.post('/api/player/games/:gameId/bases/:baseId/check-in', async ({ params, request }) => {
      const body = (await request.json()) as { nfcToken?: string }
      if (body.nfcToken === 'wrong') return HttpResponse.json({ status: 403, message: 'Invalid tag', code: 'NFC_TOKEN_MISMATCH' }, { status: 403 })
      progress = progress.map((p) => (p.baseId === params.baseId ? { ...p, status: 'checked_in', checkedInAt: '2026-09-05T10:45:00Z' } : p))
      return HttpResponse.json({ checkInId: 'ci-1', baseId: params.baseId, checkedInAt: '2026-09-05T10:45:00Z' })
    }),
    http.get('/api/player/games/:gameId/data', () => HttpResponse.json({
      gameStatus: 'live', unlockTrigger: 'CHECK_IN',
      bases: [{ id: 'b1', gameId: 'g1', lat: 40.09, lng: -8.87, nfcLinked: true, hidden: false, fixedChallengeId: null }, { id: 'b2', gameId: 'g1', lat: 40.091, lng: -8.871, nfcLinked: true, hidden: false, fixedChallengeId: null }],
      challenges: [
        { id: 'c1', gameId: 'g1', title: 'The old mill', description: 'Count the wheels', content: '<p>How many wheels?</p>', answerType, points: 10 },
        { id: 'c2', gameId: 'g1', title: 'Granite boulder', description: 'Team photo', content: '', answerType: 'file', requirePresenceToSubmit: presence, points: 20 },
      ],
      assignments: [{ id: 'a1', gameId: 'g1', baseId: 'b1', challengeId: 'c1', teamId: null }, { id: 'a2', gameId: 'g1', baseId: 'b2', challengeId: 'c2', teamId: null }],
      progress,
    })),
    http.get('/api/games/:gameId/snapshot', () => HttpResponse.json({
      stateVersion: 1, serverTime: '2026-09-05T10:30:00Z', game: { id: 'g1', name: 'Serra da Estrela', status: gameStatus }, team: { id: 'team1', name: 'Falcons', memberCount: 4 }, progress, submissions: [], uploadSessions: [],
    })),
  )
}

describe('BaseScreen', () => {
  it('checks in straight from a tag tap and shows the challenge', async () => {
    progressOverride([NOT_VISITED])
    await renderPlayer(<BaseScreen />, { route: '/base/b1?token=secret', path: '/base/:baseId' })
    expect(await screen.findByRole('status')).toHaveTextContent("You're in!")
    // The snapshot refetch re-renders the challenge content; re-query rather than hold a node.
    await waitFor(() => expect(screen.getByText('How many wheels?')).toBeInTheDocument())
    await waitFor(() => expect(screen.getByText('Checked in')).toBeInTheDocument())
  })

  it('rejects a foreign tag with the server reason', async () => {
    progressOverride([NOT_VISITED])
    await renderPlayer(<BaseScreen />, { route: '/base/b1?token=wrong', path: '/base/:baseId' })
    expect(await screen.findByRole('status')).toHaveTextContent('Invalid tag')
    expect(screen.queryByText('How many wheels?')).not.toBeInTheDocument()
  })

  it('shows the verdict, feedback and unlocked information after a text answer', async () => {
    progressOverride([{ ...NOT_VISITED, status: 'checked_in', checkedInAt: '2026-09-05T10:00:00Z' }])
    await renderPlayer(<BaseScreen />, { route: '/base/b1', path: '/base/:baseId' })
    await userEvent.type(await screen.findByLabelText('Your answer'), '3')
    await userEvent.click(screen.getByRole('button', { name: 'Send answer' }))
    expect(await screen.findByTestId('player-submission-status')).toHaveTextContent('Rejected')
    expect(screen.getByText('Feedback: Count only the wheels inside the circle.')).toBeInTheDocument()
    await userEvent.clear(screen.getByLabelText('Your answer'))
    await userEvent.type(screen.getByLabelText('Your answer'), '7')
    await userEvent.click(screen.getByRole('button', { name: 'Send answer' }))
    await waitFor(() => expect(screen.getByTestId('player-submission-status')).toHaveTextContent('Correct!'))
  })

  it('celebrates a correct answer with the unlocked information', async () => {
    progressOverride([{ ...NOT_VISITED, status: 'checked_in', checkedInAt: '2026-09-05T10:00:00Z' }])
    await renderPlayer(<BaseScreen />, { route: '/base/b1', path: '/base/:baseId' })
    await userEvent.type(await screen.findByLabelText('Your answer'), '7')
    await userEvent.click(screen.getByRole('button', { name: 'Send answer' }))
    expect(await screen.findByTestId('player-submission-status')).toHaveTextContent('Correct!')
    expect(screen.getByText('Unlocked Information')).toBeInTheDocument()
    expect(screen.getByText('Well done, the mill dates from 1850.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to Map' })).toBeInTheDocument()
  })

  it('sends a photo answer through the media service and reports it as pending', { timeout: 15_000 }, async () => {
    progressOverride([{ ...NOT_VISITED, baseId: 'b2', challengeTitle: 'Granite boulder', challengeId: 'c2', status: 'checked_in', checkedInAt: '2026-09-05T10:00:00Z' }])
    const { services } = await renderPlayer(<BaseScreen />, { route: '/base/b2', path: '/base/:baseId' })
    expect(await screen.findByTestId('player-media-answer')).toBeInTheDocument()
    expect(screen.getByTestId('player-media-camera-btn')).toBeInTheDocument()
    expect(screen.getByTestId('player-media-submit-btn')).toBeDisabled()
    const enqueue = vi.spyOn(services.media, 'enqueueSubmission')
    // Bypass the OS chooser: hand the component a file the way pickMedia would.
    const file = new File(['abc'], 'team.jpg', { type: 'image/jpeg' })
    const libraryBtn = screen.getByTestId('player-media-library-btn')
    const mediaModule = await import('@/platform/media')
    vi.spyOn(mediaModule, 'pickMedia').mockResolvedValueOnce([file])
    await userEvent.click(libraryBtn)
    expect(await screen.findByText('1 of 5 selected')).toBeInTheDocument()
    await userEvent.click(screen.getByTestId('player-media-submit-btn'))
    expect(await screen.findByTestId('player-submission-status', {}, { timeout: 8000 })).toHaveTextContent('Submitted')
    expect(enqueue).toHaveBeenCalledWith(expect.objectContaining({ baseId: 'b2', challengeId: 'c2', files: [file] }))
  })

  it('keeps a queued answer on the phone when the network is gone', async () => {
    progressOverride([{ ...NOT_VISITED, status: 'checked_in', checkedInAt: '2026-09-05T10:00:00Z' }])
    server.use(http.post('/api/player/games/:gameId/submissions', () => HttpResponse.error()))
    const { services } = await renderPlayer(<BaseScreen />, { route: '/base/b1', path: '/base/:baseId' })
    await userEvent.type(await screen.findByLabelText('Your answer'), '7')
    await userEvent.click(screen.getByRole('button', { name: 'Send answer' }))
    expect(await screen.findByTestId('player-submission-status')).toHaveTextContent('Saved offline')
    await waitFor(async () => expect(await services.queue.pendingCount()).toBe(1))
  })

  it('blocks answering while the game is not live', async () => {
    progressOverride([{ ...NOT_VISITED, status: 'checked_in', checkedInAt: '2026-09-05T10:00:00Z' }], 'ended')
    await renderPlayer(<BaseScreen />, { route: '/base/b1', path: '/base/:baseId' })
    expect(await screen.findByTestId('player-game-not-live')).toHaveTextContent('This game is not currently active')
    expect(screen.queryByLabelText('Your answer')).not.toBeInTheDocument()
  })

  it('does not auto-submit check-in-only challenges in an ended game', async () => {
    progressOverride([{ ...NOT_VISITED, status: 'checked_in' }], 'ended', 'none')
    const submitted = vi.fn()
    server.use(http.post('/api/player/games/:gameId/submissions', () => { submitted(); return HttpResponse.json({ id: 's', status: 'correct' }) }))
    await renderPlayer(<BaseScreen />, { route: '/base/b1', path: '/base/:baseId' })
    await screen.findByTestId('player-game-not-live')
    expect(submitted).not.toHaveBeenCalled()
  })

  it('updates a queued result when the server snapshot confirms completion', async () => {
    progressOverride([{ ...NOT_VISITED, status: 'checked_in' }])
    const { services, queryClient } = await renderPlayer(<BaseScreen />, {
      route: '/base/b1', path: '/base/:baseId',
      pending: [{ type: 'submission', id: 'q', gameId: 'g1', baseId: 'b1', challengeId: 'c1', answer: '7', createdAt: '', state: 'pending', attempts: 0, nextAttemptAt: Date.now() + 60_000 }],
    })
    expect(await screen.findByTestId('player-submission-status')).toHaveTextContent('Saved offline')
    await act(async () => {
      await services.queue.discard('q')
      queryClient.setQueryData(['snapshot', 'g1'], {
        game: { id: 'g1', status: 'live' }, progress: [{ ...NOT_VISITED, status: 'completed' }],
        submissions: [{ id: 's', baseId: 'b1', status: 'approved' }], uploadSessions: [],
      })
    })
    await waitFor(() => expect(screen.getByTestId('player-submission-status')).toHaveTextContent('Approved'))
    expect(screen.queryByText('Saved offline')).not.toBeInTheDocument()
  })

  it('clears the previous base result on direct base-to-base navigation', async () => {
    progressOverride([{ ...NOT_VISITED, status: 'checked_in' }, { ...NOT_VISITED, baseId: 'b2', status: 'checked_in', challengeId: 'c2', challengeTitle: 'Granite boulder' }])
    function Journey() {
      const navigate = useNavigate()
      return <><button onClick={() => navigate('/base/b2')}>Next base</button><BaseScreen /></>
    }
    await renderPlayer(<Journey />, { route: '/base/b1', path: '/base/:baseId' })
    await userEvent.type(await screen.findByLabelText('Your answer'), '7')
    await userEvent.click(screen.getByRole('button', { name: 'Send answer' }))
    await screen.findByTestId('player-submission-status')
    await userEvent.click(screen.getByRole('button', { name: 'Next base' }))
    expect(await screen.findByTestId('player-media-answer')).toBeInTheDocument()
    expect(screen.queryByTestId('player-submission-result')).not.toBeInTheDocument()
  })

  it('shows a newer teammate submission instead of this players previous rejection', async () => {
    progressOverride([{ ...NOT_VISITED, status: 'checked_in' }])
    const { queryClient } = await renderPlayer(<BaseScreen />, { route: '/base/b1', path: '/base/:baseId' })
    await userEvent.type(await screen.findByLabelText('Your answer'), '3')
    await userEvent.click(screen.getByRole('button', { name: 'Send answer' }))
    await waitFor(() => expect(screen.getByTestId('player-submission-status')).toHaveTextContent('Rejected'))
    await act(async () => {
      queryClient.setQueryData(['snapshot', 'g1'], {
        game: { id: 'g1', status: 'live' }, progress: [{ ...NOT_VISITED, status: 'completed' }],
        submissions: [{ id: 'teammate', baseId: 'b1', status: 'approved', submittedAt: '2099-01-01T00:00:00Z' }], uploadSessions: [],
      })
    })
    await waitFor(() => expect(screen.getByTestId('player-submission-status')).toHaveTextContent('Approved'))
    expect(screen.queryByText(/Feedback: Count only/)).not.toBeInTheDocument()
  })

  it('requires the correct base tag before queuing presence-bound photos', async () => {
    progressOverride([{ ...NOT_VISITED, baseId: 'b2', challengeId: 'c2', status: 'checked_in' }], 'live', 'text', true)
    const platform = await import('@/platform')
    vi.spyOn(platform, 'isNative').mockReturnValue(true)
    const { services } = await renderPlayer(<BaseScreen />, { route: '/base/b2', path: '/base/:baseId' })
    await screen.findByTestId('player-media-answer')
    const nfc = await import('@/platform/nfc')
    const scan = vi.spyOn(nfc, 'scanTag').mockResolvedValue({ tag: { baseId: 'wrong', token: 't' }, raw: { id: null, url: null, records: [] } })
    vi.spyOn(await import('@/platform/media'), 'pickMedia').mockResolvedValueOnce([new File(['abc'], 'photo.jpg', { type: 'image/jpeg' })])
    const enqueue = vi.spyOn(services.media, 'enqueueSubmission')
    await userEvent.click(screen.getByTestId('player-media-library-btn'))
    await screen.findByText('1 of 5 selected')
    await userEvent.click(screen.getByTestId('player-media-submit-btn'))
    await waitFor(() => expect(scan).toHaveBeenCalled())
    expect(enqueue).not.toHaveBeenCalled()
  })
})
