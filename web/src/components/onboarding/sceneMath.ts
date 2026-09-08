import { nearestAngle } from '@/components/compass/pose'

export const FIRST_FRAME = 1
export const LAST_FRAME = 864
export const WORLD_FADE_START = 782
export const WORLD_FADE_END = 814
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

export function stepTowardFrame(current: number, target: number, dt: number): number {
  const difference = target - current
  const speed = Math.max(24, Math.abs(difference) / 3.5)
  const step = Math.min(Math.abs(difference), speed * Math.max(0, Math.min(.25, dt)))
  return current + Math.sign(difference) * step
}
