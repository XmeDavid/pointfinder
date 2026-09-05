import { http, HttpResponse } from 'msw'
import {
  createMockVariablesResponse,
  createMockCompletenessResponse,
} from '../../factories/variable'

export const variablesHandlers = [
  // Game-level variables
  http.get('/api/games/:gameId/team-variables', ({ request }) => {
    // Distinguish completeness check from list by URL path
    const url = new URL(request.url)
    if (url.pathname.endsWith('/completeness')) {
      return HttpResponse.json(createMockCompletenessResponse())
    }
    return HttpResponse.json(createMockVariablesResponse())
  }),

  http.put('/api/games/:gameId/team-variables', async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>
    return HttpResponse.json(
      createMockVariablesResponse({
        variables: (body.variables as Array<{ key: string; teamValues: Record<string, string> }>) ?? [],
      }),
    )
  }),

  // Challenge-level variables
  http.get('/api/games/:gameId/challenges/:challengeId/team-variables', () => {
    return HttpResponse.json(createMockVariablesResponse())
  }),

  http.put('/api/games/:gameId/challenges/:challengeId/team-variables', async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>
    return HttpResponse.json(
      createMockVariablesResponse({
        variables: (body.variables as Array<{ key: string; teamValues: Record<string, string> }>) ?? [],
      }),
    )
  }),

  // Completeness check
  http.get('/api/games/:gameId/team-variables/completeness', () => {
    return HttpResponse.json(createMockCompletenessResponse())
  }),
]
