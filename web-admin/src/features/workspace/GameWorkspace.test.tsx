import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'
import { GameWorkspace } from './GameWorkspace'
import { useWorkspaceStore } from '@/stores/workspace'

// Mock react-map-gl/maplibre (WebGL not available in jsdom)
vi.mock('react-map-gl/maplibre', () => ({
  default: ({ children }: any) => (
    <div data-testid="map-container">{children}</div>
  ),
  Marker: ({ children }: any) => <div data-testid="marker">{children}</div>,
  NavigationControl: () => null,
}))

// Mock motion/react to avoid animation complexity in tests
vi.mock('motion/react', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
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
        { initialEntries: ['/app/game/test-id'] },
        createElement(
          Routes,
          null,
          createElement(Route, {
            path: '/app/game/:id',
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
})
