import { afterEach, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QrScannerOverlay } from './QrScannerOverlay'

afterEach(() => document.documentElement.classList.remove('native-scanner-active'))

it('keeps a visible back action above the native QR camera', async () => {
  const onBack = vi.fn()
  const { unmount } = render(<QrScannerOverlay onBack={onBack} caption="Scan QR code" />)

  expect(document.documentElement).toHaveClass('native-scanner-active')
  expect(screen.getByTestId('player-qr-scanner')).toBeInTheDocument()
  expect(screen.getByText('Scan QR code')).toBeInTheDocument()
  await userEvent.click(screen.getByTestId('player-join-scan-back-btn'))
  expect(onBack).toHaveBeenCalledOnce()

  unmount()
  expect(document.documentElement).not.toHaveClass('native-scanner-active')
})

it('carries the caption and test id the caller passes', () => {
  render(<QrScannerOverlay onBack={() => {}} caption="Scan code" testId="player-base-qr-scanner" />)
  expect(screen.getByTestId('player-base-qr-scanner')).toBeInTheDocument()
  expect(screen.queryByTestId('player-qr-scanner')).not.toBeInTheDocument()
  expect(screen.getByText('Scan code')).toBeInTheDocument()
})
