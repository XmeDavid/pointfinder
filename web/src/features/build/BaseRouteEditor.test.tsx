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
