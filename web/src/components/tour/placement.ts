export interface Rect {
  top: number
  left: number
  width: number
  height: number
}

export interface Insets {
  top: number
  right: number
  bottom: number
  left: number
}

export interface BubbleSize {
  width: number
  height: number
}

export interface Viewport {
  width: number
  height: number
}

export interface Placement {
  left: number
  top: number
  side: 'right' | 'left' | 'below'
}

const EDGE = 8

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min
  return Math.min(Math.max(value, min), max)
}

/**
 * Places the coach bubble beside its anchor: right first, then left, then
 * below. Pure so the collision rules can be tested without a browser.
 */
export function placeBubble(
  anchor: Rect,
  bubble: BubbleSize,
  viewport: Viewport,
  safe: Insets,
  gap = 12,
): Placement {
  const minLeft = safe.left + EDGE
  const maxLeft = viewport.width - safe.right - EDGE - bubble.width
  const minTop = safe.top + EDGE
  const maxTop = viewport.height - safe.bottom - EDGE - bubble.height

  const rightLeft = anchor.left + anchor.width + gap
  if (rightLeft + bubble.width <= viewport.width - safe.right - EDGE) {
    return { left: rightLeft, top: clamp(anchor.top, minTop, maxTop), side: 'right' }
  }

  const leftLeft = anchor.left - gap - bubble.width
  if (leftLeft >= minLeft) {
    return { left: leftLeft, top: clamp(anchor.top, minTop, maxTop), side: 'left' }
  }

  const centred = anchor.left + anchor.width / 2 - bubble.width / 2
  return {
    left: clamp(centred, minLeft, maxLeft),
    top: clamp(anchor.top + anchor.height + gap, minTop, maxTop),
    side: 'below',
  }
}

function readVar(style: CSSStyleDeclaration, name: string): number {
  const parsed = Number.parseFloat(style.getPropertyValue(name))
  return Number.isFinite(parsed) ? parsed : 0
}

/** The four `--safe-*` measurements the app already maintains, in CSS pixels. */
export function readSafeInsets(): Insets {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return { top: 0, right: 0, bottom: 0, left: 0 }
  }
  const style = window.getComputedStyle(document.documentElement)
  return {
    top: readVar(style, '--safe-top'),
    right: readVar(style, '--safe-right'),
    bottom: readVar(style, '--safe-bottom'),
    left: readVar(style, '--safe-left'),
  }
}
