import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import "@/i18n";

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("@/lib/api/monitoring", () => ({
  monitoringApi: {
    getDashboardStats: vi.fn(),
    getLeaderboard: vi.fn(),
    getRealtimeStats: vi.fn(),
  },
}));

vi.mock("@/lib/api/games", () => ({
  gamesApi: {
    getById: vi.fn(),
  },
}));

// useGameWebSocket connects to a live WebSocket — stub it to avoid network I/O
vi.mock("@/hooks/useGameWebSocket", () => ({
  useGameWebSocket: vi.fn().mockReturnValue(null),
}));

// RealtimeHealthWidget makes its own query; stub the whole component so we
// can assert it is mounted without worrying about its internal fetch.
vi.mock("@/components/RealtimeHealthWidget", () => ({
  RealtimeHealthWidget: ({ gameId }: { gameId: string | undefined }) => (
    <div data-testid="realtime-health-widget" data-game-id={gameId} />
  ),
}));

import { monitoringApi } from "@/lib/api/monitoring";
import { gamesApi } from "@/lib/api/games";
import { useGameWebSocket } from "@/hooks/useGameWebSocket";
import { DashboardPage } from "../DashboardPage";
import type { Game } from "@/types";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    id: "g1",
    name: "Summer Scout 2026",
    description: "Annual scouting game",
    status: "live",
    startDate: "2026-06-01T09:00:00Z",
    endDate: null,
    createdBy: "op1",
    operatorIds: ["op1"],
    uniformAssignment: false,
    broadcastEnabled: true,
    broadcastCode: null,
    tileSource: "osm",
    unlockTrigger: "checkin",
    ...overrides,
  };
}

function makeStats() {
  return {
    totalTeams: 5,
    totalBases: 8,
    totalChallenges: 12,
    pendingSubmissions: 3,
    completedSubmissions: 20,
    totalSubmissions: 23,
    startDate: "2026-06-01T09:00:00Z",
    endDate: "",
  };
}

function makeLeaderboardEntry(teamId: string, teamName: string, points: number) {
  return { teamId, teamName, color: "#3b82f6", points, completedChallenges: 4 };
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
      <MemoryRouter initialEntries={["/games/g1/monitor/dashboard"]}>
        <Routes>
          <Route path="/games/:gameId/monitor/dashboard" element={<DashboardPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("DashboardPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default happy-path responses; individual tests override as needed.
    vi.mocked(gamesApi.getById).mockResolvedValue(makeGame());
    vi.mocked(monitoringApi.getDashboardStats).mockResolvedValue(makeStats());
    vi.mocked(monitoringApi.getLeaderboard).mockResolvedValue([]);
  });

  // ── Loading skeleton ─────────────────────────────────────────────────────

  it("renders skeleton cards while data is loading", () => {
    // Never resolve — keep promises pending so the loading state is visible.
    vi.mocked(gamesApi.getById).mockReturnValue(new Promise(() => {}));
    vi.mocked(monitoringApi.getDashboardStats).mockReturnValue(new Promise(() => {}));
    vi.mocked(monitoringApi.getLeaderboard).mockReturnValue(new Promise(() => {}));

    renderPage();

    // Skeleton elements are rendered as divs with the animate-pulse class.
    // The container renders 4 stat-card skeletons in a grid.
    const skeletons = document.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBeGreaterThan(0);
  });

  // ── Heading and game name ────────────────────────────────────────────────

  it("renders the live dashboard heading and game name after data loads", async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1 })).toBeTruthy();
    });

    // The game name is shown as a subtitle below the heading.
    expect(screen.getByText("Summer Scout 2026")).toBeTruthy();
  });

  // ── Stats cards ──────────────────────────────────────────────────────────

  it("renders the total teams stat card with the correct value", async () => {
    renderPage();

    await waitFor(() => {
      // "5" appears in the stat card (totalTeams) and also in the game summary
      // card (totalTeams again). Use getAllByText and assert at least one match.
      const fives = screen.getAllByText("5");
      expect(fives.length).toBeGreaterThan(0);
    });
  });

  it("renders the pending submissions stat card", async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("3")).toBeTruthy();
    });
  });

  it("renders the completed/total submissions card as a fraction", async () => {
    renderPage();

    await waitFor(() => {
      // Rendered as "20/23"
      expect(screen.getByText("20/23")).toBeTruthy();
    });
  });

  // ── Time remaining display ───────────────────────────────────────────────

  it("shows em dash for time remaining when game has no endDate", async () => {
    vi.mocked(gamesApi.getById).mockResolvedValue(makeGame({ endDate: null }));
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("—")).toBeTruthy();
    });
  });

  it("shows hours and minutes remaining when game is live with a future endDate", async () => {
    const future = new Date(Date.now() + 2 * 60 * 60 * 1000 + 30 * 60 * 1000).toISOString();
    vi.mocked(gamesApi.getById).mockResolvedValue(makeGame({ endDate: future }));
    renderPage();

    await waitFor(() => {
      // e.g. "2h 30m" — exact minutes may vary by ~1 due to test timing,
      // so assert the format pattern rather than exact values.
      const timeCards = screen.getAllByText(/\d+h \d+m/);
      expect(timeCards.length).toBeGreaterThan(0);
    });
  });

  it("shows 0h 0m when game is live but endDate is in the past", async () => {
    const past = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    vi.mocked(gamesApi.getById).mockResolvedValue(makeGame({ endDate: past }));
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("0h 0m")).toBeTruthy();
    });
  });

  it("shows em dash for time remaining when game status is setup (not live)", async () => {
    const future = new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString();
    vi.mocked(gamesApi.getById).mockResolvedValue(makeGame({ status: "setup", endDate: future }));
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("—")).toBeTruthy();
    });
  });

  // ── RealtimeHealthWidget mount ───────────────────────────────────────────

  it("mounts the RealtimeHealthWidget with the correct gameId", async () => {
    renderPage();

    await waitFor(() => {
      const widget = screen.getByTestId("realtime-health-widget");
      expect(widget).toBeTruthy();
      expect(widget.getAttribute("data-game-id")).toBe("g1");
    });
  });

  // ── WebSocket error alert ────────────────────────────────────────────────

  it("shows a WebSocket error alert when useGameWebSocket returns an error string", async () => {
    vi.mocked(useGameWebSocket).mockReturnValue("Connection lost");
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Connection lost")).toBeTruthy();
    });
  });

  it("does not render an alert when useGameWebSocket returns null", async () => {
    vi.mocked(useGameWebSocket).mockReturnValue(null);
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1 })).toBeTruthy();
    });

    // No alert element should be present
    expect(screen.queryByRole("alert")).toBeNull();
  });

  // ── Leaderboard section ──────────────────────────────────────────────────

  it("shows the no-scores placeholder when leaderboard is empty", async () => {
    vi.mocked(monitoringApi.getLeaderboard).mockResolvedValue([]);
    renderPage();

    await waitFor(() => {
      // The empty state paragraph is rendered inside the quick-leaderboard card.
      // i18n key "monitor.noScores" — in tests i18n returns the key name.
      const emptyTexts = screen.getAllByText(/noScores|no.*score/i);
      expect(emptyTexts.length).toBeGreaterThan(0);
    });
  });

  it("renders a ranked row for each leaderboard entry", async () => {
    vi.mocked(monitoringApi.getLeaderboard).mockResolvedValue([
      makeLeaderboardEntry("t1", "Eagles", 150),
      makeLeaderboardEntry("t2", "Wolves", 120),
    ]);
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Eagles")).toBeTruthy();
      expect(screen.getByText("Wolves")).toBeTruthy();
    });

    // Rank numbers 1 and 2 should appear as position badges
    expect(screen.getByText("1")).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
  });

  it("renders the points value for each leaderboard entry", async () => {
    vi.mocked(monitoringApi.getLeaderboard).mockResolvedValue([
      makeLeaderboardEntry("t1", "Bears", 300),
    ]);
    renderPage();

    await waitFor(() => {
      // Points are rendered as "{points} pts" in a single span.
      const ptsCells = screen.getAllByText(/300 pts/);
      expect(ptsCells.length).toBeGreaterThan(0);
    });
  });

  // ── Game summary card ────────────────────────────────────────────────────

  it("renders the total bases count in the game summary card", async () => {
    renderPage();

    await waitFor(() => {
      // stats.totalBases = 8
      expect(screen.getByText("8")).toBeTruthy();
    });
  });

  it("renders the total challenges count in the game summary card", async () => {
    renderPage();

    await waitFor(() => {
      // stats.totalChallenges = 12
      expect(screen.getByText("12")).toBeTruthy();
    });
  });
});
