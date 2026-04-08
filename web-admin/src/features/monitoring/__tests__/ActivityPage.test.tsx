import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import "@/i18n";

// --- Module mocks -----------------------------------------------------------

// react-window renders 0 items in jsdom (container height = 0). Mock it so
// all items are rendered directly, keeping existing test assertions intact.
vi.mock("react-window", () => ({
  FixedSizeList: ({ children: Row, itemCount, itemData }: {
    children: (props: { index: number; style: React.CSSProperties; data: unknown }) => React.ReactElement;
    itemCount: number;
    itemData: unknown;
  }) => (
    <>
      {Array.from({ length: itemCount }, (_, i) => (
        <Row key={i} index={i} style={{}} data={itemData} />
      ))}
    </>
  ),
}));

vi.mock("@/lib/api/monitoring", () => ({
  monitoringApi: {
    getActivityEvents: vi.fn().mockResolvedValue([]),
    exportAuditLog: vi.fn(),
  },
}));

vi.mock("@/lib/api/teams", () => ({
  teamsApi: {
    listByGame: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("@/lib/api/challenges", () => ({
  challengesApi: {
    listByGame: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("@/lib/api/bases", () => ({
  basesApi: {
    listByGame: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("@/hooks/useGameWebSocket", () => ({
  useGameWebSocket: () => null,
}));

import { monitoringApi } from "@/lib/api/monitoring";
import { teamsApi } from "@/lib/api/teams";
import { ActivityPage } from "../ActivityPage";
import type { Team } from "@/types";

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
}

function renderPage() {
  const qc = createTestQueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/games/g1/monitor/activity"]}>
        <Routes>
          <Route path="/games/:gameId/monitor/activity" element={<ActivityPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// Stub URL.createObjectURL / revokeObjectURL for jsdom.
beforeEach(() => {
  // jsdom does not implement these methods; the cast tells TS we know.
  (global.URL as unknown as { createObjectURL: () => string }).createObjectURL = vi.fn(() => "blob:fake-url");
  (global.URL as unknown as { revokeObjectURL: () => void }).revokeObjectURL = vi.fn();
});

describe("ActivityPage — audit export dialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(teamsApi.listByGame).mockResolvedValue([
      {
        id: "t1",
        gameId: "g1",
        name: "Eagles",
        joinCode: "CODE",
        color: "#fff",
      } as Team,
    ]);
  });

  it("opens the export dialog with the filter UI rendered", async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId("activity-export-btn")).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId("activity-export-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("activity-export-dialog")).toBeTruthy();
    });

    expect(screen.getByTestId("audit-export-format-json")).toBeTruthy();
    expect(screen.getByTestId("audit-export-format-csv")).toBeTruthy();
    expect(screen.getByTestId("audit-export-from")).toBeTruthy();
    expect(screen.getByTestId("audit-export-to")).toBeTruthy();
    expect(screen.getByTestId("audit-export-team")).toBeTruthy();
    expect(screen.getByTestId("audit-export-action-operator_override")).toBeTruthy();
    expect(screen.getByTestId("audit-export-include-archived")).toBeTruthy();
  });

  it("calls exportAuditLog with the selected filters on submit", async () => {
    const blob = new Blob(["[]"], { type: "application/json" });
    vi.mocked(monitoringApi.exportAuditLog).mockResolvedValue(blob);

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId("activity-export-btn")).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId("activity-export-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("activity-export-dialog")).toBeTruthy();
    });

    // Toggle to CSV.
    fireEvent.click(screen.getByTestId("audit-export-format-csv"));
    // Toggle an action type chip.
    fireEvent.click(screen.getByTestId("audit-export-action-operator_override"));
    // Include archived rows.
    fireEvent.click(screen.getByTestId("audit-export-include-archived"));

    fireEvent.click(screen.getByTestId("audit-export-submit"));

    await waitFor(() => {
      expect(monitoringApi.exportAuditLog).toHaveBeenCalled();
    });

    const [gameId, filters] = vi.mocked(monitoringApi.exportAuditLog).mock.calls[0];
    expect(gameId).toBe("g1");
    expect(filters).toMatchObject({
      format: "csv",
      actionType: "operator_override",
      includeArchived: true,
    });
    // Empty filters should not be forwarded.
    expect(filters.teamId).toBeUndefined();
    expect(filters.from).toBeUndefined();
    expect(filters.to).toBeUndefined();
  });

  it("omits the action type filter when no chips are selected", async () => {
    const blob = new Blob(["[]"], { type: "application/json" });
    vi.mocked(monitoringApi.exportAuditLog).mockResolvedValue(blob);

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId("activity-export-btn")).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId("activity-export-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("audit-export-submit")).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("audit-export-submit"));

    await waitFor(() => {
      expect(monitoringApi.exportAuditLog).toHaveBeenCalled();
    });

    const [, filters] = vi.mocked(monitoringApi.exportAuditLog).mock.calls[0];
    expect(filters.actionType).toBeUndefined();
  });
});
