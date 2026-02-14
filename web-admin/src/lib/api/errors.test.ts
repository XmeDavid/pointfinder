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

