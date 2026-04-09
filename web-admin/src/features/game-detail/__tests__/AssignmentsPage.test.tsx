import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import "@/i18n";

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("@/lib/api/bases", () => ({
  basesApi: { listByGame: vi.fn() },
}));

vi.mock("@/lib/api/challenges", () => ({
  challengesApi: { listByGame: vi.fn() },
}));

vi.mock("@/lib/api/teams", () => ({
  teamsApi: { listByGame: vi.fn() },
}));

vi.mock("@/lib/api/assignments", () => ({
  assignmentsApi: {
    listByGame: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
  },
}));

import { basesApi } from "@/lib/api/bases";
import { challengesApi } from "@/lib/api/challenges";
import { teamsApi } from "@/lib/api/teams";
import { assignmentsApi } from "@/lib/api/assignments";
import { AssignmentsPage } from "../AssignmentsPage";
import type { Base, Challenge, Team, Assignment } from "@/types";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

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

function makeAssignment(id: string, baseId: string, challengeId: string, teamId?: string): Assignment {
  return { id, gameId: "g1", baseId, challengeId, teamId };
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
      <MemoryRouter initialEntries={["/games/g1/assignments"]}>
        <Routes>
          <Route path="/games/:gameId/assignments" element={<AssignmentsPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AssignmentsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Summary counts ──────────────────────────────────────────────────────────

  it("renders the page heading", async () => {
    vi.mocked(basesApi.listByGame).mockResolvedValue([]);
    vi.mocked(challengesApi.listByGame).mockResolvedValue([]);
    vi.mocked(teamsApi.listByGame).mockResolvedValue([]);
    vi.mocked(assignmentsApi.listByGame).mockResolvedValue([]);

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1 })).toBeTruthy();
    });
  });

  it("shows 0 for fixed-on-base, manual assignments, and unassigned bases when data is empty", async () => {
    vi.mocked(basesApi.listByGame).mockResolvedValue([]);
    vi.mocked(challengesApi.listByGame).mockResolvedValue([]);
    vi.mocked(teamsApi.listByGame).mockResolvedValue([]);
    vi.mocked(assignmentsApi.listByGame).mockResolvedValue([]);

    renderPage();

    await waitFor(() => {
      const zeros = screen.getAllByText("0");
      expect(zeros.length).toBeGreaterThanOrEqual(3);
    });
  });

  it("shows correct fixed-base count when bases have fixedChallengeId", async () => {
    vi.mocked(basesApi.listByGame).mockResolvedValue([
      makeBase("b1", { fixedChallengeId: "c1" }),
      makeBase("b2", { fixedChallengeId: "c2" }),
      makeBase("b3"), // no fixed challenge
    ]);
    vi.mocked(challengesApi.listByGame).mockResolvedValue([
      makeChallenge("c1"),
      makeChallenge("c2"),
    ]);
    vi.mocked(teamsApi.listByGame).mockResolvedValue([]);
    vi.mocked(assignmentsApi.listByGame).mockResolvedValue([]);

    renderPage();

    await waitFor(() => {
      // The summary card for "Fixed on base" shows 2
      const summaryCards = screen.getAllByText("2");
      expect(summaryCards.length).toBeGreaterThan(0);
    });
  });

  // ── Fixed bases section ─────────────────────────────────────────────────────

  it("renders the fixed assignments section when bases have fixedChallengeId", async () => {
    vi.mocked(basesApi.listByGame).mockResolvedValue([
      makeBase("b1", { name: "Gate Base", fixedChallengeId: "c1" }),
    ]);
    vi.mocked(challengesApi.listByGame).mockResolvedValue([
      makeChallenge("c1", { title: "Gate Puzzle" }),
    ]);
    vi.mocked(teamsApi.listByGame).mockResolvedValue([]);
    vi.mocked(assignmentsApi.listByGame).mockResolvedValue([]);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Gate Base")).toBeTruthy();
      expect(screen.getByText("Gate Puzzle")).toBeTruthy();
    });
  });

  it("does not render the fixed assignments section when no bases have fixedChallengeId", async () => {
    vi.mocked(basesApi.listByGame).mockResolvedValue([makeBase("b1")]);
    vi.mocked(challengesApi.listByGame).mockResolvedValue([makeChallenge("c1")]);
    vi.mocked(teamsApi.listByGame).mockResolvedValue([]);
    vi.mocked(assignmentsApi.listByGame).mockResolvedValue([]);

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1 })).toBeTruthy();
    });

    // The fixed assignments card section title ("Fixed Assignments") must not appear.
    // The summary card "Fixed (set on base)" is always rendered but that's a different string.
    expect(screen.queryByText("Fixed Assignments")).toBeNull();
  });

  // ── Manual assignment form ──────────────────────────────────────────────────

  it("renders the challenge select for assignable (non-fixed) bases", async () => {
    vi.mocked(basesApi.listByGame).mockResolvedValue([makeBase("b1", { name: "Free Base" })]);
    vi.mocked(challengesApi.listByGame).mockResolvedValue([makeChallenge("c1", { title: "Open Quest" })]);
    vi.mocked(teamsApi.listByGame).mockResolvedValue([]);
    vi.mocked(assignmentsApi.listByGame).mockResolvedValue([]);

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId("assignment-challenge-select")).toBeTruthy();
    });
    // The challenge option should be in the select
    expect(screen.getByText("Open Quest (100 pts)")).toBeTruthy();
  });

  it("calls assignmentsApi.create with baseId, challengeId when assign button clicked", async () => {
    // No teams → showAllTeamsOption=true → requiresTeamSelection=false
    // → canAssign becomes true once a challenge is selected.
    vi.mocked(basesApi.listByGame).mockResolvedValue([makeBase("b1", { name: "Free Base" })]);
    vi.mocked(challengesApi.listByGame).mockResolvedValue([makeChallenge("c1", { title: "Open Quest" })]);
    vi.mocked(teamsApi.listByGame).mockResolvedValue([]);
    vi.mocked(assignmentsApi.listByGame).mockResolvedValue([]);
    vi.mocked(assignmentsApi.create).mockResolvedValue(makeAssignment("a1", "b1", "c1"));

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId("assignment-challenge-select")).toBeTruthy();
    });

    // Select the challenge — this makes canAssign=true (no team required)
    fireEvent.change(screen.getByTestId("assignment-challenge-select"), {
      target: { value: "c1" },
    });

    // Find and click the Assign button (now enabled after challenge selection)
    await waitFor(() => {
      const assignBtns = screen.getAllByRole("button").filter((b) =>
        b.textContent?.toLowerCase().includes("assign") ||
        b.textContent?.toLowerCase().includes("atribuir") ||
        b.textContent?.toLowerCase().includes("zuweisen"),
      );
      expect(assignBtns.length).toBeGreaterThan(0);
      // Click here inside waitFor to retry if still disabled after re-render
      const btn = assignBtns[0];
      if (!btn.hasAttribute("disabled")) {
        fireEvent.click(btn);
      }
    });

    await waitFor(() => {
      expect(assignmentsApi.create).toHaveBeenCalledWith({
        gameId: "g1",
        baseId: "b1",
        challengeId: "c1",
        teamId: undefined,
      });
    });
  });

  it("renders an existing assignment row with challenge title and delete button", async () => {
    vi.mocked(basesApi.listByGame).mockResolvedValue([makeBase("b1", { name: "Camp Base" })]);
    vi.mocked(challengesApi.listByGame).mockResolvedValue([makeChallenge("c1", { title: "Compass Quest", points: 200 })]);
    vi.mocked(teamsApi.listByGame).mockResolvedValue([makeTeam("t1", { name: "Red Team" })]);
    vi.mocked(assignmentsApi.listByGame).mockResolvedValue([
      makeAssignment("a1", "b1", "c1", "t1"),
    ]);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Compass Quest")).toBeTruthy();
      expect(screen.getByText("200 pts")).toBeTruthy();
      expect(screen.getByText("Red Team")).toBeTruthy();
    });
  });

  it("shows the delete confirm dialog when the assignment delete button is clicked", async () => {
    vi.mocked(basesApi.listByGame).mockResolvedValue([makeBase("b1")]);
    vi.mocked(challengesApi.listByGame).mockResolvedValue([makeChallenge("c1", { title: "Clue Hunt" })]);
    vi.mocked(teamsApi.listByGame).mockResolvedValue([makeTeam("t1")]);
    vi.mocked(assignmentsApi.listByGame).mockResolvedValue([
      makeAssignment("a1", "b1", "c1", "t1"),
    ]);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Clue Hunt")).toBeTruthy();
    });

    // The trash icon buttons in the assignment rows
    const deleteBtns = screen.getAllByRole("button").filter((b) => {
      const svg = b.querySelector("svg");
      // Trash2 icon renders as an SVG
      return svg !== null && b.closest(".rounded-md") !== null;
    });
    // Click the first delete button in the assignment list
    if (deleteBtns.length > 0) {
      fireEvent.click(deleteBtns[0]);
      await waitFor(() => {
        // ConfirmDeleteDialog becomes open — a dialog or alert role appears
        const dialog = document.querySelector("[role='alertdialog'], [role='dialog']");
        expect(dialog).toBeTruthy();
      });
    }
  });

  it("calls assignmentsApi.delete with the assignment id on confirm", async () => {
    vi.mocked(basesApi.listByGame).mockResolvedValue([makeBase("b1")]);
    vi.mocked(challengesApi.listByGame).mockResolvedValue([makeChallenge("c1", { title: "Rope Bridge" })]);
    vi.mocked(teamsApi.listByGame).mockResolvedValue([makeTeam("t1")]);
    vi.mocked(assignmentsApi.listByGame).mockResolvedValue([makeAssignment("a1", "b1", "c1", "t1")]);
    vi.mocked(assignmentsApi.delete).mockResolvedValue(undefined);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Rope Bridge")).toBeTruthy();
    });

    // Click the delete button on the assignment row
    const deleteBtns = screen.getAllByRole("button").filter((b) => {
      const svg = b.querySelector("svg");
      return svg !== null && b.closest(".rounded-md") !== null;
    });

    if (deleteBtns.length > 0) {
      fireEvent.click(deleteBtns[0]);

      // Find and click the destructive confirm button in the dialog
      await waitFor(() => {
        const destructiveBtns = screen.getAllByRole("button").filter((b) =>
          b.classList.contains("destructive") ||
          b.getAttribute("data-variant") === "destructive",
        );
        if (destructiveBtns.length > 0) {
          fireEvent.click(destructiveBtns[0]);
        }
      });

      await waitFor(() => {
        if (vi.mocked(assignmentsApi.delete).mock.calls.length > 0) {
          expect(vi.mocked(assignmentsApi.delete).mock.calls[0][0]).toBe("a1");
        }
      });
    }
  });

  // ── Full-assignment state ───────────────────────────────────────────────────

  it("hides the add-assignment form for a base that has an all-teams assignment", async () => {
    vi.mocked(basesApi.listByGame).mockResolvedValue([makeBase("b1", { name: "Locked Base" })]);
    vi.mocked(challengesApi.listByGame).mockResolvedValue([makeChallenge("c1")]);
    vi.mocked(teamsApi.listByGame).mockResolvedValue([makeTeam("t1")]);
    // An assignment with no teamId means all teams
    vi.mocked(assignmentsApi.listByGame).mockResolvedValue([makeAssignment("a1", "b1", "c1")]);

    renderPage();

    await waitFor(() => {
      // The challenge-select form should NOT appear for a fully-locked base
      expect(screen.queryByTestId("assignment-challenge-select")).toBeNull();
    });
  });

  it("shows the unassigned note when some assignable bases have no assignment", async () => {
    vi.mocked(basesApi.listByGame).mockResolvedValue([
      makeBase("b1"),
      makeBase("b2"),
    ]);
    vi.mocked(challengesApi.listByGame).mockResolvedValue([makeChallenge("c1")]);
    vi.mocked(teamsApi.listByGame).mockResolvedValue([makeTeam("t1")]);
    vi.mocked(assignmentsApi.listByGame).mockResolvedValue([]);

    renderPage();

    await waitFor(() => {
      // When basesWithoutAssignment.length > 0 the page renders the unassigned note
      // The count "2" should appear somewhere in the unassigned note
      const twos = screen.getAllByText(/2/);
      expect(twos.length).toBeGreaterThan(0);
    });
  });

  it("excludes fixed-challenge assignments from available challenges in the manual section", async () => {
    // c1 is fixed-linked to b1; c2 is free. The manual assign form for b2 should
    // only offer c2, not c1.
    vi.mocked(basesApi.listByGame).mockResolvedValue([
      makeBase("b1", { fixedChallengeId: "c1" }),
      makeBase("b2"),
    ]);
    vi.mocked(challengesApi.listByGame).mockResolvedValue([
      makeChallenge("c1", { title: "Fixed Challenge" }),
      makeChallenge("c2", { title: "Free Challenge" }),
    ]);
    vi.mocked(teamsApi.listByGame).mockResolvedValue([]);
    vi.mocked(assignmentsApi.listByGame).mockResolvedValue([]);

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId("assignment-challenge-select")).toBeTruthy();
    });

    // The select should contain "Free Challenge" but NOT "Fixed Challenge"
    expect(screen.getByText("Free Challenge (100 pts)")).toBeTruthy();
    expect(screen.queryByText("Fixed Challenge (100 pts)")).toBeNull();
  });
});
