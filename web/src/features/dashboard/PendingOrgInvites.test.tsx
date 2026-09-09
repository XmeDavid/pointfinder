import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import i18n from '@/i18n'
import { server } from '@/test/msw/server'
import { createOrgInvite, orgsStore } from '@/test/msw/handlers/orgs'
import { useWorkspaceContext } from '@/stores/workspaceContext'
import { PendingOrgInvites } from './PendingOrgInvites'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

function renderInvites() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <PendingOrgInvites />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

/** The default handler answers an empty list; these tests need one waiting. */
function seedMyInvites(invites = [createOrgInvite()]) {
  server.use(http.get('/api/org-invites/my', () => HttpResponse.json(invites)))
}

beforeEach(async () => {
  await i18n.changeLanguage('en')
  mockNavigate.mockClear()
  orgsStore.reset()
})

afterEach(() => {
  useWorkspaceContext.setState({ active: { type: 'personal' } })
})

describe('Pending club invitations', () => {
  it('declines an invitation through the decline endpoint', async () => {
    seedMyInvites()
    const user = userEvent.setup()
    renderInvites()

    await user.click(await screen.findByTestId('org-invite-decline'))

    await waitFor(() => expect(orgsStore.declines()).toEqual(['invite-1']))
    // Declining does not switch workspace or navigate anywhere.
    expect(mockNavigate).not.toHaveBeenCalled()
    expect(useWorkspaceContext.getState().active).toEqual({ type: 'personal' })
  })

  it('still accepts an invitation and switches to the club', async () => {
    seedMyInvites()
    const user = userEvent.setup()
    renderInvites()

    await user.click(await screen.findByTestId('org-invite-accept'))

    await waitFor(() =>
      expect(useWorkspaceContext.getState().active).toEqual({
        type: 'org',
        orgId: 'org-1',
        orgName: 'Scout Group 42',
      }),
    )
    expect(mockNavigate).toHaveBeenCalledWith('/dashboard')
    expect(orgsStore.declines()).toEqual([])
  })

  it('reports a refused decline', async () => {
    seedMyInvites()
    orgsStore.failNextWrite()
    const user = userEvent.setup()
    renderInvites()

    await user.click(await screen.findByTestId('org-invite-decline'))

    expect(await screen.findByTestId('org-invite-error')).toBeInTheDocument()
  })

  it('renders nothing when no invitation is waiting', () => {
    const { container } = renderInvites()
    expect(container).toBeEmptyDOMElement()
  })
})
