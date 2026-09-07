import i18n from "@/i18n";

type ApiErrorPayload = {
  message?: unknown;
  code?: unknown;
  errors?: Record<string, unknown>;
};

type ApiErrorLike = {
  response?: {
    data?: ApiErrorPayload;
  };
};

/**
 * Backend error codes emitted in the `code` field of every error response.
 * Must stay in sync with {@code ErrorCode.java}.
 */
const ERROR_CODE_I18N_KEYS: Record<string, string> = {
  MARK_COMPLETED_REQUIRES_CHECKIN: "errors.MARK_COMPLETED_REQUIRES_CHECKIN",
  MARK_COMPLETED_ALREADY_COMPLETED: "errors.MARK_COMPLETED_ALREADY_COMPLETED",
  MANUAL_CHECKIN_ALREADY_CHECKED_IN: "errors.MANUAL_CHECKIN_ALREADY_CHECKED_IN",
  UNLOCK_OVERRIDE_ALREADY_EXISTS: "errors.UNLOCK_OVERRIDE_ALREADY_EXISTS",
  UNLOCK_OVERRIDE_NOT_FOUND: "errors.UNLOCK_OVERRIDE_NOT_FOUND",
  TAG_LABEL_DUPLICATE: "errors.TAG_LABEL_DUPLICATE",
  TAG_CAP_EXCEEDED: "errors.TAG_CAP_EXCEEDED",
  TAG_IN_USE: "errors.TAG_IN_USE",
  QUOTA_ACTIVE_GAMES_EXCEEDED: "errors.QUOTA_ACTIVE_GAMES_EXCEEDED",
  TUTORIAL_PRACTICE_GAME_EXISTS: "errors.TUTORIAL_PRACTICE_GAME_EXISTS",
  TUTORIAL_PRACTICE_GAME_NOT_ALLOWED: "errors.TUTORIAL_PRACTICE_GAME_NOT_ALLOWED",
  ASSIGNMENT_TEAM_HAS_BASE: "errors.ASSIGNMENT_TEAM_HAS_BASE",
  ASSIGNMENT_BASE_ALL_TEAMS: "errors.ASSIGNMENT_BASE_ALL_TEAMS",
  ASSIGNMENT_BASE_TEAM_SPECIFIC: "errors.ASSIGNMENT_BASE_TEAM_SPECIFIC",
  ASSIGNMENT_CHALLENGE_TEAM_ELSEWHERE: "errors.ASSIGNMENT_CHALLENGE_TEAM_ELSEWHERE",
  ASSIGNMENT_CHALLENGE_ALL_TEAMS_ELSEWHERE: "errors.ASSIGNMENT_CHALLENGE_ALL_TEAMS_ELSEWHERE",
  ASSIGNMENT_MIXED_MODES: "errors.ASSIGNMENT_MIXED_MODES",
  ASSIGNMENT_DUPLICATE: "errors.ASSIGNMENT_DUPLICATE",
  ASSIGNMENT_CHALLENGE_REPEATED: "errors.ASSIGNMENT_CHALLENGE_REPEATED",
};

/** The backend `code` of a failed request, or null when there is none. */
export function getApiErrorCode(error: unknown): string | null {
  const maybeError = error as { response?: { data?: { code?: unknown } } } | null;
  const code = maybeError?.response?.data?.code;
  return typeof code === "string" ? code : null;
}

export function getApiErrorMessage(error: unknown, fallback?: string): string {
  if (typeof error === "object" && error !== null) {
    const maybeError = error as ApiErrorLike;
    const data = maybeError.response?.data;

    // Prefer a localized message for known backend error codes.
    if (typeof data?.code === "string" && data.code in ERROR_CODE_I18N_KEYS) {
      return i18n.t(ERROR_CODE_I18N_KEYS[data.code]);
    }

    const message = data?.message;
    if (typeof message === "string" && message.trim().length > 0) {
      return message;
    }
  }
  return fallback ?? i18n.t("errors.unexpected");
}

export function getApiValidationErrors(error: unknown): Record<string, string> {
  if (typeof error !== "object" || error === null) {
    return {};
  }

  const maybeError = error as ApiErrorLike;
  const errors = maybeError.response?.data?.errors;
  if (!errors || typeof errors !== "object") {
    return {};
  }

  const result: Record<string, string> = {};
  Object.entries(errors).forEach(([field, value]) => {
    if (typeof value === "string" && value.trim().length > 0) {
      result[field] = value;
    }
  });
  return result;
}
