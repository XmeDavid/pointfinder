import { describe, expect, it } from 'vitest'
import { Vector3 } from 'three'
import { compassAmount, stepTowardFrame, unwrapHeading, worldOpacity } from './sceneMath'

describe('onboarding scene motion', () => {
  it('removes the world before the compass finishes appearing, in either direction', () => {
    expect(worldOpacity(782)).toBe(1)
    expect(worldOpacity(798)).toBeCloseTo(.5)
    expect(worldOpacity(814)).toBe(0)
    expect(worldOpacity(864)).toBe(0)
    expect(compassAmount(800)).toBe(0)
    expect(compassAmount(849)).toBe(1)
    expect(worldOpacity(798)).toBeCloseTo(.5)
  })
  it('moves backwards and forwards without overshooting a resting pose', () => {
    expect(stepTowardFrame(124.9,125,.2)).toBe(125)
    expect(stepTowardFrame(125.1,125,.2)).toBe(125)
    expect(stepTowardFrame(300,125,.1)).toBeLessThan(300)
    expect(stepTowardFrame(300,465,.1)).toBeGreaterThan(300)
    expect(stepTowardFrame(125,125,.1)).toBe(125)
  })
  it('unwraps magnetic headings without a full spin across north', () => {
    expect(unwrapHeading(359,1)).toBe(361)
    expect(unwrapHeading(1,359)).toBe(-1)
  })
  it('points the needle left when the phone points east, while the dial stays fixed', () => {
    const north = new Vector3(0,0,-1)
      .applyAxisAngle(new Vector3(0,1,0),Math.PI/2)
      .applyAxisAngle(new Vector3(1,0,0),Math.PI/2)
    expect(north.x).toBeCloseTo(-1)
    expect(north.y).toBeCloseTo(0)
  })
})
