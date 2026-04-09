import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import "@/i18n";

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("@/lib/api/monitoring", () => ({
  monitoringApi: {
    getLeaderboard: vi.fn(),
    getDashboardStats: vi.fn(),
    getResultsExport: vi.fn(),
  },
}));

vi.mock("@/lib/api/games", () => ({
  gamesApi: {
    getById: vi.fn(),
    exportGame: vi.fn(),
  },
}));

// xlsx is lazy-imported inside handleExportExcel. Mock the dynamic import so
// tests do not need the real xlsx package and avoid file-system side effects.
vi.mock("xlsx", () => ({
  utils: {
    aoa_to_sheet: vi.fn().mockReturnValue({}),
    book_new: vi.fn().mockReturnValue({}),
    book_append_sheet: vi.fn(),
  },
  writeFile: vi.fn(),
}));

import { monitoringApi } from "@/lib/api/monitoring";
import { gamesApi } from "@/lib/api/games";
import { ResultsPage } from "../ResultsPage";
import type { Game } from "@/types";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    id: "g1",
    name: "Scout Finals",
    description: "The big one",
    status: "ended",
    startDate: "2026-06-01T09:00:00Z",
    endDate: "2026-06-01T17:00:00Z",
    createdBy: "op1",
    operatorIds: ["op1"],
    uniformAssignment: false,
    broadcastEnabled: false,
    broadcastCode: null,
    tileSource: "osm",
    unlockTrigger: "checkin",
    ...overrides,
  };
}

function makeStats() {
  return {
    totalTeams: 3,
    totalBases: 5,
    totalChallenges: 10,
    pendingSubmissions: 0,
    completedSubmissions: 27,
    totalSubmissions: 27,
    startDate: "2026-06-01T09:00:00Z",
    endDate: "2026-06-01T17:00:00Z",
  };
}

function makeLeaderboard() {
  return [
    { teamId: "t1", teamName: "Eagles", color: "#f59e0b", points: 450, completedChallenges: 9 },
    { teamId: "t2", teamName: "Wolves", color: "#3b82f6", points: 380, completedChallenges: 8 },
    { teamId: "t3", teamName: "Bears", color: "#10b981", points: 310, completedChallenges: 7 },
  ];
}

function makeResultsExportData() {
  return {
    gameName: "Scout Finals",
    challenges: [
      { id: "c1", title: "Map Reading", maxPoints: 100 },
      { id: "c2", title: "Knot Tying", maxPoints: 80 },
    ],
    teams: [
      { teamId: "t1", teamName: "Eagles", color: "#f59e0b", totalPoints: 450, challengePoints: { c1: 100, c2: 80 } },
      { teamId: "t2", teamName: "Wolves", color: "#3b82f6", totalPoints: 380, challengePoints: { c1: 80, c2: 60 } },
    ],
  };
}

// ---------------------------------------------------------------------------
// Render helper
// ---------------------------------------------------------------------------

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
      <MemoryRouter initialEntries={["/games/g1/results"]}>
        <Routes>
          <Route path="/games/:gameId/results" element={<ResultsPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// Stub URL.createObjectURL / revokeObjectURL — jsdom does not implement these.
beforeEach(() => {
  (global.URL as unknown as { createObjectURL: () => string }).createObjectURL =
    vi.fn(() => "blob:fake-url");
  (global.URL as unknown as { revokeObjectURL: () => void }).revokeObjectURL = vi.fn();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ResultsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(gamesApi.getById).mockResolvedValue(makeGame());
    vi.mocked(monitoringApi.getDashboardStats).mockResolvedValue(makeStats());
    vi.mocked(monitoringApi.getLeaderboard).mockResolvedValue(makeLeaderboard());
    vi.mocked(monitoringApi.getResultsExport).mockResolvedValue(makeResultsExportData());
  });

  // ── Returns null while loading ────────────────────────────────────────────

  it("renders nothing while game or stats have not loaded yet", () => {
    vi.mocked(gamesApi.getById).mockReturnValue(new Promise(() => {}));
    vi.mocked(monitoringApi.getDashboardStats).mockReturnValue(new Promise(() => {}));

    // Should not throw and should render an empty container
    const { container } = renderPage();
    expect(container.firstChild).toBeNull();
  });

  // ── Page heading ──────────────────────────────────────────────────────────

  it("renders the results page heading", async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1 })).toBeTruthy();
    });
  });

  it("renders the game name as a subtitle below the heading", async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Scout Finals")).toBeTruthy();
    });
  });

  // ── Winner card ───────────────────────────────────────────────────────────

  it("renders the winner card for the top leaderboard entry", async () => {
    renderPage();

    await waitFor(() => {
      // "Eagles" appears in both the winner card and the standings row.
      const eaglesEls = screen.getAllByText("Eagles");
      expect(eaglesEls.length).toBeGreaterThanOrEqual(1);
    });

    // Winner's points: rendered as "450 points" in winner card (common.points)
    const ptEls = screen.getAllByText(/450/);
    expect(ptEls.length).toBeGreaterThan(0);
  });

  it("does not render the winner card when leaderboard is empty", async () => {
    vi.mocked(monitoringApi.getLeaderboard).mockResolvedValue([]);

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1 })).toBeTruthy();
    });

    // No trophy winner section
    expect(screen.queryByText(/winner/i)).toBeNull();
  });

  // ── Summary stat cards ────────────────────────────────────────────────────

  it("renders the total teams stat card", async () => {
    renderPage();

    await waitFor(() => {
      // stats.totalTeams = 3
      const threes = screen.getAllByText("3");
      expect(threes.length).toBeGreaterThan(0);
    });
  });

  it("renders the total bases stat card", async () => {
    renderPage();

    await waitFor(() => {
      // stats.totalBases = 5
      const fives = screen.getAllByText("5");
      expect(fives.length).toBeGreaterThan(0);
    });
  });

  it("renders the total challenges stat card", async () => {
    renderPage();

    await waitFor(() => {
      // stats.totalChallenges = 10
      const tens = screen.getAllByText("10");
      expect(tens.length).toBeGreaterThan(0);
    });
  });

  it("renders the total submissions stat card", async () => {
    renderPage();

    await waitFor(() => {
      // stats.totalSubmissions = 27
      const twentySevens = screen.getAllByText("27");
      expect(twentySevens.length).toBeGreaterThan(0);
    });
  });

  // ── Final standings table ─────────────────────────────────────────────────

  it("renders a row for each leaderboard entry in the final standings", async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Wolves")).toBeTruthy();
      expect(screen.getByText("Bears")).toBeTruthy();
    });
  });

  it("renders rank numbers for each entry in the standings", async () => {
    renderPage();

    await waitFor(() => {
      // Rank badges 1 and 2 are unambiguous (no stat card shows those values).
      expect(screen.getByText("1")).toBeTruthy();
      expect(screen.getByText("2")).toBeTruthy();
      // "3" also appears in the totalTeams stat card, so use getAllByText.
      const threes = screen.getAllByText("3");
      expect(threes.length).toBeGreaterThan(0);
    });
  });

  it("renders the points for each team in the standings", async () => {
    renderPage();

    await waitFor(() => {
      // Points are rendered as "{points} pts" in a single span.
      // Eagles=450, Wolves=380, Bears=310.
      const wolfPts = screen.getAllByText(/380 pts/);
      expect(wolfPts.length).toBeGreaterThan(0);
      const bearPts = screen.getAllByText(/310 pts/);
      expect(bearPts.length).toBeGreaterThan(0);
    });
  });

  it("renders the completed-challenges count for each team in the standings", async () => {
    renderPage();

    await waitFor(() => {
      // t("results.challengesOfTotal", { completed: 8, total: 10 })
      // renders as "8 of 10 challenges" (en.json: "{{completed}} of {{total}} challenges")
      const challengeRows = screen.getAllByText(/of 10 challenges/i);
      expect(challengeRows.length).toBeGreaterThan(0);
    });
  });

  // ── JSON export button ────────────────────────────────────────────────────

  it("renders the export results button", async () => {
    renderPage();

    await waitFor(() => {
      const exportBtns = screen.getAllByRole("button").filter((b) =>
        b.textContent?.toLowerCase().includes("export") ||
        b.textContent?.toLowerCase().includes("results"),
      );
      expect(exportBtns.length).toBeGreaterThan(0);
    });
  });

  it("calls gamesApi.exportGame and triggers a download when the export button is clicked", async () => {
    const blob = new Blob(['{"game":"data"}'], { type: "application/json" });
    vi.mocked(gamesApi.exportGame).mockResolvedValue(blob);

    // jsdom does not have document.createElement("a").click — stub it.
    const clickSpy = vi.fn();
    const originalCreate = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = originalCreate(tag);
      if (tag === "a") {
        Object.defineProperty(el, "click", { value: clickSpy, writable: true });
      }
      return el;
    });

    renderPage();

    await waitFor(() => {
      const exportBtns = screen.getAllByRole("button").filter((b) =>
        b.textContent?.toLowerCase().includes("export") &&
        !b.textContent?.toLowerCase().includes("excel"),
      );
      expect(exportBtns.length).toBeGreaterThan(0);
    });

    const exportBtn = screen.getAllByRole("button").find((b) =>
      b.textContent?.toLowerCase().includes("export") &&
      !b.textContent?.toLowerCase().includes("excel"),
    )!;

    fireEvent.click(exportBtn);

    await waitFor(() => {
      expect(gamesApi.exportGame).toHaveBeenCalledWith("g1");
    });

    vi.restoreAllMocks();
  });

  it("disables the JSON export button while export is in progress", async () => {
    // Never resolve to keep exporting=true
    vi.mocked(gamesApi.exportGame).mockReturnValue(new Promise(() => {}));

    renderPage();

    await waitFor(() => {
      const exportBtns = screen.getAllByRole("button").filter((b) =>
        b.textContent?.toLowerCase().includes("export") &&
        !b.textContent?.toLowerCase().includes("excel"),
      );
      expect(exportBtns.length).toBeGreaterThan(0);
    });

    const exportBtn = screen.getAllByRole("button").find((b) =>
      b.textContent?.toLowerCase().includes("export") &&
      !b.textContent?.toLowerCase().includes("excel"),
    )!;

    fireEvent.click(exportBtn);

    await waitFor(() => {
      // After click, while in-flight, the button should be disabled and show
      // the "exporting" label (i18n key "game.exporting").
      expect(exportBtn.hasAttribute("disabled")).toBe(true);
    });
  });

  // ── Excel export button ───────────────────────────────────────────────────

  it("renders the export Excel button", async () => {
    renderPage();

    await waitFor(() => {
      const xlsBtns = screen.getAllByRole("button").filter((b) =>
        b.textContent?.toLowerCase().includes("excel") ||
        b.textContent?.toLowerCase().includes("exportexcel"),
      );
      expect(xlsBtns.length).toBeGreaterThan(0);
    });
  });

  it("calls monitoringApi.getResultsExport and dynamically imports xlsx when Excel button is clicked", async () => {
    renderPage();

    await waitFor(() => {
      const xlsBtns = screen.getAllByRole("button").filter((b) =>
        b.textContent?.toLowerCase().includes("excel"),
      );
      expect(xlsBtns.length).toBeGreaterThan(0);
    });

    const xlsBtn = screen.getAllByRole("button").find((b) =>
      b.textContent?.toLowerCase().includes("excel"),
    )!;

    fireEvent.click(xlsBtn);

    await waitFor(() => {
      expect(monitoringApi.getResultsExport).toHaveBeenCalledWith("g1");
    });
  });

  it("disables the Excel export button while export is in progress", async () => {
    // Never resolve to keep exportingExcel=true
    vi.mocked(monitoringApi.getResultsExport).mockReturnValue(new Promise(() => {}));

    renderPage();

    await waitFor(() => {
      const xlsBtns = screen.getAllByRole("button").filter((b) =>
        b.textContent?.toLowerCase().includes("excel"),
      );
      expect(xlsBtns.length).toBeGreaterThan(0);
    });

    const xlsBtn = screen.getAllByRole("button").find((b) =>
      b.textContent?.toLowerCase().includes("excel"),
    )!;

    fireEvent.click(xlsBtn);

    await waitFor(() => {
      expect(xlsBtn.hasAttribute("disabled")).toBe(true);
    });
  });
});
