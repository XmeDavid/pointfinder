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
import { challengesApi } from "./challenges";

describe("challengesApi.listByGame", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches challenges from /games/:gameId/challenges", async () => {
    const challenges = [
      { id: "c1", title: "Find the flag", points: 10 },
      { id: "c2", title: "Decode the message", points: 20 },
    ];
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: challenges });

    const result = await challengesApi.listByGame("game-1");

    expect(apiClient.get).toHaveBeenCalledWith("/games/game-1/challenges");
    expect(result).toEqual(challenges);
  });

  it("returns empty array when game has no challenges", async () => {
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });

    const result = await challengesApi.listByGame("empty-game");

    expect(result).toEqual([]);
  });
});

describe("challengesApi.create", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts challenge data to /games/:gameId/challenges", async () => {
    const created = { id: "c1", title: "New Challenge", points: 15 };
    (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValue({ data: created });

    const result = await challengesApi.create({
      gameId: "g1",
      title: "New Challenge",
      description: "desc",
      content: "content",
      completionContent: "done",
      answerType: "text",
      autoValidate: false,
      points: 15,
      locationBound: false,
    });

    expect(apiClient.post).toHaveBeenCalledWith("/games/g1/challenges", {
      title: "New Challenge",
      description: "desc",
      content: "content",
      completionContent: "done",
      answerType: "text",
      autoValidate: false,
      points: 15,
      locationBound: false,
    });
    expect(result).toEqual(created);
  });

  it("does not send gameId in the request body", async () => {
    (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} });

    await challengesApi.create({
      gameId: "g1",
      title: "T",
      description: "D",
      content: "C",
      completionContent: "CC",
      answerType: "none",
      autoValidate: true,
      points: 5,
      locationBound: true,
    });

    const body = (apiClient.post as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(body).not.toHaveProperty("gameId");
  });

  it("includes optional fields when provided", async () => {
    (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} });

    await challengesApi.create({
      gameId: "g1",
      title: "T",
      description: "D",
      content: "C",
      completionContent: "CC",
      answerType: "text",
      autoValidate: true,
      correctAnswer: ["answer1", "answer2"],
      points: 10,
      locationBound: true,
      fixedBaseId: "b1",
      unlocksBaseId: "b2",
      requirePresenceToSubmit: true,
    });

    const body = (apiClient.post as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(body.correctAnswer).toEqual(["answer1", "answer2"]);
    expect(body.fixedBaseId).toBe("b1");
    expect(body.unlocksBaseId).toBe("b2");
    expect(body.requirePresenceToSubmit).toBe(true);
  });
});

describe("challengesApi.update", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends PUT to /games/:gameId/challenges/:id with partial data", async () => {
    const updated = { id: "c1", title: "Updated", points: 25 };
    (apiClient.put as ReturnType<typeof vi.fn>).mockResolvedValue({ data: updated });

    const result = await challengesApi.update("c1", { gameId: "g1", title: "Updated", points: 25 });

    expect(apiClient.put).toHaveBeenCalledWith("/games/g1/challenges/c1", {
      title: "Updated",
      points: 25,
    });
    expect(result).toEqual(updated);
  });

  it("does not send gameId in the request body", async () => {
    (apiClient.put as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} });

    await challengesApi.update("c1", { gameId: "g1", title: "X" });

    const body = (apiClient.put as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(body).not.toHaveProperty("gameId");
  });
});

describe("challengesApi.delete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends DELETE to /games/:gameId/challenges/:id", async () => {
    (apiClient.delete as ReturnType<typeof vi.fn>).mockResolvedValue({});

    await challengesApi.delete("c1", "g1");

    expect(apiClient.delete).toHaveBeenCalledWith("/games/g1/challenges/c1");
  });
});
