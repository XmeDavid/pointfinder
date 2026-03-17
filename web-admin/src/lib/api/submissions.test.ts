import { describe, expect, it, beforeEach, vi } from "vitest";
import type { Submission, SubmissionStatus } from "@/types";

vi.mock("./client", () => ({
  default: {
    get: vi.fn(),
    patch: vi.fn(),
  },
}));

import apiClient from "./client";
import { submissionsApi } from "./submissions";

const makeSubmission = (overrides: Partial<Submission> = {}): Submission =>
  ({
    id: "s1",
    gameId: "g1",
    teamId: "team-a",
    challengeId: "c1",
    baseId: "b1",
    status: "pending" as SubmissionStatus,
    createdAt: "2026-03-14T00:00:00Z",
    ...overrides,
  }) as Submission;

describe("submissionsApi.listByGame", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fetches all submissions for a game", async () => {
    const subs = [makeSubmission(), makeSubmission({ id: "s2" })];
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: subs });

    const result = await submissionsApi.listByGame("g1");

    expect(apiClient.get).toHaveBeenCalledWith("/games/g1/submissions");
    expect(result).toEqual(subs);
  });
});

describe("submissionsApi.listByTeam", () => {
  beforeEach(() => vi.clearAllMocks());

  it("passes teamId as query param to backend", async () => {
    const subs = [
      makeSubmission({ id: "s1", teamId: "team-a" }),
      makeSubmission({ id: "s3", teamId: "team-a" }),
    ];
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: subs });

    const result = await submissionsApi.listByTeam("team-a", "g1");

    expect(apiClient.get).toHaveBeenCalledWith("/games/g1/submissions", {
      params: { teamId: "team-a" },
    });
    expect(result).toHaveLength(2);
    expect(result.map((s: Submission) => s.id)).toEqual(["s1", "s3"]);
  });

  it("returns empty array when backend returns no submissions", async () => {
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });

    const result = await submissionsApi.listByTeam("team-z", "g1");

    expect(apiClient.get).toHaveBeenCalledWith("/games/g1/submissions", {
      params: { teamId: "team-z" },
    });
    expect(result).toEqual([]);
  });
});

describe("submissionsApi.review", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sends review with feedback and points", async () => {
    const reviewed = makeSubmission({ status: "approved" as SubmissionStatus });
    (apiClient.patch as ReturnType<typeof vi.fn>).mockResolvedValue({ data: reviewed });

    const result = await submissionsApi.review(
      "s1",
      "approved" as SubmissionStatus,
      "operator-1",
      "Good job!",
      "g1",
      10
    );

    expect(apiClient.patch).toHaveBeenCalledWith("/games/g1/submissions/s1/review", {
      status: "approved",
      feedback: "Good job!",
      points: 10,
    });
    expect(result).toEqual(reviewed);
  });

  it("sends review without optional feedback and points", async () => {
    (apiClient.patch as ReturnType<typeof vi.fn>).mockResolvedValue({ data: makeSubmission() });

    await submissionsApi.review("s1", "rejected" as SubmissionStatus, "op-1", undefined, "g1");

    expect(apiClient.patch).toHaveBeenCalledWith("/games/g1/submissions/s1/review", {
      status: "rejected",
      feedback: undefined,
      points: undefined,
    });
  });

  it("does not send reviewedBy to the backend (unused parameter)", async () => {
    (apiClient.patch as ReturnType<typeof vi.fn>).mockResolvedValue({ data: makeSubmission() });

    await submissionsApi.review("s1", "approved" as SubmissionStatus, "op-id", undefined, "g1");

    const payload = (apiClient.patch as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(payload).not.toHaveProperty("reviewedBy");
    expect(payload).not.toHaveProperty("_reviewedBy");
  });
});
