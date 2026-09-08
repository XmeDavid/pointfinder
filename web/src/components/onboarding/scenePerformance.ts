/** Draw pacing and measured resolution policy for the onboarding renderer. */

export const DRAW_FPS = 30
/** Timestamps from requestAnimationFrame jitter by a fraction of a millisecond; without
 * slack, a 60 Hz display would sometimes wait three vsyncs instead of two. */
export const drawDue = (now: number, previousDraw: number, fps = DRAW_FPS) => now - previousDraw >= 1000 / fps - 1

/** Pixel-ratio ladder from the sharpest allowed downwards. The ceiling is generous for
 * high-density phones; the floor stays at 1 because the characters lose their detail below it. */
export const PIXEL_RATIO_LADDER = [1.5, 1] as const
/** A drawn frame is slow when the next animation frame arrives later than this. */
export const SLOW_FRAME_MS = 50
/** Consecutive world frames measured before each step down; the median must be slow. */
export const SLOW_FRAME_WINDOW = 6

export interface ResolutionGovernor {
  readonly pixelRatio: number
  /** Report how long a drawn world frame kept the browser busy. Returns the new pixel
   * ratio when the measurement asks for a step down, otherwise undefined. */
  sample: (frameMs: number) => number | undefined
}

/** Steps the pixel ratio down, never up, while the median of the last SLOW_FRAME_WINDOW
 * world frames is slower than SLOW_FRAME_MS. Stepping only downwards avoids oscillating
 * between rungs on a device that sits near a threshold; the screen is short-lived. */
export function createResolutionGovernor(devicePixelRatio: number): ResolutionGovernor {
  const rungs = [...new Set(PIXEL_RATIO_LADDER.map((ratio) => Math.min(ratio, Math.max(devicePixelRatio, 1))))]
  let level = 0
  const samples: number[] = []
  return {
    get pixelRatio() { return rungs[level] },
    sample(frameMs) {
      if (level >= rungs.length - 1) return undefined
      samples.push(frameMs)
      if (samples.length < SLOW_FRAME_WINDOW) return undefined
      const sorted = [...samples].sort((a, b) => a - b)
      const median = sorted[Math.floor(sorted.length / 2)]
      samples.length = 0
      if (median <= SLOW_FRAME_MS) return undefined
      level += 1
      return rungs[level]
    },
  }
}
