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
import { teamsApi } from "./teams";

describe("teamsApi.listByGame", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches teams from /games/:gameId/teams", async () => {
    const teams = [{ id: "t1", name: "Alpha" }, { id: "t2", name: "Beta" }];
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: teams });

    const result = await teamsApi.listByGame("game-1");

    expect(apiClient.get).toHaveBeenCalledWith("/games/game-1/teams");
    expect(result).toEqual(teams);
  });

  it("returns empty array when game has no teams", async () => {
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });

    const result = await teamsApi.listByGame("empty-game");

    expect(result).toEqual([]);
  });
});

describe("teamsApi.getById", () => {
  it("throws with a helpful message directing callers to listByGame", async () => {
    await expect(teamsApi.getById("t1")).rejects.toThrow(
      "Use listByGame and filter instead (requested team: t1)"
    );
  });
});

describe("teamsApi.create", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts team name to /games/:gameId/teams", async () => {
    const created = { id: "t1", name: "New Team" };
    (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValue({ data: created });

    const result = await teamsApi.create({ gameId: "g1", name: "New Team" });

    expect(apiClient.post).toHaveBeenCalledWith("/games/g1/teams", { name: "New Team" });
    expect(result).toEqual(created);
  });

  it("does not send gameId in the request body", async () => {
    (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} });

    await teamsApi.create({ gameId: "g1", name: "Team X" });

    const body = (apiClient.post as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(body).not.toHaveProperty("gameId");
    expect(body).toEqual({ name: "Team X" });
  });
});

describe("teamsApi.update", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends PUT to /games/:gameId/teams/:id with update data", async () => {
    const updated = { id: "t1", name: "Renamed", color: "#ff0000" };
    (apiClient.put as ReturnType<typeof vi.fn>).mockResolvedValue({ data: updated });

    const result = await teamsApi.update("t1", "g1", { name: "Renamed", color: "#ff0000" });

    expect(apiClient.put).toHaveBeenCalledWith("/games/g1/teams/t1", {
      name: "Renamed",
      color: "#ff0000",
    });
    expect(result).toEqual(updated);
  });

  it("sends update without optional color", async () => {
    (apiClient.put as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} });

    await teamsApi.update("t1", "g1", { name: "Just Name" });

    const body = (apiClient.put as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(body).toEqual({ name: "Just Name" });
  });
});

describe("teamsApi.delete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends DELETE to /games/:gameId/teams/:id", async () => {
    (apiClient.delete as ReturnType<typeof vi.fn>).mockResolvedValue({});

    await teamsApi.delete("t1", "g1");

    expect(apiClient.delete).toHaveBeenCalledWith("/games/g1/teams/t1");
  });
});

describe("teamsApi.getPlayers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches players from /games/:gameId/teams/:teamId/players", async () => {
    const players = [{ id: "p1", displayName: "Alice" }];
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: players });

    const result = await teamsApi.getPlayers("t1", "g1");

    expect(apiClient.get).toHaveBeenCalledWith("/games/g1/teams/t1/players");
    expect(result).toEqual(players);
  });

  it("returns empty array when gameId is undefined", async () => {
    const result = await teamsApi.getPlayers("t1", undefined);

    expect(apiClient.get).not.toHaveBeenCalled();
    expect(result).toEqual([]);
  });

  it("returns empty array when gameId is empty string (falsy)", async () => {
    const result = await teamsApi.getPlayers("t1", "");

    expect(apiClient.get).not.toHaveBeenCalled();
    expect(result).toEqual([]);
  });
});

describe("teamsApi.removePlayer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends DELETE to /games/:gameId/teams/:teamId/players/:playerId", async () => {
    (apiClient.delete as ReturnType<typeof vi.fn>).mockResolvedValue({});

    await teamsApi.removePlayer("t1", "p1", "g1");

    expect(apiClient.delete).toHaveBeenCalledWith("/games/g1/teams/t1/players/p1");
  });

  it("does nothing when gameId is undefined", async () => {
    await teamsApi.removePlayer("t1", "p1", undefined);

    expect(apiClient.delete).not.toHaveBeenCalled();
  });

  it("does nothing when gameId is empty string (falsy)", async () => {
    await teamsApi.removePlayer("t1", "p1", "");

    expect(apiClient.delete).not.toHaveBeenCalled();
  });
});
