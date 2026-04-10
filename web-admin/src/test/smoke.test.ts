import { describe, it, expect } from 'vitest'

describe('MSW test infrastructure', () => {
  it('intercepts API calls', async () => {
    const response = await fetch('/api/games')
    const data = await response.json()
    expect(Array.isArray(data)).toBe(true)
    expect(data).toHaveLength(2)
    expect(data[0].name).toBe('Test Game 1')
  })

  it('intercepts auth login', async () => {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@example.com', password: 'password' }),
    })
    const data = await response.json()
    expect(data.accessToken).toBe('mock-access-token')
    expect(data.user.role).toBe('operator')
  })

  it('intercepts game by id', async () => {
    const response = await fetch('/api/games/game-42')
    const data = await response.json()
    expect(data.id).toBe('game-42')
    expect(data.status).toBe('setup')
  })

  it('returns 404 for unknown game', async () => {
    const response = await fetch('/api/games/not-found')
    expect(response.status).toBe(404)
  })
})
