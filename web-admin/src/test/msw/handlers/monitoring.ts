import { http, HttpResponse } from 'msw'
import type { TeamLocation, ActivityEvent, TeamBaseProgress } from '@/types'

export const monitoringHandlers = [
  http.get('/api/games/:gameId/monitoring/locations', () => {
    const locations: TeamLocation[] = [
      {
        teamId: 'team-1',
        playerId: 'player-1',
        displayName: 'Alice',
        lat: 38.72,
        lng: -9.14,
        updatedAt: new Date().toISOString(),
      },
      {
        teamId: 'team-2',
        playerId: 'player-2',
        displayName: 'Bob',
        lat: 38.73,
        lng: -9.13,
        updatedAt: new Date().toISOString(),
      },
    ]
    return HttpResponse.json(locations)
  }),

  http.get('/api/games/:gameId/monitoring/dashboard', () => {
    return HttpResponse.json({
      totalTeams: 4,
      totalBases: 6,
      totalChallenges: 12,
      pendingSubmissions: 3,
      completedSubmissions: 15,
      totalSubmissions: 18,
      startDate: '2026-06-01T09:00:00Z',
      endDate: '2026-06-01T17:00:00Z',
    })
  }),

  http.get('/api/games/:gameId/monitoring/leaderboard', () => {
    return HttpResponse.json([
      {
        teamId: 'team-1',
        teamName: 'Team Alpha',
        color: '#ef4444',
        points: 50,
        completedChallenges: 5,
      },
      {
        teamId: 'team-2',
        teamName: 'Team Beta',
        color: '#3b82f6',
        points: 35,
        completedChallenges: 3,
      },
    ])
  }),

  http.get('/api/games/:gameId/monitoring/activity', () => {
    const events: ActivityEvent[] = [
      {
        id: 'event-1',
        gameId: 'game-1',
        type: 'check_in',
        teamId: 'team-1',
        baseId: 'base-1',
        message: 'Team Alpha checked in at Base 1',
        timestamp: new Date().toISOString(),
      },
      {
        id: 'event-2',
        gameId: 'game-1',
        type: 'submission',
        teamId: 'team-2',
        baseId: 'base-2',
        challengeId: 'challenge-1',
        message: 'Team Beta submitted an answer',
        timestamp: new Date().toISOString(),
      },
    ]
    return HttpResponse.json(events)
  }),

  http.get('/api/games/:gameId/monitoring/progress', () => {
    const progress: TeamBaseProgress[] = [
      {
        baseId: 'base-1',
        teamId: 'team-1',
        status: 'completed',
        checkedInAt: new Date().toISOString(),
        challengeId: 'challenge-1',
        submissionStatus: 'approved',
      },
      {
        baseId: 'base-2',
        teamId: 'team-1',
        status: 'checked_in',
        checkedInAt: new Date().toISOString(),
      },
    ]
    return HttpResponse.json(progress)
  }),

  http.get('/api/games/:gameId/monitoring/results-export', () => {
    return HttpResponse.json({
      gameName: 'Test Game',
      challenges: [
        { id: 'challenge-1', title: 'Challenge 1', maxPoints: 10 },
        { id: 'challenge-2', title: 'Challenge 2', maxPoints: 20 },
      ],
      teams: [
        {
          teamId: 'team-1',
          teamName: 'Team Alpha',
          color: '#ef4444',
          totalPoints: 30,
          challengePoints: { 'challenge-1': 10, 'challenge-2': 20 },
        },
      ],
    })
  }),

  http.get('/api/games/:gameId/audit-export', () => {
    return new HttpResponse('id,type,timestamp\nevent-1,check_in,2026-06-01T10:00:00Z', {
      headers: { 'Content-Type': 'text/csv' },
    })
  }),
]
