import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ContentDrawer } from './ContentDrawer'

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
