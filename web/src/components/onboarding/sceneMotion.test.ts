import { describe, expect, it } from 'vitest'
import { TRANSITION_MAX_SECONDS, TRANSITION_MAX_STEP_SECONDS, WORLD_FADE_START } from './sceneMath'
import { createSceneMotion, type SceneMotion } from './sceneMotion'

/** Run the loop at a fixed frame interval until settled; returns wall seconds and frames drawn. */
function run(motion: SceneMotion, frameMs: number, limitSeconds = 30) {
  let seconds = 0
  let ticks = 0
  while (!motion.settled && seconds < limitSeconds) {
    motion.advance(frameMs / 1000)
    seconds += frameMs / 1000
    ticks += 1
  }
  return { seconds, ticks }
}

describe('onboarding scene motion policy', () => {
  it('approaches the first chapter from frame 1 within the bound at 60 and 30 fps', () => {
    for (const frameMs of [1000 / 60, 1000 / 30]) {
      const motion = createSceneMotion(125, false)
      expect(motion.frame).toBe(1)
      expect(motion.settled).toBe(false)
      const { seconds } = run(motion, frameMs)
      expect(motion.frame).toBe(125)
      expect(seconds).toBeLessThanOrEqual(TRANSITION_MAX_SECONDS + frameMs / 1000)
      expect(seconds).toBeGreaterThan(.9)
    }
  })
  it('finishes every chapter hop in about a second of wall time and stops exactly on the hold', () => {
    const motion = createSceneMotion(125, false)
    run(motion, 1000 / 60)
    const steps = [301, 371, 465, 580, 765, 864]
    for (const step of steps) {
      motion.setTarget(step, false)
      const { seconds } = run(motion, 1000 / 60)
      expect(motion.frame).toBe(step)
      expect(seconds).toBeGreaterThanOrEqual(.9)
      expect(seconds).toBeLessThanOrEqual(TRANSITION_MAX_SECONDS + 1 / 60)
    }
  })
  it('stretches rather than skips on a slow renderer: at most a quarter second of story per drawn frame', () => {
    expect(TRANSITION_MAX_STEP_SECONDS).toBe(.25)
    const motion = createSceneMotion(125, false)
    run(motion, 1000 / 60)
    motion.setTarget(301, false)
    const { ticks, seconds } = run(motion, 400)
    const minimumPoses = Math.ceil(TRANSITION_MAX_SECONDS / TRANSITION_MAX_STEP_SECONDS)
    expect(ticks).toBeGreaterThanOrEqual(minimumPoses)
    expect(seconds).toBeLessThanOrEqual(minimumPoses * .4 + .4)
    expect(motion.frame).toBe(301)
  })
  it('reverses smoothly when the target changes mid-transition', () => {
    const motion = createSceneMotion(125, false)
    run(motion, 1000 / 60)
    motion.setTarget(301, false)
    for (let i = 0; i < 20; i += 1) motion.advance(1 / 60)
    const midway = motion.frame
    expect(midway).toBeGreaterThan(125)
    expect(midway).toBeLessThan(301)
    motion.setTarget(125, false)
    const next = motion.advance(1 / 60)
    expect(next).toBeLessThanOrEqual(midway)
    expect(next).toBeGreaterThan(midway - 2)
    run(motion, 1000 / 60)
    expect(motion.frame).toBe(125)
    expect(motion.cameraFrame).toBe(125)
  })
  it('skips by fading the current scene, never playing unseen chapters', () => {
    const motion = createSceneMotion(125, false)
    run(motion, 1000 / 60)
    motion.setTarget(301, false)
    for (let i = 0; i < 20; i += 1) motion.advance(1 / 60)
    const shown = motion.frame
    motion.setTarget(864, false)
    expect(motion.towardCompass).toBe(true)
    expect(motion.frame).toBe(WORLD_FADE_START)
    expect(motion.cameraFrame).toBe(shown)
    expect(motion.storyFrame).toBe(shown)
    const { seconds } = run(motion, 1000 / 60)
    expect(motion.frame).toBe(864)
    expect(seconds).toBeLessThanOrEqual(TRANSITION_MAX_SECONDS + 1 / 60)
    // Past the fade the compass camera takes over; the story stays frozen on the skipped scene.
    expect(motion.cameraFrame).toBe(864)
    expect(motion.storyFrame).toBe(shown)
    // Coming back to a chapter releases the snapshot.
    motion.setTarget(765, false)
    expect(motion.storyFrame).toBe(motion.frame)
  })
  it('plays the handoff from the last chapter instead of skipping it', () => {
    const motion = createSceneMotion(765, false)
    run(motion, 1000 / 60)
    motion.setTarget(864, false)
    expect(motion.frame).toBe(765)
    expect(motion.storyFrame).toBe(765)
  })
  it('starts on the landing when the target is already the compass', () => {
    const motion = createSceneMotion(864, false)
    expect(motion.frame).toBe(864)
    expect(motion.settled).toBe(true)
    expect(motion.towardCompass).toBe(true)
  })
  it('jumps immediately under reduced motion and clamps targets to the timeline', () => {
    const motion = createSceneMotion(125, true)
    expect(motion.frame).toBe(125)
    motion.setTarget(2000, true)
    expect(motion.frame).toBe(864)
    expect(motion.settled).toBe(true)
    motion.setTarget(-5, false)
    expect(motion.target).toBe(1)
    expect(motion.settled).toBe(false)
    motion.setTarget(1, true)
    expect(motion.frame).toBe(1)
    expect(motion.advance(1)).toBe(1)
  })
  it('ignores negative or absent deltas and is idempotent once settled', () => {
    const motion = createSceneMotion(125, false)
    expect(motion.advance(-1)).toBe(1)
    run(motion, 1000 / 60)
    expect(motion.advance(1)).toBe(125)
    expect(motion.settled).toBe(true)
  })
})
