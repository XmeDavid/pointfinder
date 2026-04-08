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
import { monitoringApi } from "./monitoring";

function parseCallQuery(): URLSearchParams {
  const [url] = (apiClient.get as ReturnType<typeof vi.fn>).mock.calls[0];
  const questionMark = (url as string).indexOf("?");
  return new URLSearchParams(questionMark >= 0 ? (url as string).slice(questionMark + 1) : "");
}

describe("monitoringApi.exportAuditLog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls the audit-export endpoint with a blob response type", async () => {
    const blob = new Blob(["[]"], { type: "application/json" });
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: blob });

    const result = await monitoringApi.exportAuditLog("g1", {});

    const [url, config] = (apiClient.get as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("/games/g1/audit-export");
    expect(config).toEqual({ responseType: "blob" });
    expect(result).toBe(blob);
  });

  it("forwards all provided filters as query params", async () => {
    const blob = new Blob(["[]"], { type: "application/json" });
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: blob });

    await monitoringApi.exportAuditLog("g1", {
      format: "csv",
      from: "2026-04-01T00:00:00Z",
      to: "2026-04-08T00:00:00Z",
      teamId: "team-1",
      playerId: "player-1",
      operatorId: "op-1",
      actionType: "operator_override,approval",
      sourceSurface: "operator_rescue",
      includeArchived: true,
    });

    const params = parseCallQuery();
    expect(params.get("format")).toBe("csv");
    expect(params.get("from")).toBe("2026-04-01T00:00:00Z");
    expect(params.get("to")).toBe("2026-04-08T00:00:00Z");
    expect(params.get("teamId")).toBe("team-1");
    expect(params.get("playerId")).toBe("player-1");
    expect(params.get("operatorId")).toBe("op-1");
    expect(params.get("actionType")).toBe("operator_override,approval");
    expect(params.get("sourceSurface")).toBe("operator_rescue");
    expect(params.get("includeArchived")).toBe("true");
  });

  it("omits undefined, null, and empty-string filters from the query", async () => {
    const blob = new Blob(["[]"], { type: "application/json" });
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: blob });

    await monitoringApi.exportAuditLog("g1", {
      format: "json",
      from: "",
      to: undefined,
      teamId: "team-1",
    });

    const params = parseCallQuery();
    expect(params.get("format")).toBe("json");
    expect(params.get("teamId")).toBe("team-1");
    expect(params.has("from")).toBe(false);
    expect(params.has("to")).toBe(false);
    expect(params.has("playerId")).toBe(false);
  });

  it("returns the raw blob unwrapped (no axios envelope)", async () => {
    const blob = new Blob(["hi"], { type: "text/csv" });
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: blob, status: 200 });

    const result = await monitoringApi.exportAuditLog("g1", { format: "csv" });

    expect(result).toBe(blob);
    expect(result).not.toHaveProperty("status");
  });

  it("propagates 403 errors to the caller", async () => {
    const error = Object.assign(new Error("Forbidden"), { response: { status: 403 } });
    (apiClient.get as ReturnType<typeof vi.fn>).mockRejectedValue(error);

    await expect(monitoringApi.exportAuditLog("g1", {})).rejects.toMatchObject({
      response: { status: 403 },
    });
  });
});
