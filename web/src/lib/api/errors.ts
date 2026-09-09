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
 * Backend error codes arrive in the `code` field of every error response and
 * are translated under `errors.<CODE>`. The catalog carries every constant of
 * `ErrorCode.java` (see errors.test.ts), so a known code never falls through
 * to the server's English message.
 */
function localizedCodeMessage(code: unknown): string | null {
  if (typeof code !== "string" || !/^[A-Z][A-Z0-9_]*$/.test(code)) return null;
  const key = `errors.${code}`;
  return i18n.exists(key) ? i18n.t(key) : null;
}

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
    const localized = localizedCodeMessage(data?.code);
    if (localized) return localized;

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
