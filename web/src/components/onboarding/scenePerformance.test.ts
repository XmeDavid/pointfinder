import { describe, expect, it } from 'vitest'
import { createResolutionGovernor, drawDue, SLOW_FRAME_MS, SLOW_FRAME_WINDOW } from './scenePerformance'

describe('onboarding draw pacing', () => {
  it('draws every second vsync on a 60 Hz display despite timestamp jitter', () => {
    let previous = 0
    let drawn = 0
    for (let i = 1; i <= 60; i += 1) {
      const now = i * (1000 / 60) - (i % 3 === 0 ? .4 : 0)
      if (drawDue(now, previous)) { drawn += 1; previous = now }
    }
    expect(drawn).toBe(30)
  })
  it('draws every frame when frames are already slower than the target', () => {
    expect(drawDue(400, 0)).toBe(true)
    expect(drawDue(10, 0)).toBe(false)
  })
})

describe('onboarding resolution governor', () => {
  it('starts at the sharpest rung the device supports and never exceeds 1.5', () => {
    expect(createResolutionGovernor(3).pixelRatio).toBe(1.5)
    expect(createResolutionGovernor(1).pixelRatio).toBe(1)
    expect(createResolutionGovernor(.5).pixelRatio).toBe(1)
  })
  it('keeps the resolution while frames are quick', () => {
    const governor = createResolutionGovernor(3)
    for (let i = 0; i < 60; i += 1) expect(governor.sample(33)).toBeUndefined()
    expect(governor.pixelRatio).toBe(1.5)
  })
  it('steps down to 1 once a full window of world frames is slow, and never further or back up', () => {
    const governor = createResolutionGovernor(3)
    const applied: number[] = []
    for (let i = 0; i < SLOW_FRAME_WINDOW * 2; i += 1) {
      const ratio = governor.sample(SLOW_FRAME_MS * 4)
      if (ratio !== undefined) applied.push(ratio)
    }
    expect(applied).toEqual([1])
    expect(governor.pixelRatio).toBe(1)
    for (let i = 0; i < SLOW_FRAME_WINDOW * 3; i += 1) expect(governor.sample(SLOW_FRAME_MS * 4)).toBeUndefined()
    for (let i = 0; i < SLOW_FRAME_WINDOW * 3; i += 1) expect(governor.sample(8)).toBeUndefined()
    expect(governor.pixelRatio).toBe(1)
  })
  it('tolerates isolated stalls by judging the median, not the mean', () => {
    const governor = createResolutionGovernor(2)
    const frames = [16, 1200, 17, 16, 900, 17]
    expect(frames.length).toBe(SLOW_FRAME_WINDOW)
    for (const ms of frames) expect(governor.sample(ms)).toBeUndefined()
    expect(governor.pixelRatio).toBe(1.5)
  })
  it('has nothing to step down to on a density-1 device', () => {
    const governor = createResolutionGovernor(1)
    for (let i = 0; i < SLOW_FRAME_WINDOW * 2; i += 1) expect(governor.sample(200)).toBeUndefined()
    expect(governor.pixelRatio).toBe(1)
  })
})
