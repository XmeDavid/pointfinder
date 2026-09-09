import type { ApiErrorBody } from './types'

/**
 * Backend error codes, in the order `ErrorCode.java` declares them. A test
 * in web (error-codes.sync.test.ts) diffs the two, so add new codes to both at once.
 */
export const ERROR_CODES = [
  'MARK_COMPLETED_REQUIRES_CHECKIN',
  'MARK_COMPLETED_ALREADY_COMPLETED',
  'MANUAL_CHECKIN_ALREADY_CHECKED_IN',
  'UNLOCK_OVERRIDE_ALREADY_EXISTS',
  'UNLOCK_OVERRIDE_NOT_FOUND',
  'TAG_LABEL_DUPLICATE',
  'TAG_CAP_EXCEEDED',
  'TAG_IN_USE',
  'TAG_MODIFIED_CONCURRENTLY',
  'STAGE_NOT_FOUND',
  'STAGE_GAME_MISMATCH',
  'STAGE_HAS_BASES',
  'STAGE_TRIGGER_BASE_NOT_FOUND',
  'STAGE_ALREADY_ACTIVE',
  'INVALID_CURRENT_PASSWORD',
  'INVALID_NEW_PASSWORD',
  'EMAIL_ALREADY_TAKEN',
  'EMAIL_CHANGE_TOKEN_INVALID',
  'EMAIL_CHANGE_TOKEN_EXPIRED',
  'ACCOUNT_FROZEN',
  'NFC_TOKEN_REQUIRED',
  'CHECK_IN_METHOD_MISMATCH',
  'CHECK_IN_TOKEN_INVALID',
  'CHECK_IN_FIX_TOO_COARSE',
  'CHECK_IN_FIX_STALE',
  'CHECK_IN_OUT_OF_RANGE',
  'CHECK_IN_CLAIM_NOT_DWELLED',
  'PREVIOUS_BASE_REQUIRED',
  'BASE_ORDER_LOCKED',
  'BASE_ORDER_DISABLED',
  'BASE_ORDER_INVALID',
  'BASE_ORDER_DEPENDENCY_CONFLICT',
  'DEVICE_ALREADY_IN_DIFFERENT_TEAM',
  'RATE_LIMITED',
  'QUOTA_ACTIVE_GAMES_EXCEEDED',
  'QUOTA_BASES_PER_GAME_EXCEEDED',
  'QUOTA_OPERATORS_PER_GAME_EXCEEDED',
  'QUOTA_ORG_MEMBERS_EXCEEDED',
  'QUOTA_LIVE_GAMES_EXCEEDED',
  'QUOTA_FILE_SIZE_EXCEEDED',
  'QUOTA_PLAYERS_PER_GAME_EXCEEDED',
  'QUOTA_LOCATION_CHECK_IN_NOT_ALLOWED',
  'VARIABLE_REFERENCE_UNDEFINED',
  'TUTORIAL_SCENARIO_UNKNOWN',
  'TUTORIAL_STATUS_UNKNOWN',
  'TUTORIAL_PRACTICE_GAME_EXISTS',
  'TUTORIAL_PRACTICE_GAME_NOT_ALLOWED',
  'TUTORIAL_PRACTICE_GAME_PLAYER_LIMIT',
  'TUTORIAL_NOT_PRACTICE_GAME',
  'ASSIGNMENT_TEAM_HAS_BASE',
  'ASSIGNMENT_BASE_ALL_TEAMS',
  'ASSIGNMENT_BASE_TEAM_SPECIFIC',
  'ASSIGNMENT_CHALLENGE_TEAM_ELSEWHERE',
  'ASSIGNMENT_CHALLENGE_ALL_TEAMS_ELSEWHERE',
  'ASSIGNMENT_MIXED_MODES',
  'ASSIGNMENT_DUPLICATE',
  'ASSIGNMENT_CHALLENGE_REPEATED',
] as const

export type ErrorCode = (typeof ERROR_CODES)[number]

/** Client-side codes for failures that never reached the server, or that it did not classify. */
export type ClientErrorCode = 'NETWORK' | 'TIMEOUT' | 'ABORTED' | 'UNAUTHENTICATED' | 'INVALID_RESPONSE'

export class ApiError extends Error {
  /** HTTP status, or 0 when the request never got a response. */
  readonly status: number
  readonly code: ErrorCode | ClientErrorCode | string | undefined
  /** Per-field validation messages from the backend, when any. */
  readonly fieldErrors: Record<string, string>
  /** True for failures worth retrying as-is: network, timeout, 5xx, rate limit. */
  readonly retryable: boolean
  readonly body: ApiErrorBody | undefined

  constructor(init: {
    status: number
    message: string
    code?: string
    fieldErrors?: Record<string, string>
    body?: ApiErrorBody
    cause?: unknown
  }) {
    super(init.message, { cause: init.cause })
    this.name = 'ApiError'
    this.status = init.status
    this.code = init.code
    this.fieldErrors = init.fieldErrors ?? {}
    this.body = init.body
    this.retryable = (typeof init.body?.retryable === 'boolean' ? init.body.retryable : undefined) ?? (
      init.status === 0 ||
      init.status >= 500 ||
      init.status === 429 ||
      init.code === 'RATE_LIMITED' ||
      init.code === 'NETWORK' ||
      init.code === 'TIMEOUT')
  }

  /** The request was refused for lack of a valid session. */
  get isAuth(): boolean {
    return this.status === 401 || this.code === 'UNAUTHENTICATED'
  }

  static fromResponse(status: number, body: unknown): ApiError {
    const parsed = (typeof body === 'object' && body !== null ? body : {}) as ApiErrorBody
    const fieldErrors: Record<string, string> = {}
    if (parsed.errors && typeof parsed.errors === 'object') {
      for (const [k, v] of Object.entries(parsed.errors)) {
        if (typeof v === 'string' && v.trim()) fieldErrors[k] = v
      }
    }
    const message =
      typeof parsed.message === 'string' && parsed.message.trim()
        ? parsed.message
        : `Request failed with status ${status}`
    return new ApiError({ status, message, code: parsed.code, fieldErrors, body: parsed })
  }

  static network(cause: unknown): ApiError {
    return new ApiError({ status: 0, message: 'Network request failed', code: 'NETWORK', cause })
  }

  static timeout(): ApiError {
    return new ApiError({ status: 0, message: 'Request timed out', code: 'TIMEOUT' })
  }

  static aborted(): ApiError {
    return new ApiError({ status: 0, message: 'Request aborted', code: 'ABORTED' })
  }
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError
}
