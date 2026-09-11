import { expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QrCodeViewer } from './QrCodeViewer'
const share = vi.hoisted(() => vi.fn().mockResolvedValue('shared'))
vi.mock('@/platform/share', () => ({ shareFile: share }))
vi.mock('qrcode', () => ({
  default: {
    create: () => ({ modules: { size: 1, data: [1] } }),
    toDataURL: () => Promise.resolve('data:image/png;base64,aW1hZ2U='),
  },
}))
it('opens a focused full-screen code and saves a PNG through the platform share adapter', async () => {
  const user = userEvent.setup()
  render(
    <QrCodeViewer name="Lookout" value="https://pointfinder.app/tag/test" />,
  )
  const trigger = screen.getByRole('button', {
    name: 'Open QR code for Lookout',
  })
  await user.click(trigger)
  expect(screen.getByRole('dialog', { name: 'Lookout' })).toBeVisible()
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Save image' })).toBeEnabled(),
  )
  await user.click(screen.getByRole('button', { name: 'Save image' }))
  expect(share).toHaveBeenCalledOnce()
  expect(share.mock.calls[0][0]).toMatchObject({
    name: 'Lookout-QR.png',
    type: 'image/png',
  })
  await user.keyboard('{Escape}')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(trigger).toHaveFocus()
})
