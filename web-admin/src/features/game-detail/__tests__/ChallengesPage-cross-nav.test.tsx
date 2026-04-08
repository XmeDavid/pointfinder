/**
 * Component tests for ChallengesPage cross-navigation affordances (Wave 3d Sub-wave B).
 *
 * Tests cover:
 *   - 0 links: no linked-base row
 *   - 1 assignment-based link: clickable row with correct text and navigate() call
 *   - 1 fixed base (via fixedChallengeId on base): fixedToBase badge promoted to clickable button; no extra row
 *   - 3 distinct assignment bases: pill with count; expand; click item triggers navigate()
 *   - De-dup: fixedBase + assignment to same base → only fixedToBase badge; no extra linked-base row
 *   - unlocksBaseLabel badge promoted to clickable
 */

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { ChallengesPage } from "../ChallengesPage";
import type { Base, Challenge, Assignment } from "@/types";

// Ensure i18n is initialised so `useTranslation` returns real keys.
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
  basesApi: {
    listByGame: vi.fn(),
  },
}));

vi.mock("@/lib/api/assignments", () => ({
  assignmentsApi: {
    listByGame: vi.fn(),
  },
}));

vi.mock("@/lib/api/teams", () => ({
  teamsApi: {
    listByGame: vi.fn().mockResolvedValue([]),
  },
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

// Stub heavy lazy components
vi.mock("@/components/common/RichTextEditor", () => ({
  RichTextEditor: ({ value, onChange }: { value: string; onChange: (html: string) => void }) => (
    <textarea
      data-testid="rich-text-editor-stub"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

import { challengesApi } from "@/lib/api/challenges";
import { basesApi } from "@/lib/api/bases";
import { assignmentsApi } from "@/lib/api/assignments";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeBase(id: string, overrides: Partial<Base> = {}): Base {
  return {
    id,
    gameId: "g1",
    name: `Base ${id}`,
    description: "",
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
      <MemoryRouter initialEntries={[`/games/${gameId}/challenges`]}>
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

describe("ChallengesPage cross-navigation — Sub-wave B", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    navigateMock.mockReset();
  });

  // Walkthrough 5 (reverse): no linkage → no linked-base row
  it("renders no linked-base row when challenge has no links", async () => {
    vi.mocked(challengesApi.listByGame).mockResolvedValue([
      makeChallenge("c1", { title: "Solo challenge" }),
    ]);
    vi.mocked(basesApi.listByGame).mockResolvedValue([makeBase("b1")]);
    vi.mocked(assignmentsApi.listByGame).mockResolvedValue([]);

    renderPage();

    await waitFor(() => expect(screen.getByText("Solo challenge")).toBeTruthy());

    expect(screen.queryByTestId("challenge-linked-base-c1")).toBeNull();
    expect(screen.queryByTestId("challenge-linked-bases-c1")).toBeNull();
  });

  // Walkthrough 1 (reverse): single assignment link → clickable row
  it("renders a clickable linked-base row for a single assignment link", async () => {
    vi.mocked(challengesApi.listByGame).mockResolvedValue([
      makeChallenge("c1", { title: "Find the landmark" }),
    ]);
    vi.mocked(basesApi.listByGame).mockResolvedValue([
      makeBase("b1", { name: "Praça do Comércio" }),
    ]);
    vi.mocked(assignmentsApi.listByGame).mockResolvedValue([
      makeAssignment("a1", "b1", "c1"),
    ]);

    renderPage();

    await waitFor(() =>
      expect(screen.getByTestId("challenge-linked-base-c1")).toBeTruthy(),
    );

    const btn = screen.getByTestId("challenge-linked-base-c1");
    expect(btn.textContent).toContain("Praça do Comércio");

    fireEvent.click(btn);
    expect(navigateMock).toHaveBeenCalledWith("/games/g1/bases?edit=b1");
  });

  // Fixed base: fixedToBase badge promoted to clickable button; no extra assignment row
  it("promotes fixedToBase badge to clickable button; no extra linked-base row", async () => {
    // b1 has fixedChallengeId = c1, making c1 a 'fixed' link to b1
    vi.mocked(challengesApi.listByGame).mockResolvedValue([
      makeChallenge("c1", { title: "Fixed challenge", locationBound: true }),
    ]);
    vi.mocked(basesApi.listByGame).mockResolvedValue([
      makeBase("b1", { name: "Main Station", fixedChallengeId: "c1" }),
    ]);
    vi.mocked(assignmentsApi.listByGame).mockResolvedValue([]);

    renderPage();

    await waitFor(() =>
      expect(screen.getByTestId("challenge-fixed-base-btn-c1")).toBeTruthy(),
    );

    const btn = screen.getByTestId("challenge-fixed-base-btn-c1");
    expect(btn.textContent).toContain("Main Station");

    // No extra assignment-based linked-base row
    expect(screen.queryByTestId("challenge-linked-base-c1")).toBeNull();

    // Click navigates to bases page for b1
    fireEvent.click(btn);
    expect(navigateMock).toHaveBeenCalledWith("/games/g1/bases?edit=b1");
  });

  // unlocksBaseLabel badge promoted to clickable
  it("promotes unlocksBaseLabel badge to clickable button", async () => {
    vi.mocked(challengesApi.listByGame).mockResolvedValue([
      makeChallenge("c1", {
        title: "Unlock challenge",
        locationBound: true,
        unlocksBaseIds: ["b2"],
      }),
    ]);
    vi.mocked(basesApi.listByGame).mockResolvedValue([
      makeBase("b1", { fixedChallengeId: "c1" }),
      makeBase("b2", { name: "Secret Base", hidden: true }),
    ]);
    vi.mocked(assignmentsApi.listByGame).mockResolvedValue([]);

    renderPage();

    await waitFor(() =>
      expect(screen.getByTestId("challenge-unlocks-base-btn-b2")).toBeTruthy(),
    );

    const btn = screen.getByTestId("challenge-unlocks-base-btn-b2");
    expect(btn.textContent).toContain("Secret Base");

    fireEvent.click(btn);
    expect(navigateMock).toHaveBeenCalledWith("/games/g1/bases?edit=b2");
  });

  // Walkthrough 2 (reverse): 3 distinct assignment bases → count pill; expand; click item navigates
  it("renders a count pill for 3 linked bases; click expands list; click item navigates", async () => {
    vi.mocked(challengesApi.listByGame).mockResolvedValue([
      makeChallenge("c1", { title: "Wide challenge" }),
    ]);
    vi.mocked(basesApi.listByGame).mockResolvedValue([
      makeBase("b1", { name: "Alpha Base" }),
      makeBase("b2", { name: "Beta Base" }),
      makeBase("b3", { name: "Gamma Base" }),
    ]);
    vi.mocked(assignmentsApi.listByGame).mockResolvedValue([
      makeAssignment("a1", "b1", "c1"),
      makeAssignment("a2", "b2", "c1"),
      makeAssignment("a3", "b3", "c1"),
    ]);

    renderPage();

    await waitFor(() =>
      expect(screen.getByTestId("challenge-linked-bases-c1")).toBeTruthy(),
    );

    const pill = screen.getByTestId("challenge-linked-bases-c1");
    expect(pill.textContent).toContain("3");

    // List not visible yet
    expect(screen.queryByTestId("challenge-linked-bases-list-c1")).toBeNull();

    // Click to expand
    fireEvent.click(pill);
    await waitFor(() =>
      expect(screen.getByTestId("challenge-linked-bases-list-c1")).toBeTruthy(),
    );

    // All 3 items visible
    expect(screen.getByTestId("challenge-linked-base-item-b1").textContent).toBe("Alpha Base");
    expect(screen.getByTestId("challenge-linked-base-item-b2").textContent).toBe("Beta Base");
    expect(screen.getByTestId("challenge-linked-base-item-b3").textContent).toBe("Gamma Base");

    // Click item b2 triggers navigation
    fireEvent.click(screen.getByTestId("challenge-linked-base-item-b2"));
    expect(navigateMock).toHaveBeenCalledWith("/games/g1/bases?edit=b2");
  });

  // De-dup: fixedBase + assignment to same base → only fixedToBase badge shown; no extra linked-base row
  it("deduplicates fixed+assignment linkage: only fixedToBase badge shown, no extra linked-base row", async () => {
    // b1.fixedChallengeId = c1 (so c1 has a 'fixed' link to b1)
    // Also an assignment b1→c1 → hook de-dupes, keeps source='fixed'
    vi.mocked(challengesApi.listByGame).mockResolvedValue([
      makeChallenge("c1", { title: "Dedup challenge", locationBound: true }),
    ]);
    vi.mocked(basesApi.listByGame).mockResolvedValue([
      makeBase("b1", { name: "Dedup Base", fixedChallengeId: "c1" }),
    ]);
    vi.mocked(assignmentsApi.listByGame).mockResolvedValue([
      makeAssignment("a1", "b1", "c1"),
    ]);

    renderPage();

    await waitFor(() =>
      expect(screen.getByTestId("challenge-fixed-base-btn-c1")).toBeTruthy(),
    );

    // source='fixed' → no assignment-only row
    expect(screen.queryByTestId("challenge-linked-base-c1")).toBeNull();
    expect(screen.queryByTestId("challenge-linked-bases-c1")).toBeNull();
  });

  // Multi-team: 2 assignments to same base (different teams) → one row
  it("shows one linked-base row when two teams share the same base assignment", async () => {
    vi.mocked(challengesApi.listByGame).mockResolvedValue([
      makeChallenge("c1", { title: "Shared base challenge" }),
    ]);
    vi.mocked(basesApi.listByGame).mockResolvedValue([
      makeBase("b1", { name: "Shared Base" }),
    ]);
    vi.mocked(assignmentsApi.listByGame).mockResolvedValue([
      makeAssignment("a1", "b1", "c1", "t1"),
      makeAssignment("a2", "b1", "c1", "t2"),
    ]);

    renderPage();

    await waitFor(() =>
      expect(screen.getByTestId("challenge-linked-base-c1")).toBeTruthy(),
    );

    // Should be a single-link button, not a count pill
    expect(screen.queryByTestId("challenge-linked-bases-c1")).toBeNull();
  });
});
