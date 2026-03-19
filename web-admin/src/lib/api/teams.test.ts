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
import { teamsApi } from "./teams";
import type { CreateTeamDto, UpdateTeamDto } from "./teams";

describe("teamsApi.listByGame", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls the correct endpoint", async () => {
    const mockTeams = [{ id: "t1", name: "Eagles" }];
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: mockTeams,
    });

    const result = await teamsApi.listByGame("game-1");

    expect(apiClient.get).toHaveBeenCalledWith("/games/game-1/teams");
    expect(result).toEqual(mockTeams);
  });
});

describe("teamsApi.getById", () => {
  it("throws an error directing callers to use listByGame", async () => {
    await expect(teamsApi.getById("t1")).rejects.toThrow(
      "Use listByGame and filter instead"
    );
  });

  it("includes the requested team ID in the error message", async () => {
    await expect(teamsApi.getById("team-abc")).rejects.toThrow("team-abc");
  });
});

describe("teamsApi.create", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts team name to the game-scoped endpoint", async () => {
    const newTeam = { id: "t1", name: "Wolves" };
    (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: newTeam,
    });

    const dto: CreateTeamDto & { gameId: string } = {
      name: "Wolves",
      gameId: "game-1",
    };
    const result = await teamsApi.create(dto);

    expect(apiClient.post).toHaveBeenCalledWith("/games/game-1/teams", {
      name: "Wolves",
    });
    expect(result).toEqual(newTeam);
  });

  it("does not include gameId in the request body", async () => {
    (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: {},
    });

    await teamsApi.create({ name: "Test", gameId: "g1" });

    const payload = (apiClient.post as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(payload).not.toHaveProperty("gameId");
  });
});

describe("teamsApi.update", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends name and color to the correct endpoint", async () => {
    (apiClient.put as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { id: "t1" },
    });

    const dto: UpdateTeamDto = { name: "Hawks", color: "#00ff00" };
    await teamsApi.update("t1", "game-1", dto);

    expect(apiClient.put).toHaveBeenCalledWith("/games/game-1/teams/t1", dto);
  });
});

describe("teamsApi.delete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls delete on the correct endpoint", async () => {
    (apiClient.delete as ReturnType<typeof vi.fn>).mockResolvedValue({});

    await teamsApi.delete("t1", "game-1");

    expect(apiClient.delete).toHaveBeenCalledWith("/games/game-1/teams/t1");
  });
});

describe("teamsApi.getPlayers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches players for a team", async () => {
    const mockPlayers = [{ id: "p1", displayName: "Alice" }];
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: mockPlayers,
    });

    const result = await teamsApi.getPlayers("t1", "game-1");

    expect(apiClient.get).toHaveBeenCalledWith(
      "/games/game-1/teams/t1/players"
    );
    expect(result).toEqual(mockPlayers);
  });

  it("returns empty array when gameId is not provided", async () => {
    const result = await teamsApi.getPlayers("t1");

    expect(apiClient.get).not.toHaveBeenCalled();
    expect(result).toEqual([]);
  });

  it("returns empty array when gameId is undefined", async () => {
    const result = await teamsApi.getPlayers("t1", undefined);

    expect(apiClient.get).not.toHaveBeenCalled();
    expect(result).toEqual([]);
  });
});

describe("teamsApi.removePlayer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls delete on the player endpoint", async () => {
    (apiClient.delete as ReturnType<typeof vi.fn>).mockResolvedValue({});

    await teamsApi.removePlayer("t1", "p1", "game-1");

    expect(apiClient.delete).toHaveBeenCalledWith(
      "/games/game-1/teams/t1/players/p1"
    );
  });

  it("does nothing when gameId is not provided", async () => {
    await teamsApi.removePlayer("t1", "p1");

    expect(apiClient.delete).not.toHaveBeenCalled();
  });
});
