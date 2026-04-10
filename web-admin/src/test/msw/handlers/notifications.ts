import { http, HttpResponse } from 'msw'
import type { GameNotification } from '@/types'

export const notificationsHandlers = [
  http.get('/api/games/:gameId/notifications', () => {
    const notifications: GameNotification[] = [
      {
        id: 'notif-1',
        gameId: 'game-1',
        message: 'Welcome to the game!',
        sentAt: new Date().toISOString(),
        sentBy: 'operator-1',
      },
      {
        id: 'notif-2',
        gameId: 'game-1',
        message: 'Hurry up, Team Alpha!',
        targetTeamId: 'team-1',
        sentAt: new Date().toISOString(),
        sentBy: 'operator-1',
      },
    ]
    return HttpResponse.json(notifications)
  }),

  http.post('/api/games/:gameId/notifications', async ({ params, request }) => {
    const body = (await request.json()) as Record<string, unknown>
    const { gameId } = params
    const notification: GameNotification = {
      id: `notif-new-${Date.now()}`,
      gameId: gameId as string,
      message: (body.message as string) ?? '',
      targetTeamId: (body.targetTeamId as string) ?? undefined,
      sentAt: new Date().toISOString(),
      sentBy: 'operator-1',
    }
    return HttpResponse.json(notification, { status: 201 })
  }),
]
