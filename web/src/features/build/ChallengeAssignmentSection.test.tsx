import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import { createMockBase } from '@/test/factories/base'
import { createMockTeam } from '@/test/factories/team'
import { ChallengeAssignmentSection } from './ChallengeAssignmentSection'
import type { Assignment } from '@/types/v2'

const bases = [createMockBase({ id: 'A', name: 'Old mill' }), createMockBase({ id: 'B', name: 'Chapel' }), createMockBase({ id: 'C', name: 'Lookout' })]
const teams = [createMockTeam({ id: 'falcons', name: 'Falcons' }), createMockTeam({ id: 'lions', name: 'Lions' })]
const sent: Array<Array<{ baseId: string; challengeId: string; teamId?: string }>> = []
const key = (rows: (typeof sent)[number]) => rows.map((r) => `${r.baseId}:${r.teamId ?? 'all'}=${r.challengeId}`).sort()

function renderSection(assignments: Assignment[], onNavigate = vi.fn()) {
  sent.length = 0
  server.use(http.put('/api/games/g/assignments', async ({ request }) => {
    const body = (await request.json()) as { assignments: (typeof sent)[number] }
    sent.push(body.assignments)
    return HttpResponse.json(body.assignments.map((a, i) => ({ id: `n${i}`, gameId: 'g', ...a })))
  }))
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <ChallengeAssignmentSection gameId="g" challengeId="c1" assignments={assignments} bases={bases} teams={teams} onNavigateToBase={onNavigate} />
    </QueryClientProvider>,
  )
  return onNavigate
}

describe('ChallengeAssignmentSection', () => {
  it('assigns the challenge to a base for all teams', async () => {
    const user = userEvent.setup()
    renderSection([])
    await user.selectOptions(screen.getByTestId('assign-to-base-btn'), 'B')
    await waitFor(() => expect(sent).toHaveLength(1))
    expect(key(sent[0])).toEqual(['B:all=c1'])
  })

  it('links to the base it sits at and can move it', async () => {
    const user = userEvent.setup()
    const onNavigate = renderSection([{ id: 'a1', gameId: 'g', baseId: 'A', challengeId: 'c1' }])
    expect(screen.getByTestId('assigned-base-link')).toHaveTextContent('Old mill')
    await user.click(screen.getByTestId('assigned-base-link'))
    expect(onNavigate).toHaveBeenCalledWith('A')

    await user.selectOptions(screen.getByTestId('assign-to-base-btn'), 'C')
    await waitFor(() => expect(sent).toHaveLength(1))
    expect(key(sent[0])).toEqual(['C:all=c1'])
  })

  it('puts the challenge at a different base per team', async () => {
    const user = userEvent.setup()
    renderSection([{ id: 'a1', gameId: 'g', baseId: 'A', challengeId: 'c1' }])

    await user.click(screen.getByTestId('assign-per-team-btn'))
    await waitFor(() => expect(sent).toHaveLength(1))
    expect(key(sent[0])).toEqual(['A:falcons=c1', 'A:lions=c1'])
  })

  it('moves one team to another base, leaving the other team where it was', async () => {
    const user = userEvent.setup()
    renderSection([
      { id: 'a1', gameId: 'g', baseId: 'A', challengeId: 'c1', teamId: 'falcons' },
      { id: 'a2', gameId: 'g', baseId: 'A', challengeId: 'c1', teamId: 'lions' },
    ])
    expect(screen.getByTestId('challenge-team-base-lions')).toHaveValue('A')

    await user.selectOptions(screen.getByTestId('challenge-team-base-lions'), 'C')

    await waitFor(() => expect(sent).toHaveLength(1))
    expect(key(sent[0])).toEqual(['A:falcons=c1', 'C:lions=c1'])
  })

  it('shows the server reason when a write is refused', async () => {
    const user = userEvent.setup()
    renderSection([])
    server.use(http.put('/api/games/g/assignments', () =>
      HttpResponse.json({ status: 409, message: 'raw', code: 'ASSIGNMENT_TEAM_HAS_BASE' }, { status: 409 }),
    ))
    await user.selectOptions(screen.getByTestId('assign-to-base-btn'), 'B')
    expect(await screen.findByTestId('assignment-error')).toHaveTextContent('That team already has a challenge at this base.')
  })
})
