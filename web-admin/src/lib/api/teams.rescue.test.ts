import { describe, expect, it, beforeEach, vi } from "vitest";

vi.mock("./client", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

import apiClient from "./client";
import {
  teamsApi,
  type MarkCompletedRequest,
  type BaseUnlockOverrideResponse,
} from "./teams";

// =============================================================================
// Manual check-in — now accepts an optional OperatorCheckInRequest body
// =============================================================================

describe("teamsApi.manualCheckIn (with operator reason body)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts the reason when the body is supplied", async () => {
    (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} });

    await teamsApi.manualCheckIn("g1", "t1", "b1", { reason: "NFC failure" });

    expect(apiClient.post).toHaveBeenCalledWith(
      "/games/g1/teams/t1/check-in/b1",
      { reason: "NFC failure" },
    );
  });

  it("stays backwards-compatible when no body is supplied (empty-object POST)", async () => {
    (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} });

    await teamsApi.manualCheckIn("g1", "t1", "b1");

    const [url, body] = (apiClient.post as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("/games/g1/teams/t1/check-in/b1");
    expect(body).toEqual({});
  });

  it("embeds gameId, teamId, and baseId in the URL path", async () => {
    (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} });

    await teamsApi.manualCheckIn("game-77", "team-22", "base-99", { reason: "x" });

    const calledUrl = (apiClient.post as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(calledUrl).toContain("game-77");
    expect(calledUrl).toContain("team-22");
    expect(calledUrl).toContain("base-99");
  });
});

// =============================================================================
// Mark-completed rescue endpoint
// =============================================================================

describe("teamsApi.markCompleted", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls the mark-completed endpoint with the right path and body", async () => {
    (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: {
        id: "sub-1",
        teamId: "t1",
        challengeId: "ch1",
        baseId: "b1",
        answer: "[Operator marked complete]",
        status: "approved",
        submittedAt: "2026-04-08T00:00:00Z",
      },
    });

    const req: MarkCompletedRequest = {
      challengeId: "ch1",
      reason: "Team finished in the field",
      pointsOverride: 150,
    };

    const result = await teamsApi.markCompleted("g1", "t1", "b1", req);

    expect(apiClient.post).toHaveBeenCalledWith(
      "/games/g1/teams/t1/bases/b1/mark-completed",
      req,
    );
    expect(result.id).toBe("sub-1");
    expect(result.status).toBe("approved");
  });

  it("forwards the request body verbatim including optional fields", async () => {
    (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} });

    await teamsApi.markCompleted("g1", "t1", "b1", {
      challengeId: "ch1",
    });

    const payload = (apiClient.post as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(payload).toEqual({ challengeId: "ch1" });
    expect(payload).not.toHaveProperty("reason");
    expect(payload).not.toHaveProperty("pointsOverride");
  });

  it("propagates 400 MARK_COMPLETED_REQUIRES_CHECKIN errors", async () => {
    const error = Object.assign(new Error("Bad Request"), {
      response: {
        status: 400,
        data: { message: "MARK_COMPLETED_REQUIRES_CHECKIN" },
      },
    });
    (apiClient.post as ReturnType<typeof vi.fn>).mockRejectedValue(error);

    await expect(
      teamsApi.markCompleted("g1", "t1", "b1", { challengeId: "ch1" }),
    ).rejects.toMatchObject({ response: { status: 400 } });
  });
});

// =============================================================================
// Unlock override — create, remove, list
// =============================================================================

describe("teamsApi unlock override endpoints", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("createUnlockOverride posts to the correct endpoint with optional reason", async () => {
    const response: BaseUnlockOverrideResponse = {
      id: "o1",
      gameId: "g1",
      teamId: "t1",
      baseId: "b1",
      createdByOperatorId: "u1",
      createdByDisplayName: "Jane Operator",
      reason: "Rain-out",
      createdAt: "2026-04-08T00:00:00Z",
    };
    (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValue({ data: response });

    const result = await teamsApi.createUnlockOverride("g1", "t1", "b1", {
      reason: "Rain-out",
    });

    expect(apiClient.post).toHaveBeenCalledWith(
      "/games/g1/teams/t1/bases/b1/unlock-override",
      { reason: "Rain-out" },
    );
    expect(result).toEqual(response);
  });

  it("createUnlockOverride sends an empty object when no body provided", async () => {
    (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} });

    await teamsApi.createUnlockOverride("g1", "t1", "b1");

    const body = (apiClient.post as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(body).toEqual({});
  });

  it("removeUnlockOverride calls DELETE on the correct endpoint", async () => {
    (apiClient.delete as ReturnType<typeof vi.fn>).mockResolvedValue({});

    await teamsApi.removeUnlockOverride("g1", "t1", "b1");

    expect(apiClient.delete).toHaveBeenCalledWith(
      "/games/g1/teams/t1/bases/b1/unlock-override",
      { data: {} },
    );
  });

  it("removeUnlockOverride forwards an optional reason via the DELETE body", async () => {
    (apiClient.delete as ReturnType<typeof vi.fn>).mockResolvedValue({});

    await teamsApi.removeUnlockOverride("g1", "t1", "b1", { reason: "back on course" });

    const [, config] = (apiClient.delete as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(config).toEqual({ data: { reason: "back on course" } });
  });

  it("listUnlockOverrides returns the unwrapped array", async () => {
    const rows: BaseUnlockOverrideResponse[] = [
      {
        id: "o1",
        gameId: "g1",
        teamId: "t1",
        baseId: "b1",
        createdByOperatorId: "u1",
        createdByDisplayName: "Jane Operator",
        reason: null,
        createdAt: "2026-04-08T00:00:00Z",
      },
    ];
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: rows });

    const result = await teamsApi.listUnlockOverrides("g1", "t1");

    expect(apiClient.get).toHaveBeenCalledWith("/games/g1/teams/t1/unlock-overrides");
    expect(result).toEqual(rows);
  });
});
