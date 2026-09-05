import { describe, expect, it, vi } from 'vitest'
const nativeFetch = vi.hoisted(() => vi.fn())
vi.mock('./runtime', () => ({ isNative: () => true }))
vi.mock('@tauri-apps/plugin-http', () => ({ fetch: nativeFetch }))
import axios from './axios'

describe('native operator HTTP transport', () => {
  it('preserves authentication, JSON bodies and Axios responses through native fetch', async () => {
    nativeFetch.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init)
      expect(request.headers.get('Authorization')).toBe('Bearer operator-token')
      expect(request.headers.get('Origin')).toBe('')
      expect(await request.json()).toEqual({ name: 'Forest' })
      return new Response(JSON.stringify({ id: 'g' }), { headers: { 'Content-Type': 'application/json' } })
    })
    const response = await axios.post('https://pointfinder.pt/api/games', { name: 'Forest' }, { headers: { Authorization: 'Bearer operator-token' } })
    expect(nativeFetch).toHaveBeenCalledOnce()
    expect(response.data).toEqual({ id: 'g' })
  })
})
