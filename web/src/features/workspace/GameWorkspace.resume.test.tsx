import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

const memory = vi.hoisted(() => new Map<string, string>())
vi.mock('@/platform', () => ({
  isNative: () => false,
  kv: {
    get: async (key: string) => memory.get(key) ?? null,
    set: async (key: string, value: string) => {
      memory.set(key, value)
    },
    remove: async (key: string) => {
      memory.delete(key)
    },
  },
}))
vi.mock('react-map-gl/maplibre', () => ({
  default: ({ children }: { children?: ReactNode }) => <div data-testid="map-container">{children}</div>,
  Marker: ({ children }: { children?: ReactNode }) => <div data-testid="marker">{children}</div>,
  NavigationControl: () => null,
}))
vi.mock('motion/react', () => ({
  useReducedMotion: () => true,
  motion: { div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement> & { children?: ReactNode }) => <div {...props}>{children}</div> },
  AnimatePresence: ({ children }: { children?: ReactNode }) => <>{children}</>,
}))
vi.mock('@/components/map/LocationPicker', () => ({ LocationPicker: () => <div data-testid="location-picker-mock" /> }))

import { useAuthStore } from '@/lib/auth/store'
import { GameWorkspace } from './GameWorkspace'
import { useWorkspaceStore } from '@/stores/workspace'
import { __flushWorkspaceWritesForTests, __setWorkspacePersistenceForTests } from '@/stores/workspacePersistence'

function Wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/game/test-id']}>
        <Routes>
          <Route path="/game/:id" element={children} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

/** Reproduces a killed WebView on a phone: the store is empty, the game route is reloaded. */
describe('GameWorkspace resume (OW-38 regression reproduction)', () => {
  beforeEach(() => {
    memory.clear()
    useAuthStore.setState({ user: { id: 'u1', name: 'Organizer', email: 'operator@example.test', role: 'operator', createdAt: '' } })
    useWorkspaceStore.getState().reset()
    __setWorkspacePersistenceForTests(true)
  })
  afterEach(() => {
    __setWorkspacePersistenceForTests(null)
    useAuthStore.setState({ user: null })
    useWorkspaceStore.getState().reset()
  })

  it('reopens the base editor that was open before the restart', async () => {
    memory.set(
      'workspace:u1:test-id',
      JSON.stringify({
        mode: 'build',
        drawerOpen: true,
        drawerTab: 'bases',
        selectedBaseId: 'base-1',
        selectedChallengeId: null,
        challengeOriginBaseId: null,
        selectedTeamId: null,
        selectedStageId: null,
        settingsPanelOpen: false,
        teamLocationsVisible: false,
        savedAt: Date.now(),
      }),
    )
    render(<GameWorkspace />, { wrapper: Wrapper })
    await waitFor(() => expect(screen.getByTestId('map-container')).toBeInTheDocument())
    await waitFor(() => expect(useWorkspaceStore.getState().selectedBaseId).toBe('base-1'))
    expect(useWorkspaceStore.getState().drawerOpen).toBe(true)
    expect(await screen.findByTestId('base-detail')).toBeInTheDocument()
  })

  it('records the workspace as the operator works and keeps it when the workspace unmounts', async () => {
    const view = render(<GameWorkspace />, { wrapper: Wrapper })
    await waitFor(() => expect(screen.getByTestId('map-container')).toBeInTheDocument())
    useWorkspaceStore.getState().selectBase('base-1')
    await __flushWorkspaceWritesForTests()
    expect(JSON.parse(memory.get('workspace:u1:test-id')!).selectedBaseId).toBe('base-1')
    view.unmount()
    // The unmount reset is not recorded over the last real state.
    await __flushWorkspaceWritesForTests()
    expect(JSON.parse(memory.get('workspace:u1:test-id')!).selectedBaseId).toBe('base-1')
  })

  it('does nothing in the browser', async () => {
    __setWorkspacePersistenceForTests(false)
    memory.set('workspace:u1:test-id', JSON.stringify({ mode: 'build', drawerOpen: true, drawerTab: 'bases', selectedBaseId: 'base-1', selectedChallengeId: null, challengeOriginBaseId: null, selectedTeamId: null, selectedStageId: null, settingsPanelOpen: false, teamLocationsVisible: false, savedAt: Date.now() }))
    render(<GameWorkspace />, { wrapper: Wrapper })
    await waitFor(() => expect(screen.getByTestId('map-container')).toBeInTheDocument())
    expect(useWorkspaceStore.getState().selectedBaseId).toBeNull()
  })
})
