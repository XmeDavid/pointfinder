import { distanceM, type Fix } from './location'

/**
 * The rules that decide whether a fix proves a team reached a base.
 *
 * Every constant and helper here mirrors the server's verification exactly,
 * so the phone can refuse a hopeless proof before spending a round trip and
 * both ends' tests describe one behaviour rather than two.
 */

/** An automatic proof needs a fix at least this accurate. */
export const AUTO_ACCURACY_CAP_M = 50
/** Accuracy widens the accepted distance, but only this far. */
export const ACCURACY_CREDIT_CAP_M = 30
/** A claim tolerates a coarser fix, because GPS refusing to converge is the reason for it. */
export const CLAIM_ACCURACY_CAP_M = 100
/** Radius used when neither the base nor the game resolved one. */
export const DEFAULT_CHECK_IN_RADIUS_M = 15

export const DWELL_MIN_FIXES = 4
export const DWELL_MIN_SPAN_MS = 60_000
export const DWELL_SAMPLE_INTERVAL_MS = 10_000
export const DWELL_BUFFER_MAX_MS = 300_000
/** A dwell buffer counts only while its last sample is this fresh. */
export const DWELL_MAX_GAP_TO_MAIN_MS = 120_000

/** The wider ring a claim may be made from. */
export function wideRingM(radiusM: number): number {
  return Math.max(3 * radiusM, 50)
}

export type AutoAcceptance =
  | { ok: true; distanceM: number }
  | { ok: false; distanceM: number; allowedM: number; reason: 'inaccurate' | 'out_of_range' }

/**
 * Would the server accept this fix as an automatic arrival?
 * A fix with no usable accuracy is refused here as it is on the server:
 * an unmeasured error is not a small one.
 */
export function autoAccepts(fix: Fix, base: { lat: number; lng: number }, radiusM: number): AutoAcceptance {
  const distance = distanceM(fix, base)
  if (!Number.isFinite(fix.accuracy) || !(fix.accuracy > 0) || fix.accuracy > AUTO_ACCURACY_CAP_M) {
    return { ok: false, distanceM: distance, allowedM: radiusM, reason: 'inaccurate' }
  }
  const allowedM = radiusM + Math.min(fix.accuracy, ACCURACY_CREDIT_CAP_M)
  return distance <= allowedM ? { ok: true, distanceM: distance } : { ok: false, distanceM: distance, allowedM, reason: 'out_of_range' }
}

/** Is the fix inside the wider ring a claim may be made from? */
export function insideWideRing(fix: Fix, base: { lat: number; lng: number }, radiusM: number): boolean {
  return distanceM(fix, base) <= wideRingM(radiusM)
}

/** Enough samples, spread over enough time, all usable, and still current. */
export function dwellSatisfied(buffer: Fix[], now: number): boolean {
  if (buffer.length < DWELL_MIN_FIXES) return false
  const first = buffer[0]
  const last = buffer[buffer.length - 1]
  if (!first || !last) return false
  if (buffer.some((f) => !Number.isFinite(f.accuracy) || !(f.accuracy > 0) || f.accuracy > CLAIM_ACCURACY_CAP_M)) return false
  if (last.capturedAt - first.capturedAt < DWELL_MIN_SPAN_MS) return false
  return now - last.capturedAt <= DWELL_MAX_GAP_TO_MAIN_MS
}

/** Append a sample at most every ten seconds, and forget anything older than five minutes. */
export function pushDwellSample(buffer: Fix[], fix: Fix): Fix[] {
  const last = buffer[buffer.length - 1]
  if (last && fix.capturedAt - last.capturedAt < DWELL_SAMPLE_INTERVAL_MS) return buffer
  return [...buffer, fix].filter((f) => fix.capturedAt - f.capturedAt <= DWELL_BUFFER_MAX_MS)
}
