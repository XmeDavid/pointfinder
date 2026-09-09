import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '@/i18n'
import { adminStore, createAdminOrgDetail, createOrgInvoice } from '@/test/msw/handlers/admin'
import { AdminOrgDetail } from './AdminOrgDetail'
import { GIB } from './clubLimits'

// These forms type through many fields with user-event; on a loaded CI host that
// brushes the default 5 s per-test budget, so give them room without hiding a hang.
vi.setConfig({ testTimeout: 20_000 })

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => vi.fn() }
})

function renderDetail() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AdminOrgDetail orgId="org-1" onBack={() => {}} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(async () => {
  await i18n.changeLanguage('en')
  adminStore.reset()
})

describe('Admin club detail', () => {
  it('shows the term the club has paid for', async () => {
    renderDetail()
    expect(await screen.findByTestId('admin-org-paid-until')).toHaveTextContent('Paid until July 31, 2027')
  })

  it('seeds the limits form from the stored overrides', async () => {
    adminStore.seedOrgDetail(
      createAdminOrgDetail({
        quotaOverrides: { max_members: 40, max_bases_per_game: null, max_file_size_bytes: 2 * GIB },
      }),
    )
    renderDetail()

    expect(await screen.findByTestId('club-limit-max_members-value')).toHaveValue(40)
    // An explicit null reads as unlimited; an absent key falls back to the tier.
    expect(screen.getByTestId('club-limit-max_bases_per_game-mode')).toHaveValue('unlimited')
    expect(screen.getByTestId('club-limit-max_live_games-mode')).toHaveValue('default')
    expect(screen.getByTestId('club-limit-max_file_size_bytes-value')).toHaveValue(2)
  })

  it('saves the name, status, term, note and limits in one patch', async () => {
    adminStore.seedOrgDetail(createAdminOrgDetail({ quotaOverrides: { max_members: 15 } }))
    const user = userEvent.setup()
    renderDetail()

    const name = await screen.findByTestId('admin-org-name')
    await user.clear(name)
    await user.type(name, 'Scout Group 7')
    await user.selectOptions(screen.getByTestId('admin-org-status'), 'grace_period')
    await user.clear(screen.getByTestId('admin-org-term-end'))
    await user.type(screen.getByTestId('admin-org-term-end'), '2028-06-30')
    await user.type(screen.getByTestId('admin-org-note'), 'Renewed by phone')
    await user.clear(screen.getByTestId('club-limit-max_members-value'))
    await user.type(screen.getByTestId('club-limit-max_members-value'), '40')
    await user.click(screen.getByTestId('admin-org-save'))

    await waitFor(() => expect(adminStore.clubUpdates()).toHaveLength(1))
    expect(adminStore.clubUpdates()[0]).toEqual({
      orgId: 'org-1',
      body: {
        name: 'Scout Group 7',
        tier: 'club',
        status: 'grace_period',
        termEnd: '2028-06-30T23:59:59.999Z',
        quotaOverrides: { max_members: 40 },
        adminNote: 'Renewed by phone',
      },
    })
    expect(await screen.findByTestId('admin-org-saved')).toBeInTheDocument()
  })

  it('keeps a per-deal override the limits form does not manage', async () => {
    adminStore.seedOrgDetail(
      createAdminOrgDetail({ quotaOverrides: { max_members: 15, custom_flag: 'yes' } }),
    )
    const user = userEvent.setup()
    renderDetail()

    await user.click(await screen.findByTestId('admin-org-save'))

    await waitFor(() => expect(adminStore.clubUpdates()).toHaveLength(1))
    expect(adminStore.clubUpdates()[0].body.quotaOverrides).toEqual({
      custom_flag: 'yes',
      max_members: 15,
    })
  })

  it('shows the resolved JSON read-only rather than an editable textarea', async () => {
    adminStore.seedOrgDetail(createAdminOrgDetail({ quotaOverrides: { max_members: 15 } }))
    renderDetail()

    const json = await screen.findByTestId('admin-org-overrides-json')
    expect(json.tagName).toBe('PRE')
    expect(JSON.parse(json.textContent ?? '{}')).toEqual({ max_members: 15 })
    expect(screen.queryByRole('textbox', { name: /Quota Overrides/i })).not.toBeInTheDocument()
  })

  it('clears the term and the note when the admin empties them', async () => {
    // Null is how the client says "take this off the club". The backend reads
    // presence, not nullness, on these three fields, so a save that sends
    // null actually clears them rather than being ignored.
    adminStore.seedOrgDetail(
      createAdminOrgDetail({
        quotaOverrides: { max_members: 15 },
        termEnd: '2027-07-31T00:00:00Z',
        adminNote: 'Agreed by phone',
      }),
    )
    const user = userEvent.setup()
    renderDetail()

    await user.clear(await screen.findByTestId('admin-org-term-end'))
    await user.clear(screen.getByTestId('admin-org-note'))
    await user.click(screen.getByTestId('admin-org-save'))

    await waitFor(() => expect(adminStore.clubUpdates()).toHaveLength(1))
    const body = adminStore.clubUpdates()[0].body
    expect(body.termEnd).toBeNull()
    expect(body.adminNote).toBeNull()
    expect('termEnd' in body).toBe(true)
    expect('adminNote' in body).toBe(true)

    // And the club that comes back has actually lost them.
    await screen.findByTestId('admin-org-saved')
    await waitFor(() =>
      expect(screen.getByTestId('admin-org-paid-until')).not.toHaveTextContent('Paid until'),
    )
  })

  it('refuses to save a limit that is not a usable number', async () => {
    adminStore.seedOrgDetail(createAdminOrgDetail({ quotaOverrides: { max_members: 15 } }))
    const user = userEvent.setup()
    renderDetail()

    await user.clear(await screen.findByTestId('club-limit-max_members-value'))
    expect(screen.getByTestId('admin-org-save')).toBeDisabled()
    expect(adminStore.clubUpdates()).toEqual([])
  })
})

describe('Admin club ownership transfer', () => {
  it('hands the club to a member after confirmation', async () => {
    const user = userEvent.setup()
    renderDetail()

    await user.selectOptions(await screen.findByTestId('admin-org-transfer-target'), 'user-2')
    await user.click(screen.getByTestId('admin-org-transfer-btn'))
    await user.click(await screen.findByTestId('confirm-action-btn'))

    await waitFor(() =>
      expect(adminStore.transfers()).toEqual([{ orgId: 'org-1', userId: 'user-2' }]),
    )
  })

  it('offers nobody when the creator is the only member', async () => {
    adminStore.seedOrgDetail(
      createAdminOrgDetail({
        members: [
          {
            id: 'member-1',
            userId: 'user-1',
            name: 'Test Operator',
            email: 'test@example.com',
            permissions: 127,
            joinedAt: '2026-01-01T00:00:00Z',
          },
        ],
      }),
    )
    renderDetail()

    expect(await screen.findByTestId('admin-org-transfer')).toHaveTextContent(
      'There is no other member to hand the club to.',
    )
  })
})

describe('Admin club invoicing', () => {
  it('lists the club invoices with both Stripe links', async () => {
    adminStore.seedInvoices([createOrgInvoice({ status: 'paid', paidAt: '2026-09-20T00:00:00Z' })])
    renderDetail()

    const row = await screen.findByTestId('admin-org-invoices-row')
    expect(row).toHaveTextContent('PointFinder club, 2026/27 season')
    expect(row).toHaveTextContent('€499.00')
    expect(row).toHaveTextContent('Paid September 20, 2026')
    expect(within(row).getByLabelText('Open the invoice page')).toHaveAttribute(
      'href',
      'https://invoice.example/hosted',
    )
    expect(within(row).getByLabelText('Open the PDF')).toHaveAttribute(
      'href',
      'https://invoice.example/pdf',
    )
  })

  it('issues an invoice in cents and shows the new row', async () => {
    const user = userEvent.setup()
    renderDetail()

    await user.click(await screen.findByTestId('admin-org-issue-invoice'))
    await user.type(screen.getByTestId('issue-invoice-amount'), '499')
    await user.type(screen.getByTestId('issue-invoice-description'), '2026/27 season')
    await user.clear(screen.getByTestId('issue-invoice-term-months'))
    await user.type(screen.getByTestId('issue-invoice-term-months'), '24')

    expect(screen.getByTestId('issue-invoice-confirm')).toHaveTextContent(
      'Sends €499.00, due in 30 days, buying 24 months of term.',
    )

    await user.click(screen.getByTestId('issue-invoice-submit'))

    await waitFor(() => expect(adminStore.issuedInvoices()).toHaveLength(1))
    expect(adminStore.issuedInvoices()[0].body).toEqual({
      amountCents: 49900,
      currency: 'eur',
      description: '2026/27 season',
      dueDays: 30,
      termMonths: 24,
    })
    expect(await screen.findByTestId('admin-org-invoices-row')).toHaveTextContent('2026/27 season')
  })

  it('keeps a Stripe-not-configured refusal inline in the dialog', async () => {
    adminStore.failNextInvoice('INVOICE_STRIPE_NOT_CONFIGURED')
    const user = userEvent.setup()
    renderDetail()

    await user.click(await screen.findByTestId('admin-org-issue-invoice'))
    await user.type(screen.getByTestId('issue-invoice-amount'), '499')
    await user.type(screen.getByTestId('issue-invoice-description'), '2026/27 season')
    await user.click(screen.getByTestId('issue-invoice-submit'))

    expect(await screen.findByTestId('issue-invoice-error')).toHaveTextContent(
      'Invoicing is not configured on this server.',
    )
    // The dialog stays open so the amount is not retyped.
    expect(screen.getByTestId('issue-invoice-dialog')).toBeInTheDocument()
  })
})
