import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CoachBubble } from './CoachBubble'

const LONG_DE =
  'Tippe auf die Karte an der Stelle, an der die Teams später ankommen sollen, und wähle anschließend „Basis hier platzieren“, damit die Basis mit den Koordinaten dieses Punktes angelegt wird.'

function renderBubble(overrides: Partial<React.ComponentProps<typeof CoachBubble>> = {}) {
  const props = {
    title: 'Place your first base',
    body: 'Tap the map where players should go.',
    step: 3,
    total: 12,
    onClose: vi.fn(),
    anchorRect: null,
    ...overrides,
  }
  return { props, ...render(<CoachBubble {...props} />) }
}

afterEach(() => {
  cleanup()
})

describe('CoachBubble', () => {
  it('renders the step counter, title and body', () => {
    renderBubble()
    expect(screen.getByTestId('tour-bubble-title')).toHaveTextContent('Place your first base')
    expect(screen.getByTestId('tour-bubble-body')).toHaveTextContent('Tap the map where players should go.')
    expect(screen.getByTestId('tour-bubble')).toHaveTextContent('Step 3 of 12')
  })

  it('renders the aside only when there is one', () => {
    renderBubble()
    expect(screen.queryByTestId('tour-bubble-aside')).not.toBeInTheDocument()

    cleanup()
    renderBubble({ aside: 'Players never see scores.' })
    expect(screen.getByTestId('tour-bubble-aside')).toHaveTextContent('Players never see scores.')
  })

  it('renders Next only for ack steps and Got it on the last step', async () => {
    const onAck = vi.fn()
    renderBubble()
    expect(screen.queryByTestId('tour-next')).not.toBeInTheDocument()

    cleanup()
    const user = userEvent.setup()
    renderBubble({ onAck })
    await user.click(screen.getByTestId('tour-next'))
    expect(screen.getByTestId('tour-next')).toHaveTextContent('Next')
    expect(onAck).toHaveBeenCalledTimes(1)

    cleanup()
    renderBubble({ onAck, isLast: true })
    expect(screen.getByTestId('tour-next')).toHaveTextContent('Got it')
  })

  it('renders the later action only when a handler is supplied', async () => {
    const onLater = vi.fn()
    renderBubble()
    expect(screen.queryByTestId('tour-later')).not.toBeInTheDocument()

    cleanup()
    const user = userEvent.setup()
    renderBubble({ onLater })
    await user.click(screen.getByTestId('tour-later'))
    expect(screen.getByTestId('tour-later')).toHaveTextContent("I'll do it later")
    expect(onLater).toHaveBeenCalledTimes(1)
  })

  it('closes from the close control and from Escape while focus is inside', async () => {
    const user = userEvent.setup()
    const { props } = renderBubble()
    await user.click(screen.getByTestId('tour-close'))
    expect(props.onClose).toHaveBeenCalledTimes(1)

    screen.getByTestId('tour-bubble').focus()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(props.onClose).toHaveBeenCalledTimes(2)
  })

  it('ignores Escape while focus is elsewhere, so it never fights the drawer', () => {
    const outside = document.createElement('input')
    document.body.appendChild(outside)
    const { props } = renderBubble()
    outside.focus()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(props.onClose).not.toHaveBeenCalled()
    outside.remove()
  })

  it('is an accessible, focused, polite dialog', () => {
    renderBubble()
    const bubble = screen.getByTestId('tour-bubble')
    expect(bubble).toHaveAttribute('role', 'dialog')
    expect(screen.getByTestId('tour-bubble-live')).toHaveAttribute('aria-live', 'polite')
    expect(bubble.getAttribute('aria-labelledby')).toBe(screen.getByTestId('tour-bubble-title').id)
    expect(screen.getByTestId('tour-close')).toHaveAttribute('aria-label', 'Close tutorial')
    expect(document.activeElement).toBe(bubble)
  })

  it('renders a footer above the actions when given one', () => {
    renderBubble({ footer: <button type="button" data-testid="footer-btn">Keep</button> })
    expect(screen.getByTestId('footer-btn')).toBeInTheDocument()
  })

  it('leaves focus on a control the operator just pressed', () => {
    const button = document.createElement('button')
    button.textContent = 'Visible'
    document.body.appendChild(button)
    button.focus()
    renderBubble()
    expect(document.activeElement).toBe(button)
    button.remove()
  })

  it('never steals focus from a field the operator is typing in', () => {
    const field = document.createElement('input')
    document.body.appendChild(field)
    field.focus()

    const view = renderBubble()
    expect(document.activeElement).toBe(field)

    view.rerender(<CoachBubble {...view.props} title="Name the base" step={4} />)
    expect(document.activeElement).toBe(field)
    field.remove()
  })

  it('is a bottom sheet when the desktop media query does not match', () => {
    // the shared test setup stubs matchMedia to always report matches: false
    renderBubble()
    expect(screen.getByTestId('tour-bubble')).toHaveAttribute('data-variant', 'sheet')
    expect(screen.getByTestId('tour-bubble')).toHaveAttribute('data-side', 'bottom')
  })

  it('moves the phone sheet to the top when the anchor sits low or fills the screen', () => {
    const low = { top: window.innerHeight - 60, left: 0, width: 200, height: 40 } as DOMRect
    renderBubble({ anchorRect: low })
    expect(screen.getByTestId('tour-bubble')).toHaveAttribute('data-side', 'top')

    cleanup()
    const tall = { top: 0, left: 0, width: 390, height: window.innerHeight } as DOMRect
    renderBubble({ anchorRect: tall })
    expect(screen.getByTestId('tour-bubble')).toHaveAttribute('data-side', 'top')

    cleanup()
    const high = { top: 10, left: 0, width: 200, height: 40 } as DOMRect
    renderBubble({ anchorRect: high })
    expect(screen.getByTestId('tour-bubble')).toHaveAttribute('data-side', 'bottom')
  })

  it('survives long German copy without dropping the controls', () => {
    renderBubble({ body: LONG_DE, onAck: vi.fn(), onLater: vi.fn() })
    expect(screen.getByTestId('tour-bubble-body')).toHaveTextContent('Basis hier platzieren')
    expect(screen.getByTestId('tour-next')).toBeInTheDocument()
    expect(screen.getByTestId('tour-later')).toBeInTheDocument()
  })
})
