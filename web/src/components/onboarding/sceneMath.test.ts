import { describe, expect, it } from 'vitest'
import { Vector3 } from 'three'
import {
  AUTHORED_FPS, compassAmount, planTransition, TRANSITION_MAX_SECONDS, TRANSITION_SPEED, transitionFrame,
  unwrapHeading, worldOpacity,
} from './sceneMath'

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
  it('bounds short chapter reveals to 1.2 s and plays short hops at three times the authored speed', () => {
    expect(TRANSITION_SPEED).toBe(3)
    expect(TRANSITION_MAX_SECONDS).toBe(1.2)
    // Real chapter hops (70 to 185 frames), the first approach (1 to 125) and the handoff.
    for (const [from, to] of [[1, 125], [301, 371], [371, 465], [465, 580], [782, 864]]) {
      const { duration } = planTransition(from, to)
      expect(duration).toBeGreaterThanOrEqual(.9)
      expect(duration).toBeLessThanOrEqual(TRANSITION_MAX_SECONDS)
    }
    expect(planTransition(301, 371).duration).toBeCloseTo(70 / (AUTHORED_FPS * TRANSITION_SPEED))
    expect(planTransition(125, 301).duration).toBe(2.8)
    expect(planTransition(301, 125).duration).toBe(planTransition(125, 301).duration)
    expect(planTransition(125, 125).duration).toBe(0)
  })
  it('gives walking, placing bases and player exploration longer while keeping other reveals quick', () => {
    for (const branch of ['participant', 'organizer'] as const) {
      expect(planTransition(125, 301, branch).duration).toBe(2.8)
      expect(planTransition(301, 125, branch).duration).toBe(2.8)
      expect(planTransition(213, 301, branch).duration).toBeCloseTo(1.4)
    }
    expect(planTransition(580, 765, 'participant').duration).toBe(2.4)
    expect(planTransition(765, 580, 'participant').duration).toBe(2.4)
    expect(planTransition(580, 765, 'organizer').duration).toBe(1.2)
    expect(planTransition(765, 864, 'participant').duration).toBe(1.2)
  })
  it('eases into holds without overshooting, forwards and backwards', () => {
    const forward = planTransition(125, 301)
    expect(transitionFrame(forward, 0)).toBe(125)
    expect(transitionFrame(forward, forward.duration / 2)).toBeCloseTo(213)
    expect(transitionFrame(forward, forward.duration)).toBe(301)
    expect(transitionFrame(forward, forward.duration * 3)).toBe(301)
    const early = transitionFrame(forward, forward.duration * .1) - 125
    const middle = transitionFrame(forward, forward.duration * .55) - transitionFrame(forward, forward.duration * .45)
    expect(early).toBeLessThan(middle)
    const backward = planTransition(301, 125)
    expect(transitionFrame(backward, backward.duration / 2)).toBeCloseTo(213)
    expect(transitionFrame(backward, backward.duration)).toBe(125)
    expect(transitionFrame(planTransition(125, 125), 0)).toBe(125)
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
