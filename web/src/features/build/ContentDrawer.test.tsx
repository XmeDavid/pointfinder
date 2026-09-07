import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import { createMockBase } from '@/test/factories/base'
import { createMockChallenge } from '@/test/factories/challenge'
import { ContentDrawer } from './ContentDrawer'

const platform = vi.hoisted(() => ({ native: false }))
vi.mock('@/platform/runtime', () => ({ isNative: () => platform.native, isNativeEntry: () => platform.native }))

// Mock workspace store
const mockStore = {
  drawerOpen: true,
  drawerTab: 'bases' as const,
  setDrawerTab: vi.fn(),
  closeDrawer: vi.fn(),
  selectedBaseId: null as string | null,
  selectBase: vi.fn(),
  selectChallenge: vi.fn(),
}

vi.mock('@/stores/workspace', () => ({
  useWorkspaceStore: (selector: (s: typeof mockStore) => unknown) => selector(mockStore),
}))

// Mock framer motion so AnimatePresence doesn't interfere
vi.mock('motion/react', () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => {
      const htmlProps = Object.fromEntries(
        Object.entries(props).filter(
          ([key]) =>
            !['initial', 'animate', 'exit', 'transition', 'variants', 'whileHover', 'whileTap'].includes(key),
        ),
      )
      return <div {...htmlProps}>{children}</div>
    },
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
}))

function renderDrawer() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <ContentDrawer gameId="game-1" />
    </QueryClientProvider>,
  )
}

describe('ContentDrawer', () => {
  beforeEach(() => {
    platform.native = false
    mockStore.drawerOpen = true
    mockStore.drawerTab = 'bases'
    mockStore.setDrawerTab.mockClear()
    mockStore.closeDrawer.mockClear()
  })

  it('renders all four tabs', () => {
    renderDrawer()
    expect(screen.getByTestId('tab-bases')).toBeInTheDocument()
    expect(screen.getByTestId('tab-challenges')).toBeInTheDocument()
    expect(screen.getByTestId('tab-teams')).toBeInTheDocument()
    expect(screen.getByTestId('tab-stages')).toBeInTheDocument()
  })

  it('offers tags and codes in the browser as well as the phone app', () => {
    renderDrawer()
    expect(screen.getByTestId('tab-nfc')).toHaveTextContent('Tags')

    platform.native = true
    const { container } = renderDrawer()
    expect(container.querySelector('[data-testid="tab-nfc"]')).toBeInTheDocument()
  })

  it('clicking a tab calls setDrawerTab', async () => {
    const user = userEvent.setup()
    renderDrawer()

    await user.click(screen.getByTestId('tab-challenges'))
    expect(mockStore.setDrawerTab).toHaveBeenCalledWith('challenges')
  })

  it('shows "+ New Base" button on bases tab', () => {
    renderDrawer()
    expect(screen.getByTestId('new-entity-btn')).toHaveTextContent('New Base')
  })

  it('shows "+ New Challenge" button on challenges tab', () => {
    mockStore.drawerTab = 'challenges'
    renderDrawer()
    expect(screen.getByTestId('new-entity-btn')).toHaveTextContent('New Challenge')
  })

  it('shows auto-assign button only on bases tab', () => {
    renderDrawer()
    expect(screen.getByTestId('auto-assign-btn')).toBeInTheDocument()

    mockStore.drawerTab = 'challenges'
    const { container } = renderDrawer()
    expect(container.querySelector('[data-testid="auto-assign-btn"]')).not.toBeInTheDocument()
  })

  it('auto-assign pairs open bases with unused challenges and keeps existing assignments', async () => {
    const user = userEvent.setup()
    let sent: Array<{ baseId: string; challengeId: string; teamId?: string }> = []
    server.use(
      http.get('/api/games/game-1/bases', () => HttpResponse.json([
        createMockBase({ id: 'b1', name: 'Mill' }),
        createMockBase({ id: 'b2', name: 'Bridge' }),
        createMockBase({ id: 'b3', name: 'Lookout', fixedChallengeId: 'c9' }),
        createMockBase({ id: 'b4', name: 'Chapel' }),
      ])),
      http.get('/api/games/game-1/challenges', () => HttpResponse.json([
        createMockChallenge({ id: 'c1', title: 'One' }),
        createMockChallenge({ id: 'c2', title: 'Two' }),
        createMockChallenge({ id: 'c3', title: 'Three' }),
        createMockChallenge({ id: 'c9', title: 'Pinned to Lookout' }),
      ])),
      http.get('/api/games/game-1/assignments', () => HttpResponse.json([
        { id: 'a1', gameId: 'game-1', baseId: 'b2', challengeId: 'c2', teamId: 'team-1' },
      ])),
      http.put('/api/games/game-1/assignments', async ({ request }) => {
        const body = (await request.json()) as { assignments: typeof sent }
        sent = body.assignments
        return HttpResponse.json(sent.map((a, i) => ({ id: `n${i}`, gameId: 'game-1', ...a })))
      }),
    )
    renderDrawer()
    await waitFor(() => expect(screen.getByText('Mill')).toBeInTheDocument())

    await user.click(screen.getByTestId('auto-assign-btn'))

    await waitFor(() => expect(sent.length).toBeGreaterThan(0))
    // b2 keeps its per-team assignment, b3 is fixed to c9 (so c9 is taken too),
    // leaving b1 and b4 to take c1 and c3.
    expect(sent).toEqual([
      { baseId: 'b2', challengeId: 'c2', teamId: 'team-1' },
      { baseId: 'b1', challengeId: 'c1' },
      { baseId: 'b4', challengeId: 'c3' },
    ])
  })

  it('close button calls closeDrawer', async () => {
    const user = userEvent.setup()
    renderDrawer()

    await user.click(screen.getByTestId('drawer-close'))
    expect(mockStore.closeDrawer).toHaveBeenCalled()
  })

  it('renders BasesTab content when bases tab is active', async () => {
    renderDrawer()
    // MSW will return base data; after loading we should see base names
    await waitFor(() => {
      expect(screen.getByText('Base Alpha')).toBeInTheDocument()
    })
  })

  it('renders TeamsTab when teams tab is active', () => {
    mockStore.drawerTab = 'teams'
    renderDrawer()
    expect(screen.getByTestId('teams-tab')).toBeInTheDocument()
  })

  it('does not render content when drawer is closed', () => {
    mockStore.drawerOpen = false
    const { container } = renderDrawer()
    // SlideDrawer should not render when open=false
    expect(container.querySelector('[data-testid="slide-drawer"]')).not.toBeInTheDocument()
  })
})
