import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CodesPrintSheet } from './CodesPrintSheet'
import { QrCodeSvg } from './QrCodeSvg'

describe('QrCodeSvg', () => {
  it('renders a square svg with a module path for the encoded value', () => {
    render(<QrCodeSvg value="https://pointfinder.pt/tag/abc?t=xyz" data-testid="qr" />)
    const svg = screen.getByTestId('qr')
    expect(svg.tagName.toLowerCase()).toBe('svg')
    const viewBox = svg.getAttribute('viewBox')?.split(' ') ?? []
    expect(viewBox[2]).toBe(viewBox[3])
    const path = svg.querySelector('path[data-testid="qr-modules"]')
    expect(path?.getAttribute('d')).toMatch(/^M\d+ \d+h1v1h-1z/)
  })

  it('renders nothing when the value cannot be encoded', () => {
    const { container } = render(<QrCodeSvg value="" />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('CodesPrintSheet', () => {
  it('renders one page per code with the base and game name and asks the browser to print', async () => {
    const print = vi.fn()
    vi.stubGlobal('print', print)

    render(
      <CodesPrintSheet
        open
        gameName="Night Trail"
        onClose={vi.fn()}
        codes={[
          { id: 'b1', name: 'Old mill', value: 'https://pointfinder.pt/tag/b1?t=a' },
          { id: 'b2', name: 'Chapel', value: 'https://pointfinder.pt/tag/b2?t=b' },
        ]}
      />,
    )

    const pages = await screen.findAllByTestId('codes-print-page')
    expect(pages).toHaveLength(2)
    expect(pages[0]).toHaveTextContent('Old mill')
    expect(pages[0]).toHaveTextContent('Night Trail')
    expect(pages[1]).toHaveTextContent('Chapel')
    expect(print).toHaveBeenCalledTimes(1)

    vi.unstubAllGlobals()
  })

  it('renders nothing while closed and closes on demand', async () => {
    const onClose = vi.fn()
    vi.stubGlobal('print', vi.fn())
    const { rerender } = render(
      <CodesPrintSheet open={false} gameName="Night Trail" onClose={onClose} codes={[]} />,
    )
    expect(screen.queryByTestId('codes-print-sheet')).not.toBeInTheDocument()

    rerender(
      <CodesPrintSheet
        open
        gameName="Night Trail"
        onClose={onClose}
        codes={[{ id: 'b1', name: 'Old mill', value: 'https://pointfinder.pt/tag/b1?t=a' }]}
      />,
    )
    await userEvent.click(screen.getByTestId('codes-print-close'))
    expect(onClose).toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})
