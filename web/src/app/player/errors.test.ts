import { describe, expect, it } from 'vitest'
import { ApiError } from '@pointfinder/api'
import i18n from '@/i18n'
import { describeError } from './errors'

const t = i18n.getFixedT(null, undefined, 'playerApp')

function apiError(code: string, fieldErrors: Record<string, string> = {}) {
  return new ApiError({ status: 400, message: 'server text', code, fieldErrors })
}

describe('describeError', () => {
  it('explains a method mismatch in player words', () => {
    expect(describeError(apiError('CHECK_IN_METHOD_MISMATCH'), t)).toBe('This base uses a different way to check in.')
  })

  it('explains an invalid token', () => {
    expect(describeError(apiError('CHECK_IN_TOKEN_INVALID'), t)).toBe("That code doesn't belong to this base.")
  })

  it('explains a coarse fix', () => {
    expect(describeError(apiError('CHECK_IN_FIX_TOO_COARSE'), t)).toBe('Your GPS signal is too weak. Move into the open and try again.')
  })

  it('explains a stale fix', () => {
    expect(describeError(apiError('CHECK_IN_FIX_STALE'), t)).toBe('That position is too old. Wait for a fresh GPS reading.')
  })

  it('reports the measured distance when out of range', () => {
    expect(describeError(apiError('CHECK_IN_OUT_OF_RANGE', { distanceM: '84', allowedM: '20' }), t))
      .toBe("You're about 84 m away. Get within 20 m of the base.")
  })

  it('explains a refused claim', () => {
    expect(describeError(apiError('CHECK_IN_CLAIM_NOT_DWELLED'), t)).toBe('Stay near the base a little longer, then try again.')
  })

  it('still falls back to the server message for unknown codes', () => {
    expect(describeError(apiError('SOMETHING_ELSE'), t)).toBe('server text')
  })
})
