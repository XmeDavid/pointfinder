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

import type { SubmissionStatus } from "@/types";
import apiClient from "./client";
import { submissionsApi } from "./submissions";

describe("submissionsApi.listByGame", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls the correct endpoint with game ID", async () => {
    const mockSubmissions = [{ id: "s1" }, { id: "s2" }];
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: mockSubmissions,
    });

    const result = await submissionsApi.listByGame("game-1");

    expect(apiClient.get).toHaveBeenCalledWith("/games/game-1/submissions");
    expect(result).toEqual(mockSubmissions);
  });

  it("returns the unwrapped .data array, not the axios envelope", async () => {
    const mockSubmissions = [{ id: "s1" }, { id: "s2" }];
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: mockSubmissions,
      status: 200,
      headers: {},
    });

    const result = await submissionsApi.listByGame("game-1");

    // Must be the plain array, not { data: [...], status: 200, ... }
    expect(Array.isArray(result)).toBe(true);
    expect(result).not.toHaveProperty("data");
    expect(result).not.toHaveProperty("status");
  });

  it("embeds the gameId in the URL path", async () => {
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });

    await submissionsApi.listByGame("abc-123");

    const calledUrl = (apiClient.get as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(calledUrl).toContain("abc-123");
    expect(calledUrl).not.toContain("gameId");
  });

  it("returns empty array when no submissions exist", async () => {
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });

    const result = await submissionsApi.listByGame("game-empty");

    expect(result).toEqual([]);
  });

  it("propagates 404 errors to the caller", async () => {
    const error = Object.assign(new Error("Not Found"), { response: { status: 404 } });
    (apiClient.get as ReturnType<typeof vi.fn>).mockRejectedValue(error);

    await expect(submissionsApi.listByGame("missing-game")).rejects.toThrow("Not Found");
  });

  it("propagates 500 server errors to the caller", async () => {
    const error = Object.assign(new Error("Internal Server Error"), {
      response: { status: 500 },
    });
    (apiClient.get as ReturnType<typeof vi.fn>).mockRejectedValue(error);

    await expect(submissionsApi.listByGame("game-1")).rejects.toMatchObject({
      response: { status: 500 },
    });
  });
});

describe("submissionsApi.listByTeam", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes teamId as a query parameter", async () => {
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });

    await submissionsApi.listByTeam("team-1", "game-1");

    expect(apiClient.get).toHaveBeenCalledWith("/games/game-1/submissions", {
      params: { teamId: "team-1" },
    });
  });

  it("returns submissions filtered by team", async () => {
    const teamSubmissions = [{ id: "s1", teamId: "team-1" }];
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: teamSubmissions,
    });

    const result = await submissionsApi.listByTeam("team-1", "game-1");

    expect(result).toEqual(teamSubmissions);
  });

  it("returns the unwrapped .data array, not the axios envelope", async () => {
    const teamSubmissions = [{ id: "s2" }];
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: teamSubmissions,
      status: 200,
    });

    const result = await submissionsApi.listByTeam("team-1", "game-1");

    expect(Array.isArray(result)).toBe(true);
    expect(result).not.toHaveProperty("status");
  });

  it("propagates 400 errors to the caller", async () => {
    const error = Object.assign(new Error("Bad Request"), { response: { status: 400 } });
    (apiClient.get as ReturnType<typeof vi.fn>).mockRejectedValue(error);

    await expect(submissionsApi.listByTeam("bad-team", "game-1")).rejects.toMatchObject({
      response: { status: 400 },
    });
  });
});

describe("submissionsApi.review", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends status and feedback to the review endpoint", async () => {
    const reviewed = { id: "s1", status: "approved" };
    (apiClient.patch as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: reviewed,
    });

    const result = await submissionsApi.review(
      "s1",
      "approved" as SubmissionStatus,
      "Great work!",
      "game-1",
      10
    );

    expect(apiClient.patch).toHaveBeenCalledWith(
      "/games/game-1/submissions/s1/review",
      { status: "approved", feedback: "Great work!", points: 10 }
    );
    expect(result).toEqual(reviewed);
  });

  it("returns the unwrapped .data object, not the axios envelope", async () => {
    const reviewed = { id: "s1", status: "approved" };
    (apiClient.patch as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: reviewed,
      status: 200,
    });

    const result = await submissionsApi.review(
      "s1",
      "approved" as SubmissionStatus,
      undefined,
      "game-1",
      10
    );

    expect(result).toEqual(reviewed);
    expect(result).not.toHaveProperty("status", 200);
  });

  it("sends review without optional feedback", async () => {
    (apiClient.patch as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { id: "s1" },
    });

    await submissionsApi.review(
      "s1",
      "rejected" as SubmissionStatus,
      undefined,
      "game-1",
      undefined
    );

    expect(apiClient.patch).toHaveBeenCalledWith(
      "/games/game-1/submissions/s1/review",
      { status: "rejected", feedback: undefined, points: undefined }
    );
  });

  it("passes points correctly in the request body", async () => {
    (apiClient.patch as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { id: "s1" },
    });

    await submissionsApi.review(
      "s1",
      "approved" as SubmissionStatus,
      "Nice",
      "game-1",
      42
    );

    const payload = (apiClient.patch as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(payload.points).toBe(42);
  });

  it("embeds submissionId and gameId in the URL path", async () => {
    (apiClient.patch as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { id: "sub-99" },
    });

    await submissionsApi.review(
      "sub-99",
      "approved" as SubmissionStatus,
      undefined,
      "game-77",
      0
    );

    const calledUrl = (apiClient.patch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(calledUrl).toContain("sub-99");
    expect(calledUrl).toContain("game-77");
  });

  it("does not send _reviewedBy in the request body", async () => {
    (apiClient.patch as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { id: "s1" },
    });

    await submissionsApi.review(
      "s1",
      "approved" as SubmissionStatus,
      "OK",
      "game-1",
      5
    );

    const payload = (apiClient.patch as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(payload).not.toHaveProperty("_reviewedBy");
    expect(payload).not.toHaveProperty("reviewedBy");
  });

  it("propagates 400 validation errors to the caller", async () => {
    const error = Object.assign(new Error("Bad Request"), { response: { status: 400 } });
    (apiClient.patch as ReturnType<typeof vi.fn>).mockRejectedValue(error);

    await expect(
      submissionsApi.review("s1", "approved" as SubmissionStatus, undefined, "game-1", 10)
    ).rejects.toMatchObject({ response: { status: 400 } });
  });

  it("propagates 404 when submission is not found", async () => {
    const error = Object.assign(new Error("Not Found"), { response: { status: 404 } });
    (apiClient.patch as ReturnType<typeof vi.fn>).mockRejectedValue(error);

    await expect(
      submissionsApi.review("missing", "approved" as SubmissionStatus, undefined, "game-1", 0)
    ).rejects.toMatchObject({ response: { status: 404 } });
  });

  it("propagates 500 server errors to the caller", async () => {
    const error = Object.assign(new Error("Internal Server Error"), {
      response: { status: 500 },
    });
    (apiClient.patch as ReturnType<typeof vi.fn>).mockRejectedValue(error);

    await expect(
      submissionsApi.review("s1", "approved" as SubmissionStatus, undefined, "game-1", 0)
    ).rejects.toMatchObject({ response: { status: 500 } });
  });
});
