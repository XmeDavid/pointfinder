import {
  clampFrame, HANDOFF_FRAME, LAST_STORY_FRAME, planTransition, TRANSITION_MAX_STEP_SECONDS,
  transitionFrame, WORLD_FADE_END, WORLD_FADE_START, type FrameTransition, type MotionBranch,
} from './sceneMath'

/** Story position and pacing, independent of WebGL so the policy is unit-testable. */
export interface SceneMotion {
  readonly frame: number
  readonly target: number
  readonly reduced: boolean
  /** No transition pending: nothing needs a redraw for the story itself. */
  readonly settled: boolean
  /** The target is the compass landing rather than a chapter. */
  readonly towardCompass: boolean
  /** Frame that drives the camera; skip keeps the camera on the scene it fades out. */
  readonly cameraFrame: number
  /** Frame that drives the world animation, frozen on the skipped scene during its fade. */
  readonly storyFrame: number
  setTarget: (frame: number, reduced: boolean) => void
  /** Advance story time by rendered wall time in seconds and return the new frame. */
  advance: (dt: number) => number
}

export function createSceneMotion(initialTarget: number, reducedMotion: boolean, branch: MotionBranch = 'participant'): SceneMotion {
  let target = clampFrame(initialTarget)
  let reduced = reducedMotion
  let frame = target >= HANDOFF_FRAME || reduced ? target : 1
  let handoffSnapshot: number | undefined
  let transition: FrameTransition | undefined
  let elapsed = 0

  const plan = () => {
    transition = reduced || frame === target ? undefined : planTransition(frame, target, branch)
    elapsed = 0
  }
  plan()

  return {
    get frame() { return frame },
    get target() { return target },
    get reduced() { return reduced },
    get settled() { return frame === target },
    get towardCompass() { return target >= HANDOFF_FRAME },
    get cameraFrame() { return handoffSnapshot !== undefined && frame < WORLD_FADE_END ? handoffSnapshot : frame },
    get storyFrame() { return handoffSnapshot ?? frame },
    setTarget(next, reducedMotion) {
      target = clampFrame(next)
      reduced = reducedMotion
      if (target >= HANDOFF_FRAME && frame < LAST_STORY_FRAME) {
        // Skip fades the scene currently on screen; it does not play unseen chapters.
        handoffSnapshot = frame
        frame = WORLD_FADE_START
      } else if (target < HANDOFF_FRAME) handoffSnapshot = undefined
      if (reduced) frame = target
      plan()
    },
    advance(dt) {
      if (reduced) frame = target
      else if (transition) {
        elapsed += Math.max(0, Math.min(TRANSITION_MAX_STEP_SECONDS, dt))
        frame = transitionFrame(transition, elapsed)
        if (frame === target) transition = undefined
      }
      return frame
    },
  }
}
