import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import { createMockBase } from '@/test/factories/base'
import { createMockChallenge } from '@/test/factories/challenge'
import { createMockTeam } from '@/test/factories/team'
import { AssignmentGrid } from './AssignmentGrid'

const bases = [
  createMockBase({ id: 'A', name: 'Old mill', sequenceNumber: 1 }),
  createMockBase({ id: 'B', name: 'Chapel', sequenceNumber: 2 }),
  createMockBase({ id: 'C', name: 'Lookout', sequenceNumber: 3 }),
]
const sent: Array<Array<{ baseId: string; challengeId: string; teamId?: string }>> = []

function mockGame(assignments: Array<{ id: string; gameId: string; baseId: string; challengeId: string; teamId?: string }>) {
  sent.length = 0
  server.use(
    http.get('/api/games/g/challenges', () => HttpResponse.json([
      createMockChallenge({ id: 'c1', title: 'One' }), createMockChallenge({ id: 'c2', title: 'Two' }), createMockChallenge({ id: 'c3', title: 'Three' }),
    ])),
    http.get('/api/games/g/teams', () => HttpResponse.json([
      createMockTeam({ id: 'falcons', name: 'Falcons' }), createMockTeam({ id: 'lions', name: 'Lions' }),
    ])),
    http.get('/api/games/g/assignments', () => HttpResponse.json(assignments)),
    http.put('/api/games/g/assignments', async ({ request }) => {
      const body = (await request.json()) as { assignments: (typeof sent)[number] }
      sent.push(body.assignments)
      return HttpResponse.json(body.assignments.map((a, i) => ({ id: `n${i}`, gameId: 'g', ...a })))
    }),
  )
}

function renderGrid(editable = true, onClose = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <AssignmentGrid gameId="g" bases={bases} editable={editable} onClose={onClose} />
    </QueryClientProvider>,
  )
  return onClose
}
const key = (rows: (typeof sent)[number]) => rows.map((r) => `${r.baseId}:${r.teamId ?? 'all'}=${r.challengeId}`).sort()

/** Choose a challenge in a cell through the picker dialog. */
async function pick(user: ReturnType<typeof userEvent.setup>, cellId: string, challengeId: string | 'none') {
  await user.click(screen.getByTestId(cellId))
  await user.click(await screen.findByTestId(`challenge-option-${challengeId}`))
}

describe('AssignmentGrid', () => {
  // The grid is a table only from the md breakpoint up; the shared setup
  // stubs matchMedia to false, so this suite reports a desktop.
  const originalMatchMedia = window.matchMedia
  beforeAll(() => {
    window.matchMedia = (query: string) => ({ ...originalMatchMedia(query), matches: query.includes('min-width: 768px') })
  })
  afterAll(() => { window.matchMedia = originalMatchMedia })

  it('shows a row per base in order and a column for all teams plus each team', async () => {
    mockGame([{ id: 'a1', gameId: 'g', baseId: 'A', challengeId: 'c1' }])
    renderGrid()
    await waitFor(() => expect(screen.getByTestId('assignment-cell-A-all')).toHaveAttribute('data-value', 'c1'))
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Base', 'All teams', 'Falcons', 'Lions'])
    expect(screen.getAllByRole('row').slice(1).map((r) => r.getAttribute('data-testid'))).toEqual(['assignment-row-A', 'assignment-row-B', 'assignment-row-C'])
  })

  it('sends the whole list when a team cell changes, converting an all-teams base', async () => {
    mockGame([{ id: 'a1', gameId: 'g', baseId: 'A', challengeId: 'c1' }])
    const user = userEvent.setup()
    renderGrid()
    await waitFor(() => expect(screen.getByTestId('assignment-cell-A-all')).toHaveAttribute('data-value', 'c1'))

    await pick(user, 'assignment-cell-A-lions', 'c3')

    await waitFor(() => expect(sent).toHaveLength(1))
    expect(key(sent[0])).toEqual(['A:falcons=c1', 'A:lions=c3'])
  })

  it('offers only challenges unused in that column, and says where the others sit', async () => {
    const user = userEvent.setup()
    mockGame([
      { id: 'a1', gameId: 'g', baseId: 'A', challengeId: 'c1', teamId: 'falcons' },
      { id: 'a2', gameId: 'g', baseId: 'B', challengeId: 'c2', teamId: 'falcons' },
    ])
    renderGrid()
    await waitFor(() => expect(screen.getByTestId('assignment-cell-A-falcons')).toHaveAttribute('data-value', 'c1'))
    await user.click(screen.getByTestId('assignment-cell-C-falcons'))
    expect(await screen.findByTestId('challenge-option-c3')).not.toBeDisabled()
    expect(screen.getByTestId('challenge-option-c1')).toBeDisabled()
    expect(screen.getByTestId('challenge-option-c1')).toHaveTextContent('At Old mill')
    expect(screen.getByTestId('challenge-option-c2')).toBeDisabled()
    expect(screen.getByTestId('challenge-option-c2')).toHaveTextContent('At Chapel')
  })

  it('asks before replacing per-team choices with an all-teams one', async () => {
    mockGame([
      { id: 'a1', gameId: 'g', baseId: 'A', challengeId: 'c1', teamId: 'falcons' },
      { id: 'a2', gameId: 'g', baseId: 'A', challengeId: 'c3', teamId: 'lions' },
    ])
    const user = userEvent.setup()
    renderGrid()
    await waitFor(() => expect(screen.getByTestId('assignment-cell-A-falcons')).toHaveAttribute('data-value', 'c1'))

    await pick(user, 'assignment-cell-A-all', 'c2')
    expect(await screen.findByText('Assign to all teams?')).toBeInTheDocument()
    expect(sent).toHaveLength(0)

    await user.click(screen.getByTestId('confirm-action-btn'))
    await waitFor(() => expect(sent).toHaveLength(1))
    expect(key(sent[0])).toEqual(['A:all=c2'])
  })

  it('shows the server reason when a write is refused and keeps the old value', async () => {
    mockGame([{ id: 'a1', gameId: 'g', baseId: 'A', challengeId: 'c1' }])
    server.use(http.put('/api/games/g/assignments', () =>
      HttpResponse.json({ status: 409, message: 'raw', code: 'ASSIGNMENT_CHALLENGE_REPEATED' }, { status: 409 }),
    ))
    const user = userEvent.setup()
    renderGrid()
    await waitFor(() => expect(screen.getByTestId('assignment-cell-A-all')).toHaveAttribute('data-value', 'c1'))

    await pick(user, 'assignment-cell-B-all', 'c2')

    expect(await screen.findByTestId('assignment-grid-error')).toHaveTextContent('A challenge waits at one base for a team, or once for all teams.')
    await waitFor(() => expect(screen.getByTestId('assignment-cell-B-all')).toHaveAttribute('data-value', ''))
  })

  it('is read-only once the game has ended', async () => {
    mockGame([])
    renderGrid(false)
    expect(await screen.findByTestId('assignment-grid-readonly')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByTestId('assignment-cell-A-all')).toBeDisabled())
  })
})
