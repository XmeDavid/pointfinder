import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import { createMockStage, resetStageCounter } from '@/test/factories/stage'
import { createMockBase, resetBaseCounter } from '@/test/factories/base'
import { createMockAssignment, resetAssignmentCounter } from '@/test/factories/assignment'
import { createMockGame } from '@/test/factories/game'
import { useWorkspaceStore } from '@/stores/workspace'
import StageDetail from './StageDetail'

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
  resetStageCounter()
  resetBaseCounter()
  resetAssignmentCounter()
  useWorkspaceStore.getState().reset()
})

describe('StageDetail', () => {
  it('renders stage name and description fields', async () => {
    server.use(
      http.get('/api/games/:gameId/stages', () =>
        HttpResponse.json([
          createMockStage({
            id: 's1',
            name: 'Opening Stage',
            description: 'The first stage',
          }),
        ]),
      ),
      http.get('/api/games/:gameId/bases', () => HttpResponse.json([])),
      http.get('/api/games/:gameId/assignments', () => HttpResponse.json([])),
    )

    render(createElement(StageDetail, { stageId: 's1', gameId: 'game-1' }), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByTestId('stage-detail')).toBeInTheDocument()
    })

    const nameInput = screen.getByTestId('stage-name-input') as HTMLInputElement
    const descInput = screen.getByTestId('stage-description-input') as HTMLTextAreaElement
    expect(nameInput.value).toBe('Opening Stage')
    expect(descInput.value).toBe('The first stage')
  })

  it('shows "Stage not found" for invalid stageId', async () => {
    server.use(
      http.get('/api/games/:gameId/stages', () => HttpResponse.json([])),
      http.get('/api/games/:gameId/bases', () => HttpResponse.json([])),
      http.get('/api/games/:gameId/assignments', () => HttpResponse.json([])),
    )

    render(createElement(StageDetail, { stageId: 'nonexistent', gameId: 'game-1' }), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByText('Stage not found')).toBeInTheDocument()
    })
  })

  it('renders transition type buttons', async () => {
    server.use(
      http.get('/api/games/:gameId/stages', () =>
        HttpResponse.json([
          createMockStage({ id: 's1', transitionType: 'manual' }),
        ]),
      ),
      http.get('/api/games/:gameId/bases', () => HttpResponse.json([])),
      http.get('/api/games/:gameId/assignments', () => HttpResponse.json([])),
    )

    render(createElement(StageDetail, { stageId: 's1', gameId: 'game-1' }), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByTestId('transition-type-scheduled')).toBeInTheDocument()
      expect(screen.getByTestId('transition-type-trigger')).toBeInTheDocument()
      expect(screen.getByTestId('transition-type-manual')).toBeInTheDocument()
    })
  })

  it('shows "Activated by operator" for manual type', async () => {
    server.use(
      http.get('/api/games/:gameId/stages', () =>
        HttpResponse.json([
          createMockStage({ id: 's1', transitionType: 'manual' }),
        ]),
      ),
      http.get('/api/games/:gameId/bases', () => HttpResponse.json([])),
      http.get('/api/games/:gameId/assignments', () => HttpResponse.json([])),
    )

    render(createElement(StageDetail, { stageId: 's1', gameId: 'game-1' }), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByText('Activated by operator')).toBeInTheDocument()
    })
  })

  it('shows datetime input when switching to scheduled', async () => {
    const user = userEvent.setup()

    server.use(
      http.get('/api/games/:gameId/stages', () =>
        HttpResponse.json([
          createMockStage({ id: 's1', transitionType: 'manual' }),
        ]),
      ),
      http.get('/api/games/:gameId/bases', () => HttpResponse.json([])),
      http.get('/api/games/:gameId/assignments', () => HttpResponse.json([])),
    )

    render(createElement(StageDetail, { stageId: 's1', gameId: 'game-1' }), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByTestId('transition-type-scheduled')).toBeInTheDocument()
    })

    await user.click(screen.getByTestId('transition-type-scheduled'))

    expect(screen.getByTestId('scheduled-at-input')).toBeInTheDocument()
  })

  it('lists bases belonging to the stage', async () => {
    server.use(
      http.get('/api/games/:gameId/stages', () =>
        HttpResponse.json([
          createMockStage({ id: 's1', baseIds: ['base-1', 'base-2'] }),
        ]),
      ),
      http.get('/api/games/:gameId/bases', () =>
        HttpResponse.json([
          createMockBase({ id: 'base-1', name: 'Alpha', nfcLinked: true }),
          createMockBase({ id: 'base-2', name: 'Beta', nfcLinked: false }),
          createMockBase({ id: 'base-3', name: 'Gamma' }),
        ]),
      ),
      http.get('/api/games/:gameId/assignments', () =>
        HttpResponse.json([
          createMockAssignment({ baseId: 'base-1', challengeId: 'c1' }),
        ]),
      ),
    )

    render(createElement(StageDetail, { stageId: 's1', gameId: 'game-1' }), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByTestId('stage-bases-list')).toBeInTheDocument()
    })

    expect(screen.getByText('Alpha')).toBeInTheDocument()
    expect(screen.getByText('Beta')).toBeInTheDocument()
    // base-3 is not in this stage
    expect(screen.queryByText('Gamma')).not.toBeInTheDocument()
  })

  it('shows NFC badges on bases', async () => {
    server.use(
      http.get('/api/games/:gameId/stages', () =>
        HttpResponse.json([
          createMockStage({ id: 's1', baseIds: ['base-1', 'base-2'] }),
        ]),
      ),
      http.get('/api/games/:gameId/bases', () =>
        HttpResponse.json([
          createMockBase({ id: 'base-1', name: 'Alpha', nfcLinked: true }),
          createMockBase({ id: 'base-2', name: 'Beta', nfcLinked: false }),
        ]),
      ),
      http.get('/api/games/:gameId/assignments', () => HttpResponse.json([])),
    )

    render(createElement(StageDetail, { stageId: 's1', gameId: 'game-1' }), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByText('NFC linked')).toBeInTheDocument()
      expect(screen.getByText('NFC missing')).toBeInTheDocument()
    })
  })

  it('calls updateStage on save', async () => {
    const user = userEvent.setup()
    let updateCalled = false
    let updateBody: Record<string, unknown> = {}

    server.use(
      http.get('/api/games/:gameId/stages', () =>
        HttpResponse.json([
          createMockStage({ id: 's1', name: 'Original' }),
        ]),
      ),
      http.get('/api/games/:gameId/bases', () => HttpResponse.json([])),
      http.get('/api/games/:gameId/assignments', () => HttpResponse.json([])),
      http.put('/api/games/:gameId/stages/:stageId', async ({ request }) => {
        updateCalled = true
        updateBody = (await request.json()) as Record<string, unknown>
        return HttpResponse.json(
          createMockStage({ id: 's1', name: updateBody.name as string }),
        )
      }),
    )

    render(createElement(StageDetail, { stageId: 's1', gameId: 'game-1' }), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByTestId('stage-name-input')).toBeInTheDocument()
    })

    const nameInput = screen.getByTestId('stage-name-input')
    await user.clear(nameInput)
    await user.type(nameInput, 'Updated Name')
    await user.click(screen.getByTestId('stage-save-btn'))

    await waitFor(() => {
      expect(updateCalled).toBe(true)
    })

    expect(updateBody.name).toBe('Updated Name')
  })

  it('shows "No bases in this stage yet" when stage has no bases', async () => {
    server.use(
      http.get('/api/games/:gameId/stages', () =>
        HttpResponse.json([
          createMockStage({ id: 's1', baseIds: [] }),
        ]),
      ),
      http.get('/api/games/:gameId/bases', () => HttpResponse.json([])),
      http.get('/api/games/:gameId/assignments', () => HttpResponse.json([])),
    )

    render(createElement(StageDetail, { stageId: 's1', gameId: 'game-1' }), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByText('No bases in this stage yet')).toBeInTheDocument()
    })
  })
})

describe('StageDetail base order (OW-40)', () => {
  function stageFixture(status: 'setup' | 'live', enforceBaseOrder: boolean) {
    const puts: Array<Record<string, unknown>> = []
    let stage = createMockStage({ id: 's1', name: 'Linear', transitionType: 'manual', enforceBaseOrder, baseIds: ['b2', 'b1', 'b3'] })
    server.use(
      http.get('/api/games/:gameId', () => HttpResponse.json(createMockGame({ id: 'game-1', status }))),
      http.get('/api/games/:gameId/stages', () => HttpResponse.json([stage])),
      http.get('/api/games/:gameId/bases', () => HttpResponse.json([
        createMockBase({ id: 'b1', name: 'Mill', stageId: 's1', sequenceNumber: enforceBaseOrder ? 2 : null }),
        createMockBase({ id: 'b2', name: 'Bridge', stageId: 's1', sequenceNumber: enforceBaseOrder ? 1 : null }),
        createMockBase({ id: 'b3', name: 'Lookout', stageId: 's1', checkInMethod: 'QR', nfcLinked: false, sequenceNumber: enforceBaseOrder ? 3 : null }),
      ])),
      http.get('/api/games/:gameId/assignments', () => HttpResponse.json([])),
      http.put('/api/games/:gameId/stages/:stageId', async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>
        puts.push(body)
        stage = { ...stage, enforceBaseOrder: Boolean(body.enforceBaseOrder), updatedAt: new Date().toISOString() }
        return HttpResponse.json(stage)
      }),
    )
    return puts
  }

  it('turns on ordered visits for this stage only, without sending unsaved form edits', async () => {
    const user = userEvent.setup()
    const puts = stageFixture('setup', false)
    render(createElement(StageDetail, { stageId: 's1', gameId: 'game-1' }), { wrapper: createWrapper() })
    const toggle = await screen.findByRole('switch', { name: "Visit this stage's bases in order" })
    await waitFor(() => expect(toggle).toBeEnabled())
    await user.type(screen.getByTestId('stage-name-input'), ' draft')
    await user.click(toggle)
    await waitFor(() => expect(puts).toHaveLength(1))
    expect(puts[0]).toMatchObject({ name: 'Linear', transitionType: 'manual', enforceBaseOrder: true })
    await waitFor(() => expect(screen.getByRole('switch', { name: "Visit this stage's bases in order" })).toHaveAttribute('aria-checked', 'true'))
    expect(screen.getByTestId('stage-name-input')).toHaveValue('Linear draft')
  })

  it('lists an ordered stage in route order and opens its route editor', async () => {
    const user = userEvent.setup()
    stageFixture('setup', true)
    render(createElement(StageDetail, { stageId: 's1', gameId: 'game-1' }), { wrapper: createWrapper() })
    await waitFor(() => expect(screen.getAllByTestId(/^stage-base-link-/).map((b) => b.textContent)).toEqual(['Bridge', 'Mill', 'Lookout']))
    // A QR base shows its method instead of a misleading NFC warning.
    expect(screen.getByText('QR code')).toBeInTheDocument()
    await user.click(screen.getByTestId('stage-arrange-route-btn'))
    expect(useWorkspaceStore.getState()).toMatchObject({ routeEditorRequested: true, drawerOpen: true, drawerTab: 'bases' })
  })

  it('keeps the order setting read-only once the game is live', async () => {
    stageFixture('live', true)
    render(createElement(StageDetail, { stageId: 's1', gameId: 'game-1' }), { wrapper: createWrapper() })
    expect(await screen.findByText('Base order can only be changed during setup.')).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: "Visit this stage's bases in order" })).toBeDisabled()
    expect(screen.queryByTestId('stage-arrange-route-btn')).not.toBeInTheDocument()
  })
})
