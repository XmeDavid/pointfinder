import { describe, expect, it } from 'vitest'
import { sheetGoesOnTop, placeBubble, readSafeInsets, type Insets } from './placement'

const noInsets: Insets = { top: 0, right: 0, bottom: 0, left: 0 }
const viewport = { width: 1280, height: 800 }
const bubble = { width: 320, height: 200 }

describe('placeBubble', () => {
  it('sits to the right of the anchor when there is room', () => {
    const result = placeBubble({ top: 100, left: 100, width: 60, height: 40 }, bubble, viewport, noInsets)
    expect(result.side).toBe('right')
    expect(result.left).toBe(172) // 100 + 60 + 12
    expect(result.top).toBe(100)
  })

  it('flips to the left when the right edge would overflow', () => {
    const result = placeBubble({ top: 100, left: 1100, width: 60, height: 40 }, bubble, viewport, noInsets)
    expect(result.side).toBe('left')
    expect(result.left).toBe(768) // 1100 - 12 - 320
  })

  it('drops below when neither side fits', () => {
    const result = placeBubble({ top: 100, left: 0, width: 1280, height: 40 }, bubble, viewport, noInsets)
    expect(result.side).toBe('below')
    expect(result.top).toBe(152) // 100 + 40 + 12
    expect(result.left).toBe(480) // centred: 0 + 1280/2 - 160
  })

  it('clamps the top inside the safe area', () => {
    const insets: Insets = { top: 48, right: 0, bottom: 34, left: 0 }
    const high = placeBubble({ top: -20, left: 100, width: 60, height: 40 }, bubble, viewport, insets)
    expect(high.top).toBe(56) // safe.top + 8

    const low = placeBubble({ top: 780, left: 100, width: 60, height: 40 }, bubble, viewport, insets)
    expect(low.top).toBe(800 - 34 - 8 - 200)
  })

  it('clamps the left inside the safe area when it drops below', () => {
    const insets: Insets = { top: 0, right: 20, bottom: 0, left: 20 }
    const result = placeBubble({ top: 100, left: 0, width: 1280, height: 40 }, { width: 1280, height: 200 }, viewport, insets)
    expect(result.left).toBe(28) // safe.left + 8
  })
})

describe('readSafeInsets', () => {
  it('returns zeroes when the CSS variables are unset', () => {
    expect(readSafeInsets()).toEqual({ top: 0, right: 0, bottom: 0, left: 0 })
  })
})

describe('sheetGoesOnTop', () => {
  const insets = { top: 40, right: 0, bottom: 30, left: 0 }
  const viewport = 800

  it('stays at the bottom when the bottom edge leaves the region clear', () => {
    expect(sheetGoesOnTop({ top: 100, left: 0, width: 300, height: 40 }, 300, viewport, insets)).toBe(false)
  })

  it('moves to the top when only the top edge leaves the region clear', () => {
    // A dialog that reaches down into where a bottom sheet would sit.
    expect(sheetGoesOnTop({ top: 360, left: 0, width: 300, height: 300 }, 300, viewport, insets)).toBe(true)
  })

  it('goes to the top for a region that fills most of the screen', () => {
    expect(sheetGoesOnTop({ top: 0, left: 0, width: 300, height: 700 }, 300, viewport, insets)).toBe(true)
  })

  it('covers less of the region when neither edge clears it, top on a tie', () => {
    // 340..720: a bottom sheet (starting at 414) covers 306 px, a top sheet (ending at 340) covers 0.
    expect(sheetGoesOnTop({ top: 340, left: 0, width: 300, height: 380 }, 300, viewport, insets)).toBe(true)
    // 150..500: bottom overlaps 86, top overlaps 190 → bottom.
    expect(sheetGoesOnTop({ top: 150, left: 0, width: 300, height: 350 }, 300, viewport, insets)).toBe(false)
  })
})
