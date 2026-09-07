import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import { createMockBase } from '@/test/factories/base'
import { createMockChallenge } from '@/test/factories/challenge'
import { createMockTeam } from '@/test/factories/team'
import { AssignmentGrid } from './AssignmentGrid'

// The shared test setup stubs matchMedia to report matches: false, so the
// grid renders its phone shape here: the base list and the per-base sheet.

const bases = [
  createMockBase({ id: 'A', name: 'Old mill', sequenceNumber: 1 }),
  createMockBase({ id: 'B', name: 'Chapel', sequenceNumber: 2, fixedChallengeId: 'c2' }),
]
const sent: Array<Array<{ baseId: string; challengeId: string; teamId?: string }>> = []

function mockGame(assignments: Array<{ id: string; gameId: string; baseId: string; challengeId: string; teamId?: string }>) {
  sent.length = 0
  // The server keeps what the last write sent, so a refetch shows the new plan.
  let current = assignments
  server.use(
    http.get('/api/games/g/challenges', () => HttpResponse.json([
      createMockChallenge({ id: 'c1', title: 'One' }), createMockChallenge({ id: 'c2', title: 'Two' }), createMockChallenge({ id: 'c3', title: 'Three' }),
    ])),
    http.get('/api/games/g/teams', () => HttpResponse.json([
      createMockTeam({ id: 'falcons', name: 'Falcons' }), createMockTeam({ id: 'lions', name: 'Lions' }),
    ])),
    http.get('/api/games/g/assignments', () => HttpResponse.json(current)),
    http.put('/api/games/g/assignments', async ({ request }) => {
      const body = (await request.json()) as { assignments: (typeof sent)[number] }
      sent.push(body.assignments)
      current = body.assignments.map((a, i) => ({ id: `n${i}`, gameId: 'g', ...a }))
      return HttpResponse.json(current)
    }),
  )
}

function renderGrid(editable = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <AssignmentGrid gameId="g" bases={bases} editable={editable} onClose={vi.fn()} />
    </QueryClientProvider>,
  )
}
const key = (rows: (typeof sent)[number]) => rows.map((r) => `${r.baseId}:${r.teamId ?? 'all'}=${r.challengeId}`).sort()

describe('AssignmentGrid on a phone', () => {
  it('lists bases with what they hold instead of a table', async () => {
    mockGame([
      { id: '1', gameId: 'g', baseId: 'A', challengeId: 'c1', teamId: 'falcons' },
    ])
    renderGrid()
    await waitFor(() => expect(screen.getByTestId('assignment-list')).toBeInTheDocument())
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.getByTestId('assignment-base-summary-A')).toHaveTextContent('Per team · 1 of 2 set')
    // A pinned base with no rows shows its pinned challenge.
    expect(screen.getByTestId('assignment-base-summary-B')).toHaveTextContent('Two')
  })

  it('opens a base, shows All teams plus a picker per team, and writes the whole list', async () => {
    const user = userEvent.setup()
    mockGame([{ id: '1', gameId: 'g', baseId: 'A', challengeId: 'c1' }])
    renderGrid()
    await waitFor(() => expect(screen.getByTestId('assignment-base-summary-A')).toHaveTextContent('One'))

    await user.click(screen.getByTestId('assignment-base-A'))
    const sheet = await screen.findByTestId('assignment-base-dialog')
    expect(sheet).toHaveTextContent('Old mill')
    expect(screen.getByTestId('assignment-cell-A-all')).toHaveAttribute('data-value', 'c1')
    expect(screen.getByTestId('assignment-cell-A-falcons')).toHaveAttribute('data-value', '')

    await user.click(screen.getByTestId('assignment-cell-A-lions'))
    await user.click(screen.getByTestId('challenge-option-c3'))
    await waitFor(() => expect(sent).toHaveLength(1))
    // The all-teams base converts: Falcons keep One, Lions take Three.
    expect(key(sent[0])).toEqual(['A:falcons=c1', 'A:lions=c3'])
    // The sheet stays open for the next pick.
    expect(screen.getByTestId('assignment-base-dialog')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByTestId('assignment-cell-A-lions')).toHaveAttribute('data-value', 'c3'))
  })

  it('shows the pinned challenge read-only under All teams for a pinned base', async () => {
    const user = userEvent.setup()
    mockGame([])
    renderGrid()
    await waitFor(() => expect(screen.getByTestId('assignment-base-B')).toBeInTheDocument())
    await user.click(screen.getByTestId('assignment-base-B'))
    const all = await screen.findByTestId('assignment-cell-B-all')
    expect(all.tagName).toBe('P')
    expect(all).toHaveTextContent('Two')
    expect(screen.getByTestId('assignment-cell-B-falcons')).toBeInTheDocument()
  })

  it('keeps every picker disabled once the game has ended', async () => {
    const user = userEvent.setup()
    mockGame([{ id: '1', gameId: 'g', baseId: 'A', challengeId: 'c1' }])
    renderGrid(false)
    await waitFor(() => expect(screen.getByTestId('assignment-base-A')).toBeInTheDocument())
    await user.click(screen.getByTestId('assignment-base-A'))
    expect(await screen.findByTestId('assignment-cell-A-all')).toBeDisabled()
    expect(screen.getByTestId('assignment-grid-readonly')).toBeInTheDocument()
  })
})
