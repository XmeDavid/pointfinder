import { http, HttpResponse } from 'msw'
import { createMockTeam } from '../../factories/team'
import type { Player } from '@/types'

const mockPlayers: Player[] = [
  { id: 'player-1', teamId: 'team-1', deviceId: 'device-1', displayName: 'Alice' },
  { id: 'player-2', teamId: 'team-1', deviceId: 'device-2', displayName: 'Bob' },
]

export const teamsHandlers = [
  http.get('/api/games/:gameId/teams', () => {
    return HttpResponse.json([
      createMockTeam({ id: 'team-1', name: 'Team Alpha' }),
      createMockTeam({ id: 'team-2', name: 'Team Beta' }),
    ])
  }),

  http.post('/api/games/:gameId/teams', async ({ params, request }) => {
    const body = (await request.json()) as Record<string, unknown>
    const { gameId } = params
    return HttpResponse.json(
      createMockTeam({
        id: `team-new-${Date.now()}`,
        gameId: gameId as string,
        name: (body.name as string) ?? 'New Team',
      }),
      { status: 201 },
    )
  }),

  http.put('/api/games/:gameId/teams/:teamId', async ({ params, request }) => {
    const body = (await request.json()) as Record<string, unknown>
    const { gameId, teamId } = params
    return HttpResponse.json(
      createMockTeam({
        id: teamId as string,
        gameId: gameId as string,
        name: (body.name as string) ?? 'Updated Team',
        color: (body.color as string) ?? '#ef4444',
      }),
    )
  }),

  http.delete('/api/games/:gameId/teams/:teamId', () => {
    return new HttpResponse(null, { status: 204 })
  }),

  http.get('/api/games/:gameId/teams/:teamId/players', () => {
    return HttpResponse.json(mockPlayers)
  }),

  http.delete('/api/games/:gameId/teams/:teamId/players/:playerId', () => {
    return new HttpResponse(null, { status: 204 })
  }),
]
