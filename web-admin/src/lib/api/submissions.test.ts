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

  it("returns empty array when no submissions exist", async () => {
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });

    const result = await submissionsApi.listByGame("game-empty");

    expect(result).toEqual([]);
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
      "operator-1",
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

  it("sends review without optional feedback", async () => {
    (apiClient.patch as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { id: "s1" },
    });

    await submissionsApi.review(
      "s1",
      "rejected" as SubmissionStatus,
      "operator-1",
      undefined,
      "game-1",
      undefined
    );

    expect(apiClient.patch).toHaveBeenCalledWith(
      "/games/game-1/submissions/s1/review",
      { status: "rejected", feedback: undefined, points: undefined }
    );
  });

  it("does not send _reviewedBy in the request body", async () => {
    (apiClient.patch as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { id: "s1" },
    });

    await submissionsApi.review(
      "s1",
      "approved" as SubmissionStatus,
      "operator-1",
      "OK",
      "game-1",
      5
    );

    const payload = (apiClient.patch as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(payload).not.toHaveProperty("_reviewedBy");
    expect(payload).not.toHaveProperty("reviewedBy");
  });
});
