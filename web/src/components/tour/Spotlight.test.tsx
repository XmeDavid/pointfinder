import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { Spotlight } from './Spotlight'

function rectOf(top: number, left: number, width: number, height: number): DOMRect {
  return { top, left, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) } as DOMRect
}

afterEach(() => {
  cleanup()
})

describe('Spotlight', () => {
  it('renders nothing without a rect', () => {
    render(<Spotlight rect={null} />)
    expect(screen.queryByTestId('tour-spotlight')).not.toBeInTheDocument()
  })

  it('cuts a padded hole over the anchor and never intercepts clicks', () => {
    render(<Spotlight rect={rectOf(100, 200, 160, 40)} />)

    const root = screen.getByTestId('tour-spotlight')
    expect(root.className).toContain('pointer-events-none')
    expect(root.className).toContain('z-[70]')
    expect(root).toHaveAttribute('aria-hidden', 'true')

    const hole = screen.getByTestId('tour-spotlight-hole')
    expect(hole).toHaveAttribute('x', '192')
    expect(hole).toHaveAttribute('y', '92')
    expect(hole).toHaveAttribute('width', '176')
    expect(hole).toHaveAttribute('height', '56')
    expect(hole).toHaveAttribute('rx', '8')
  })

  it('paints with the lighter tour scrim token, not the modal scrim', () => {
    render(<Spotlight rect={rectOf(0, 0, 10, 10)} />)
    const fills = Array.from(document.querySelectorAll('rect')).map((r) => r.getAttribute('fill'))
    expect(fills).toContain('var(--pf-color-surface-tourScrim)')
    expect(fills).not.toContain('var(--pf-color-surface-scrim)')
  })

  it('portals to the document body so no stacking context can trap it', () => {
    const { container } = render(<Spotlight rect={rectOf(0, 0, 10, 10)} />)
    expect(container).toBeEmptyDOMElement()
    expect(document.body.querySelector('[data-testid="tour-spotlight"]')).not.toBeNull()
  })
})
