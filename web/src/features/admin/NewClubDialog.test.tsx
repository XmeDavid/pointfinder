import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '@/i18n'
import { adminStore, createAdminOrg } from '@/test/msw/handlers/admin'
import { AdminPanel } from './AdminPanel'
import { GIB } from './clubLimits'

function renderPanel() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AdminPanel />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

async function openNewClub(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('tab', { name: 'Organizations' }))
  await user.click(await screen.findByTestId('admin-new-club'))
  return screen.findByTestId('new-club-dialog')
}

beforeEach(async () => {
  await i18n.changeLanguage('en')
  adminStore.reset()
})

describe('New club form', () => {
  it('sends the standard club deal as quota overrides', async () => {
    const user = userEvent.setup()
    renderPanel()

    await openNewClub(user)
    await user.type(screen.getByTestId('new-club-name'), 'Scout Group 7')
    await user.type(screen.getByTestId('new-club-admin-email'), 'chief@example.com')
    await user.click(screen.getByTestId('new-club-submit'))

    await waitFor(() => expect(adminStore.clubCreations()).toHaveLength(1))
    expect(adminStore.clubCreations()[0]).toEqual({
      name: 'Scout Group 7',
      adminEmail: 'chief@example.com',
      quotaOverrides: {
        max_members: 15,
        max_live_games: 10,
        max_players_per_game: 200,
        // Unlimited is an explicit null, not an omitted key.
        max_bases_per_game: null,
        max_operators_per_game: null,
        max_file_size_bytes: 2 * GIB,
        max_resource_storage_bytes: 25 * GIB,
        location_check_in: true,
      },
    })
  })

  it('turns a limit switched to unlimited into a null and one left to the tier into an omission', async () => {
    const user = userEvent.setup()
    renderPanel()

    await openNewClub(user)
    await user.type(screen.getByTestId('new-club-name'), 'Scout Group 7')
    await user.type(screen.getByTestId('new-club-admin-email'), 'chief@example.com')
    await user.selectOptions(screen.getByTestId('club-limit-max_members-mode'), 'unlimited')
    await user.selectOptions(screen.getByTestId('club-limit-max_live_games-mode'), 'default')
    await user.selectOptions(screen.getByTestId('club-limit-location_check_in-mode'), 'off')
    await user.click(screen.getByTestId('new-club-submit'))

    await waitFor(() => expect(adminStore.clubCreations()).toHaveLength(1))
    const overrides = adminStore.clubCreations()[0].quotaOverrides!
    expect(overrides.max_members).toBeNull()
    expect('max_live_games' in overrides).toBe(false)
    expect(overrides.location_check_in).toBe(false)
  })

  it('sends an edited number, a term end and a note', async () => {
    const user = userEvent.setup()
    renderPanel()

    await openNewClub(user)
    await user.type(screen.getByTestId('new-club-name'), 'Scout Group 7')
    await user.type(screen.getByTestId('new-club-admin-email'), 'chief@example.com')
    await user.clear(screen.getByTestId('club-limit-max_members-value'))
    await user.type(screen.getByTestId('club-limit-max_members-value'), '40')
    await user.type(screen.getByTestId('new-club-term-end'), '2027-07-31')
    await user.type(screen.getByTestId('new-club-note'), 'Signed at the summer fair')
    await user.click(screen.getByTestId('new-club-submit'))

    await waitFor(() => expect(adminStore.clubCreations()).toHaveLength(1))
    const sent = adminStore.clubCreations()[0]
    expect(sent.quotaOverrides!.max_members).toBe(40)
    expect(sent.termEnd).toBe('2027-07-31T00:00:00.000Z')
    expect(sent.adminNote).toBe('Signed at the summer fair')
  })

  it('refuses to submit a limit that is not a usable number', async () => {
    const user = userEvent.setup()
    renderPanel()

    await openNewClub(user)
    await user.type(screen.getByTestId('new-club-name'), 'Scout Group 7')
    await user.type(screen.getByTestId('new-club-admin-email'), 'chief@example.com')
    await user.clear(screen.getByTestId('club-limit-max_members-value'))

    expect(screen.getByTestId('new-club-submit')).toBeDisabled()
    expect(adminStore.clubCreations()).toEqual([])
  })

  it('says the administrator was attached when the address already had an account', async () => {
    const user = userEvent.setup()
    renderPanel()

    await openNewClub(user)
    await user.type(screen.getByTestId('new-club-name'), 'Scout Group 7')
    await user.type(screen.getByTestId('new-club-admin-email'), 'chief@example.com')
    await user.click(screen.getByTestId('new-club-submit'))

    const result = await screen.findByTestId('new-club-result')
    expect(result).toHaveTextContent('chief@example.com already had an account')
  })

  it('says an invitation was sent when the address had no account', async () => {
    adminStore.seedCreateInvites()
    const user = userEvent.setup()
    renderPanel()

    await openNewClub(user)
    await user.type(screen.getByTestId('new-club-name'), 'Scout Group 7')
    await user.type(screen.getByTestId('new-club-admin-email'), 'new@example.com')
    await user.click(screen.getByTestId('new-club-submit'))

    const result = await screen.findByTestId('new-club-result')
    expect(result).toHaveTextContent('A registration invitation went to new@example.com')
  })
})

describe('Admin list pagination', () => {
  it('pages the orgs list and reports the range', async () => {
    adminStore.seedOrgs(
      Array.from({ length: 50 }, (_, i) => createAdminOrg({ id: `org-${i}`, name: `Club ${i}` })),
      120,
    )
    const user = userEvent.setup()
    renderPanel()

    await user.click(screen.getByRole('tab', { name: 'Organizations' }))
    expect(await screen.findByTestId('admin-orgs-pagination-range')).toHaveTextContent('1–50 of 120')
    expect(screen.getByTestId('admin-orgs-pagination-prev')).toBeDisabled()

    await user.click(screen.getByTestId('admin-orgs-pagination-next'))

    await waitFor(() =>
      expect(adminStore.listQueries().filter((q) => q.path === 'orgs').at(-1)?.page).toBe('1'),
    )
    expect(await screen.findByTestId('admin-orgs-pagination-range')).toHaveTextContent('51–100 of 120')
    expect(screen.getByTestId('admin-orgs-pagination-prev')).toBeEnabled()
  })

  it('shows no pagination controls for an empty list', async () => {
    adminStore.seedUsers([], 0)
    renderPanel()

    await screen.findByText('No users found')
    expect(screen.queryByTestId('admin-users-pagination')).not.toBeInTheDocument()
  })

  it('asks for the first page again when the search changes', async () => {
    adminStore.seedOrgs([createAdminOrg()], 120)
    const user = userEvent.setup()
    renderPanel()

    await user.click(screen.getByRole('tab', { name: 'Organizations' }))
    await screen.findByTestId('admin-orgs-pagination-next')
    await user.click(screen.getByTestId('admin-orgs-pagination-next'))
    await waitFor(() =>
      expect(adminStore.listQueries().filter((q) => q.path === 'orgs').at(-1)?.page).toBe('1'),
    )

    await user.type(screen.getByPlaceholderText('Search by name...'), 'scout')

    await waitFor(() => {
      const last = adminStore.listQueries().filter((q) => q.path === 'orgs').at(-1)
      expect(last?.search).toBe('scout')
      expect(last?.page).toBe('0')
    })
  })
})
