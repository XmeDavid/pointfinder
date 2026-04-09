import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import "@/i18n";

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("@/lib/api/games", () => ({
  gamesApi: {
    getById: vi.fn(),
    updateStatus: vi.fn(),
  },
}));

vi.mock("@/lib/api/bases", () => ({
  basesApi: {
    listByGame: vi.fn(),
  },
}));

vi.mock("@/lib/api/challenges", () => ({
  challengesApi: {
    listByGame: vi.fn(),
  },
}));

vi.mock("@/lib/api/teams", () => ({
  teamsApi: {
    listByGame: vi.fn(),
  },
}));

vi.mock("@/lib/api/assignments", () => ({
  assignmentsApi: {
    listByGame: vi.fn(),
  },
}));

vi.mock("@/lib/api/team-variables", () => ({
  teamVariablesApi: {
    checkCompleteness: vi.fn(),
  },
}));

vi.mock("@/hooks/useToast", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

import { gamesApi } from "@/lib/api/games";
import { basesApi } from "@/lib/api/bases";
import { challengesApi } from "@/lib/api/challenges";
import { teamsApi } from "@/lib/api/teams";
import { assignmentsApi } from "@/lib/api/assignments";
import { teamVariablesApi } from "@/lib/api/team-variables";
import { OverviewPage } from "../OverviewPage";
import type { Game, Base, Challenge, Team } from "@/types";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    id: "g1",
    name: "Forest Challenge",
    description: "Annual scouting event",
    status: "setup",
    startDate: null,
    endDate: null,
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

function makeBase(id: string, overrides: Partial<Base> = {}): Base {
  return {
    id,
    gameId: "g1",
    name: `Base ${id}`,
    description: "",
    lat: 0,
    lng: 0,
    nfcLinked: true,
    hidden: false,
    ...overrides,
  };
}

function makeChallenge(id: string, overrides: Partial<Challenge> = {}): Challenge {
  return {
    id,
    gameId: "g1",
    title: `Challenge ${id}`,
    description: "",
    content: "",
    completionContent: "",
    answerType: "text",
    autoValidate: false,
    points: 100,
    locationBound: false,
    requirePresenceToSubmit: false,
    ...overrides,
  };
}

function makeTeam(id: string, overrides: Partial<Team> = {}): Team {
  return {
    id,
    gameId: "g1",
    name: `Team ${id}`,
    joinCode: `CODE-${id.toUpperCase()}`,
    color: "#3b82f6",
    ...overrides,
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
      <MemoryRouter initialEntries={["/games/g1/overview"]}>
        <Routes>
          <Route path="/games/:gameId/overview" element={<OverviewPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// Default complete setup — all readiness checks pass.
function mockAllReadySetup() {
  vi.mocked(gamesApi.getById).mockResolvedValue(makeGame());
  vi.mocked(basesApi.listByGame).mockResolvedValue([
    makeBase("b1", { nfcLinked: true }),
    makeBase("b2", { nfcLinked: true }),
  ]);
  vi.mocked(challengesApi.listByGame).mockResolvedValue([
    makeChallenge("c1"),
    makeChallenge("c2"),
  ]);
  vi.mocked(teamsApi.listByGame).mockResolvedValue([makeTeam("t1")]);
  vi.mocked(assignmentsApi.listByGame).mockResolvedValue([]);
  vi.mocked(teamVariablesApi.checkCompleteness).mockResolvedValue({ complete: true, errors: [] });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("OverviewPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Basic render ─────────────────────────────────────────────────────────

  it("renders the game name as the page heading", async () => {
    mockAllReadySetup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1 })).toBeTruthy();
    });

    expect(screen.getByText("Forest Challenge")).toBeTruthy();
  });

  it("returns null without crashing when game data has not loaded yet", () => {
    // All queries pending — page should render nothing (returns null).
    vi.mocked(gamesApi.getById).mockReturnValue(new Promise(() => {}));
    vi.mocked(basesApi.listByGame).mockReturnValue(new Promise(() => {}));
    vi.mocked(challengesApi.listByGame).mockReturnValue(new Promise(() => {}));
    vi.mocked(teamsApi.listByGame).mockReturnValue(new Promise(() => {}));
    vi.mocked(assignmentsApi.listByGame).mockReturnValue(new Promise(() => {}));
    vi.mocked(teamVariablesApi.checkCompleteness).mockReturnValue(new Promise(() => {}));

    // Should not throw
    expect(() => renderPage()).not.toThrow();
  });

  // ── Stat cards ───────────────────────────────────────────────────────────

  it("renders the bases count stat card", async () => {
    mockAllReadySetup();
    renderPage();

    await waitFor(() => {
      // 2 bases in the fixture
      const twos = screen.getAllByText("2");
      expect(twos.length).toBeGreaterThan(0);
    });
  });

  it("renders the NFC-linked fraction in the stat card", async () => {
    vi.mocked(gamesApi.getById).mockResolvedValue(makeGame());
    vi.mocked(basesApi.listByGame).mockResolvedValue([
      makeBase("b1", { nfcLinked: true }),
      makeBase("b2", { nfcLinked: false }),
    ]);
    vi.mocked(challengesApi.listByGame).mockResolvedValue([makeChallenge("c1"), makeChallenge("c2")]);
    vi.mocked(teamsApi.listByGame).mockResolvedValue([makeTeam("t1")]);
    vi.mocked(assignmentsApi.listByGame).mockResolvedValue([]);
    vi.mocked(teamVariablesApi.checkCompleteness).mockResolvedValue({ complete: true, errors: [] });

    renderPage();

    await waitFor(() => {
      // NFC linked fraction: "1/2"
      expect(screen.getByText("1/2")).toBeTruthy();
    });
  });

  // ── Status badge ─────────────────────────────────────────────────────────

  it("renders the status badge matching the game status", async () => {
    mockAllReadySetup();
    renderPage();

    await waitFor(() => {
      // i18n key "status.setup" — in test env i18n returns the key
      const badges = screen.getAllByText(/setup/i);
      expect(badges.length).toBeGreaterThan(0);
    });
  });

  it("renders the live status badge when game is live", async () => {
    vi.mocked(gamesApi.getById).mockResolvedValue(makeGame({ status: "live" }));
    vi.mocked(basesApi.listByGame).mockResolvedValue([makeBase("b1")]);
    vi.mocked(challengesApi.listByGame).mockResolvedValue([makeChallenge("c1")]);
    vi.mocked(teamsApi.listByGame).mockResolvedValue([makeTeam("t1")]);
    vi.mocked(assignmentsApi.listByGame).mockResolvedValue([]);
    vi.mocked(teamVariablesApi.checkCompleteness).mockResolvedValue({ complete: true, errors: [] });

    renderPage();

    await waitFor(() => {
      const badges = screen.getAllByText(/live/i);
      expect(badges.length).toBeGreaterThan(0);
    });
  });

  // ── Readiness checklist ──────────────────────────────────────────────────

  it("renders the readiness checklist only when game is in setup state", async () => {
    mockAllReadySetup();
    renderPage();

    await waitFor(() => {
      // i18n key "overview.readinessChecklist"
      const checklist = screen.queryByText(/readinessChecklist|Readiness/i);
      expect(checklist).toBeTruthy();
    });
  });

  it("does not render the readiness checklist when game is live", async () => {
    vi.mocked(gamesApi.getById).mockResolvedValue(makeGame({ status: "live" }));
    vi.mocked(basesApi.listByGame).mockResolvedValue([makeBase("b1")]);
    vi.mocked(challengesApi.listByGame).mockResolvedValue([makeChallenge("c1")]);
    vi.mocked(teamsApi.listByGame).mockResolvedValue([makeTeam("t1")]);
    vi.mocked(assignmentsApi.listByGame).mockResolvedValue([]);
    vi.mocked(teamVariablesApi.checkCompleteness).mockResolvedValue({ complete: true, errors: [] });

    renderPage();

    await waitFor(() => {
      expect(screen.queryByText(/readinessChecklist/i)).toBeNull();
    });
  });

  it("shows an NFC-missing warning in the checklist when a base has no NFC tag linked", async () => {
    vi.mocked(gamesApi.getById).mockResolvedValue(makeGame({ status: "setup" }));
    vi.mocked(basesApi.listByGame).mockResolvedValue([
      makeBase("b1", { nfcLinked: false }),
      makeBase("b2", { nfcLinked: false }),
    ]);
    vi.mocked(challengesApi.listByGame).mockResolvedValue([makeChallenge("c1"), makeChallenge("c2")]);
    vi.mocked(teamsApi.listByGame).mockResolvedValue([makeTeam("t1")]);
    vi.mocked(assignmentsApi.listByGame).mockResolvedValue([]);
    vi.mocked(teamVariablesApi.checkCompleteness).mockResolvedValue({ complete: true, errors: [] });

    renderPage();

    await waitFor(() => {
      // t("overview.nfcMissing", { count: 2 }) renders as
      // "2 bases missing NFC link" (from en.json nfcMissing_other key).
      const warnings = screen.getAllByText(/missing NFC/i);
      expect(warnings.length).toBeGreaterThan(0);
    });
  });

  it("shows variable-completeness errors in the readiness checklist", async () => {
    vi.mocked(gamesApi.getById).mockResolvedValue(makeGame({ status: "setup" }));
    vi.mocked(basesApi.listByGame).mockResolvedValue([makeBase("b1")]);
    vi.mocked(challengesApi.listByGame).mockResolvedValue([makeChallenge("c1")]);
    vi.mocked(teamsApi.listByGame).mockResolvedValue([makeTeam("t1")]);
    vi.mocked(assignmentsApi.listByGame).mockResolvedValue([]);
    vi.mocked(teamVariablesApi.checkCompleteness).mockResolvedValue({
      complete: false,
      errors: ["Team t1 is missing variable 'player_name'"],
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Team t1 is missing variable 'player_name'")).toBeTruthy();
    });
  });

  // ── Go-live button ───────────────────────────────────────────────────────

  it("renders the Go Live button when game is in setup state", async () => {
    mockAllReadySetup();
    renderPage();

    await waitFor(() => {
      const goLiveBtns = screen.getAllByRole("button").filter((b) =>
        b.textContent?.toLowerCase().includes("live") ||
        b.textContent?.toLowerCase().includes("golive") ||
        b.textContent?.toLowerCase().includes("go live"),
      );
      expect(goLiveBtns.length).toBeGreaterThan(0);
    });
  });

  it("disables the Go Live button when readiness checks fail", async () => {
    // No bases, no challenges, no teams — all checks fail
    vi.mocked(gamesApi.getById).mockResolvedValue(makeGame({ status: "setup" }));
    vi.mocked(basesApi.listByGame).mockResolvedValue([]);
    vi.mocked(challengesApi.listByGame).mockResolvedValue([]);
    vi.mocked(teamsApi.listByGame).mockResolvedValue([]);
    vi.mocked(assignmentsApi.listByGame).mockResolvedValue([]);
    vi.mocked(teamVariablesApi.checkCompleteness).mockResolvedValue({ complete: true, errors: [] });

    renderPage();

    await waitFor(() => {
      const goLiveBtns = screen.getAllByRole("button").filter((b) =>
        b.textContent?.toLowerCase().includes("live"),
      );
      expect(goLiveBtns.length).toBeGreaterThan(0);
      expect(goLiveBtns[0].hasAttribute("disabled")).toBe(true);
    });
  });

  it("opens the go-live confirm dialog when the Go Live button is clicked", async () => {
    mockAllReadySetup();
    renderPage();

    await waitFor(() => {
      const goLiveBtns = screen.getAllByRole("button").filter((b) =>
        b.textContent?.toLowerCase().includes("live"),
      );
      expect(goLiveBtns.length).toBeGreaterThan(0);
    });

    const goLiveBtn = screen.getAllByRole("button").find((b) =>
      b.textContent?.toLowerCase().includes("live"),
    )!;
    fireEvent.click(goLiveBtn);

    await waitFor(() => {
      // ConfirmDeleteDialog renders an alertdialog or dialog role
      const dialog = document.querySelector("[role='alertdialog'], [role='dialog']");
      expect(dialog).toBeTruthy();
    });
  });

  it("calls gamesApi.updateStatus with 'live' when go-live is confirmed", async () => {
    mockAllReadySetup();
    vi.mocked(gamesApi.updateStatus).mockResolvedValue(makeGame({ status: "live" }));

    renderPage();

    // Wait for page to fully load
    await waitFor(() => {
      expect(screen.getByText("Forest Challenge")).toBeTruthy();
    });

    // Click the Go Live button to open the confirm dialog
    const goLiveBtn = screen.getAllByRole("button").find((b) =>
      b.textContent?.toLowerCase().includes("live"),
    )!;
    expect(goLiveBtn).toBeTruthy();
    fireEvent.click(goLiveBtn);

    // Wait for confirm dialog to appear
    await waitFor(() => {
      const dialog = document.querySelector("[role='alertdialog'], [role='dialog']");
      expect(dialog).toBeTruthy();
    });

    // Find the confirm button inside the dialog (not the cancel button).
    // ConfirmDeleteDialog renders confirmLabel as the action button text.
    const dialog = document.querySelector("[role='alertdialog'], [role='dialog']")!;
    const dialogBtns = Array.from(dialog.querySelectorAll("button"));
    const confirmBtn = dialogBtns.find((b) =>
      !b.textContent?.toLowerCase().includes("cancel") &&
      !b.textContent?.toLowerCase().includes("cancelar") &&
      !b.textContent?.toLowerCase().includes("abbrechen"),
    );
    expect(confirmBtn).toBeTruthy();
    fireEvent.click(confirmBtn!);

    await waitFor(() => {
      expect(gamesApi.updateStatus).toHaveBeenCalledWith("g1", "live");
    });
  });

  // ── End game button ──────────────────────────────────────────────────────

  it("renders the End Game button when game is live", async () => {
    vi.mocked(gamesApi.getById).mockResolvedValue(makeGame({ status: "live" }));
    vi.mocked(basesApi.listByGame).mockResolvedValue([makeBase("b1")]);
    vi.mocked(challengesApi.listByGame).mockResolvedValue([makeChallenge("c1")]);
    vi.mocked(teamsApi.listByGame).mockResolvedValue([makeTeam("t1")]);
    vi.mocked(assignmentsApi.listByGame).mockResolvedValue([]);
    vi.mocked(teamVariablesApi.checkCompleteness).mockResolvedValue({ complete: true, errors: [] });

    renderPage();

    await waitFor(() => {
      const endBtns = screen.getAllByRole("button").filter((b) =>
        b.textContent?.toLowerCase().includes("end") ||
        b.textContent?.toLowerCase().includes("endgame") ||
        b.textContent?.toLowerCase().includes("end game"),
      );
      expect(endBtns.length).toBeGreaterThan(0);
    });
  });

  it("does not render any lifecycle button when game has ended", async () => {
    vi.mocked(gamesApi.getById).mockResolvedValue(makeGame({ status: "ended" }));
    vi.mocked(basesApi.listByGame).mockResolvedValue([makeBase("b1")]);
    vi.mocked(challengesApi.listByGame).mockResolvedValue([makeChallenge("c1")]);
    vi.mocked(teamsApi.listByGame).mockResolvedValue([makeTeam("t1")]);
    vi.mocked(assignmentsApi.listByGame).mockResolvedValue([]);
    vi.mocked(teamVariablesApi.checkCompleteness).mockResolvedValue({ complete: true, errors: [] });

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1 })).toBeTruthy();
    });

    // transitions["ended"] is null — no button should be rendered.
    // Use queryAllByRole (not getAllByRole) so it returns [] instead of throwing
    // when no buttons are present.
    const lifecycleBtns = screen.queryAllByRole("button").filter((b) =>
      b.textContent?.toLowerCase().includes("live") ||
      b.textContent?.toLowerCase().includes("end game"),
    );
    expect(lifecycleBtns.length).toBe(0);
  });
});
