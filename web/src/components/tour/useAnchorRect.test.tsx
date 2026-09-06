import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { useAnchorRect } from './useAnchorRect'

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

function Probe({ testId, tick }: { testId: string | null; tick?: number }) {
  const { element, rect, visible } = useAnchorRect(testId, tick)
  return (
    <div
      data-testid="probe"
      data-present={element ? 'yes' : 'no'}
      data-visible={visible ? 'yes' : 'no'}
      data-geometry={rect ? `${rect.left},${rect.top},${rect.width},${rect.height}` : 'none'}
    />
  )
}

function stubRect(el: Element, rect: Partial<DOMRect>): void {
  el.getBoundingClientRect = () =>
    ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}), ...rect }) as DOMRect
}

function mountAnchor(testId: string, rect: Partial<DOMRect>): HTMLElement {
  const anchor = document.createElement('button')
  anchor.setAttribute('data-testid', testId)
  document.body.appendChild(anchor)
  stubRect(anchor, rect)
  return anchor
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('useAnchorRect', () => {
  it('measures a present anchor', () => {
    mountAnchor('go-live-btn', { top: 40, left: 24, right: 224, bottom: 80, width: 200, height: 40 })

    render(<Probe testId="go-live-btn" />)

    expect(screen.getByTestId('probe')).toHaveAttribute('data-present', 'yes')
    expect(screen.getByTestId('probe')).toHaveAttribute('data-visible', 'yes')
    expect(screen.getByTestId('probe')).toHaveAttribute('data-geometry', '24,40,200,40')
  })

  it('reports nothing for a missing anchor and for a null test id', () => {
    render(<Probe testId="not-here" />)
    expect(screen.getByTestId('probe')).toHaveAttribute('data-present', 'no')
    expect(screen.getByTestId('probe')).toHaveAttribute('data-geometry', 'none')

    render(<Probe testId={null} />)
    expect(screen.getAllByTestId('probe')[1]).toHaveAttribute('data-present', 'no')
  })

  it('re-measures when the tick changes', () => {
    const anchor = mountAnchor('save-base-btn', { top: 10, left: 10, right: 60, bottom: 30, width: 50, height: 20 })

    const view = render(<Probe testId="save-base-btn" tick={0} />)
    expect(screen.getByTestId('probe')).toHaveAttribute('data-geometry', '10,10,50,20')

    stubRect(anchor, { top: 90, left: 10, right: 60, bottom: 110, width: 50, height: 20 })
    act(() => {
      view.rerender(<Probe testId="save-base-btn" tick={1} />)
    })
    expect(screen.getByTestId('probe')).toHaveAttribute('data-geometry', '10,90,50,20')
  })

  it('re-measures on a capture-phase scroll', () => {
    const anchor = mountAnchor('map-wrapper', { top: 300, left: 0, right: 100, bottom: 340, width: 100, height: 40 })

    render(<Probe testId="map-wrapper" />)
    expect(screen.getByTestId('probe')).toHaveAttribute('data-geometry', '0,300,100,40')

    stubRect(anchor, { top: 100, left: 0, right: 100, bottom: 140, width: 100, height: 40 })
    act(() => {
      window.dispatchEvent(new Event('scroll'))
    })
    expect(screen.getByTestId('probe')).toHaveAttribute('data-geometry', '0,100,100,40')
  })

  it('finds an anchor that appears after mount, without any user event', async () => {
    render(<Probe testId="late-anchor" />)
    expect(screen.getByTestId('probe')).toHaveAttribute('data-present', 'no')

    act(() => {
      mountAnchor('late-anchor', { top: 5, left: 5, right: 55, bottom: 25, width: 50, height: 20 })
    })

    await waitFor(() => expect(screen.getByTestId('probe')).toHaveAttribute('data-present', 'yes'))
    expect(screen.getByTestId('probe')).toHaveAttribute('data-geometry', '5,5,50,20')
  })

  it('keeps re-measuring for a short settle window after a trigger', async () => {
    const anchor = mountAnchor('drawer-anchor', { top: 500, left: 0, right: 100, bottom: 540, width: 100, height: 40 })

    render(<Probe testId="drawer-anchor" />)
    expect(screen.getByTestId('probe')).toHaveAttribute('data-geometry', '0,500,100,40')

    act(() => {
      window.dispatchEvent(new Event('resize'))
    })
    // The anchor keeps moving after the trigger, as a spring animation would.
    stubRect(anchor, { top: 200, left: 0, right: 100, bottom: 240, width: 100, height: 40 })

    await waitFor(() => expect(screen.getByTestId('probe')).toHaveAttribute('data-geometry', '0,200,100,40'))
  })
})
