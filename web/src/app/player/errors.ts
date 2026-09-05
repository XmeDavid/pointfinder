import { ApiError } from '@pointfinder/api'
import type { TFunction } from 'i18next'

/** Map an API failure to something a scout can read. Unknown codes fall back to the server message. */
export function describeError(err: unknown, t: TFunction): string {
  if (err instanceof ApiError) {
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
