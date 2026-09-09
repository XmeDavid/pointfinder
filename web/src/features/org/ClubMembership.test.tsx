import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '@/i18n'
import { useAuthStore } from '@/lib/auth/store'
import { useWorkspaceContext } from '@/stores/workspaceContext'
import { createOrgMember, orgsStore } from '@/test/msw/handlers/orgs'
import { workspacesStore } from '@/test/msw/handlers/workspaces'
import { OrgMembersPage } from './OrgMembersPage'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <OrgMembersPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const OTHER_MEMBER = createOrgMember({
  id: 'member-2',
  userId: 'user-2',
  name: 'Second Operator',
  email: 'second@example.com',
  permissions: 3,
})

beforeEach(async () => {
  await i18n.changeLanguage('en')
  mockNavigate.mockClear()
  orgsStore.reset()
  workspacesStore.reset()
  useWorkspaceContext.setState({
    active: { type: 'org', orgId: 'org-1', orgName: 'Scout Group 42' },
  })
  useAuthStore.setState({
    user: { id: 'user-1', email: 'test@example.com', name: 'Test Operator', role: 'operator', createdAt: '2026-01-01T00:00:00Z' },
    isAuthenticated: true,
    accessToken: 'token',
    hasHydrated: true,
  })
})

afterEach(() => {
  useAuthStore.setState({ user: null, isAuthenticated: false, accessToken: null })
  useWorkspaceContext.setState({ active: { type: 'personal' } })
})

describe('Club term on the members page', () => {
  it('says what the club has paid for', async () => {
    renderPage()
    const term = await screen.findByTestId('org-members-term')
    expect(term).toHaveTextContent('Active')
    expect(term).toHaveTextContent('Paid until July 31, 2027')
  })

  it('says so when the club has no term', async () => {
    orgsStore.seedOrganization({ termEnd: null, subscriptionStatus: 'grace_period' })
    renderPage()
    const term = await screen.findByTestId('org-members-term')
    expect(term).toHaveTextContent('In grace period')
    expect(term).toHaveTextContent('No paid term')
  })
})

describe('Leaving a club', () => {
  it('lets a member who did not create the club leave, after confirming', async () => {
    orgsStore.seedOrganization({ createdBy: 'user-2' })
    orgsStore.seedMembers([createOrgMember(), OTHER_MEMBER])
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByTestId('club-leave-btn'))
    expect(screen.getByRole('dialog')).toHaveTextContent('Leave "Scout Group 42"?')
    await user.click(screen.getByTestId('confirm-action-btn'))

    await waitFor(() => expect(orgsStore.departures()).toEqual(['org-1']))
    // The workspace we were standing in is no longer ours.
    expect(useWorkspaceContext.getState().active).toEqual({ type: 'personal' })
    expect(mockNavigate).toHaveBeenCalledWith('/dashboard')
  })

  it('offers the creator a transfer instead of leaving', async () => {
    orgsStore.seedMembers([createOrgMember(), OTHER_MEMBER])
    renderPage()

    expect(await screen.findByTestId('club-transfer')).toBeInTheDocument()
    expect(screen.queryByTestId('club-leave-btn')).not.toBeInTheDocument()
  })

  it('reports a refused departure without leaving the page', async () => {
    orgsStore.seedOrganization({ createdBy: 'user-2' })
    orgsStore.seedMembers([createOrgMember(), OTHER_MEMBER])
    orgsStore.failNextWrite()
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByTestId('club-leave-btn'))
    await user.click(screen.getByTestId('confirm-action-btn'))

    expect(await screen.findByTestId('club-leave-error')).toBeInTheDocument()
    expect(useWorkspaceContext.getState().active).toEqual({
      type: 'org',
      orgId: 'org-1',
      orgName: 'Scout Group 42',
    })
  })
})

describe('Transferring a club as its creator', () => {
  it('hands the club to a chosen member after confirming', async () => {
    orgsStore.seedMembers([createOrgMember(), OTHER_MEMBER])
    const user = userEvent.setup()
    renderPage()

    await user.selectOptions(await screen.findByTestId('club-transfer-target'), 'user-2')
    await user.click(screen.getByTestId('club-transfer-btn'))
    await user.click(screen.getByTestId('confirm-action-btn'))

    await waitFor(() =>
      expect(orgsStore.transfers()).toEqual([{ orgId: 'org-1', userId: 'user-2' }]),
    )
  })

  it('says there is nobody to hand a one-member club to', async () => {
    renderPage()
    expect(await screen.findByTestId('club-transfer')).toHaveTextContent(
      'There is no other member to hand the club to.',
    )
  })
})
