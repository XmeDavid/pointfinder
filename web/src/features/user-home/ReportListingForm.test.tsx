import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ReportListingForm } from './ReportListingForm'

function setup(over: Partial<React.ComponentProps<typeof ReportListingForm>> = {}) {
  const onSubmit = vi.fn().mockResolvedValue(undefined)
  const onBack = vi.fn()
  render(<ReportListingForm title="Coast trail" online onSubmit={onSubmit} onBack={onBack} {...over} />)
  return { onSubmit: (over.onSubmit as typeof onSubmit | undefined) ?? onSubmit, onBack }
}

describe('ReportListingForm (OW-06)', () => {
  it('sends the chosen reason with trimmed details and thanks the reporter', async () => {
    const { onSubmit } = setup()
    const send = screen.getByRole('button', { name: 'Send report' })
    expect(send).toBeDisabled()
    await userEvent.click(screen.getByRole('radio', { name: 'Unsafe place or activity' }))
    await userEvent.type(screen.getByLabelText('Details (optional)'), '  Crosses a motorway  ')
    await userEvent.click(send)
    expect(onSubmit).toHaveBeenCalledWith({ reason: 'unsafe', details: 'Crosses a motorway' })
    expect(await screen.findByRole('status')).toHaveTextContent('Thanks. An administrator will review this listing.')
    expect(screen.queryByRole('button', { name: 'Send report' })).not.toBeInTheDocument()
  })

  it('leaves details out when none were written', async () => {
    const { onSubmit } = setup()
    await userEvent.click(screen.getByRole('radio', { name: 'Spam or advertising' }))
    await userEvent.click(screen.getByRole('button', { name: 'Send report' }))
    expect(onSubmit).toHaveBeenCalledWith({ reason: 'spam', details: null })
  })

  it('treats a report that is already open as received', async () => {
    setup({ onSubmit: vi.fn().mockRejectedValue({ response: { status: 409 } }) })
    await userEvent.click(screen.getByRole('radio', { name: 'Something else' }))
    await userEvent.click(screen.getByRole('button', { name: 'Send report' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Thanks.')
  })

  it('explains a listing that has gone and keeps the form for other failures', async () => {
    setup({ onSubmit: vi.fn().mockRejectedValueOnce({ status: 404 }).mockRejectedValueOnce(new Error('network')) })
    await userEvent.click(screen.getByRole('radio', { name: 'Offensive or inappropriate' }))
    await userEvent.click(screen.getByRole('button', { name: 'Send report' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('This listing is no longer in Explore.')
    await userEvent.click(screen.getByRole('button', { name: 'Send report' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Could not send the report. Try again.'))
    expect(screen.getByRole('radio', { name: 'Offensive or inappropriate' })).toBeChecked()
  })

  it('cannot send offline and says why', async () => {
    setup({ online: false })
    await userEvent.click(screen.getByRole('radio', { name: 'Spam or advertising' }))
    expect(screen.getByRole('button', { name: 'Send report' })).toBeDisabled()
    expect(screen.getByText('Reconnect to send a report.')).toBeInTheDocument()
  })

  it('goes back without sending', async () => {
    const { onSubmit, onBack } = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(onBack).toHaveBeenCalled()
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
