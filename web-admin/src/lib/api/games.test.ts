import { describe, expect, it, beforeEach, vi } from "vitest";

// Mock apiClient before importing the module under test
vi.mock("./client", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

import type { GameStatus } from "@/types";
import apiClient from "./client";
import { gamesApi, isGameExportDto } from "./games";
import type { CreateGameDto, GameExportDto } from "./games";

// ─── isGameExportDto ─────────────────────────────────────────────────────────

describe("isGameExportDto", () => {
  const validExport: GameExportDto = {
    exportVersion: "1",
    game: { name: "Test Game", description: "" },
    bases: [],
    challenges: [],
    assignments: [],
  };

  it("returns true for a valid minimal export object", () => {
    expect(isGameExportDto(validExport)).toBe(true);
  });

  it("returns true when optional fields are present", () => {
    const full: GameExportDto = {
      ...validExport,
      exportedAt: "2026-03-14T00:00:00Z",
      game: { name: "Full Game", description: "desc", uniformAssignment: true },
      teams: [{ tempId: "t1", name: "Team A", color: "#ff0000" }],
    };
    expect(isGameExportDto(full)).toBe(true);
  });

  it("returns false for null", () => {
    expect(isGameExportDto(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isGameExportDto(undefined)).toBe(false);
  });

  it("returns false for a string", () => {
    expect(isGameExportDto("not an object")).toBe(false);
  });

  it("returns false for a number", () => {
    expect(isGameExportDto(42)).toBe(false);
  });

  it("returns false when exportVersion is missing", () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { exportVersion: _omit, ...rest } = validExport;
    expect(isGameExportDto(rest)).toBe(false);
  });

  it("returns false when exportVersion is not a string", () => {
    expect(isGameExportDto({ ...validExport, exportVersion: 1 })).toBe(false);
  });

  it("returns false when game is missing", () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { game: _omit, ...rest } = validExport;
    expect(isGameExportDto(rest)).toBe(false);
  });

  it("returns false when game.name is missing", () => {
    expect(isGameExportDto({ ...validExport, game: {} })).toBe(false);
  });

  it("returns false when game.name is not a string", () => {
    expect(isGameExportDto({ ...validExport, game: { name: 123 } })).toBe(false);
  });

  it("returns false when bases is missing", () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { bases: _omit, ...rest } = validExport;
    expect(isGameExportDto(rest)).toBe(false);
  });

  it("returns false when bases is not an array", () => {
    expect(isGameExportDto({ ...validExport, bases: "nope" })).toBe(false);
  });

  it("returns false when challenges is missing", () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { challenges: _omit, ...rest } = validExport;
    expect(isGameExportDto(rest)).toBe(false);
  });

  it("returns false when assignments is missing", () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { assignments: _omit, ...rest } = validExport;
    expect(isGameExportDto(rest)).toBe(false);
  });

  it("returns false for an empty object", () => {
    expect(isGameExportDto({})).toBe(false);
  });
});

// ─── gamesApi.create (date transformation) ───────────────────────────────────

describe("gamesApi.create", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("converts startDate and endDate to ISO strings", async () => {
    const mockGame = { id: "1", name: "New Game" };
    (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValue({ data: mockGame });

    const dto: CreateGameDto = {
      name: "New Game",
      description: "desc",
      startDate: "2026-06-15",
      endDate: "2026-06-20",
    };

    const result = await gamesApi.create(dto);

    expect(result).toEqual(mockGame);
    const postedPayload = (apiClient.post as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(postedPayload.startDate).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(postedPayload.endDate).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("sends null for startDate and endDate when not provided", async () => {
    (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} });

    await gamesApi.create({ name: "No dates", description: "d" });

    const postedPayload = (apiClient.post as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(postedPayload.startDate).toBeNull();
    expect(postedPayload.endDate).toBeNull();
  });

  it("passes through other fields unchanged", async () => {
    (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} });

    await gamesApi.create({
      name: "Game",
      description: "desc",
      uniformAssignment: true,
      broadcastEnabled: false,
      tileSource: "osm",
    });

    const postedPayload = (apiClient.post as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(postedPayload.name).toBe("Game");
    expect(postedPayload.description).toBe("desc");
    expect(postedPayload.uniformAssignment).toBe(true);
    expect(postedPayload.broadcastEnabled).toBe(false);
    expect(postedPayload.tileSource).toBe("osm");
  });
});

// ─── gamesApi.update (date transformation edge cases) ────────────────────────

describe("gamesApi.update", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("converts startDate and endDate to ISO strings when present", async () => {
    (apiClient.put as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} });

    await gamesApi.update("game-1", {
      startDate: "2026-07-01",
      endDate: "2026-07-10",
    });

    const payload = (apiClient.put as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(payload.startDate).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(payload.endDate).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("sends null when startDate is empty string (clear date)", async () => {
    (apiClient.put as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} });

    await gamesApi.update("game-1", { startDate: "", endDate: "" });

    const payload = (apiClient.put as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(payload.startDate).toBeNull();
    expect(payload.endDate).toBeNull();
  });

  it("does not include date fields when not provided in dto", async () => {
    (apiClient.put as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} });

    await gamesApi.update("game-1", { name: "Renamed" });

    const payload = (apiClient.put as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(payload.name).toBe("Renamed");
    expect(payload).not.toHaveProperty("startDate");
    expect(payload).not.toHaveProperty("endDate");
  });

  it("calls the correct endpoint with game ID", async () => {
    (apiClient.put as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} });

    await gamesApi.update("abc-123", { name: "X" });

    expect(apiClient.put).toHaveBeenCalledWith("/games/abc-123", expect.any(Object));
  });
});

// ─── gamesApi.updateStatus ───────────────────────────────────────────────────

describe("gamesApi.updateStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends status and resetProgress to the correct endpoint", async () => {
    (apiClient.patch as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} });

    await gamesApi.updateStatus("g1", "live" as GameStatus, true);

    expect(apiClient.patch).toHaveBeenCalledWith("/games/g1/status", {
      status: "live",
      resetProgress: true,
    });
  });

  it("defaults resetProgress to false", async () => {
    (apiClient.patch as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} });

    await gamesApi.updateStatus("g1", "ended" as GameStatus);

    expect(apiClient.patch).toHaveBeenCalledWith("/games/g1/status", {
      status: "ended",
      resetProgress: false,
    });
  });
});

