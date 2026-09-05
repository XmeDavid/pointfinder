import { afterEach, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QrScannerOverlay } from './QrScannerOverlay'

afterEach(() => document.documentElement.classList.remove('native-scanner-active'))

it('keeps a visible back action above the native QR camera', async () => {
  const onBack = vi.fn()
  const { unmount } = render(<QrScannerOverlay onBack={onBack} />)

  expect(document.documentElement).toHaveClass('native-scanner-active')
  await userEvent.click(screen.getByTestId('player-join-scan-back-btn'))
  expect(onBack).toHaveBeenCalledOnce()

  unmount()
  expect(document.documentElement).not.toHaveClass('native-scanner-active')
})
