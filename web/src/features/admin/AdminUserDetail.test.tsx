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
  gameCount: 2, orgCount: 0, resourceStorageBytes: 0, blockedAt: null, blockedReason: null, ...over,
})

function setup(initial = detail()) {
  const saved: Array<Record<string, unknown>> = []
  let user = initial
  server.use(
    http.get('/api/admin/users/:userId', () => HttpResponse.json(user)),
    http.post('/api/admin/users/:userId/block', async ({ request }) => {
      const body = (await request.json()) as { reason: string }
      saved.push({ block: body.reason })
      user = { ...user, blockedAt: '2026-09-24T10:00:00Z', blockedReason: body.reason }
      return HttpResponse.json(user)
    }),
    http.post('/api/admin/users/:userId/unblock', () => {
      saved.push({ unblock: true })
      user = { ...user, blockedAt: null, blockedReason: null }
      return HttpResponse.json(user)
    }),
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

describe('AdminUserDetail blocking (owner decision 2026-09-24)', () => {
  it('blocks an account with a reason, after confirming', async () => {
    const saved = setup()
    const block = await screen.findByTestId('admin-user-block')
    expect(block).toBeDisabled()
    await userEvent.type(screen.getByLabelText('Reason for blocking'), 'Offensive listings')
    await userEvent.click(block)
    expect(await screen.findByRole('dialog', { name: 'Block Ana Lopes?' })).toBeInTheDocument()
    expect(saved).toEqual([])
    await userEvent.click(screen.getByTestId('confirm-action-btn'))
    await waitFor(() => expect(saved).toEqual([{ block: 'Offensive listings' }]))
    expect(await screen.findByTestId('admin-user-blocked')).toHaveTextContent('Offensive listings')
  })

  it('unblocks a blocked account', async () => {
    const saved = setup(detail({ blockedAt: '2026-09-20T10:00:00Z', blockedReason: 'Spam' }))
    expect(await screen.findByTestId('admin-user-blocked')).toHaveTextContent('Spam')
    await userEvent.click(screen.getByRole('button', { name: 'Unblock account' }))
    await waitFor(() => expect(saved).toEqual([{ unblock: true }]))
    await waitFor(() => expect(screen.queryByTestId('admin-user-blocked')).not.toBeInTheDocument())
  })

  it('does not offer blocking a platform admin', async () => {
    setup(detail({ role: 'admin' }))
    expect(await screen.findByText('Platform administrators cannot be blocked.')).toBeInTheDocument()
    expect(screen.queryByTestId('admin-user-block')).not.toBeInTheDocument()
  })
})
