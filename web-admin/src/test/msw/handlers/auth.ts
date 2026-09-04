import { http, HttpResponse } from 'msw'

export const authHandlers = [
  http.post('/api/auth/login', async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>
    const email = body.email as string | undefined

    if (email === 'fail@example.com') {
      return HttpResponse.json(
        { message: 'Invalid credentials' },
        { status: 401 },
      )
    }

    return HttpResponse.json({
      accessToken: 'mock-access-token',
      refreshToken: 'mock-refresh-token',
      user: {
        id: 'user-1',
        email: email ?? 'test@example.com',
        name: 'Test Operator',
        role: 'operator',
        createdAt: '2026-01-01T00:00:00Z',
      },
    })
  }),

  http.post('/api/auth/refresh', () => {
    // Refresh token arrives via HttpOnly cookie (not in the request body).
    // The response still includes refreshToken for mobile backward compat.
    return HttpResponse.json({
      accessToken: 'mock-new-access-token',
      refreshToken: 'mock-new-refresh-token',
      user: {
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test Operator',
        role: 'operator',
        createdAt: '2026-01-01T00:00:00Z',
      },
    })
  }),

  http.post('/api/auth/logout', () => {
    return new HttpResponse(null, { status: 204 })
  }),
]
