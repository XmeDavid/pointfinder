import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'
import { http, HttpResponse } from 'msw'
import { GameWorkspace } from './GameWorkspace'
import { useWorkspaceStore } from '@/stores/workspace'
import { server } from '@/test/msw/server'
import { createMockBase } from '@/test/factories/base'
import { createMockGame } from '@/test/factories/game'

// Mock react-map-gl/maplibre (WebGL not available in jsdom)
vi.mock('react-map-gl/maplibre', () => ({
  default: ({ children, onClick }: {
    children?: React.ReactNode
    onClick?: (event: {
      point: { x: number; y: number }
      lngLat: { lat: number; lng: number }
    }) => void
  }) => (
    <div
      data-testid="map-container"
      onClick={() => onClick?.({
        point: { x: 240, y: 180 },
        lngLat: { lat: 47.3769, lng: 8.5417 },
      })}
    >
      {children}
    </div>
  ),
  Marker: ({ children }: { children?: React.ReactNode }) => <div data-testid="marker">{children}</div>,
  NavigationControl: () => null,
}))

// Mock motion/react to avoid animation complexity in tests
vi.mock('motion/react', () => ({
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement> & { children?: React.ReactNode }) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}))

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(
        MemoryRouter,
        { initialEntries: ['/game/test-id'] },
        createElement(
          Routes,
          null,
          createElement(Route, {
            path: '/game/:id',
            element: children,
          }),
        ),
      ),
    )
  }
}

function renderWorkspace() {
  return render(<GameWorkspace />, { wrapper: createWrapper() })
}

describe('GameWorkspace', () => {
  beforeEach(() => {
    useWorkspaceStore.getState().reset()
  })

  afterEach(() => {
    useWorkspaceStore.getState().reset()
  })

  it('renders the map when game loads', async () => {
    renderWorkspace()

    await waitFor(() => {
      expect(screen.getByTestId('map-container')).toBeInTheDocument()
    })
  })

  it('shows TopBar with game name', async () => {
    renderWorkspace()

    await waitFor(() => {
      // MSW handler returns name "Game test-id" for id "test-id"
      expect(screen.getByText('Game test-id')).toBeInTheDocument()
    })
  })

  it('renders base markers', async () => {
    renderWorkspace()

    await waitFor(() => {
      // MSW bases handler returns base-1, base-2, base-3
      expect(screen.getByTestId('base-marker-base-1')).toBeInTheDocument()
      expect(screen.getByTestId('base-marker-base-2')).toBeInTheDocument()
      expect(screen.getByTestId('base-marker-base-3')).toBeInTheDocument()
    })
  })

  it('shows "Open Content Panel" button in build mode', async () => {
    // default mode is 'build', drawer is closed
    renderWorkspace()

    await waitFor(() => {
      expect(screen.getByTestId('open-content-panel')).toBeInTheDocument()
      expect(screen.getByTestId('open-content-panel')).toHaveTextContent(
        'Open Content Panel',
      )
    })
  })

  it('hides "Open Content Panel" when drawer is open', async () => {
    useWorkspaceStore.getState().openDrawer()

    renderWorkspace()

    await waitFor(() => {
      expect(screen.getByTestId('map-container')).toBeInTheDocument()
    })

    expect(screen.queryByTestId('open-content-panel')).not.toBeInTheDocument()
  })

  it('does not show "Open Content Panel" in command mode', async () => {
    useWorkspaceStore.getState().setMode('command')

    renderWorkspace()

    await waitFor(() => {
      expect(screen.getByTestId('map-container')).toBeInTheDocument()
    })

    expect(screen.queryByTestId('open-content-panel')).not.toBeInTheDocument()
  })

  it('opens map actions on a build-mode map click and places a base at that location', async () => {
    const user = userEvent.setup()
    let requestBody: Record<string, unknown> | undefined
    server.use(
      http.post('/api/games/:gameId/bases', async ({ request }) => {
        requestBody = await request.json() as Record<string, unknown>
        return HttpResponse.json(
          createMockBase({
            id: 'placed-base',
            name: requestBody.name as string,
            lat: requestBody.lat as number,
            lng: requestBody.lng as number,
          }),
          { status: 201 },
        )
      }),
    )

    renderWorkspace()
    const map = await screen.findByTestId('map-container')

    await user.click(map)

    expect(screen.getByRole('menu', { name: 'Map actions' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Place base here' })).toHaveFocus()

    await user.click(screen.getByRole('menuitem', { name: 'Place base here' }))

    await waitFor(() => {
      expect(requestBody).toMatchObject({
        name: 'Base 4',
        description: '',
        lat: 47.3769,
        lng: 8.5417,
      })
      expect(useWorkspaceStore.getState().selectedBaseId).toBe('placed-base')
      expect(useWorkspaceStore.getState().drawerOpen).toBe(true)
    })
    expect(screen.queryByTestId('map-action-menu')).not.toBeInTheDocument()
  })

  it('does not offer base placement after setup has ended', async () => {
    const user = userEvent.setup()
    server.use(
      http.get('/api/games/:id', ({ params }) => HttpResponse.json(
        createMockGame({ id: params.id as string, status: 'live' }),
      )),
    )

    renderWorkspace()
    await user.click(await screen.findByTestId('map-container'))

    expect(screen.queryByTestId('map-action-menu')).not.toBeInTheDocument()
  })
})
