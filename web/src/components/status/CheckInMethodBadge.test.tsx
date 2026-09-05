import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CheckInMethodBadge, CheckInMethodIcon, CheckInVerificationBadge } from './CheckInMethodBadge'

describe('CheckInMethodBadge', () => {
  it('labels each method with its localized name', () => {
    render(
      <>
        <CheckInMethodBadge method="NFC" />
        <CheckInMethodBadge method="QR" />
        <CheckInMethodBadge method="LOCATION" />
      </>,
    )
    expect(screen.getByText('NFC')).toBeInTheDocument()
    expect(screen.getByText('QR code')).toBeInTheDocument()
    expect(screen.getByText('Location')).toBeInTheDocument()
  })

  it('gives the standalone icon an accessible label', () => {
    render(<CheckInMethodIcon method="LOCATION" data-testid="method-icon" />)
    const icon = screen.getByTestId('method-icon')
    expect(icon).toHaveAttribute('role', 'img')
    expect(icon).toHaveAttribute('aria-label', 'Location')
  })

  it('renders nothing for a verified check-in and a badge for a claimed one', () => {
    const { container } = render(<CheckInVerificationBadge verification="VERIFIED" />)
    expect(container).toBeEmptyDOMElement()

    render(<CheckInVerificationBadge verification="CLAIMED" />)
    expect(screen.getByText('Claimed')).toBeInTheDocument()

    render(<CheckInVerificationBadge verification="OPERATOR" />)
    expect(screen.getByText('Operator')).toBeInTheDocument()
  })
})
