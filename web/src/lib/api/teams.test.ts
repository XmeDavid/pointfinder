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

  it("returns the unwrapped .data array, not the axios envelope", async () => {
    const mockTeams = [{ id: "t1" }];
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: mockTeams,
      status: 200,
    });

    const result = await teamsApi.listByGame("game-1");

    expect(Array.isArray(result)).toBe(true);
    expect(result).not.toHaveProperty("status");
  });

  it("embeds the gameId in the URL path", async () => {
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });

    await teamsApi.listByGame("xyz-999");

    const calledUrl = (apiClient.get as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(calledUrl).toContain("xyz-999");
    expect(calledUrl).not.toContain("gameId");
  });

  it("propagates 404 errors to the caller", async () => {
    const error = Object.assign(new Error("Not Found"), { response: { status: 404 } });
    (apiClient.get as ReturnType<typeof vi.fn>).mockRejectedValue(error);

    await expect(teamsApi.listByGame("missing")).rejects.toMatchObject({
      response: { status: 404 },
    });
  });

  it("propagates 500 server errors to the caller", async () => {
    const error = Object.assign(new Error("Internal Server Error"), {
      response: { status: 500 },
    });
    (apiClient.get as ReturnType<typeof vi.fn>).mockRejectedValue(error);

    await expect(teamsApi.listByGame("game-1")).rejects.toMatchObject({
      response: { status: 500 },
    });
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

  it("returns the unwrapped .data object, not the axios envelope", async () => {
    const newTeam = { id: "t2", name: "Bears" };
    (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: newTeam,
      status: 201,
    });

    const result = await teamsApi.create({ name: "Bears", gameId: "game-1" });

    expect(result).toEqual(newTeam);
    expect(result).not.toHaveProperty("status");
  });

  it("propagates 400 validation errors to the caller", async () => {
    const error = Object.assign(new Error("Bad Request"), { response: { status: 400 } });
    (apiClient.post as ReturnType<typeof vi.fn>).mockRejectedValue(error);

    await expect(teamsApi.create({ name: "", gameId: "game-1" })).rejects.toMatchObject({
      response: { status: 400 },
    });
  });

  it("propagates 500 server errors to the caller", async () => {
    const error = Object.assign(new Error("Internal Server Error"), {
      response: { status: 500 },
    });
    (apiClient.post as ReturnType<typeof vi.fn>).mockRejectedValue(error);

    await expect(teamsApi.create({ name: "Foxes", gameId: "game-1" })).rejects.toMatchObject({
      response: { status: 500 },
    });
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

  it("passes name field in the request body", async () => {
    (apiClient.put as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { id: "t1" },
    });

    await teamsApi.update("t1", "game-1", { name: "Raptors", color: "#ff0000" });

    const payload = (apiClient.put as ReturnType<typeof vi.fn>).mock.calls[0][1] as UpdateTeamDto;
    expect(payload.name).toBe("Raptors");
  });

  it("passes color field in the request body", async () => {
    (apiClient.put as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { id: "t1" },
    });

    await teamsApi.update("t1", "game-1", { name: "Raptors", color: "#aabbcc" });

    const payload = (apiClient.put as ReturnType<typeof vi.fn>).mock.calls[0][1] as UpdateTeamDto;
    expect(payload.color).toBe("#aabbcc");
  });

  it("sends update without optional color", async () => {
    (apiClient.put as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { id: "t1" },
    });

    await teamsApi.update("t1", "game-1", { name: "Falcons" });

    const payload = (apiClient.put as ReturnType<typeof vi.fn>).mock.calls[0][1] as UpdateTeamDto;
    expect(payload.name).toBe("Falcons");
    expect(payload.color).toBeUndefined();
  });

  it("embeds teamId and gameId in the URL path", async () => {
    (apiClient.put as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { id: "team-55" },
    });

    await teamsApi.update("team-55", "game-77", { name: "Owls" });

    const calledUrl = (apiClient.put as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(calledUrl).toContain("team-55");
    expect(calledUrl).toContain("game-77");
  });

  it("returns the unwrapped .data object, not the axios envelope", async () => {
    const updated = { id: "t1", name: "Hawks" };
    (apiClient.put as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: updated,
      status: 200,
    });

    const result = await teamsApi.update("t1", "game-1", { name: "Hawks" });

    expect(result).toEqual(updated);
    expect(result).not.toHaveProperty("status");
  });

  it("propagates 400 errors to the caller", async () => {
    const error = Object.assign(new Error("Bad Request"), { response: { status: 400 } });
    (apiClient.put as ReturnType<typeof vi.fn>).mockRejectedValue(error);

    await expect(teamsApi.update("t1", "game-1", { name: "" })).rejects.toMatchObject({
      response: { status: 400 },
    });
  });

  it("propagates 404 when team is not found", async () => {
    const error = Object.assign(new Error("Not Found"), { response: { status: 404 } });
    (apiClient.put as ReturnType<typeof vi.fn>).mockRejectedValue(error);

    await expect(teamsApi.update("missing", "game-1", { name: "X" })).rejects.toMatchObject({
      response: { status: 404 },
    });
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

  it("propagates 404 errors to the caller", async () => {
    const error = Object.assign(new Error("Not Found"), { response: { status: 404 } });
    (apiClient.delete as ReturnType<typeof vi.fn>).mockRejectedValue(error);

    await expect(teamsApi.delete("missing", "game-1")).rejects.toMatchObject({
      response: { status: 404 },
    });
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

  it("propagates 500 server errors to the caller", async () => {
    const error = Object.assign(new Error("Internal Server Error"), {
      response: { status: 500 },
    });
    (apiClient.get as ReturnType<typeof vi.fn>).mockRejectedValue(error);

    await expect(teamsApi.getPlayers("t1", "game-1")).rejects.toMatchObject({
      response: { status: 500 },
    });
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

  it("propagates 404 errors to the caller", async () => {
    const error = Object.assign(new Error("Not Found"), { response: { status: 404 } });
    (apiClient.delete as ReturnType<typeof vi.fn>).mockRejectedValue(error);

    await expect(teamsApi.removePlayer("t1", "missing-player", "game-1")).rejects.toMatchObject({
      response: { status: 404 },
    });
  });
});
