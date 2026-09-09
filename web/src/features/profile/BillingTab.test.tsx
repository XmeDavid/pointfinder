import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '@/i18n'
import { useAuthStore } from '@/lib/auth/store'
import { useWorkspaceContext } from '@/stores/workspaceContext'
import { billingStore } from '@/test/msw/handlers/billing'
import { orgsStore } from '@/test/msw/handlers/orgs'
import { createOrgInvoice } from '@/test/msw/handlers/admin'
import { createOrgWorkspace, createQuota, workspacesStore } from '@/test/msw/handlers/workspaces'
import { OrgPermission } from '@/types/organization'
import { BillingTab } from './BillingTab'

// Checkout and portal both leave for Stripe; the tab only has to ask for the
// right session, so keep the navigation out of jsdom.
vi.mock('@/platform/navigation', () => ({ openExternal: vi.fn(async () => {}) }))

function renderTab() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <BillingTab />
    </QueryClientProvider>,
  )
}

beforeEach(async () => {
  await i18n.changeLanguage('en')
  billingStore.reset()
  workspacesStore.reset()
  orgsStore.reset()
  useWorkspaceContext.setState({ active: { type: 'personal' } })
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

describe('BillingTab personal plan', () => {
  it('offers the monthly price and checks out with the monthly cycle', async () => {
    const user = userEvent.setup()
    renderTab()

    await waitFor(() => expect(screen.getByTestId('billing-pro-price')).toHaveTextContent('€3.99'))
    expect(screen.getByTestId('billing-pro-price')).toHaveTextContent('/ month')

    await user.click(screen.getByTestId('billing-subscribe-pro'))

    await waitFor(() =>
      expect(billingStore.checkouts()).toEqual([{ plan: 'pro', cycle: 'monthly' }]),
    )
  })

  it('offers the yearly price with its saving and checks out with the annual cycle', async () => {
    const user = userEvent.setup()
    renderTab()

    await waitFor(() => expect(screen.getByTestId('billing-pro-price')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Yearly' }))

    expect(screen.getByTestId('billing-pro-price')).toHaveTextContent('€30')
    expect(screen.getByTestId('billing-pro-price')).toHaveTextContent('/ year')
    expect(screen.getByTestId('billing-pro-savings')).toHaveTextContent('Save €17.88 compared with monthly')

    await user.click(screen.getByTestId('billing-subscribe-pro'))

    await waitFor(() =>
      expect(billingStore.checkouts()).toEqual([{ plan: 'pro', cycle: 'annual' }]),
    )
  })

  it('formats the price for the reader language rather than hardcoding a euro string', async () => {
    await i18n.changeLanguage('de')
    renderTab()
    await waitFor(() => expect(screen.getByTestId('billing-pro-price')).toHaveTextContent('3,99'))
    await i18n.changeLanguage('en')
  })

  it('names the plan from the catalog and never lists a club price', async () => {
    renderTab()
    await waitFor(() => expect(screen.getByText('Pro')).toBeInTheDocument())
    expect(screen.getByTestId('billing-club-info')).toBeInTheDocument()
    expect(screen.queryByText(/€25/)).not.toBeInTheDocument()
    expect(screen.queryByText(/€99/)).not.toBeInTheDocument()
    expect(screen.queryByText('Institution')).not.toBeInTheDocument()
  })

  it('sends club interest to the shared contact address instead of a checkout', async () => {
    renderTab()
    const contact = await screen.findByTestId('billing-club-contact')
    expect(contact).toHaveAttribute('href', expect.stringMatching(/^mailto:info@pointfinder\.pt/))
    expect(billingStore.checkouts()).toEqual([])
  })
})

describe('BillingTab in an org workspace', () => {
  beforeEach(() => {
    useWorkspaceContext.setState({
      active: { type: 'org', orgId: 'org-1', orgName: 'Scout Group 42' },
    })
    workspacesStore.seedOrgQuota(createQuota({ context: 'org', orgId: 'org-1', tier: 'club' }))
  })

  it('hides upgrade and subscription controls from a member without MANAGE_BILLING', async () => {
    workspacesStore.seedOrganizations([createOrgWorkspace({ permissions: 3 })])
    renderTab()

    await waitFor(() => expect(screen.getByTestId('billing-club-info')).toBeInTheDocument())
    expect(screen.queryByTestId('billing-personal-upgrade')).not.toBeInTheDocument()
    expect(screen.queryByTestId('billing-manage-subscription')).not.toBeInTheDocument()
  })

  it('offers no self-serve portal even to a member who holds MANAGE_BILLING', async () => {
    workspacesStore.seedOrganizations([
      createOrgWorkspace({ permissions: OrgPermission.OPERATE_GAMES | OrgPermission.MANAGE_BILLING }),
    ])
    renderTab()

    // A club is invoiced by us; there is no org billing portal to open.
    await waitFor(() => expect(screen.getByTestId('billing-club-info')).toBeInTheDocument())
    expect(screen.queryByTestId('billing-manage-subscription')).not.toBeInTheDocument()
  })

  it('states the club term and status on the club block', async () => {
    workspacesStore.seedOrganizations([createOrgWorkspace({ status: 'grace_period' })])
    renderTab()

    const term = await screen.findByTestId('billing-club-term')
    expect(term).toHaveTextContent('In grace period')
    expect(term).toHaveTextContent('Paid until July 31, 2027')
  })

  it('lists the club invoices for a member who holds MANAGE_BILLING', async () => {
    workspacesStore.seedOrganizations([
      createOrgWorkspace({ permissions: OrgPermission.OPERATE_GAMES | OrgPermission.MANAGE_BILLING }),
    ])
    orgsStore.seedInvoices([createOrgInvoice({ status: 'paid', paidAt: '2026-09-20T00:00:00Z' })])
    renderTab()

    const row = await screen.findByTestId('club-invoices-row')
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

  it('hides the club invoices from a member without MANAGE_BILLING', async () => {
    workspacesStore.seedOrganizations([createOrgWorkspace({ permissions: 3 })])
    orgsStore.seedInvoices([createOrgInvoice()])
    renderTab()

    await waitFor(() => expect(screen.getByTestId('billing-club-info')).toBeInTheDocument())
    expect(screen.queryByTestId('billing-club-invoices')).not.toBeInTheDocument()
  })
})
