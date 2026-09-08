import { describe, expect, it } from 'vitest'
import { clampTilt, nearestAngle } from './pose'

describe('welcome compass pose', () => {
  it('crosses north by the short path in either direction after multiple turns', () => {
    expect(nearestAngle(-359, -1)).toBe(-361)
    expect(nearestAngle(-1, -359)).toBe(1)
    expect(nearestAngle(1081, 359)).toBe(1079)
    expect(nearestAngle(-1081, 1)).toBe(-1079)
  })
  it('keeps physical tilt readable even when the phone is upright or inverted', () => {
    expect(clampTilt(90)).toBe(25)
    expect(clampTilt(-180)).toBe(-25)
    expect(clampTilt(12)).toBe(12)
  })
})
