type ApiErrorPayload = {
  message?: unknown;
  errors?: Record<string, unknown>;
};

type ApiErrorLike = {
  response?: {
    data?: ApiErrorPayload;
  };
};

export function getApiErrorMessage(error: unknown, fallback?: string): string {
  if (typeof error === "object" && error !== null) {
    const maybeError = error as ApiErrorLike;
    const message = maybeError.response?.data?.message;
    if (typeof message === "string" && message.trim().length > 0) {
      return message;
    }
  }
  return fallback ?? "Unexpected error";
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
