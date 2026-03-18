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
  context: string,
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
  context: string,
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

      assertFieldType(snapshot, "accessToken", "string", "AuthResponse");
      assertFieldType(snapshot, "refreshToken", "string", "AuthResponse");
      assertFieldType(snapshot, "user", "object", "AuthResponse");

      const user = snapshot.user as Record<string, unknown>;
      assertFieldType(user, "id", "string", "AuthResponse.user");
      assertFieldType(user, "email", "string", "AuthResponse.user");
      assertFieldType(user, "name", "string", "AuthResponse.user");
      assertFieldType(user, "role", "string", "AuthResponse.user");
    });
  });

  describe("PlayerAuthResponse", () => {
    it("matches frontend PlayerAuthResponse shape", () => {
      const snapshot = readSnapshot("PlayerAuthResponse");

      assertFieldType(snapshot, "token", "string", "PlayerAuthResponse");
      assertFieldType(snapshot, "player", "object", "PlayerAuthResponse");
      assertFieldType(snapshot, "team", "object", "PlayerAuthResponse");
      assertFieldType(snapshot, "game", "object", "PlayerAuthResponse");

      const player = snapshot.player as Record<string, unknown>;
      assertFieldType(player, "id", "string", "PlayerAuthResponse.player");
      assertFieldType(player, "displayName", "string", "PlayerAuthResponse.player");
      assertFieldType(player, "deviceId", "string", "PlayerAuthResponse.player");

      const team = snapshot.team as Record<string, unknown>;
      assertFieldType(team, "id", "string", "PlayerAuthResponse.team");
      assertFieldType(team, "name", "string", "PlayerAuthResponse.team");
      assertFieldType(team, "color", "string", "PlayerAuthResponse.team");

      const game = snapshot.game as Record<string, unknown>;
      assertFieldType(game, "id", "string", "PlayerAuthResponse.game");
      assertFieldType(game, "name", "string", "PlayerAuthResponse.game");
      assertFieldType(game, "description", "string", "PlayerAuthResponse.game");
      assertFieldType(game, "status", "string", "PlayerAuthResponse.game");
      assertOptionalFieldType(game, "tileSource", "string", "PlayerAuthResponse.game");
    });
  });

  describe("GameResponse", () => {
    it("matches frontend Game interface shape", () => {
      const snapshot = readSnapshot("GameResponse");

      assertFieldType(snapshot, "id", "string", "GameResponse");
      assertFieldType(snapshot, "name", "string", "GameResponse");
      assertFieldType(snapshot, "description", "string", "GameResponse");
      assertFieldType(snapshot, "status", "string", "GameResponse");
      assertFieldType(snapshot, "tileSource", "string", "GameResponse");
      assertFieldType(snapshot, "uniformAssignment", "boolean", "GameResponse");
      assertFieldType(snapshot, "broadcastEnabled", "boolean", "GameResponse");
      assertFieldType(snapshot, "operatorIds", "array", "GameResponse");

      assertOptionalFieldType(snapshot, "startDate", "string", "GameResponse");
      assertOptionalFieldType(snapshot, "endDate", "string", "GameResponse");
      assertOptionalFieldType(snapshot, "createdBy", "string", "GameResponse");
      assertOptionalFieldType(snapshot, "broadcastCode", "string", "GameResponse");

      // Validate status is a known GameStatus value
      expect(["setup", "live", "ended"]).toContain(snapshot.status);
    });
  });

  describe("SubmissionResponse", () => {
    it("matches frontend Submission interface shape", () => {
      const snapshot = readSnapshot("SubmissionResponse");

      assertFieldType(snapshot, "id", "string", "SubmissionResponse");
      assertFieldType(snapshot, "teamId", "string", "SubmissionResponse");
      assertFieldType(snapshot, "challengeId", "string", "SubmissionResponse");
      assertFieldType(snapshot, "baseId", "string", "SubmissionResponse");
      assertFieldType(snapshot, "answer", "string", "SubmissionResponse");
      assertFieldType(snapshot, "status", "string", "SubmissionResponse");
      assertFieldType(snapshot, "submittedAt", "string", "SubmissionResponse");

      assertOptionalFieldType(snapshot, "fileUrl", "string", "SubmissionResponse");
      assertOptionalFieldType(snapshot, "fileUrls", "array", "SubmissionResponse");
      assertOptionalFieldType(snapshot, "reviewedBy", "string", "SubmissionResponse");
      assertOptionalFieldType(snapshot, "feedback", "string", "SubmissionResponse");
      assertOptionalFieldType(snapshot, "points", "number", "SubmissionResponse");
      assertOptionalFieldType(snapshot, "completionContent", "string", "SubmissionResponse");

      // Validate status is a known SubmissionStatus value
      expect(["pending", "approved", "rejected", "correct"]).toContain(snapshot.status);
    });
  });

  describe("BaseProgressResponse", () => {
    it("matches frontend TeamBaseProgress-like shape", () => {
      const snapshot = readSnapshot("BaseProgressResponse");

      assertFieldType(snapshot, "baseId", "string", "BaseProgressResponse");
      assertFieldType(snapshot, "baseName", "string", "BaseProgressResponse");
      assertFieldType(snapshot, "lat", "number", "BaseProgressResponse");
      assertFieldType(snapshot, "lng", "number", "BaseProgressResponse");
      assertFieldType(snapshot, "nfcLinked", "boolean", "BaseProgressResponse");
      assertFieldType(snapshot, "status", "string", "BaseProgressResponse");

      assertOptionalFieldType(snapshot, "checkedInAt", "string", "BaseProgressResponse");
      assertOptionalFieldType(snapshot, "challengeId", "string", "BaseProgressResponse");
      assertOptionalFieldType(snapshot, "submissionStatus", "string", "BaseProgressResponse");

      // Validate status is a known BaseStatus value
      expect(["not_visited", "checked_in", "submitted", "completed", "rejected"]).toContain(
        snapshot.status,
      );
    });
  });

  describe("LeaderboardEntry", () => {
    it("matches frontend LeaderboardEntry / BroadcastLeaderboardEntry shape", () => {
      const snapshot = readSnapshot("LeaderboardEntry");

      assertFieldType(snapshot, "teamId", "string", "LeaderboardEntry");
      assertFieldType(snapshot, "teamName", "string", "LeaderboardEntry");
      assertFieldType(snapshot, "color", "string", "LeaderboardEntry");
      assertFieldType(snapshot, "points", "number", "LeaderboardEntry");
      assertFieldType(snapshot, "completedChallenges", "number", "LeaderboardEntry");
    });
  });
});
