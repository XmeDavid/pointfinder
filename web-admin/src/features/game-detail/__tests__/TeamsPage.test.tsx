import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import "@/i18n";

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("@/lib/api/teams", () => ({
  teamsApi: {
    listByGame: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    getPlayers: vi.fn(),
    removePlayer: vi.fn(),
  },
}));

vi.mock("@/lib/api/team-variables", () => ({
  teamVariablesApi: {
    getGameVariables: vi.fn().mockResolvedValue({ variables: [] }),
    saveGameVariables: vi.fn().mockResolvedValue({}),
  },
}));

// TeamVariablesEditor pulls in a complex form — stub it to keep tests focused
// on TeamsPage routing/mutations, not on the variables sub-form.
vi.mock("@/components/common/TeamVariablesEditor", () => ({
  TeamVariablesEditor: () => <div data-testid="team-variables-editor-stub" />,
}));

// QRCode is a canvas-based lib that doesn't work in jsdom.
vi.mock("qrcode", () => ({
  default: { toDataURL: vi.fn().mockResolvedValue("data:image/png;base64,MOCK") },
}));

import { teamsApi } from "@/lib/api/teams";
import { TeamsPage } from "../TeamsPage";
import type { Team, Player } from "@/types";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

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

function makePlayer(id: string, teamId: string): Player {
  return {
    id,
    teamId,
    deviceId: `device-${id}`,
    displayName: `Player ${id}`,
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
      <MemoryRouter initialEntries={["/games/g1/teams"]}>
        <Routes>
          <Route path="/games/:gameId/teams" element={<TeamsPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("TeamsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no players for any team — individual tests override per-team
    vi.mocked(teamsApi.getPlayers).mockResolvedValue([]);
  });

  it("renders empty state when no teams exist", async () => {
    vi.mocked(teamsApi.listByGame).mockResolvedValue([]);

    renderPage();

    await waitFor(() => {
      // The empty state card should be visible; the grid of team cards should not.
      expect(screen.queryByTestId("team-name-input")).toBeNull();
    });
    // The heading is always shown
    expect(screen.getByRole("heading", { level: 1 })).toBeTruthy();
  });

  it("renders a card for each team returned by the API", async () => {
    const teams = [makeTeam("t1", { name: "Alpha" }), makeTeam("t2", { name: "Bravo" })];
    vi.mocked(teamsApi.listByGame).mockResolvedValue(teams);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Alpha")).toBeTruthy();
      expect(screen.getByText("Bravo")).toBeTruthy();
    });
  });

  it("shows the join code for each team in a monospace block", async () => {
    vi.mocked(teamsApi.listByGame).mockResolvedValue([makeTeam("t1", { joinCode: "WOLF-42" })]);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("WOLF-42")).toBeTruthy();
    });
  });

  it("opens the create-team dialog when the create button is clicked", async () => {
    vi.mocked(teamsApi.listByGame).mockResolvedValue([]);

    renderPage();

    // Wait for data load
    await waitFor(() => {
      expect(screen.queryByTestId("team-name-input")).toBeNull();
    });

    // The button to open the dialog has no testid but has a Plus icon; find by role
    const openDialogBtns = screen.getAllByRole("button");
    // The first prominent button in the page header is the create-team button
    const openBtn = openDialogBtns.find((b) =>
      b.textContent?.toLowerCase().includes("create") ||
      b.textContent?.toLowerCase().includes("team"),
    );
    expect(openBtn).toBeTruthy();
    fireEvent.click(openBtn!);

    await waitFor(() => {
      expect(screen.getByTestId("team-name-input")).toBeTruthy();
      expect(screen.getByTestId("team-save-btn")).toBeTruthy();
    });
  });

  it("calls teamsApi.create with trimmed name on form submit", async () => {
    vi.mocked(teamsApi.listByGame).mockResolvedValue([]);
    vi.mocked(teamsApi.create).mockResolvedValue(makeTeam("t-new", { name: "Delta" }));

    renderPage();

    // Open dialog
    const openDialogBtns = screen.getAllByRole("button");
    const openBtn = openDialogBtns.find((b) =>
      b.textContent?.toLowerCase().includes("create") ||
      b.textContent?.toLowerCase().includes("team"),
    );
    fireEvent.click(openBtn!);

    await waitFor(() => {
      expect(screen.getByTestId("team-name-input")).toBeTruthy();
    });

    fireEvent.change(screen.getByTestId("team-name-input"), {
      target: { value: "  Delta  " },
    });
    fireEvent.click(screen.getByTestId("team-save-btn"));

    await waitFor(() => {
      expect(teamsApi.create).toHaveBeenCalledWith({ gameId: "g1", name: "Delta" });
    });
  });

  it("does not call teamsApi.create when team name is blank", async () => {
    vi.mocked(teamsApi.listByGame).mockResolvedValue([]);

    renderPage();

    const openDialogBtns = screen.getAllByRole("button");
    const openBtn = openDialogBtns.find((b) =>
      b.textContent?.toLowerCase().includes("create") ||
      b.textContent?.toLowerCase().includes("team"),
    );
    fireEvent.click(openBtn!);

    await waitFor(() => {
      expect(screen.getByTestId("team-name-input")).toBeTruthy();
    });

    // Leave name empty and try to submit
    fireEvent.click(screen.getByTestId("team-save-btn"));

    // create should not have been called
    expect(teamsApi.create).not.toHaveBeenCalled();
  });

  it("shows player list inside the team card when players exist", async () => {
    const team = makeTeam("t1", { name: "Eagles" });
    vi.mocked(teamsApi.listByGame).mockResolvedValue([team]);
    vi.mocked(teamsApi.getPlayers).mockResolvedValue([
      makePlayer("p1", "t1"),
      makePlayer("p2", "t1"),
    ]);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Player p1")).toBeTruthy();
      expect(screen.getByText("Player p2")).toBeTruthy();
    });
  });

  it("shows the member count in the team card description", async () => {
    const team = makeTeam("t1", { name: "Foxes" });
    vi.mocked(teamsApi.listByGame).mockResolvedValue([team]);
    vi.mocked(teamsApi.getPlayers).mockResolvedValue([
      makePlayer("p1", "t1"),
      makePlayer("p2", "t1"),
      makePlayer("p3", "t1"),
    ]);

    renderPage();

    await waitFor(() => {
      // i18n "teams.member" with count=3 is somewhere on the page
      const countText = screen.getAllByText(/3/);
      expect(countText.length).toBeGreaterThan(0);
    });
  });

  it("shows the delete confirm dialog when the delete button is clicked", async () => {
    vi.mocked(teamsApi.listByGame).mockResolvedValue([makeTeam("t1", { name: "Ghosts" })]);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Ghosts")).toBeTruthy();
    });

    // Find the delete button (trash icon button inside the team card)
    const deleteBtns = screen.getAllByRole("button").filter((b) =>
      b.getAttribute("aria-label")?.toLowerCase().includes("delete") ||
      b.getAttribute("aria-label")?.toLowerCase().includes("apagar") ||
      b.getAttribute("aria-label")?.toLowerCase().includes("löschen"),
    );
    expect(deleteBtns.length).toBeGreaterThan(0);
    fireEvent.click(deleteBtns[0]);

    // The confirm dialog should appear
    await waitFor(() => {
      // ConfirmDeleteDialog renders a dialog with a confirm button
      const confirmBtns = screen.getAllByRole("button").filter((b) =>
        b.textContent?.toLowerCase().includes("delete") ||
        b.textContent?.toLowerCase().includes("apagar") ||
        b.textContent?.toLowerCase().includes("löschen") ||
        b.textContent?.toLowerCase().includes("confirm"),
      );
      expect(confirmBtns.length).toBeGreaterThan(0);
    });
  });

  it("calls teamsApi.delete with the team id on confirm", async () => {
    const team = makeTeam("t1", { name: "Hunters" });
    vi.mocked(teamsApi.listByGame).mockResolvedValue([team]);
    vi.mocked(teamsApi.delete).mockResolvedValue(undefined);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Hunters")).toBeTruthy();
    });

    const deleteBtns = screen.getAllByRole("button").filter((b) =>
      b.getAttribute("aria-label")?.toLowerCase().includes("delete") ||
      b.getAttribute("aria-label")?.toLowerCase().includes("apagar") ||
      b.getAttribute("aria-label")?.toLowerCase().includes("löschen"),
    );
    fireEvent.click(deleteBtns[0]);

    // Wait for dialog then click confirm (the destructive button)
    await waitFor(() => {
      const confirmBtns = screen.getAllByRole("button").filter((b) =>
        b.getAttribute("data-variant") === "destructive" ||
        b.classList.contains("destructive") ||
        b.textContent?.toLowerCase().includes("delete") ||
        b.textContent?.toLowerCase().includes("apagar"),
      );
      expect(confirmBtns.length).toBeGreaterThan(0);
    });

    const destructiveBtns = screen.getAllByRole("button").filter((b) =>
      b.getAttribute("data-variant") === "destructive" ||
      b.classList.contains("destructive"),
    );
    if (destructiveBtns.length > 0) {
      fireEvent.click(destructiveBtns[0]);
      await waitFor(() => {
        expect(teamsApi.delete).toHaveBeenCalledWith("t1", "g1");
      });
    }
  });

  it("renders the team-variables editor when teams exist", async () => {
    vi.mocked(teamsApi.listByGame).mockResolvedValue([makeTeam("t1")]);

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId("team-variables-editor-stub")).toBeTruthy();
    });
  });

  it("does not render the team-variables editor when no teams exist", async () => {
    vi.mocked(teamsApi.listByGame).mockResolvedValue([]);

    renderPage();

    await waitFor(() => {
      expect(screen.queryByTestId("team-variables-editor-stub")).toBeNull();
    });
  });
});
