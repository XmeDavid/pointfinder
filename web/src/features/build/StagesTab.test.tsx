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
import StagesTab from './StagesTab'

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

describe('StagesTab', () => {
  it('renders stages list from API', async () => {
    const stages = [
      createMockStage({ id: 's1', name: 'Opening', orderIndex: 0, baseIds: ['base-1'] }),
      createMockStage({ id: 's2', name: 'Finale', orderIndex: 1, baseIds: [] }),
    ]

    server.use(
      http.get('/api/games/:gameId/stages', () => HttpResponse.json(stages)),
      http.get('/api/games/:gameId/bases', () =>
        HttpResponse.json([createMockBase({ id: 'base-1', name: 'Alpha' })]),
      ),
      http.get('/api/games/:gameId/assignments', () =>
        HttpResponse.json([
          createMockAssignment({ baseId: 'base-1', challengeId: 'c1' }),
        ]),
      ),
    )

    render(createElement(StagesTab, { gameId: 'game-1' }), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByTestId('stage-item-s1')).toBeInTheDocument()
    })

    expect(screen.getByTestId('stage-item-s2')).toBeInTheDocument()
    expect(screen.getByText('Opening')).toBeInTheDocument()
    expect(screen.getByText('Finale')).toBeInTheDocument()
  })

  it('shows empty state when no stages', async () => {
    server.use(
      http.get('/api/games/:gameId/stages', () => HttpResponse.json([])),
      http.get('/api/games/:gameId/bases', () => HttpResponse.json([])),
      http.get('/api/games/:gameId/assignments', () => HttpResponse.json([])),
    )

    render(createElement(StagesTab, { gameId: 'game-1' }), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByText('No stages yet')).toBeInTheDocument()
    })
  })

  it('shows empty detail state when no stage selected', async () => {
    server.use(
      http.get('/api/games/:gameId/stages', () =>
        HttpResponse.json([
          createMockStage({ id: 's1', name: 'Stage 1' }),
        ]),
      ),
      http.get('/api/games/:gameId/bases', () => HttpResponse.json([])),
      http.get('/api/games/:gameId/assignments', () => HttpResponse.json([])),
    )

    render(createElement(StagesTab, { gameId: 'game-1' }), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByText('Select a stage to view details')).toBeInTheDocument()
    })
  })

  it('selects a stage on click', async () => {
    const user = userEvent.setup()

    server.use(
      http.get('/api/games/:gameId/stages', () =>
        HttpResponse.json([
          createMockStage({ id: 's1', name: 'Stage 1', orderIndex: 0 }),
        ]),
      ),
      http.get('/api/games/:gameId/bases', () => HttpResponse.json([])),
      http.get('/api/games/:gameId/assignments', () => HttpResponse.json([])),
    )

    render(createElement(StagesTab, { gameId: 'game-1' }), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByTestId('stage-item-s1')).toBeInTheDocument()
    })

    await user.click(screen.getByTestId('stage-item-s1'))
    expect(useWorkspaceStore.getState().selectedStageId).toBe('s1')
  })

  it('calls create stage mutation on new stage button', async () => {
    const user = userEvent.setup()
    let createCalled = false

    server.use(
      http.get('/api/games/:gameId/stages', () => HttpResponse.json([])),
      http.get('/api/games/:gameId/bases', () => HttpResponse.json([])),
      http.get('/api/games/:gameId/assignments', () => HttpResponse.json([])),
      http.post('/api/games/:gameId/stages', () => {
        createCalled = true
        return HttpResponse.json(
          createMockStage({ id: 'new-stage', name: 'Stage 1' }),
          { status: 201 },
        )
      }),
    )

    render(createElement(StagesTab, { gameId: 'game-1' }), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByTestId('create-stage-btn')).toBeInTheDocument()
    })

    await user.click(screen.getByTestId('create-stage-btn'))

    await waitFor(() => {
      expect(createCalled).toBe(true)
    })
  })

  it('displays transition summary for scheduled stage', async () => {
    const scheduledAt = '2026-06-15T14:30:00Z'

    server.use(
      http.get('/api/games/:gameId/stages', () =>
        HttpResponse.json([
          createMockStage({
            id: 's1',
            name: 'Timed Stage',
            transitionType: 'scheduled',
            scheduledAt,
          }),
        ]),
      ),
      http.get('/api/games/:gameId/bases', () => HttpResponse.json([])),
      http.get('/api/games/:gameId/assignments', () => HttpResponse.json([])),
    )

    render(createElement(StagesTab, { gameId: 'game-1' }), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByText(/Scheduled/)).toBeInTheDocument()
    })
  })

  it('displays transition summary for trigger stage', async () => {
    server.use(
      http.get('/api/games/:gameId/stages', () =>
        HttpResponse.json([
          createMockStage({
            id: 's1',
            name: 'Trigger Stage',
            transitionType: 'trigger',
            triggerBaseId: 'base-1',
          }),
        ]),
      ),
      http.get('/api/games/:gameId/bases', () =>
        HttpResponse.json([
          createMockBase({ id: 'base-1', name: 'Checkpoint' }),
        ]),
      ),
      http.get('/api/games/:gameId/assignments', () => HttpResponse.json([])),
    )

    render(createElement(StagesTab, { gameId: 'game-1' }), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByText(/Trigger: Checkpoint/)).toBeInTheDocument()
    })
  })

  it('shows base and challenge counts in stage subtitle', async () => {
    server.use(
      http.get('/api/games/:gameId/stages', () =>
        HttpResponse.json([
          createMockStage({
            id: 's1',
            name: 'Full Stage',
            baseIds: ['base-1', 'base-2'],
          }),
        ]),
      ),
      http.get('/api/games/:gameId/bases', () =>
        HttpResponse.json([
          createMockBase({ id: 'base-1', name: 'B1' }),
          createMockBase({ id: 'base-2', name: 'B2' }),
        ]),
      ),
      http.get('/api/games/:gameId/assignments', () =>
        HttpResponse.json([
          createMockAssignment({ baseId: 'base-1', challengeId: 'c1' }),
          createMockAssignment({ baseId: 'base-2', challengeId: 'c2' }),
        ]),
      ),
    )

    render(createElement(StagesTab, { gameId: 'game-1' }), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByText(/2 bases/)).toBeInTheDocument()
      expect(screen.getByText(/2 challenges/)).toBeInTheDocument()
    })
  })
})
