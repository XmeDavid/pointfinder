import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import { createMockChallenge } from '@/test/factories/challenge'
import { createMockTeam } from '@/test/factories/team'
import { BaseAssignmentSection } from './BaseAssignmentSection'
import type { Assignment } from '@/types/v2'

const challenges = [createMockChallenge({ id: 'c1', title: 'One' }), createMockChallenge({ id: 'c2', title: 'Two' }), createMockChallenge({ id: 'c3', title: 'Three' })]
const teams = [createMockTeam({ id: 'falcons', name: 'Falcons' }), createMockTeam({ id: 'lions', name: 'Lions' })]
const sent: Array<Array<{ baseId: string; challengeId: string; teamId?: string }>> = []
const key = (rows: (typeof sent)[number]) => rows.map((r) => `${r.baseId}:${r.teamId ?? 'all'}=${r.challengeId}`).sort()

function renderSection(assignments: Assignment[], onOpen = vi.fn()) {
  sent.length = 0
  server.use(http.put('/api/games/g/assignments', async ({ request }) => {
    const body = (await request.json()) as { assignments: (typeof sent)[number] }
    sent.push(body.assignments)
    return HttpResponse.json(body.assignments.map((a, i) => ({ id: `n${i}`, gameId: 'g', ...a })))
  }))
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <BaseAssignmentSection gameId="g" baseId="A" assignments={assignments} challenges={challenges} teams={teams} onOpenChallenge={onOpen} />
    </QueryClientProvider>,
  )
  return onOpen
}

describe('BaseAssignmentSection', () => {
  it('links a challenge for all teams', async () => {
    const user = userEvent.setup()
    renderSection([])
    await user.selectOptions(screen.getByTestId('link-challenge-btn'), 'c2')
    await waitFor(() => expect(sent).toHaveLength(1))
    expect(key(sent[0])).toEqual(['A:all=c2'])
  })

  it('opens the linked challenge', async () => {
    const user = userEvent.setup()
    const onOpen = renderSection([{ id: 'a1', gameId: 'g', baseId: 'A', challengeId: 'c2' }])
    expect(screen.getByTestId('link-challenge-btn')).toHaveValue('c2')
    await user.click(screen.getByTestId('open-linked-challenge-btn'))
    expect(onOpen).toHaveBeenCalledWith('c2')
  })

  it('splits an all-teams base into one row per team, then lets a team differ', async () => {
    const user = userEvent.setup()
    renderSection([{ id: 'a1', gameId: 'g', baseId: 'A', challengeId: 'c1' }])

    await user.click(screen.getByTestId('base-assign-per-team-btn'))
    await waitFor(() => expect(sent).toHaveLength(1))
    expect(key(sent[0])).toEqual(['A:falcons=c1', 'A:lions=c1'])
  })

  it('changes one team\'s challenge at the base', async () => {
    const user = userEvent.setup()
    renderSection([
      { id: 'a1', gameId: 'g', baseId: 'A', challengeId: 'c1', teamId: 'falcons' },
      { id: 'a2', gameId: 'g', baseId: 'A', challengeId: 'c1', teamId: 'lions' },
    ])
    await user.selectOptions(screen.getByTestId('base-team-challenge-lions'), 'c3')
    await waitFor(() => expect(sent).toHaveLength(1))
    expect(key(sent[0])).toEqual(['A:falcons=c1', 'A:lions=c3'])
  })

  it('hides challenges a team already meets at another base', () => {
    renderSection([
      { id: 'a1', gameId: 'g', baseId: 'B', challengeId: 'c2', teamId: 'lions' },
      { id: 'a2', gameId: 'g', baseId: 'A', challengeId: 'c1', teamId: 'lions' },
    ])
    const options = Array.from(screen.getByTestId('base-team-challenge-lions').querySelectorAll('option')).map((o) => o.textContent)
    expect(options).toEqual(['Unassign', 'One', 'Three'])
  })

  it('keeps the picker in place, disabled, while the game has no challenges yet', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <BaseAssignmentSection gameId="g" baseId="A" assignments={[]} challenges={[]} teams={teams} onOpenChallenge={vi.fn()} />
      </QueryClientProvider>,
    )
    expect(screen.getByTestId('link-challenge-btn')).toBeDisabled()
    expect(screen.getByText('No challenges yet.')).toBeInTheDocument()
  })
})
