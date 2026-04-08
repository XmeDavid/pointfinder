/**
 * Component tests for BasesPage cross-navigation affordances (Wave 3d Sub-wave B).
 *
 * Tests cover:
 *   - 0 links: no linked-challenge row
 *   - 1 assignment-based link: clickable row rendered with correct text
 *   - 1 fixed link only: existing fixedChallengeNamed badge rendered as a clickable button; no new row
 *   - 3 distinct assignment links: pill with "3 linked challenges"; click opens list; click item triggers navigate()
 *   - De-dup: fixed + assignment to same challenge → one badge (fixed), no extra row
 */

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { BasesPage } from "../BasesPage";
import type { Base, Challenge, Assignment } from "@/types";

// Ensure i18n is initialised so `useTranslation` returns real keys.
import "@/i18n";

// ---------------------------------------------------------------------------
// API mocks
// ---------------------------------------------------------------------------

vi.mock("@/lib/api/bases", () => ({
  basesApi: {
    listByGame: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("@/lib/api/challenges", () => ({
  challengesApi: {
    listByGame: vi.fn(),
  },
}));

vi.mock("@/lib/api/assignments", () => ({
  assignmentsApi: {
    listByGame: vi.fn(),
  },
}));

vi.mock("@/lib/api/games", () => ({
  gamesApi: {
    getById: vi.fn().mockResolvedValue({ id: "g1", tileSource: undefined }),
  },
}));

// Stub heavy components
vi.mock("@/components/common/MapPicker", () => ({
  MapPicker: ({ value }: { value: { lat: number; lng: number } }) => (
    <div data-testid="map-picker-stub">{value.lat},{value.lng}</div>
  ),
  BaseMapView: () => <div data-testid="base-map-view-stub" />,
}));

import { basesApi } from "@/lib/api/bases";
import { challengesApi } from "@/lib/api/challenges";
import { assignmentsApi } from "@/lib/api/assignments";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeBase(id: string, overrides: Partial<Base> = {}): Base {
  return {
    id,
    gameId: "g1",
    name: `Base ${id}`,
    description: `Desc ${id}`,
    lat: 40,
    lng: -8,
    nfcLinked: false,
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

function makeAssignment(id: string, baseId: string, challengeId: string, teamId?: string): Assignment {
  return { id, gameId: "g1", baseId, challengeId, teamId };
}

// ---------------------------------------------------------------------------
// Render helpers
// ---------------------------------------------------------------------------

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
}

// Capture navigate calls
const navigateMock = vi.fn();

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

function renderPage(gameId = "g1") {
  const qc = createTestQueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/games/${gameId}/bases`]}>
        <Routes>
          <Route path="/games/:gameId/bases" element={<BasesPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("BasesPage cross-navigation — Sub-wave B", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    navigateMock.mockReset();
  });

  // Walkthrough 5: no linkage → no linked row
  it("renders no linked-challenge row when base has no links", async () => {
    vi.mocked(basesApi.listByGame).mockResolvedValue([makeBase("b1")]);
    vi.mocked(challengesApi.listByGame).mockResolvedValue([makeChallenge("c1")]);
    vi.mocked(assignmentsApi.listByGame).mockResolvedValue([]);

    renderPage();

    await waitFor(() => expect(screen.getByText("Base b1")).toBeTruthy());

    expect(screen.queryByTestId("base-linked-challenge-b1")).toBeNull();
    expect(screen.queryByTestId("base-linked-challenges-b1")).toBeNull();
  });

  // Walkthrough 1: single assignment-based link → clickable row
  it("renders a clickable linked-challenge row for a single assignment link", async () => {
    vi.mocked(basesApi.listByGame).mockResolvedValue([makeBase("b1")]);
    vi.mocked(challengesApi.listByGame).mockResolvedValue([
      makeChallenge("c1", { title: "Guess the landmark" }),
    ]);
    vi.mocked(assignmentsApi.listByGame).mockResolvedValue([
      makeAssignment("a1", "b1", "c1"),
    ]);

    renderPage();

    await waitFor(() =>
      expect(screen.getByTestId("base-linked-challenge-b1")).toBeTruthy(),
    );

    const btn = screen.getByTestId("base-linked-challenge-b1");
    expect(btn.textContent).toContain("Guess the landmark");

    fireEvent.click(btn);
    expect(navigateMock).toHaveBeenCalledWith("/games/g1/challenges?edit=c1");
  });

  // Fixed-only link: existing badge promoted to clickable button; no new assignment row
  it("promotes fixed-challenge badge to clickable button; no extra linked row", async () => {
    vi.mocked(basesApi.listByGame).mockResolvedValue([
      makeBase("b1", { fixedChallengeId: "c1" }),
    ]);
    vi.mocked(challengesApi.listByGame).mockResolvedValue([
      makeChallenge("c1", { title: "Fixed Challenge" }),
    ]);
    vi.mocked(assignmentsApi.listByGame).mockResolvedValue([]);

    renderPage();

    await waitFor(() =>
      expect(screen.getByTestId("base-fixed-challenge-btn-b1")).toBeTruthy(),
    );

    // The promoted badge button is rendered
    const btn = screen.getByTestId("base-fixed-challenge-btn-b1");
    expect(btn.textContent).toContain("Fixed Challenge");

    // No extra assignment-based linked-challenge row
    expect(screen.queryByTestId("base-linked-challenge-b1")).toBeNull();

    // Clicking the badge navigates to challenge page
    fireEvent.click(btn);
    expect(navigateMock).toHaveBeenCalledWith("/games/g1/challenges?edit=c1");
  });

  // Walkthrough 2: 3 distinct assignment links → pill shows count; expand shows all; click item navigates
  it("renders a count pill for 3 linked challenges; click expands list; click item navigates", async () => {
    vi.mocked(basesApi.listByGame).mockResolvedValue([makeBase("b1")]);
    vi.mocked(challengesApi.listByGame).mockResolvedValue([
      makeChallenge("c1", { title: "Alpha" }),
      makeChallenge("c2", { title: "Beta" }),
      makeChallenge("c3", { title: "Gamma" }),
    ]);
    vi.mocked(assignmentsApi.listByGame).mockResolvedValue([
      makeAssignment("a1", "b1", "c1"),
      makeAssignment("a2", "b1", "c2"),
      makeAssignment("a3", "b1", "c3"),
    ]);

    renderPage();

    await waitFor(() =>
      expect(screen.getByTestId("base-linked-challenges-b1")).toBeTruthy(),
    );

    const pill = screen.getByTestId("base-linked-challenges-b1");
    expect(pill.textContent).toContain("3");

    // List not visible yet
    expect(screen.queryByTestId("base-linked-challenges-list-b1")).toBeNull();

    // Click to expand
    fireEvent.click(pill);
    await waitFor(() =>
      expect(screen.getByTestId("base-linked-challenges-list-b1")).toBeTruthy(),
    );

    // All 3 items visible
    expect(screen.getByTestId("base-linked-challenge-item-c1").textContent).toBe("Alpha");
    expect(screen.getByTestId("base-linked-challenge-item-c2").textContent).toBe("Beta");
    expect(screen.getByTestId("base-linked-challenge-item-c3").textContent).toBe("Gamma");

    // Click item c2 triggers navigation
    fireEvent.click(screen.getByTestId("base-linked-challenge-item-c2"));
    expect(navigateMock).toHaveBeenCalledWith("/games/g1/challenges?edit=c2");
  });

  // De-dup: fixed + assignment to same challenge → only fixed badge; no extra row
  it("deduplicates fixed+assignment linkage: only fixed badge shown, no extra linked row", async () => {
    vi.mocked(basesApi.listByGame).mockResolvedValue([
      makeBase("b1", { fixedChallengeId: "c1" }),
    ]);
    vi.mocked(challengesApi.listByGame).mockResolvedValue([
      makeChallenge("c1", { title: "Shared Challenge" }),
    ]);
    vi.mocked(assignmentsApi.listByGame).mockResolvedValue([
      makeAssignment("a1", "b1", "c1"), // same as fixedChallengeId
    ]);

    renderPage();

    await waitFor(() =>
      expect(screen.getByTestId("base-fixed-challenge-btn-b1")).toBeTruthy(),
    );

    // The hook returns source='fixed' for c1 (fixed wins over assignment).
    // assignment-filtered list is empty → no extra row
    expect(screen.queryByTestId("base-linked-challenge-b1")).toBeNull();
    expect(screen.queryByTestId("base-linked-challenges-b1")).toBeNull();
  });

  // Multi-team: 2 assignments to same challenge (different teams) → one row
  it("shows one linked-challenge row when two teams share the same assignment", async () => {
    vi.mocked(basesApi.listByGame).mockResolvedValue([makeBase("b1")]);
    vi.mocked(challengesApi.listByGame).mockResolvedValue([
      makeChallenge("c1", { title: "Shared" }),
    ]);
    vi.mocked(assignmentsApi.listByGame).mockResolvedValue([
      makeAssignment("a1", "b1", "c1", "t1"),
      makeAssignment("a2", "b1", "c1", "t2"),
    ]);

    renderPage();

    await waitFor(() =>
      expect(screen.getByTestId("base-linked-challenge-b1")).toBeTruthy(),
    );

    // Should be a single-link button, not a count pill
    expect(screen.queryByTestId("base-linked-challenges-b1")).toBeNull();
  });
});
