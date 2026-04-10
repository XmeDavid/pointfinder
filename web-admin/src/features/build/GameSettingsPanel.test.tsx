import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import { createMockGame } from '@/test/factories/game'
import { useWorkspaceStore } from '@/stores/workspace'
import GameSettingsPanel from './GameSettingsPanel'

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children)
  }
}

beforeEach(() => {
  useWorkspaceStore.getState().reset()
})

describe('GameSettingsPanel', () => {
  it('renders nothing when panel is closed', () => {
    server.use(
      http.get('/api/games/:id', () =>
        HttpResponse.json(createMockGame({ id: 'game-1' })),
      ),
    )

    render(createElement(GameSettingsPanel, { gameId: 'game-1' }), {
      wrapper: createWrapper(),
    })

    expect(screen.queryByTestId('game-settings-panel')).not.toBeInTheDocument()
  })

  it('renders settings when panel is open', async () => {
    useWorkspaceStore.getState().toggleSettingsPanel()

    server.use(
      http.get('/api/games/:id', () =>
        HttpResponse.json(
          createMockGame({
            id: 'game-1',
            tileSource: 'osm',
            unlockTrigger: 'CHECK_IN',
          }),
        ),
      ),
    )

    render(createElement(GameSettingsPanel, { gameId: 'game-1' }), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByTestId('game-settings-panel')).toBeInTheDocument()
    })

    expect(screen.getByText('Map Settings')).toBeInTheDocument()
    expect(screen.getByText('Progression')).toBeInTheDocument()
    expect(screen.getByText('Assignment Mode')).toBeInTheDocument()
    expect(screen.getByText('Broadcast')).toBeInTheDocument()
    expect(screen.getByText('Operators')).toBeInTheDocument()
    expect(screen.getByText('Danger Zone')).toBeInTheDocument()
  })

  it('renders all tile source options', async () => {
    useWorkspaceStore.getState().toggleSettingsPanel()

    server.use(
      http.get('/api/games/:id', () =>
        HttpResponse.json(createMockGame({ id: 'game-1' })),
      ),
    )

    render(createElement(GameSettingsPanel, { gameId: 'game-1' }), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByTestId('tile-source-osm')).toBeInTheDocument()
    })

    expect(screen.getByTestId('tile-source-voyager')).toBeInTheDocument()
    expect(screen.getByTestId('tile-source-positron')).toBeInTheDocument()
    expect(screen.getByTestId('tile-source-swisstopo')).toBeInTheDocument()
    expect(screen.getByTestId('tile-source-swisstopo-sat')).toBeInTheDocument()
  })

  it('renders all unlock trigger options', async () => {
    useWorkspaceStore.getState().toggleSettingsPanel()

    server.use(
      http.get('/api/games/:id', () =>
        HttpResponse.json(createMockGame({ id: 'game-1' })),
      ),
    )

    render(createElement(GameSettingsPanel, { gameId: 'game-1' }), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByTestId('unlock-trigger-CHECK_IN')).toBeInTheDocument()
    })

    expect(screen.getByTestId('unlock-trigger-SUBMISSION')).toBeInTheDocument()
    expect(screen.getByTestId('unlock-trigger-COMPLETED')).toBeInTheDocument()
  })

  it('calls updateGame when tile source is clicked', async () => {
    const user = userEvent.setup()
    useWorkspaceStore.getState().toggleSettingsPanel()
    let updateCalled = false
    let updateBody: Record<string, unknown> = {}

    server.use(
      http.get('/api/games/:id', () =>
        HttpResponse.json(
          createMockGame({ id: 'game-1', tileSource: 'osm' }),
        ),
      ),
      http.put('/api/games/:id', async ({ request }) => {
        updateCalled = true
        updateBody = (await request.json()) as Record<string, unknown>
        return HttpResponse.json(
          createMockGame({ id: 'game-1', tileSource: 'voyager' }),
        )
      }),
    )

    render(createElement(GameSettingsPanel, { gameId: 'game-1' }), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByTestId('tile-source-voyager')).toBeInTheDocument()
    })

    await user.click(screen.getByTestId('tile-source-voyager'))

    await waitFor(() => {
      expect(updateCalled).toBe(true)
    })

    expect(updateBody.tileSource).toBe('voyager')
  })

  it('calls updateGame when unlock trigger is clicked', async () => {
    const user = userEvent.setup()
    useWorkspaceStore.getState().toggleSettingsPanel()
    let updateBody: Record<string, unknown> = {}

    server.use(
      http.get('/api/games/:id', () =>
        HttpResponse.json(
          createMockGame({ id: 'game-1', unlockTrigger: 'CHECK_IN' }),
        ),
      ),
      http.put('/api/games/:id', async ({ request }) => {
        updateBody = (await request.json()) as Record<string, unknown>
        return HttpResponse.json(
          createMockGame({ id: 'game-1', unlockTrigger: 'COMPLETED' }),
        )
      }),
    )

    render(createElement(GameSettingsPanel, { gameId: 'game-1' }), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByTestId('unlock-trigger-COMPLETED')).toBeInTheDocument()
    })

    await user.click(screen.getByTestId('unlock-trigger-COMPLETED'))

    await waitFor(() => {
      expect(updateBody.unlockTrigger).toBe('COMPLETED')
    })
  })

  it('shows operators placeholder', async () => {
    useWorkspaceStore.getState().toggleSettingsPanel()

    server.use(
      http.get('/api/games/:id', () =>
        HttpResponse.json(createMockGame({ id: 'game-1' })),
      ),
    )

    render(createElement(GameSettingsPanel, { gameId: 'game-1' }), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByTestId('operators-placeholder')).toBeInTheDocument()
    })

    expect(screen.getByText('Operators panel coming soon')).toBeInTheDocument()
  })

  it('renders danger zone with reset and delete buttons', async () => {
    useWorkspaceStore.getState().toggleSettingsPanel()

    server.use(
      http.get('/api/games/:id', () =>
        HttpResponse.json(createMockGame({ id: 'game-1' })),
      ),
    )

    render(createElement(GameSettingsPanel, { gameId: 'game-1' }), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByTestId('reset-progress-btn')).toBeInTheDocument()
    })

    expect(screen.getByTestId('delete-game-btn')).toBeInTheDocument()
    expect(screen.getByTestId('delete-game-btn')).toBeDisabled()
  })

  it('calls updateGameStatus with reset on Reset Progress click', async () => {
    const user = userEvent.setup()
    useWorkspaceStore.getState().toggleSettingsPanel()
    let statusCalled = false
    let statusBody: Record<string, unknown> = {}

    server.use(
      http.get('/api/games/:id', () =>
        HttpResponse.json(createMockGame({ id: 'game-1' })),
      ),
      http.patch('/api/games/:id/status', async ({ request }) => {
        statusCalled = true
        statusBody = (await request.json()) as Record<string, unknown>
        return HttpResponse.json(
          createMockGame({ id: 'game-1', status: 'setup' }),
        )
      }),
    )

    render(createElement(GameSettingsPanel, { gameId: 'game-1' }), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByTestId('reset-progress-btn')).toBeInTheDocument()
    })

    await user.click(screen.getByTestId('reset-progress-btn'))

    await waitFor(() => {
      expect(statusCalled).toBe(true)
    })

    expect(statusBody.status).toBe('setup')
    expect(statusBody.resetProgress).toBe(true)
  })

  it('closes panel via drawer close button', async () => {
    const user = userEvent.setup()
    useWorkspaceStore.getState().toggleSettingsPanel()

    server.use(
      http.get('/api/games/:id', () =>
        HttpResponse.json(createMockGame({ id: 'game-1' })),
      ),
    )

    render(createElement(GameSettingsPanel, { gameId: 'game-1' }), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByTestId('game-settings-panel')).toBeInTheDocument()
    })

    await user.click(screen.getByTestId('slide-drawer-close'))

    // After closing, the settings panel state should be toggled
    expect(useWorkspaceStore.getState().settingsPanelOpen).toBe(false)
  })
})
