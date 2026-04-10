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
      expect(screen.getByText('NFC')).toBeInTheDocument()
      expect(screen.getByText('No NFC')).toBeInTheDocument()
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
