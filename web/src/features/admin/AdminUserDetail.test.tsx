import { describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import type { AdminUserDetail as AdminUserDetailModel } from '@/types/admin'
import { AdminUserDetail } from './AdminUserDetail'

const detail = (over: Partial<AdminUserDetailModel> = {}): AdminUserDetailModel => ({
  id: 'user-1', name: 'Ana Lopes', email: 'ana@example.test', role: 'operator', subscriptionTier: 'free', subscriptionStatus: 'active',
  createdAt: '2026-01-01T00:00:00Z', billingCycle: null, currentPeriodEnd: null, gracePeriodEnd: null,
  quotaOverrides: { max_active_games: 3, location_check_in: true, legacy_flag: 'keep-me' }, adminNote: null,
  gameCount: 2, orgCount: 0, resourceStorageBytes: 0, ...over,
})

function setup(user = detail()) {
  const saved: Array<Record<string, unknown>> = []
  server.use(
    http.get('/api/admin/users/:userId', () => HttpResponse.json(user)),
    http.get('/api/admin/users/:userId/games', () => HttpResponse.json([])),
    http.patch('/api/admin/users/:userId/subscription', async ({ request }) => {
      saved.push((await request.json()) as Record<string, unknown>)
      return HttpResponse.json({})
    }),
  )
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(<QueryClientProvider client={client}><MemoryRouter><AdminUserDetail userId="user-1" onBack={() => {}} /></MemoryRouter></QueryClientProvider>)
  return saved
}

describe('AdminUserDetail limits', () => {
  it('edits personal limits as a form instead of raw JSON', async () => {
    setup()
    expect(await screen.findByTestId('user-limits')).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('{}')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Active games')).toHaveValue(3)
    // Only the keys a personal plan reads: clubs' member and live-game limits are not offered.
    expect(screen.queryByText('Members')).not.toBeInTheDocument()
  })

  it('saves the form as overrides and keeps keys the form cannot show', async () => {
    const saved = setup()
    const games = await screen.findByLabelText('Active games')
    await userEvent.clear(games)
    await userEvent.type(games, '5')
    await userEvent.selectOptions(screen.getByLabelText('Players per game limit'), 'unlimited')
    await userEvent.click(screen.getByRole('button', { name: 'Save Overrides' }))
    await waitFor(() => expect(saved).toHaveLength(1))
    expect(saved[0].quotaOverrides).toEqual({ max_active_games: 5, max_players_per_game: null, location_check_in: true, legacy_flag: 'keep-me' })
  })

  it('refuses a limit that is not a number above zero', async () => {
    const saved = setup(detail({ quotaOverrides: null }))
    await userEvent.selectOptions(await screen.findByLabelText('Bases per game limit'), 'value')
    await userEvent.type(screen.getByLabelText('Bases per game'), '0')
    expect(screen.getByRole('button', { name: 'Save Overrides' })).toBeDisabled()
    expect(saved).toHaveLength(0)
  })
})
