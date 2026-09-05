/**
 * Shared operator vocabulary for the three check-in methods.
 *
 * Mirrors the backend `CheckInMethod` / `CheckInVerification` enums and the
 * clamp constants in `service/CheckInVerificationService.java`. Distances and
 * wide rings are NOT computed here — those come from `@pointfinder/game-core`
 * so the browser and the server share one implementation.
 */

export type CheckInMethod = 'NFC' | 'QR' | 'LOCATION'

export type CheckInVerification = 'VERIFIED' | 'CLAIMED' | 'OPERATOR'

/** Operator display order: today's default first, then the two new methods. */
export const CHECK_IN_METHODS: CheckInMethod[] = ['NFC', 'QR', 'LOCATION']

export const MIN_CHECK_IN_RADIUS_M = 5
export const MAX_CHECK_IN_RADIUS_M = 200

/** Server default when a game predates the feature. */
export const DEFAULT_CHECK_IN_RADIUS_M = 15

/** One teammate position recorded alongside a CLAIMED check-in. */
export interface TeamPositionSnapshotEntry {
  playerId: string
  displayName: string
  lat: number | null
  lng: number | null
  accuracyM?: number | null
  ageSeconds?: number | null
  distanceM?: number | null
}

/** Structured payload appended to check-in activity events. */
export interface ActivityCheckInMetadata {
  method?: CheckInMethod
  verification?: CheckInVerification
  teammatesInRing?: number
  teammatesTotal?: number
}

/** Base radius when set, otherwise the game default. Never null. */
export function resolveCheckInRadiusM(
  baseRadiusM: number | null | undefined,
  gameDefaultRadiusM: number | null | undefined,
): number {
  if (typeof baseRadiusM === 'number' && Number.isFinite(baseRadiusM)) return baseRadiusM
  if (typeof gameDefaultRadiusM === 'number' && Number.isFinite(gameDefaultRadiusM)) {
    return gameDefaultRadiusM
  }
  return DEFAULT_CHECK_IN_RADIUS_M
}

/** True when the value is inside the server's 5..200 clamp. */
export function isValidCheckInRadiusM(value: number | null | undefined): boolean {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= MIN_CHECK_IN_RADIUS_M &&
    value <= MAX_CHECK_IN_RADIUS_M
  )
}

/**
 * Read an operator radius field. Blank means "inherit the game default"
 * (null); anything unparseable or outside the clamp is rejected so the
 * operator sees an inline error instead of a silent fallback.
 */
export function parseCheckInRadiusInput(
  text: string,
): { ok: true; value: number | null } | { ok: false } {
  const trimmed = text.trim()
  if (trimmed === '') return { ok: true, value: null }
  const parsed = Number.parseFloat(trimmed)
  if (!Number.isFinite(parsed)) return { ok: false }
  const rounded = Math.round(parsed)
  if (!isValidCheckInRadiusM(rounded)) return { ok: false }
  return { ok: true, value: rounded }
}
