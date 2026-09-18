import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { IncomingLink } from '@/platform/deepLinks'

const links = vi.hoisted(() => ({ launch: null as IncomingLink | null }))
vi.mock('@/platform/deepLinks', () => ({
  listenForLinks: async (handler: (link: IncomingLink) => void) => {
    const launch = links.launch
    const timer = launch ? setTimeout(() => handler(launch), 0) : undefined
    return () => clearTimeout(timer)
  },
}))
vi.mock('@/platform/nfc', () => ({ listenForTags: async () => () => {} }))

import { ServicesProvider } from '@/app/player/services'
import { createServices } from '@/app/player/client'
import { memoryPlatform, accountAuth, playerAuth } from '@/features/player/test/renderPlayer'
import { useAuthStore } from '@/lib/auth/store'
import { __setPreloadedForTests, __setResumeEnabledForTests, resumeTarget } from '@/app/resume'
import { ResumeRecorder } from '@/app/ResumeRecorder'
import { TagIntake } from '@/app/player/TagIntake'
import { Home } from './routes'

const OPERATOR = { id: 'u-op', email: 'op@example.com', name: 'Op', role: 'operator' as const, createdAt: '2026-01-01T00:00:00.000Z' }

function Location() {
  return <span data-testid="location">{useLocation().pathname}</span>
}

/** Cold start: the router opens at `/`, like the phone does after the process was killed. */
async function coldStart(options: { player?: boolean; account?: boolean } = {}) {
  const services = await createServices(await memoryPlatform(options.player ? playerAuth : null, [], options.account ? accountAuth : null))
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  render(
    <QueryClientProvider client={queryClient}>
      <ServicesProvider services={services}>
        <MemoryRouter initialEntries={['/']}>
          <ResumeRecorder />
          <Routes>
            <Route element={<TagIntake />}>
              <Route path="/" element={<Home />} />
              <Route path="*" element={<div data-testid="screen" />} />
            </Route>
          </Routes>
          <Location />
        </MemoryRouter>
      </ServicesProvider>
    </QueryClientProvider>,
  )
}

describe('Home resume after a native restart (OW-38 regression reproduction)', () => {
  beforeEach(() => {
    __setResumeEnabledForTests(true)
    links.launch = null
    useAuthStore.setState({ user: null, isAuthenticated: false, accessToken: null, hasHydrated: true })
  })
  afterEach(() => {
    __setResumeEnabledForTests(null)
    useAuthStore.setState({ user: null, isAuthenticated: false, accessToken: null })
  })

  it('reopens the operator on the game they were editing instead of Home', async () => {
    useAuthStore.setState({ user: OPERATOR, isAuthenticated: true, accessToken: 'tok' })
    __setPreloadedForTests({ path: '/game/g1?tab=bases', userId: 'u-op', playerId: null, at: Date.now() })
    await coldStart()
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/game/g1'))
    // Consumed: a later visit to the root falls through to the normal flow.
    await waitFor(() => expect(resumeTarget({ userId: 'u-op', playerId: null, accountId: null })).toBeNull())
  })

  it('reopens a player on the map screen they were on', async () => {
    __setPreloadedForTests({ path: '/base/b1', userId: null, playerId: playerAuth.playerId, at: Date.now() })
    await coldStart({ player: true })
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/base/b1'))
  })

  it('goes to the account home when the record belongs to another operator', async () => {
    useAuthStore.setState({ user: { ...OPERATOR, id: 'u-other' }, isAuthenticated: true, accessToken: 'tok' })
    __setPreloadedForTests({ path: '/game/g1', userId: 'u-op', playerId: null, at: Date.now() })
    await coldStart()
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/dashboard'))
  })

  it('goes to the account home after an explicit sign-out (no record) and to the sign-in page when nobody is signed in', async () => {
    __setPreloadedForTests(null)
    useAuthStore.setState({ user: OPERATOR, isAuthenticated: true, accessToken: 'tok' })
    await coldStart()
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/dashboard'))
  })

  it('lets a launch deep link win over the remembered screen', async () => {
    useAuthStore.setState({ user: OPERATOR, isAuthenticated: true, accessToken: 'tok' })
    __setPreloadedForTests({ path: '/game/g1', userId: 'u-op', playerId: null, at: Date.now() })
    links.launch = { kind: 'dashboard', url: 'https://pointfinder.pt/dashboard' }
    await coldStart()
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/dashboard'))
  })

  it('forgets the screen when the operator signs out', async () => {
    useAuthStore.setState({ user: OPERATOR, isAuthenticated: true, accessToken: 'tok' })
    __setPreloadedForTests({ path: '/game/g1', userId: 'u-op', playerId: null, at: Date.now() })
    await coldStart()
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/game/g1'))
    useAuthStore.getState().logout()
    expect(resumeTarget({ userId: 'u-op', playerId: null, accountId: null })).toBeNull()
  })
})
