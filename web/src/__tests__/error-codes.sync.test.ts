import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";
import { ERROR_CODES } from "@pointfinder/api";

const JAVA_ENUM = resolve(__dirname, "../../../backend/src/main/java/com/prayer/pointfinder/exception/ErrorCode.java");

/** Enum constants only: an upper-case identifier alone on its line, optionally followed by a comma. */
function backendCodes(): string[] {
  const body = readFileSync(JAVA_ENUM, "utf-8");
  return [...body.matchAll(/^\s+([A-Z][A-Z0-9_]+),?\s*$/gm)].map((m) => m[1]);
}

describe("ERROR_CODES", () => {
  it("lists exactly the constants of ErrorCode.java, in order", () => {
    const backend = backendCodes();
    expect(backend.length).toBeGreaterThan(0);
    expect([...ERROR_CODES]).toEqual(backend);
  });

  it("has no duplicates", () => {
    expect(new Set(ERROR_CODES).size).toBe(ERROR_CODES.length);
  });
});
