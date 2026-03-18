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
import { basesApi } from "./bases";

describe("basesApi.listByGame", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches bases from /games/:gameId/bases", async () => {
    const bases = [
      { id: "b1", name: "Base Alpha", lat: 47.3, lng: 8.5 },
      { id: "b2", name: "Base Beta", lat: 47.4, lng: 8.6 },
    ];
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: bases });

    const result = await basesApi.listByGame("game-1");

    expect(apiClient.get).toHaveBeenCalledWith("/games/game-1/bases");
    expect(result).toEqual(bases);
  });

  it("returns empty array when game has no bases", async () => {
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });

    const result = await basesApi.listByGame("empty-game");

    expect(result).toEqual([]);
  });
});

describe("basesApi.create", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts base data to /games/:gameId/bases", async () => {
    const created = { id: "b1", name: "New Base", lat: 47.3, lng: 8.5 };
    (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValue({ data: created });

    const result = await basesApi.create({
      gameId: "g1",
      name: "New Base",
      description: "A new base",
      lat: 47.3,
      lng: 8.5,
    });

    expect(apiClient.post).toHaveBeenCalledWith("/games/g1/bases", {
      name: "New Base",
      description: "A new base",
      lat: 47.3,
      lng: 8.5,
    });
    expect(result).toEqual(created);
  });

  it("does not send gameId in the request body", async () => {
    (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} });

    await basesApi.create({ gameId: "g1", name: "B", description: "D", lat: 0, lng: 0 });

    const body = (apiClient.post as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(body).not.toHaveProperty("gameId");
  });

  it("includes optional hidden field when provided", async () => {
    (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} });

    await basesApi.create({ gameId: "g1", name: "B", description: "D", lat: 0, lng: 0, hidden: true });

    const body = (apiClient.post as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(body.hidden).toBe(true);
  });
});

describe("basesApi.update", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends PUT to /games/:gameId/bases/:id with partial data", async () => {
    const updated = { id: "b1", name: "Renamed Base" };
    (apiClient.put as ReturnType<typeof vi.fn>).mockResolvedValue({ data: updated });

    const result = await basesApi.update("b1", { gameId: "g1", name: "Renamed Base" });

    expect(apiClient.put).toHaveBeenCalledWith("/games/g1/bases/b1", {
      name: "Renamed Base",
    });
    expect(result).toEqual(updated);
  });

  it("does not send gameId in the request body", async () => {
    (apiClient.put as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} });

    await basesApi.update("b1", { gameId: "g1", name: "X" });

    const body = (apiClient.put as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(body).not.toHaveProperty("gameId");
  });

  it("supports nfcLinked and hidden fields", async () => {
    (apiClient.put as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} });

    await basesApi.update("b1", { gameId: "g1", nfcLinked: true, hidden: false });

    const body = (apiClient.put as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(body).toEqual({ nfcLinked: true, hidden: false });
  });
});

describe("basesApi.delete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends DELETE to /games/:gameId/bases/:id", async () => {
    (apiClient.delete as ReturnType<typeof vi.fn>).mockResolvedValue({});

    await basesApi.delete("b1", "g1");

    expect(apiClient.delete).toHaveBeenCalledWith("/games/g1/bases/b1");
  });
});
