import { describe, expect, it } from "vitest";
import { getApiErrorMessage, getApiValidationErrors } from "./errors";

describe("getApiErrorMessage", () => {
  it("extracts message from API error response", () => {
    const error = {
      response: { data: { message: "Invalid join code" } },
    };
    expect(getApiErrorMessage(error)).toBe("Invalid join code");
  });

  it("returns fallback when no response data", () => {
    expect(getApiErrorMessage({})).toBe("Unexpected error");
    expect(getApiErrorMessage({}, "Custom fallback")).toBe("Custom fallback");
  });

  it("returns fallback for null/undefined", () => {
    expect(getApiErrorMessage(null)).toBe("Unexpected error");
    expect(getApiErrorMessage(undefined)).toBe("Unexpected error");
  });

  it("ignores empty/whitespace messages", () => {
    const error = { response: { data: { message: "   " } } };
    expect(getApiErrorMessage(error)).toBe("Unexpected error");
  });
});

describe("getApiValidationErrors", () => {
  it("extracts field errors from validation response", () => {
    const error = {
      response: {
        data: {
          errors: { email: "Invalid email", name: "Required" },
        },
      },
    };
    const result = getApiValidationErrors(error);
    expect(result).toEqual({ email: "Invalid email", name: "Required" });
  });

  it("returns empty object when no errors", () => {
    expect(getApiValidationErrors({})).toEqual({});
    expect(getApiValidationErrors(null)).toEqual({});
    expect(getApiValidationErrors({ response: { data: {} } })).toEqual({});
  });

  it("filters out non-string error values", () => {
    const error = {
      response: {
        data: {
          errors: { email: "Bad", count: 42, empty: "" },
        },
      },
    };
    const result = getApiValidationErrors(error);
    expect(result).toEqual({ email: "Bad" });
  });
});


describe("backend error codes", () => {
  it("every ErrorCode has a translation under errors.*", async () => {
    const { ERROR_CODES } = await import("@pointfinder/api");
    const { resources } = await import("@pointfinder/i18n");
    const errors = (resources.en.translation as { errors: Record<string, string> }).errors;
    const missing = ERROR_CODES.filter((code) => !errors[code]);
    expect(missing).toEqual([]);
  });

  it("prefers the localized message for a known code", () => {
    const error = { response: { data: { code: "RATE_LIMITED", message: "raw server text" } } };
    expect(getApiErrorMessage(error)).toBe("Too many attempts. Wait a moment and try again.");
  });

  it("falls back to the server message for an unknown code", () => {
    const error = { response: { data: { code: "SOMETHING_NEW", message: "raw server text" } } };
    expect(getApiErrorMessage(error)).toBe("raw server text");
  });
});
