import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
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
    return createElement(
      MemoryRouter,
      null,
      createElement(QueryClientProvider, { client: queryClient }, children),
    )
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

  it('shows operators section with invite input', async () => {
    useWorkspaceStore.getState().toggleSettingsPanel()

    server.use(
      http.get('/api/games/:id', () =>
        HttpResponse.json(createMockGame({ id: 'game-1' })),
      ),
      http.get('/api/games/:id/operators', () =>
        HttpResponse.json([]),
      ),
      http.get('/api/games/:id/invites', () =>
        HttpResponse.json([]),
      ),
    )

    render(createElement(GameSettingsPanel, { gameId: 'game-1' }), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByTestId('invite-email-input')).toBeInTheDocument()
    })

    expect(screen.getByTestId('send-invite-btn')).toBeInTheDocument()
  })

  it('renders danger zone with delete button', async () => {
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
      expect(screen.getByTestId('delete-game-btn')).toBeInTheDocument()
    })

    expect(screen.getByTestId('delete-game-btn')).not.toBeDisabled()
  })

  it('shows game state section with revert options for live game', async () => {
    useWorkspaceStore.getState().toggleSettingsPanel()

    server.use(
      http.get('/api/games/:id', () =>
        HttpResponse.json(createMockGame({ id: 'game-1', status: 'live' })),
      ),
    )

    render(createElement(GameSettingsPanel, { gameId: 'game-1' }), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByText('Game State')).toBeInTheDocument()
    })

    expect(screen.getByTestId('revert-to-setup-btn')).toBeInTheDocument()
    expect(screen.queryByTestId('revert-to-live-btn')).not.toBeInTheDocument()
  })

  it('reverts to setup with erase progress', async () => {
    const user = userEvent.setup()
    useWorkspaceStore.getState().toggleSettingsPanel()
    let statusBody: Record<string, unknown> = {}

    server.use(
      http.get('/api/games/:id', () =>
        HttpResponse.json(createMockGame({ id: 'game-1', status: 'live' })),
      ),
      http.patch('/api/games/:id/status', async ({ request }) => {
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
      expect(screen.getByTestId('revert-to-setup-btn')).toBeInTheDocument()
    })

    await user.click(screen.getByTestId('revert-to-setup-btn'))

    await waitFor(() => {
      expect(screen.getByTestId('progress-erase-btn')).toBeInTheDocument()
    })

    await user.click(screen.getByTestId('progress-erase-btn'))
    await user.click(screen.getByTestId('confirm-state-change-btn'))

    await waitFor(() => {
      expect(statusBody.status).toBe('setup')
    })

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


describe('enforced base order settings', () => {
  it('saves the setting independently of per-team challenge assignment and opens the Bases tab', async () => {
    const user = userEvent.setup()
    useWorkspaceStore.getState().toggleSettingsPanel()
    let game = createMockGame({ id: 'game-1', enforceBaseOrder: false, uniformAssignment: false })
    const requests: Record<string, unknown>[] = []
    server.use(
      http.get('/api/games/game-1', () => HttpResponse.json(game)),
      http.put('/api/games/game-1', async ({ request }) => {
        const body = await request.json() as Record<string, unknown>
        requests.push(body)
        game = { ...game, enforceBaseOrder: body.enforceBaseOrder as boolean }
        return HttpResponse.json(game)
      }),
    )
    render(createElement(GameSettingsPanel, { gameId: 'game-1' }), { wrapper: createWrapper() })
    const toggle = await screen.findByRole('switch', { name: 'Enforce base order' })
    expect(toggle).toHaveAttribute('aria-checked', 'false')
    await user.click(toggle)
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'true'))
    expect(requests[0]).toMatchObject({ enforceBaseOrder: true, uniformAssignment: false })
    await user.click(screen.getByRole('button', { name: 'Arrange route' }))
    expect(useWorkspaceStore.getState()).toMatchObject({ drawerOpen: true, drawerTab: 'bases', settingsPanelOpen: false, selectedBaseId: null })
  })

  it('keeps the previous setting and shows an error if saving fails', async () => {
    const user = userEvent.setup()
    useWorkspaceStore.getState().toggleSettingsPanel()
    server.use(
      http.get('/api/games/game-1', () => HttpResponse.json(createMockGame({ enforceBaseOrder: false }))),
      http.put('/api/games/game-1', () => HttpResponse.json({ message: 'Unavailable' }, { status: 503 })),
    )
    render(createElement(GameSettingsPanel, { gameId: 'game-1' }), { wrapper: createWrapper() })
    const toggle = await screen.findByRole('switch', { name: 'Enforce base order' })
    await user.click(toggle)
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not update base order')
    expect(toggle).toHaveAttribute('aria-checked', 'false')
    expect(toggle).toBeEnabled()
  })

  it.each(['live', 'ended'] as const)('locks the setting in %s games', async (status) => {
    useWorkspaceStore.getState().toggleSettingsPanel()
    server.use(http.get('/api/games/game-1', () => HttpResponse.json(createMockGame({ enforceBaseOrder: true, status }))))
    render(createElement(GameSettingsPanel, { gameId: 'game-1' }), { wrapper: createWrapper() })
    expect(await screen.findByRole('switch', { name: 'Enforce base order' })).toBeDisabled()
    expect(screen.getByText('Base order can only be changed during setup.')).toBeInTheDocument()
  })

  it('offers the three check-in methods and saves the chosen default', async () => {
    const user = userEvent.setup()
    useWorkspaceStore.getState().toggleSettingsPanel()
    let body: Record<string, unknown> = {}

    server.use(
      http.get('/api/games/:id', () =>
        HttpResponse.json(createMockGame({ id: 'game-1', status: 'setup' })),
      ),
      http.put('/api/games/:id', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>
        return HttpResponse.json(
          createMockGame({ id: 'game-1', defaultCheckInMethod: 'LOCATION' }),
        )
      }),
    )

    render(createElement(GameSettingsPanel, { gameId: 'game-1' }), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByTestId('checkin-default-method')).toBeInTheDocument()
    })

    await user.click(screen.getByTestId('checkin-default-method-location'))

    await waitFor(() => {
      expect(body.defaultCheckInMethod).toBe('LOCATION')
    })
  })

  it('shows the default radius only for the location method', async () => {
    useWorkspaceStore.getState().toggleSettingsPanel()
    server.use(
      http.get('/api/games/:id', () =>
        HttpResponse.json(createMockGame({ id: 'game-1', defaultCheckInMethod: 'NFC' })),
      ),
    )

    const { unmount } = render(createElement(GameSettingsPanel, { gameId: 'game-1' }), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByTestId('checkin-default-method')).toBeInTheDocument()
    })
    expect(screen.queryByTestId('checkin-default-radius')).not.toBeInTheDocument()
    unmount()

    server.use(
      http.get('/api/games/:id', () =>
        HttpResponse.json(
          createMockGame({
            id: 'game-1',
            defaultCheckInMethod: 'LOCATION',
            defaultCheckInRadiusM: 30,
          }),
        ),
      ),
    )

    render(createElement(GameSettingsPanel, { gameId: 'game-1' }), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByTestId('checkin-default-radius')).toHaveValue(30)
    })
  })

  it('rejects a radius outside the 5..200 clamp without calling the API', async () => {
    const user = userEvent.setup()
    useWorkspaceStore.getState().toggleSettingsPanel()
    let putCalls = 0

    server.use(
      http.get('/api/games/:id', () =>
        HttpResponse.json(
          createMockGame({
            id: 'game-1',
            defaultCheckInMethod: 'LOCATION',
            defaultCheckInRadiusM: 15,
          }),
        ),
      ),
      http.put('/api/games/:id', () => {
        putCalls += 1
        return HttpResponse.json(createMockGame({ id: 'game-1' }))
      }),
    )

    render(createElement(GameSettingsPanel, { gameId: 'game-1' }), {
      wrapper: createWrapper(),
    })

    const input = await screen.findByTestId('checkin-default-radius')
    await user.clear(input)
    await user.type(input, '900')
    await user.tab()

    expect(await screen.findByTestId('checkin-default-radius-error')).toBeInTheDocument()
    expect(putCalls).toBe(0)
  })

  it('locks the check-in group once the game is live', async () => {
    useWorkspaceStore.getState().toggleSettingsPanel()
    server.use(
      http.get('/api/games/:id', () =>
        HttpResponse.json(
          createMockGame({ id: 'game-1', status: 'live', defaultCheckInMethod: 'LOCATION' }),
        ),
      ),
    )

    render(createElement(GameSettingsPanel, { gameId: 'game-1' }), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByTestId('checkin-default-method-qr')).toBeDisabled()
    })
    expect(screen.getByTestId('checkin-default-radius')).toBeDisabled()
    expect(
      screen.getByText('Check-in settings can only be changed during setup.'),
    ).toBeInTheDocument()
  })

})
