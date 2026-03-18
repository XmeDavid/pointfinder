import { describe, expect, it, beforeEach, vi } from "vitest";

vi.mock("./client", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

import apiClient from "./client";
import { assignmentsApi } from "./assignments";

describe("assignmentsApi.listByGame", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches assignments from /games/:gameId/assignments", async () => {
    const assignments = [
      { id: "a1", baseId: "b1", challengeId: "c1" },
      { id: "a2", baseId: "b2", challengeId: "c2", teamId: "t1" },
    ];
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: assignments });

    const result = await assignmentsApi.listByGame("game-1");

    expect(apiClient.get).toHaveBeenCalledWith("/games/game-1/assignments");
    expect(result).toEqual(assignments);
  });

  it("returns empty array when game has no assignments", async () => {
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });

    const result = await assignmentsApi.listByGame("empty-game");

    expect(result).toEqual([]);
  });
});

describe("assignmentsApi.create", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts assignment data to /games/:gameId/assignments", async () => {
    const created = { id: "a1", baseId: "b1", challengeId: "c1" };
    (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValue({ data: created });

    const result = await assignmentsApi.create({
      gameId: "g1",
      baseId: "b1",
      challengeId: "c1",
    });

    expect(apiClient.post).toHaveBeenCalledWith("/games/g1/assignments", {
      baseId: "b1",
      challengeId: "c1",
    });
    expect(result).toEqual(created);
  });

  it("does not send gameId in the request body", async () => {
    (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} });

    await assignmentsApi.create({ gameId: "g1", baseId: "b1", challengeId: "c1" });

    const body = (apiClient.post as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(body).not.toHaveProperty("gameId");
  });

  it("includes optional teamId when provided", async () => {
    (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} });

    await assignmentsApi.create({ gameId: "g1", baseId: "b1", challengeId: "c1", teamId: "t1" });

    const body = (apiClient.post as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(body).toEqual({ baseId: "b1", challengeId: "c1", teamId: "t1" });
  });
});

describe("assignmentsApi.delete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends DELETE to /games/:gameId/assignments/:id", async () => {
    (apiClient.delete as ReturnType<typeof vi.fn>).mockResolvedValue({});

    await assignmentsApi.delete("a1", "g1");

    expect(apiClient.delete).toHaveBeenCalledWith("/games/g1/assignments/a1");
  });
});

describe("assignmentsApi.bulkSet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends PUT with wrapped assignments array to /games/:gameId/assignments", async () => {
    const assignments = [
      { baseId: "b1", challengeId: "c1", teamId: undefined },
      { baseId: "b2", challengeId: "c2", teamId: "t1" },
    ];
    const returned = [
      { id: "a1", baseId: "b1", challengeId: "c1" },
      { id: "a2", baseId: "b2", challengeId: "c2", teamId: "t1" },
    ];
    (apiClient.put as ReturnType<typeof vi.fn>).mockResolvedValue({ data: returned });

    const result = await assignmentsApi.bulkSet("g1", assignments);

    expect(apiClient.put).toHaveBeenCalledWith("/games/g1/assignments", {
      assignments: [
        { baseId: "b1", challengeId: "c1", teamId: undefined },
        { baseId: "b2", challengeId: "c2", teamId: "t1" },
      ],
    });
    expect(result).toEqual(returned);
  });

  it("sends empty assignments array", async () => {
    (apiClient.put as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });

    const result = await assignmentsApi.bulkSet("g1", []);

    expect(apiClient.put).toHaveBeenCalledWith("/games/g1/assignments", {
      assignments: [],
    });
    expect(result).toEqual([]);
  });

  it("strips extra properties from assignment objects, keeping only baseId, challengeId, teamId", async () => {
    const assignments = [
      { baseId: "b1", challengeId: "c1", teamId: "t1", extraField: "should-be-stripped" } as never,
    ];
    (apiClient.put as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });

    await assignmentsApi.bulkSet("g1", assignments);

    const body = (apiClient.put as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(body.assignments[0]).toEqual({
      baseId: "b1",
      challengeId: "c1",
      teamId: "t1",
    });
    expect(body.assignments[0]).not.toHaveProperty("extraField");
  });
});
