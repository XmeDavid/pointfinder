import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import { createMockBase } from '@/test/factories/base'
import { BaseRouteEditor } from './BaseRouteEditor'

const bases = [
  createMockBase({ id: 'a', name: 'Forest', sequenceNumber: 1 }),
  createMockBase({ id: 'b', name: 'Bridge', sequenceNumber: 2 }),
  createMockBase({ id: 'c', name: 'Lookout', sequenceNumber: 3 }),
]
function setup(editable = true) {
  const onClose = vi.fn()
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const view = render(<QueryClientProvider client={client}><BaseRouteEditor gameId="game-1" bases={bases} editable={editable} onClose={onClose} /></QueryClientProvider>)
  return { ...view, onClose, client }
}
function order() {
  return screen.getAllByRole('listitem').map((item) => item.dataset.testid)
}

describe('BaseRouteEditor', () => {
  it('stages keyboard-accessible moves and submits the complete sequence only on save', async () => {
    const user = userEvent.setup()
    const requests: unknown[] = []
    server.use(http.patch('/api/games/game-1/bases/reorder', async ({ request }) => {
      requests.push(await request.json())
      return new HttpResponse(null, { status: 204 })
    }))
    const { onClose } = setup()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Move Forest up' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Move Lookout down' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Move Bridge up' }))
    expect(order()).toEqual(['route-base-b', 'route-base-a', 'route-base-c'])
    expect(requests).toEqual([])
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
    expect(requests).toEqual([{ ids: ['b', 'a', 'c'] }])
  })

  it('supports dragging without saving automatically and cancel discards the draft', async () => {
    const user = userEvent.setup()
    const { onClose } = setup()
    fireEvent.dragStart(screen.getByTitle('Drag Forest to reorder'), { dataTransfer: { setData: vi.fn() } })
    fireEvent.dragOver(screen.getByTestId('route-base-c'))
    fireEvent.drop(screen.getByTestId('route-base-c'))
    expect(order()).toEqual(['route-base-b', 'route-base-c', 'route-base-a'])
    expect(onClose).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('preserves a failed draft and supports retrying the same route', async () => {
    const user = userEvent.setup()
    const requests: unknown[] = []
    server.use(http.patch('/api/games/game-1/bases/reorder', async ({ request }) => {
      requests.push(await request.json())
      return requests.length === 1 ? HttpResponse.json({ message: 'Offline' }, { status: 503 }) : new HttpResponse(null, { status: 204 })
    }))
    const { onClose } = setup()
    await user.click(screen.getByRole('button', { name: 'Move Bridge up' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save the route')
    expect(onClose).not.toHaveBeenCalled()
    expect(order()).toEqual(['route-base-b', 'route-base-a', 'route-base-c'])
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
    expect(requests).toEqual([{ ids: ['b', 'a', 'c'] }, { ids: ['b', 'a', 'c'] }])
  })

  it('prevents applying an outdated draft when another operator changed the route', async () => {
    const user = userEvent.setup()
    const { rerender, client, onClose } = setup()
    await user.click(screen.getByRole('button', { name: 'Move Bridge up' }))
    rerender(<QueryClientProvider client={client}><BaseRouteEditor gameId="game-1" bases={[bases[2], bases[0], bases[1]]} editable onClose={onClose} /></QueryClientProvider>)
    expect(screen.getByRole('alert')).toHaveTextContent('The route changed while you were editing')
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Move Bridge down' })).toBeDisabled()
  })

  it('locks moves and save after setup', () => {
    setup(false)
    expect(screen.getByText('Base order can only be changed during setup.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Move Bridge up' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled()
  })
})

describe('BaseRouteEditor with stage routes (OW-40)', () => {
  const free = createMockBase({ id: 'f', name: 'Car park' })
  const m = createMockBase({ id: 'm', name: 'Meadow', stageId: 'explore' })
  const g = createMockBase({ id: 'g', name: 'Gate', stageId: 'trail', sequenceNumber: 1 })
  const s = createMockBase({ id: 's', name: 'Summit', stageId: 'trail', sequenceNumber: 2 })
  const routes = [
    { key: 'default', stageId: null, name: null, enforced: true, bases: [free] },
    { key: 'explore', stageId: 'explore', name: 'Explore', enforced: false, bases: [m] },
    { key: 'trail', stageId: 'trail', name: 'Final trail', enforced: true, bases: [g, s] },
  ]

  it('moves bases only within their route and saves every base once, routes in order', async () => {
    const user = userEvent.setup()
    const requests: unknown[] = []
    server.use(http.patch('/api/games/game-1/bases/reorder', async ({ request }) => {
      requests.push(await request.json())
      return new HttpResponse(null, { status: 204 })
    }))
    const onClose = vi.fn()
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(<QueryClientProvider client={client}><BaseRouteEditor gameId="game-1" bases={[free, m, g, s]} routes={routes} editable onClose={onClose} /></QueryClientProvider>)
    expect(screen.getByRole('heading', { name: 'Bases without a stage' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Final trail' })).toBeInTheDocument()
    // The only base of its route cannot move anywhere.
    expect(screen.getByRole('button', { name: 'Move Car park down' })).toBeDisabled()
    expect(screen.getByTestId('route-unordered-note')).toHaveTextContent('Any order: Explore')
    await user.click(screen.getByRole('button', { name: 'Move Summit up' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
    expect(requests).toEqual([{ ids: ['f', 'm', 's', 'g'] }])
  })
})
