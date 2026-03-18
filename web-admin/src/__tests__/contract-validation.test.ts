import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, it, expect } from "vitest";

/**
 * Cross-platform DTO contract validation tests.
 *
 * Reads canonical JSON snapshots from contract-snapshots/ at the repo root
 * and validates that the JSON shape matches the TypeScript interfaces used
 * by the web-admin frontend. This catches DTO drift between backend and frontend.
 */

const SNAPSHOT_DIR = resolve(__dirname, "../../../contract-snapshots");

function readSnapshot(name: string): Record<string, unknown> {
  const raw = readFileSync(resolve(SNAPSHOT_DIR, `${name}.json`), "utf-8");
  return JSON.parse(raw);
}

function assertFieldType(
  obj: Record<string, unknown>,
  field: string,
  expectedType: string,
) {
  expect(obj).toHaveProperty(field);
  const value = obj[field];
  if (expectedType === "array") {
    expect(Array.isArray(value)).toBe(true);
  } else {
    expect(typeof value).toBe(expectedType);
  }
}

function assertOptionalFieldType(
  obj: Record<string, unknown>,
  field: string,
  expectedType: string,
) {
  if (!(field in obj) || obj[field] === null || obj[field] === undefined) return;
  const value = obj[field];
  if (expectedType === "array") {
    expect(Array.isArray(value)).toBe(true);
  } else {
    expect(typeof value).toBe(expectedType);
  }
}

describe("Cross-platform DTO contract validation", () => {
  describe("AuthResponse", () => {
    it("matches frontend AuthResponse / OperatorAuthResponse shape", () => {
      const snapshot = readSnapshot("AuthResponse");

      assertFieldType(snapshot, "accessToken", "string");
      assertFieldType(snapshot, "refreshToken", "string");
      assertFieldType(snapshot, "user", "object");

      const user = snapshot.user as Record<string, unknown>;
      assertFieldType(user, "id", "string");
      assertFieldType(user, "email", "string");
      assertFieldType(user, "name", "string");
      assertFieldType(user, "role", "string");
    });
  });

  describe("PlayerAuthResponse", () => {
    it("matches frontend PlayerAuthResponse shape", () => {
      const snapshot = readSnapshot("PlayerAuthResponse");

      assertFieldType(snapshot, "token", "string");
      assertFieldType(snapshot, "player", "object");
      assertFieldType(snapshot, "team", "object");
      assertFieldType(snapshot, "game", "object");

      const player = snapshot.player as Record<string, unknown>;
      assertFieldType(player, "id", "string");
      assertFieldType(player, "displayName", "string");
      assertFieldType(player, "deviceId", "string");

      const team = snapshot.team as Record<string, unknown>;
      assertFieldType(team, "id", "string");
      assertFieldType(team, "name", "string");
      assertFieldType(team, "color", "string");

      const game = snapshot.game as Record<string, unknown>;
      assertFieldType(game, "id", "string");
      assertFieldType(game, "name", "string");
      assertFieldType(game, "description", "string");
      assertFieldType(game, "status", "string");
      assertOptionalFieldType(game, "tileSource", "string");
    });
  });

  describe("GameResponse", () => {
    it("matches frontend Game interface shape", () => {
      const snapshot = readSnapshot("GameResponse");

      assertFieldType(snapshot, "id", "string");
      assertFieldType(snapshot, "name", "string");
      assertFieldType(snapshot, "description", "string");
      assertFieldType(snapshot, "status", "string");
      assertFieldType(snapshot, "tileSource", "string");
      assertFieldType(snapshot, "uniformAssignment", "boolean");
      assertFieldType(snapshot, "broadcastEnabled", "boolean");
      assertFieldType(snapshot, "operatorIds", "array");

      assertOptionalFieldType(snapshot, "startDate", "string");
      assertOptionalFieldType(snapshot, "endDate", "string");
      assertOptionalFieldType(snapshot, "createdBy", "string");
      assertOptionalFieldType(snapshot, "broadcastCode", "string");

      // Validate status is a known GameStatus value
      expect(["setup", "live", "ended"]).toContain(snapshot.status);
    });
  });

  describe("SubmissionResponse", () => {
    it("matches frontend Submission interface shape", () => {
      const snapshot = readSnapshot("SubmissionResponse");

      assertFieldType(snapshot, "id", "string");
      assertFieldType(snapshot, "teamId", "string");
      assertFieldType(snapshot, "challengeId", "string");
      assertFieldType(snapshot, "baseId", "string");
      assertFieldType(snapshot, "answer", "string");
      assertFieldType(snapshot, "status", "string");
      assertFieldType(snapshot, "submittedAt", "string");

      assertOptionalFieldType(snapshot, "fileUrl", "string");
      assertOptionalFieldType(snapshot, "fileUrls", "array");
      assertOptionalFieldType(snapshot, "reviewedBy", "string");
      assertOptionalFieldType(snapshot, "feedback", "string");
      assertOptionalFieldType(snapshot, "points", "number");
      assertOptionalFieldType(snapshot, "completionContent", "string");

      // Validate status is a known SubmissionStatus value
      expect(["pending", "approved", "rejected", "correct"]).toContain(snapshot.status);
    });
  });

  describe("BaseProgressResponse", () => {
    it("matches frontend TeamBaseProgress-like shape", () => {
      const snapshot = readSnapshot("BaseProgressResponse");

      assertFieldType(snapshot, "baseId", "string");
      assertFieldType(snapshot, "baseName", "string");
      assertFieldType(snapshot, "lat", "number");
      assertFieldType(snapshot, "lng", "number");
      assertFieldType(snapshot, "nfcLinked", "boolean");
      assertFieldType(snapshot, "status", "string");

      assertOptionalFieldType(snapshot, "checkedInAt", "string");
      assertOptionalFieldType(snapshot, "challengeId", "string");
      assertOptionalFieldType(snapshot, "submissionStatus", "string");

      // Validate status is a known BaseStatus value
      expect(["not_visited", "checked_in", "submitted", "completed", "rejected"]).toContain(
        snapshot.status,
      );
    });
  });

  describe("LeaderboardEntry", () => {
    it("matches frontend LeaderboardEntry / BroadcastLeaderboardEntry shape", () => {
      const snapshot = readSnapshot("LeaderboardEntry");

      assertFieldType(snapshot, "teamId", "string");
      assertFieldType(snapshot, "teamName", "string");
      assertFieldType(snapshot, "color", "string");
      assertFieldType(snapshot, "points", "number");
      assertFieldType(snapshot, "completedChallenges", "number");
    });
  });
});
