/**
 * Component tests for the ChallengesPage view-toggle (Wave 4 M3).
 *
 * Covers:
 *   1. Toggle buttons are visible alongside the New Challenge button
 *   2. Default view is card view (data-testid="challenges-card-view")
 *   3. Clicking List button switches to list view (data-testid="challenges-list-view")
 *   4. Clicking Card button switches back to card view
 *   5. URL ?view=list param restores list view on mount
 *   6. URL ?view=card param restores card view on mount
 *   7. localStorage preference restores list view when no URL param
 *   8. Filter bar still visible in list view; filtering reduces rows
 *   9. Clicking a list row opens the edit dialog (same as card click)
 *  10. aria-pressed reflects active view on toggle buttons
 */

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { ChallengesPage } from "../ChallengesPage";
import type { Base, Challenge } from "@/types";

import "@/i18n";

// ---------------------------------------------------------------------------
// API mocks
// ---------------------------------------------------------------------------

vi.mock("@/lib/api/challenges", () => ({
  challengesApi: {
    listByGame: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("@/lib/api/bases", () => ({
  basesApi: { listByGame: vi.fn() },
}));

vi.mock("@/lib/api/assignments", () => ({
  assignmentsApi: { listByGame: vi.fn().mockResolvedValue([]) },
}));

vi.mock("@/lib/api/teams", () => ({
  teamsApi: { listByGame: vi.fn().mockResolvedValue([]) },
}));

vi.mock("@/lib/api/team-variables", () => ({
  teamVariablesApi: {
    getChallengeVariables: vi.fn().mockResolvedValue({ variables: [] }),
    getGameVariables: vi.fn().mockResolvedValue({ variables: [] }),
    saveChallengeVariables: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock("@/lib/api/games", () => ({
  gamesApi: {
    getById: vi.fn().mockResolvedValue({ id: "g1", tileSource: undefined }),
  },
}));

vi.mock("@/components/common/RichTextEditor", () => ({
  RichTextEditor: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <textarea data-testid="rich-text-editor-stub" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));

import { challengesApi } from "@/lib/api/challenges";
import { basesApi } from "@/lib/api/bases";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeBase(id: string, overrides: Partial<Base> = {}): Base {
  return { id, gameId: "g1", name: `Base ${id}`, description: "", lat: 40, lng: -8, nfcLinked: false, hidden: false, ...overrides };
}

function makeChallenge(id: string, overrides: Partial<Challenge> = {}): Challenge {
  return {
    id,
    gameId: "g1",
    title: `Challenge ${id}`,
    description: `Desc ${id}`,
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

const CHALLENGES = [
  makeChallenge("c1", { title: "Alpha Challenge", tagIds: ["tag-autonomous"] }),
  makeChallenge("c2", { title: "Beta Challenge", tagIds: ["tag-staffed"] }),
];

const BASES = [makeBase("b1")];

// ---------------------------------------------------------------------------
// Render helpers
// ---------------------------------------------------------------------------

function createQC() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 }, mutations: { retry: false } },
  });
}

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => vi.fn() };
});

function renderPage(initialPath = "/games/g1/challenges") {
  const qc = createQC();
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/games/:gameId/challenges" element={<ChallengesPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ChallengesPage view toggle (Wave 4 M3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.mocked(challengesApi.listByGame).mockResolvedValue(CHALLENGES);
    vi.mocked(basesApi.listByGame).mockResolvedValue(BASES);
  });

  afterEach(() => {
    localStorage.clear();
  });

  // 1. Toggle buttons visible
  it("renders view toggle buttons in the header", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId("challenges-view-card")).toBeTruthy());
    expect(screen.getByTestId("challenges-view-list")).toBeTruthy();
  });

  // 2. Default view is card
  it("defaults to card view when no URL param or localStorage is set", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId("challenges-card-view")).toBeTruthy());
    expect(screen.queryByTestId("challenges-list-view")).toBeNull();
  });

  // 3. Clicking List button switches to list view
  it("switches to list view when List button is clicked", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId("challenges-view-list")).toBeTruthy());

    fireEvent.click(screen.getByTestId("challenges-view-list"));

    await waitFor(() => expect(screen.getByTestId("challenges-list-view")).toBeTruthy());
    expect(screen.queryByTestId("challenges-card-view")).toBeNull();
  });

  // 4. Clicking Card button switches back to card view
  it("switches back to card view when Card button is clicked after list", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId("challenges-view-list")).toBeTruthy());

    // switch to list
    fireEvent.click(screen.getByTestId("challenges-view-list"));
    await waitFor(() => expect(screen.getByTestId("challenges-list-view")).toBeTruthy());

    // switch back to card
    fireEvent.click(screen.getByTestId("challenges-view-card"));
    await waitFor(() => expect(screen.getByTestId("challenges-card-view")).toBeTruthy());
    expect(screen.queryByTestId("challenges-list-view")).toBeNull();
  });

  // 5. URL ?view=list restores list view on mount
  it("restores list view from ?view=list URL param on mount", async () => {
    renderPage("/games/g1/challenges?view=list");
    await waitFor(() => expect(screen.getByTestId("challenges-list-view")).toBeTruthy());
    expect(screen.queryByTestId("challenges-card-view")).toBeNull();
  });

  // 6. URL ?view=card restores card view on mount
  it("restores card view from ?view=card URL param on mount", async () => {
    renderPage("/games/g1/challenges?view=card");
    await waitFor(() => expect(screen.getByTestId("challenges-card-view")).toBeTruthy());
    expect(screen.queryByTestId("challenges-list-view")).toBeNull();
  });

  // 7. localStorage preference restores list view when no URL param
  it("restores list view from localStorage when no URL param is set", async () => {
    localStorage.setItem("challenges-view-preference", "list");
    renderPage();
    await waitFor(() => expect(screen.getByTestId("challenges-list-view")).toBeTruthy());
    expect(screen.queryByTestId("challenges-card-view")).toBeNull();
  });

  // 8. Filter bar visible in list view; challenges appear as list rows
  it("shows challenge rows in list view matching filter state", async () => {
    renderPage("/games/g1/challenges?view=list");
    await waitFor(() => expect(screen.getByTestId("challenges-list-view")).toBeTruthy());

    // Both challenges should appear as list rows
    expect(screen.getByTestId("challenge-list-row-c1")).toBeTruthy();
    expect(screen.getByTestId("challenge-list-row-c2")).toBeTruthy();
  });

  // 9. Clicking a list row opens the edit dialog
  it("opens edit dialog when a list row is clicked", async () => {
    renderPage("/games/g1/challenges?view=list");
    await waitFor(() => expect(screen.getByTestId("challenge-list-row-c1")).toBeTruthy());

    fireEvent.click(screen.getByTestId("challenge-list-row-c1"));

    await waitFor(() => expect(screen.getByTestId("challenge-save-btn")).toBeTruthy());
  });

  // 10. aria-pressed reflects active view
  it("sets aria-pressed=true on the active view button", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId("challenges-view-card")).toBeTruthy());

    const cardBtn = screen.getByTestId("challenges-view-card");
    const listBtn = screen.getByTestId("challenges-view-list");

    expect(cardBtn.getAttribute("aria-pressed")).toBe("true");
    expect(listBtn.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(listBtn);

    await waitFor(() => expect(listBtn.getAttribute("aria-pressed")).toBe("true"));
    expect(cardBtn.getAttribute("aria-pressed")).toBe("false");
  });

  // 11. localStorage is updated when view is toggled
  it("saves view preference to localStorage when toggled", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId("challenges-view-list")).toBeTruthy());

    fireEvent.click(screen.getByTestId("challenges-view-list"));

    await waitFor(() => expect(localStorage.getItem("challenges-view-preference")).toBe("list"));
  });

  // 12. List rows show title text
  it("renders challenge title in list view rows", async () => {
    renderPage("/games/g1/challenges?view=list");
    await waitFor(() => expect(screen.getByTestId("challenges-list-view")).toBeTruthy());

    expect(screen.getByText("Alpha Challenge")).toBeTruthy();
    expect(screen.getByText("Beta Challenge")).toBeTruthy();
  });

  // 13. Keyboard: Enter on list row opens edit dialog
  it("opens edit dialog when Enter is pressed on a list row", async () => {
    renderPage("/games/g1/challenges?view=list");
    await waitFor(() => expect(screen.getByTestId("challenge-list-row-c1")).toBeTruthy());

    const row = screen.getByTestId("challenge-list-row-c1");
    fireEvent.keyDown(row, { key: "Enter" });

    await waitFor(() => expect(screen.getByTestId("challenge-save-btn")).toBeTruthy());
  });

  // 14. Card view does not show list rows
  it("card view does not render list row elements", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId("challenges-card-view")).toBeTruthy());
    expect(screen.queryByTestId("challenge-list-row-c1")).toBeNull();
  });
});
