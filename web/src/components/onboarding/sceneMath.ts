import { nearestAngle } from '@/components/compass/pose'

export const FIRST_FRAME = 1
export const LAST_FRAME = 864
/** Frames per second the story was authored at; the timeline JSON carries the same value. */
export const AUTHORED_FPS = 24
/** Last chapter hold before the compass handoff; skip only fades what is on screen from here. */
export const LAST_STORY_FRAME = 765
export const WORLD_FADE_START = 782
/** Targets at or beyond this frame mean the compass landing rather than a story chapter. */
export const HANDOFF_FRAME = 784
export const WORLD_FADE_END = 814
/** From here the compass is fully in and follows the device sensors. */
export const SENSOR_FRAME = 830
export const clampFrame = (frame: number) => Math.max(FIRST_FRAME, Math.min(LAST_FRAME, frame))
export const smoothStep = (value: number) => {
  const t = Math.max(0, Math.min(1, value))
  return t * t * (3 - 2 * t)
}
export const worldOpacity = (frame: number) => 1 - smoothStep((frame - WORLD_FADE_START) / (WORLD_FADE_END - WORLD_FADE_START))
export const compassAmount = (frame: number) => smoothStep((frame - 800) / 49)

/** Exported compass lies in XZ, north is -Z. Its display rig turns +Y toward the viewer.
 * Positive magnetic heading therefore rotates the needle +Y, pointing left when
 * the top of the phone points east. Never rotate the fixed case/dial with heading.
 */
export const unwrapHeading = (previousDegrees: number, heading: number) => nearestAngle(previousDegrees, heading)

/** Transition policy: chapter hops play at three times the authored speed and always
 * finish within TRANSITION_MAX_SECONDS of story time, eased in and out (smoothstep, peak
 * rate 1.5x the average) so every hold pose is reached gently. The same plan runs
 * forwards, backwards and for the compass handoff. Story time advances by rendered wall
 * time, but never more than TRANSITION_MAX_STEP_SECONDS per drawn frame, so a slow
 * renderer stretches a hop instead of skipping its gestures: at least
 * ceil(duration / step) poses are drawn.
 */
export const TRANSITION_SPEED = 3
export const TRANSITION_MAX_SECONDS = 1.2
export const TRANSITION_MAX_STEP_SECONDS = .25

export interface FrameTransition { readonly from: number; readonly to: number; readonly duration: number }

export const planTransition = (from: number, to: number): FrameTransition =>
  ({ from, to, duration: Math.min(TRANSITION_MAX_SECONDS, Math.abs(to - from) / (AUTHORED_FPS * TRANSITION_SPEED)) })

export const transitionFrame = (transition: FrameTransition, elapsed: number) =>
  transition.duration <= 0 || elapsed >= transition.duration
    ? transition.to
    : transition.from + (transition.to - transition.from) * smoothStep(elapsed / transition.duration)
