import { afterEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { useWorkspaceContext } from '@/stores/workspaceContext'
import { WorkspaceSwitcher } from './WorkspaceSwitcher'

function Location() {
  const location = useLocation()
  return <p data-testid="location">{location.pathname + location.search}</p>
}

function renderAt(route: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(['workspaces'], {
    personal: { tier: 'free', status: 'active', activeGames: 1 },
    organizations: [{ id: 'org-1', name: 'Nazaré Scouts', slug: 'nazare', tier: 'club', status: 'active', memberCount: 4, liveGames: 1, permissions: 0, termEnd: null }],
  })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path="*" element={<><WorkspaceSwitcher /><Location /></>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('WorkspaceSwitcher', () => {
  afterEach(() => {
    useWorkspaceContext.setState({ active: { type: 'personal' } })
  })

  it('opens the personal workspace\'s games, not Home, from inside a game', async () => {
    useWorkspaceContext.setState({ active: { type: 'org', orgId: 'org-1', orgName: 'Scouts' } })
    renderAt('/game/g')
    await userEvent.click(screen.getByRole('button', { name: 'Personal' }))
    expect(screen.getByTestId('location')).toHaveTextContent('/dashboard?view=organize')
    expect(useWorkspaceContext.getState().active).toEqual({ type: 'personal' })
  })

  it('opens a club\'s games from the admin panel', async () => {
    renderAt('/admin')
    await userEvent.click(await screen.findByRole('button', { name: 'Nazaré Scouts' }))
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/dashboard?view=organize'))
    expect(useWorkspaceContext.getState().active).toMatchObject({ type: 'org', orgId: 'org-1' })
  })

  it('stays on the Organize page when switching there', async () => {
    renderAt('/dashboard?view=organize')
    await userEvent.click(screen.getByRole('button', { name: 'Personal' }))
    expect(screen.getByTestId('location')).toHaveTextContent('/dashboard?view=organize')
  })
})
