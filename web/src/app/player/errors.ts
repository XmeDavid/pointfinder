import { ApiError } from '@pointfinder/api'
import type { TFunction } from 'i18next'

/** Check-in refusals the player can act on. Distances come from the server's detail map. */
const CHECK_IN_CODES = new Set([
  'CHECK_IN_METHOD_MISMATCH',
  'CHECK_IN_TOKEN_INVALID',
  'CHECK_IN_FIX_TOO_COARSE',
  'CHECK_IN_FIX_STALE',
  'CHECK_IN_OUT_OF_RANGE',
  'CHECK_IN_CLAIM_NOT_DWELLED',
])

function rounded(value: string | undefined): string {
  const n = Number(value)
  return Number.isFinite(n) ? String(Math.round(n)) : '?'
}

/** Map an API failure to something a scout can read. Unknown codes fall back to the server message. */
export function describeError(err: unknown, t: TFunction): string {
  if (err instanceof ApiError) {
    if (err.code && CHECK_IN_CODES.has(err.code)) {
      return t(`errors.${err.code}`, {
        distance: rounded(err.fieldErrors.distanceM),
        allowed: rounded(err.fieldErrors.allowedM),
      })
    }
    switch (err.code) {
      case 'INVALID_JOIN_CODE':
      case 'TEAM_NOT_FOUND':
        return t('join.invalidCode')
      case 'GAME_NOT_ACTIVE':
        return t('join.gameNotActive')
      case 'DEVICE_IN_OTHER_TEAM':
        return t('join.deviceInOtherTeam')
      case 'INVALID_CREDENTIALS':
        return t('login.invalid')
    }
    if (err.status === 401) return t('login.invalid')
    if (err.status === 0) return t('common.offline')
    return err.message || t('common.unknownError')
  }
  return err instanceof Error && err.message ? err.message : t('common.unknownError')
}

/** The same mapping for a queued action's stored failure, which has no ApiError instance. */
export function describeFailedAction(
  code: string | null | undefined,
  details: Record<string, string> | undefined,
  fallback: string | null | undefined,
  t: TFunction,
): string {
  if (code && CHECK_IN_CODES.has(code)) {
    return t(`errors.${code}`, { distance: rounded(details?.distanceM), allowed: rounded(details?.allowedM) })
  }
  return fallback || t('common.unknownError')
}
