import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '@/i18n'
import { useAuthStore } from '@/lib/auth/store'
import { useWorkspaceContext } from '@/stores/workspaceContext'
import { createOrgInvite, createOrgMember, orgsStore } from '@/test/msw/handlers/orgs'
import { workspacesStore } from '@/test/msw/handlers/workspaces'
import { OrgPermission } from '@/types/organization'
import { OrgMembersPage } from './OrgMembersPage'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

const ALL_PERMISSIONS = 127

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

describe('OrgMembersPage settings', () => {
  it('renames the club through the org update endpoint', async () => {
    const user = userEvent.setup()
    renderPage()

    const input = await screen.findByTestId('org-name-input')
    expect(input).toHaveValue('Scout Group 42')

    await user.clear(input)
    await user.type(input, 'Scout Group 7')
    await user.click(screen.getByTestId('org-rename-save'))

    await waitFor(() =>
      expect(orgsStore.renames()).toEqual([{ orgId: 'org-1', name: 'Scout Group 7' }]),
    )
    expect(await screen.findByTestId('org-rename-saved')).toBeInTheDocument()
  })

  it('refuses to save an unchanged or empty name', async () => {
    const user = userEvent.setup()
    renderPage()

    const save = await screen.findByTestId('org-rename-save')
    expect(save).toBeDisabled()

    await user.clear(await screen.findByTestId('org-name-input'))
    expect(save).toBeDisabled()
    expect(orgsStore.renames()).toEqual([])
  })

  it('reports a failed rename instead of claiming success', async () => {
    orgsStore.failNextWrite()
    const user = userEvent.setup()
    renderPage()

    const input = await screen.findByTestId('org-name-input')
    await user.clear(input)
    await user.type(input, 'Scout Group 7')
    await user.click(screen.getByTestId('org-rename-save'))

    expect(await screen.findByRole('alert')).toHaveTextContent('An error occurred')
    expect(screen.queryByTestId('org-rename-saved')).not.toBeInTheDocument()
  })

  it('deletes the club behind a confirm and returns to the personal workspace', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByTestId('org-delete-btn'))
    await user.click(await screen.findByTestId('confirm-action-btn'))

    await waitFor(() => expect(orgsStore.deletions()).toEqual(['org-1']))
    await waitFor(() =>
      expect(useWorkspaceContext.getState().active).toEqual({ type: 'personal' }),
    )
    expect(mockNavigate).toHaveBeenCalledWith('/dashboard')
  })

  it('does not delete when the confirm is dismissed', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByTestId('org-delete-btn'))
    await user.click(await screen.findByTestId('cancel-action-btn'))

    expect(orgsStore.deletions()).toEqual([])
    expect(useWorkspaceContext.getState().active).toEqual({
      type: 'org',
      orgId: 'org-1',
      orgName: 'Scout Group 42',
    })
  })

  it('hides settings from a member who neither created the club nor manages permissions', async () => {
    orgsStore.seedOrganization({ createdBy: 'someone-else' })
    orgsStore.seedMembers([
      createOrgMember({ permissions: OrgPermission.OPERATE_GAMES | OrgPermission.INVITE_MEMBERS }),
    ])
    renderPage()

    await waitFor(() => expect(screen.getByText('Test Operator')).toBeInTheDocument())
    expect(screen.queryByTestId('org-settings')).not.toBeInTheDocument()
  })

  it('lets a permission manager rename but keeps delete for the creator', async () => {
    orgsStore.seedOrganization({ createdBy: 'someone-else' })
    orgsStore.seedMembers([
      createOrgMember({ permissions: OrgPermission.OPERATE_GAMES | OrgPermission.MANAGE_PERMS }),
    ])
    renderPage()

    expect(await screen.findByTestId('org-settings')).toBeInTheDocument()
    expect(screen.queryByTestId('org-danger-zone')).not.toBeInTheDocument()
  })
})

describe('OrgMembersPage pending invites', () => {
  it('shows the invite status, expired included', async () => {
    orgsStore.seedMembers([createOrgMember({ permissions: ALL_PERMISSIONS })])
    orgsStore.seedInvites([
      createOrgInvite({ id: 'invite-1', email: 'pending@example.com', status: 'pending' }),
      createOrgInvite({ id: 'invite-2', email: 'stale@example.com', status: 'expired' }),
    ])
    renderPage()

    const stale = (await screen.findByText('stale@example.com')).closest('div')!.parentElement!
    expect(within(stale).getByText('Expired')).toBeInTheDocument()

    const pending = screen.getByText('pending@example.com').closest('div')!.parentElement!
    expect(within(pending).getByText('Pending')).toBeInTheDocument()
  })

  it('reads a declined invite as declined, in the same muted tone as expired', async () => {
    // `declined` is the invitee's own refusal (V66). Left out of the union it
    // rendered as the raw key, and left out of the tone rule it read as an
    // answer still to come.
    orgsStore.seedMembers([createOrgMember({ permissions: ALL_PERMISSIONS })])
    orgsStore.seedInvites([
      createOrgInvite({ id: 'invite-3', email: 'refused@example.com', status: 'declined' }),
      createOrgInvite({ id: 'invite-4', email: 'stale@example.com', status: 'expired' }),
    ])
    renderPage()

    const refused = (await screen.findByText('refused@example.com')).closest('div')!.parentElement!
    const badge = within(refused).getByText('Declined')
    expect(badge).toBeInTheDocument()

    const stale = screen.getByText('stale@example.com').closest('div')!.parentElement!
    expect(badge.className).toBe(within(stale).getByText('Expired').className)
  })
})

describe('MemberPermissionsDialog', () => {
  beforeEach(() => {
    orgsStore.seedMembers([
      createOrgMember({ permissions: ALL_PERMISSIONS }),
      createOrgMember({ id: 'member-2', userId: 'user-2', name: 'Other Operator', email: 'other@example.com', permissions: 1 }),
    ])
  })

  it('traps focus in a real modal dialog and closes on Escape', async () => {
    const user = userEvent.setup()
    renderPage()

    await waitFor(() => expect(screen.getByText('Other Operator')).toBeInTheDocument())
    await user.click(screen.getAllByRole('button', { name: 'Permissions' })[0])

    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toContainElement(document.activeElement)

    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
})
