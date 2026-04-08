import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { BasesAndChallengesView } from "../BasesAndChallengesView";
import { aggregateBasesAndChallenges } from "../aggregate-bases-challenges";
import type { Base, Challenge } from "@/types";

// Ensure i18n is initialised so `useTranslation` returns real keys.
import "@/i18n";

// Mock the API clients — we only drive `listByGame` and `update` here.
vi.mock("@/lib/api/bases", () => ({
  basesApi: {
    listByGame: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("@/lib/api/challenges", () => ({
  challengesApi: {
    listByGame: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("@/lib/api/games", () => ({
  gamesApi: {
    getById: vi.fn().mockResolvedValue({ id: "g1", tileSource: undefined }),
  },
}));

// Stub the lazy-loaded heavy components so tests don't need a real MapLibre/Tiptap
// environment. The stubs render immediately (no async chunk boundary) so tests can
// verify that the components are rendered once the dialog is open, and that the
// Suspense fallback is shown before they resolve (tested via the mock delay path).
vi.mock("@/components/common/MapPicker", () => ({
  MapPicker: ({ value, onChange }: { value: { lat: number; lng: number }; onChange: (lat: number, lng: number) => void }) => (
    <div data-testid="map-picker-stub">
      <span data-testid="map-picker-lat">{value.lat}</span>
      <span data-testid="map-picker-lng">{value.lng}</span>
      <button
        data-testid="map-picker-move"
        onClick={() => onChange(51.5, -0.1)}
      >
        Move pin
      </button>
    </div>
  ),
}));

vi.mock("@/components/common/RichTextEditor", () => ({
  RichTextEditor: ({ value, onChange, placeholder }: { value: string; onChange: (html: string) => void; placeholder?: string }) => (
    <textarea
      data-testid="rich-text-editor-stub"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

import { basesApi } from "@/lib/api/bases";
import { challengesApi } from "@/lib/api/challenges";

// --------------------------------------------------------------------------
// Fixtures
// --------------------------------------------------------------------------

function makeBase(id: string, overrides: Partial<Base> = {}): Base {
  return {
    id,
    gameId: "g1",
    name: `Base ${id}`,
    description: `Description ${id}`,
    lat: 40 + Number(id.slice(-1)) * 0.01,
    lng: -8 - Number(id.slice(-1)) * 0.01,
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
    description: `Challenge description ${id}`,
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

// --------------------------------------------------------------------------
// Render helper
// --------------------------------------------------------------------------

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
}

function renderView() {
  const qc = createTestQueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/games/g1/bases-and-challenges"]}>
        <Routes>
          <Route path="/games/:gameId/bases-and-challenges" element={<BasesAndChallengesView />} />
          {/* Stub routes so the "Manage bases" etc. links resolve in MemoryRouter. */}
          <Route path="/games/:gameId/bases" element={<div>bases page</div>} />
          <Route path="/games/:gameId/challenges" element={<div>challenges page</div>} />
          <Route path="/games/:gameId/assignments" element={<div>assignments page</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// --------------------------------------------------------------------------
// Pure aggregation tests
// --------------------------------------------------------------------------

describe("aggregateBasesAndChallenges", () => {
  it("pairs each base with its fixed challenge", () => {
    const bases = [makeBase("b1", { fixedChallengeId: "c1" })];
    const challenges = [makeChallenge("c1")];
    const out = aggregateBasesAndChallenges(bases, challenges);
    expect(out.pairs).toHaveLength(1);
    expect(out.pairs[0].base.id).toBe("b1");
    expect(out.pairs[0].challenge.id).toBe("c1");
    expect(out.unpairedBases).toHaveLength(0);
    expect(out.orphanedChallenges).toHaveLength(0);
  });

  it("separates unpaired bases and orphaned challenges", () => {
    const bases = [
      makeBase("b1", { fixedChallengeId: "c1" }),
      makeBase("b2"),
    ];
    const challenges = [makeChallenge("c1"), makeChallenge("c2")];
    const out = aggregateBasesAndChallenges(bases, challenges);
    expect(out.pairs.map((p) => p.base.id)).toEqual(["b1"]);
    expect(out.unpairedBases.map((b) => b.id)).toEqual(["b2"]);
    expect(out.orphanedChallenges.map((c) => c.id)).toEqual(["c2"]);
  });

  it("flags bases whose fixedChallengeId points at a missing challenge", () => {
    const bases = [makeBase("b1", { fixedChallengeId: "missing" })];
    const challenges: Challenge[] = [];
    const out = aggregateBasesAndChallenges(bases, challenges);
    expect(out.pairs).toHaveLength(0);
    expect(out.danglingBases.map((b) => b.id)).toEqual(["b1"]);
  });
});

// --------------------------------------------------------------------------
// View rendering tests
// --------------------------------------------------------------------------

describe("BasesAndChallengesView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the empty state when there are no bases or challenges", async () => {
    vi.mocked(basesApi.listByGame).mockResolvedValue([]);
    vi.mocked(challengesApi.listByGame).mockResolvedValue([]);

    renderView();

    await waitFor(() => {
      expect(screen.getByTestId("bases-and-challenges-empty")).toBeTruthy();
    });
    // No pair section is rendered when bases are empty.
    expect(screen.queryByTestId("pair-section")).toBeNull();
  });

  it("renders a mix of paired bases, unpaired bases, and orphaned challenges", async () => {
    vi.mocked(basesApi.listByGame).mockResolvedValue([
      makeBase("b1", { fixedChallengeId: "c1" }),
      makeBase("b2"),
    ]);
    vi.mocked(challengesApi.listByGame).mockResolvedValue([
      makeChallenge("c1", { title: "Tied-up challenge" }),
      makeChallenge("c2", { title: "Orphan challenge" }),
    ]);

    renderView();

    await waitFor(() => {
      expect(screen.getByTestId("pair-card-b1")).toBeTruthy();
    });
    // Pair card shows both names
    const pairCard = screen.getByTestId("pair-card-b1");
    expect(within(pairCard).getByText("Base b1")).toBeTruthy();
    expect(within(pairCard).getByText("Tied-up challenge")).toBeTruthy();

    // Unpaired base card present
    expect(screen.getByTestId("unpaired-base-b2")).toBeTruthy();

    // Orphaned challenge section present with the orphan
    const orphanSection = screen.getByTestId("orphaned-challenges-section");
    expect(within(orphanSection).getByText("Orphan challenge")).toBeTruthy();
  });

  it("opens the unified edit dialog with the correct pair data", async () => {
    vi.mocked(basesApi.listByGame).mockResolvedValue([
      makeBase("b1", { fixedChallengeId: "c1", name: "Alpha base", description: "Alpha desc" }),
    ]);
    vi.mocked(challengesApi.listByGame).mockResolvedValue([
      makeChallenge("c1", { title: "Alpha challenge", points: 250 }),
    ]);

    renderView();

    await waitFor(() => {
      expect(screen.getByTestId("pair-edit-btn-b1")).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("pair-edit-btn-b1"));

    await waitFor(() => {
      expect(screen.getByTestId("unified-edit-dialog")).toBeTruthy();
    });

    const baseNameInput = screen.getByTestId("unified-base-name-input") as HTMLInputElement;
    expect(baseNameInput.value).toBe("Alpha base");
    const challengeTitleInput = screen.getByTestId("unified-challenge-title-input") as HTMLInputElement;
    expect(challengeTitleInput.value).toBe("Alpha challenge");
  });

  it("saves the pair via two sequential mutations", async () => {
    vi.mocked(basesApi.listByGame).mockResolvedValue([
      makeBase("b1", { fixedChallengeId: "c1" }),
    ]);
    vi.mocked(challengesApi.listByGame).mockResolvedValue([makeChallenge("c1")]);

    // Capture the call order: base must happen before challenge.
    const callOrder: string[] = [];
    vi.mocked(basesApi.update).mockImplementation(async (id) => {
      callOrder.push(`base:${id}`);
      return makeBase("b1", { fixedChallengeId: "c1", name: "Renamed base" });
    });
    vi.mocked(challengesApi.update).mockImplementation(async (id) => {
      callOrder.push(`challenge:${id}`);
      return makeChallenge("c1", { title: "Renamed challenge" });
    });

    renderView();

    await waitFor(() => {
      expect(screen.getByTestId("pair-edit-btn-b1")).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId("pair-edit-btn-b1"));

    await waitFor(() => {
      expect(screen.getByTestId("unified-edit-dialog")).toBeTruthy();
    });

    // Rename both
    fireEvent.change(screen.getByTestId("unified-base-name-input"), {
      target: { value: "Renamed base" },
    });
    fireEvent.change(screen.getByTestId("unified-challenge-title-input"), {
      target: { value: "Renamed challenge" },
    });

    fireEvent.click(screen.getByTestId("unified-save-btn"));

    await waitFor(() => {
      expect(basesApi.update).toHaveBeenCalledTimes(1);
      expect(challengesApi.update).toHaveBeenCalledTimes(1);
    });

    expect(callOrder).toEqual(["base:b1", "challenge:c1"]);

    // Both payloads carry the expected gameId + new names.
    const baseCall = vi.mocked(basesApi.update).mock.calls[0];
    expect(baseCall[0]).toBe("b1");
    expect(baseCall[1].gameId).toBe("g1");
    expect(baseCall[1].name).toBe("Renamed base");
    expect(baseCall[1].fixedChallengeId).toBe("c1");

    const challengeCall = vi.mocked(challengesApi.update).mock.calls[0];
    expect(challengeCall[0]).toBe("c1");
    expect(challengeCall[1].gameId).toBe("g1");
    expect(challengeCall[1].title).toBe("Renamed challenge");
  });

  // P1 Phase 4 W2 — operator-only challenge notes.
  it("renders the operator notes textarea populated from the challenge data", async () => {
    vi.mocked(basesApi.listByGame).mockResolvedValue([
      makeBase("b1", { fixedChallengeId: "c1" }),
    ]);
    vi.mocked(challengesApi.listByGame).mockResolvedValue([
      makeChallenge("c1", { operatorNotes: "Radio the trail lead before starting" }),
    ]);

    renderView();

    await waitFor(() => {
      expect(screen.getByTestId("pair-edit-btn-b1")).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId("pair-edit-btn-b1"));

    await waitFor(() => {
      expect(screen.getByTestId("unified-edit-dialog")).toBeTruthy();
    });

    const operatorNotes = screen.getByTestId(
      "unified-challenge-operator-notes-input",
    ) as HTMLTextAreaElement;
    expect(operatorNotes).toBeTruthy();
    expect(operatorNotes.value).toBe("Radio the trail lead before starting");
  });

  it("persists edits to operator notes through the challenge update call", async () => {
    vi.mocked(basesApi.listByGame).mockResolvedValue([
      makeBase("b1", { fixedChallengeId: "c1" }),
    ]);
    vi.mocked(challengesApi.listByGame).mockResolvedValue([
      makeChallenge("c1", { operatorNotes: "" }),
    ]);

    vi.mocked(basesApi.update).mockResolvedValue(
      makeBase("b1", { fixedChallengeId: "c1" }),
    );
    vi.mocked(challengesApi.update).mockResolvedValue(
      makeChallenge("c1", { operatorNotes: "New private note" }),
    );

    renderView();

    await waitFor(() => {
      expect(screen.getByTestId("pair-edit-btn-b1")).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId("pair-edit-btn-b1"));

    await waitFor(() => {
      expect(screen.getByTestId("unified-edit-dialog")).toBeTruthy();
    });

    fireEvent.change(screen.getByTestId("unified-challenge-operator-notes-input"), {
      target: { value: "New private note" },
    });
    fireEvent.click(screen.getByTestId("unified-save-btn"));

    await waitFor(() => {
      expect(challengesApi.update).toHaveBeenCalledTimes(1);
    });

    const challengeCall = vi.mocked(challengesApi.update).mock.calls[0];
    expect(challengeCall[1].operatorNotes).toBe("New private note");
  });

  // W3 — color stripe and tag chips on PairCard
  it("renders the color stripe when the base has a color", async () => {
    vi.mocked(basesApi.listByGame).mockResolvedValue([
      makeBase("b1", { fixedChallengeId: "c1", color: "#3b82f6" }),
    ]);
    vi.mocked(challengesApi.listByGame).mockResolvedValue([makeChallenge("c1")]);

    renderView();

    await waitFor(() => {
      expect(screen.getByTestId("pair-card-b1")).toBeTruthy();
    });

    // Fix 15: query by testid instead of fragile [style*="background-color"] selector.
    const stripe = screen.getByTestId("pair-color-stripe");
    expect(stripe).toBeTruthy();
    expect((stripe as HTMLElement).style.backgroundColor).toBe("rgb(59, 130, 246)");
  });

  // Filter bar — Fix 3: BasesAndChallengesView must have a filter bar.
  it("renders the filter bar when pairs have tags", async () => {
    vi.mocked(basesApi.listByGame).mockResolvedValue([
      makeBase("b1", { fixedChallengeId: "c1", tags: ["morning", "staffed"] }),
    ]);
    vi.mocked(challengesApi.listByGame).mockResolvedValue([makeChallenge("c1")]);

    renderView();

    await waitFor(() => {
      expect(screen.getByTestId("filter-tag-morning")).toBeTruthy();
    });
    expect(screen.getByTestId("filter-tag-staffed")).toBeTruthy();
  });

  it("filter bar: clicking a tag chip filters pairs to those matching ALL selected tags (AND semantics)", async () => {
    vi.mocked(basesApi.listByGame).mockResolvedValue([
      makeBase("b1", { fixedChallengeId: "c1", tags: ["morning", "staffed"] }),
      makeBase("b2", { fixedChallengeId: "c2", tags: ["morning"] }),
    ]);
    vi.mocked(challengesApi.listByGame).mockResolvedValue([
      makeChallenge("c1", { title: "Both tags" }),
      makeChallenge("c2", { title: "Morning only" }),
    ]);

    renderView();

    await waitFor(() => {
      expect(screen.getByTestId("filter-tag-morning")).toBeTruthy();
    });

    // Select "morning" — both pairs visible
    fireEvent.click(screen.getByTestId("filter-tag-morning"));
    await waitFor(() => {
      expect(screen.getByTestId("pair-card-b1")).toBeTruthy();
      expect(screen.getByTestId("pair-card-b2")).toBeTruthy();
    });

    // Also select "staffed" — AND semantics: only b1 should remain
    fireEvent.click(screen.getByTestId("filter-tag-staffed"));
    await waitFor(() => {
      expect(screen.getByTestId("pair-card-b1")).toBeTruthy();
    });
    expect(screen.queryByTestId("pair-card-b2")).toBeNull();
  });

  it("filter bar: pair matches if EITHER base OR challenge tags satisfy the filter", async () => {
    vi.mocked(basesApi.listByGame).mockResolvedValue([
      // base has no tags, challenge has "outdoor"
      makeBase("b1", { fixedChallengeId: "c1" }),
    ]);
    vi.mocked(challengesApi.listByGame).mockResolvedValue([
      makeChallenge("c1", { title: "Outdoor challenge", tags: ["outdoor"] }),
    ]);

    renderView();

    await waitFor(() => {
      expect(screen.getByTestId("filter-tag-outdoor")).toBeTruthy();
    });

    // Clicking "outdoor" should still show pair-card-b1 because the challenge matches
    fireEvent.click(screen.getByTestId("filter-tag-outdoor"));
    await waitFor(() => {
      expect(screen.getByTestId("pair-card-b1")).toBeTruthy();
    });
  });

  it("renders tag chips for both base tags and challenge tags on a PairCard", async () => {
    vi.mocked(basesApi.listByGame).mockResolvedValue([
      makeBase("b1", { fixedChallengeId: "c1", tags: ["autonomous", "morning"] }),
    ]);
    vi.mocked(challengesApi.listByGame).mockResolvedValue([
      makeChallenge("c1", { tags: ["outdoor"] }),
    ]);

    renderView();

    await waitFor(() => {
      expect(screen.getByTestId("pair-card-b1")).toBeTruthy();
    });

    const card = screen.getByTestId("pair-card-b1");
    expect(card.textContent).toContain("autonomous");
    expect(card.textContent).toContain("morning");
    expect(card.textContent).toContain("outdoor");
  });

  it("renders the has-notes indicator when challenge has operator notes", async () => {
    vi.mocked(basesApi.listByGame).mockResolvedValue([
      makeBase("b1", { fixedChallengeId: "c1" }),
    ]);
    vi.mocked(challengesApi.listByGame).mockResolvedValue([
      makeChallenge("c1", { operatorNotes: "Accept any city name" }),
    ]);

    renderView();

    await waitFor(() => {
      expect(screen.getByTestId("pair-challenge-has-notes-b1")).toBeTruthy();
    });
  });

  it("does NOT render the has-notes indicator when challenge has no operator notes", async () => {
    vi.mocked(basesApi.listByGame).mockResolvedValue([
      makeBase("b1", { fixedChallengeId: "c1" }),
    ]);
    vi.mocked(challengesApi.listByGame).mockResolvedValue([
      makeChallenge("c1", { operatorNotes: undefined }),
    ]);

    renderView();

    await waitFor(() => {
      expect(screen.getByTestId("pair-card-b1")).toBeTruthy();
    });

    expect(screen.queryByTestId("pair-challenge-has-notes-b1")).toBeNull();
  });

  // Wave 3b — lazy-loaded MapPicker and RichTextEditor in the edit dialog.
  it("renders MapPicker stub in the edit dialog when editing a base with coordinates", async () => {
    vi.mocked(basesApi.listByGame).mockResolvedValue([
      makeBase("b1", { fixedChallengeId: "c1", lat: 48.8, lng: 2.35 }),
    ]);
    vi.mocked(challengesApi.listByGame).mockResolvedValue([makeChallenge("c1")]);

    renderView();

    await waitFor(() => {
      expect(screen.getByTestId("pair-edit-btn-b1")).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId("pair-edit-btn-b1"));

    await waitFor(() => {
      expect(screen.getByTestId("unified-edit-dialog")).toBeTruthy();
    });

    // MapPicker stub should be rendered (lazy chunk resolved synchronously in test)
    await waitFor(() => {
      expect(screen.getByTestId("map-picker-stub")).toBeTruthy();
    });
    expect(screen.getByTestId("map-picker-lat").textContent).toBe("48.8");
    expect(screen.getByTestId("map-picker-lng").textContent).toBe("2.35");
  });

  it("updates lat/lng state when MapPicker fires onChange", async () => {
    vi.mocked(basesApi.listByGame).mockResolvedValue([
      makeBase("b1", { fixedChallengeId: "c1", lat: 48.8, lng: 2.35 }),
    ]);
    vi.mocked(challengesApi.listByGame).mockResolvedValue([makeChallenge("c1")]);
    vi.mocked(basesApi.update).mockResolvedValue(makeBase("b1", { fixedChallengeId: "c1" }));
    vi.mocked(challengesApi.update).mockResolvedValue(makeChallenge("c1"));

    renderView();

    await waitFor(() => {
      expect(screen.getByTestId("pair-edit-btn-b1")).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId("pair-edit-btn-b1"));

    await waitFor(() => {
      expect(screen.getByTestId("map-picker-stub")).toBeTruthy();
    });

    // Simulate the operator clicking the map to move the pin
    fireEvent.click(screen.getByTestId("map-picker-move"));

    // The number inputs should reflect the new values
    await waitFor(() => {
      const latInput = screen.getByTestId("unified-base-lat-input") as HTMLInputElement;
      expect(latInput.value).toBe("51.5");
      const lngInput = screen.getByTestId("unified-base-lng-input") as HTMLInputElement;
      expect(lngInput.value).toBe("-0.1");
    });
  });

  it("renders RichTextEditor stub in the edit dialog for challenge content", async () => {
    vi.mocked(basesApi.listByGame).mockResolvedValue([
      makeBase("b1", { fixedChallengeId: "c1" }),
    ]);
    vi.mocked(challengesApi.listByGame).mockResolvedValue([
      makeChallenge("c1", { content: "<p>Solve this puzzle</p>" }),
    ]);

    renderView();

    await waitFor(() => {
      expect(screen.getByTestId("pair-edit-btn-b1")).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId("pair-edit-btn-b1"));

    await waitFor(() => {
      expect(screen.getByTestId("unified-edit-dialog")).toBeTruthy();
    });

    // RichTextEditor stubs should be rendered (content + completionContent = 2)
    await waitFor(() => {
      const editors = screen.getAllByTestId("rich-text-editor-stub");
      expect(editors.length).toBeGreaterThanOrEqual(1);
    });

    const editors = screen.getAllByTestId("rich-text-editor-stub");
    // First editor is the content field
    expect((editors[0] as HTMLTextAreaElement).value).toBe("<p>Solve this puzzle</p>");

    // Helper text for completion content is rendered unconditionally below the label
    expect(screen.getByText("Shown to players after they finish this challenge.")).toBeTruthy();
  });

  it("persists rich-text content changes through the challenge update call", async () => {
    vi.mocked(basesApi.listByGame).mockResolvedValue([
      makeBase("b1", { fixedChallengeId: "c1" }),
    ]);
    vi.mocked(challengesApi.listByGame).mockResolvedValue([
      makeChallenge("c1", { content: "<p>Old content</p>" }),
    ]);
    vi.mocked(basesApi.update).mockResolvedValue(makeBase("b1", { fixedChallengeId: "c1" }));
    vi.mocked(challengesApi.update).mockResolvedValue(makeChallenge("c1"));

    renderView();

    await waitFor(() => {
      expect(screen.getByTestId("pair-edit-btn-b1")).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId("pair-edit-btn-b1"));

    await waitFor(() => {
      expect(screen.getAllByTestId("rich-text-editor-stub").length).toBeGreaterThanOrEqual(1);
    });

    const editors = screen.getAllByTestId("rich-text-editor-stub");
    // Edit the content field (first editor)
    fireEvent.change(editors[0], { target: { value: "<p><strong>New rich content</strong></p>" } });

    fireEvent.click(screen.getByTestId("unified-save-btn"));

    await waitFor(() => {
      expect(challengesApi.update).toHaveBeenCalledTimes(1);
    });

    const challengeCall = vi.mocked(challengesApi.update).mock.calls[0];
    expect(challengeCall[1].content).toBe("<p><strong>New rich content</strong></p>");
  });

  // correctAnswer multi-input — mirrors ChallengesPage pattern
  it("shows multi-answer input when answerType=text and autoValidate is on", async () => {
    vi.mocked(basesApi.listByGame).mockResolvedValue([
      makeBase("b1", { fixedChallengeId: "c1" }),
    ]);
    vi.mocked(challengesApi.listByGame).mockResolvedValue([
      makeChallenge("c1", { answerType: "text", autoValidate: false }),
    ]);

    renderView();

    await waitFor(() => {
      expect(screen.getByTestId("pair-edit-btn-b1")).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId("pair-edit-btn-b1"));

    await waitFor(() => {
      expect(screen.getByTestId("unified-edit-dialog")).toBeTruthy();
    });

    // autoValidate is off — multi-answer input must NOT be visible yet
    expect(screen.queryByTestId("unified-correct-answer-input-0")).toBeNull();

    // Toggle autoValidate on via the switch (label text "Auto-validate")
    const autoValidateSwitch = screen.getByRole("switch", { name: /auto.?validate/i });
    fireEvent.click(autoValidateSwitch);

    // Now the first answer input should appear
    await waitFor(() => {
      expect(screen.getByTestId("unified-correct-answer-input-0")).toBeTruthy();
    });

    // Type first answer
    fireEvent.change(screen.getByTestId("unified-correct-answer-input-0"), {
      target: { value: "Lisbon" },
    });

    // Add a second answer
    fireEvent.click(screen.getByTestId("unified-correct-answer-add-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("unified-correct-answer-input-1")).toBeTruthy();
    });

    fireEvent.change(screen.getByTestId("unified-correct-answer-input-1"), {
      target: { value: "Lisboa" },
    });

    // Save
    vi.mocked(basesApi.update).mockResolvedValue(makeBase("b1", { fixedChallengeId: "c1" }));
    vi.mocked(challengesApi.update).mockResolvedValue(makeChallenge("c1"));

    fireEvent.click(screen.getByTestId("unified-save-btn"));

    await waitFor(() => {
      expect(challengesApi.update).toHaveBeenCalledTimes(1);
    });

    const challengeCall = vi.mocked(challengesApi.update).mock.calls[0];
    expect(challengeCall[1].correctAnswer).toEqual(["Lisbon", "Lisboa"]);
  });

  it("does NOT call challenge update when the base update fails", async () => {
    vi.mocked(basesApi.listByGame).mockResolvedValue([
      makeBase("b1", { fixedChallengeId: "c1" }),
    ]);
    vi.mocked(challengesApi.listByGame).mockResolvedValue([makeChallenge("c1")]);

    vi.mocked(basesApi.update).mockRejectedValue(new Error("boom"));
    vi.mocked(challengesApi.update).mockResolvedValue(makeChallenge("c1"));

    renderView();

    await waitFor(() => {
      expect(screen.getByTestId("pair-edit-btn-b1")).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId("pair-edit-btn-b1"));

    await waitFor(() => {
      expect(screen.getByTestId("unified-edit-dialog")).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("unified-save-btn"));

    await waitFor(() => {
      expect(basesApi.update).toHaveBeenCalledTimes(1);
    });

    // Crucially: the challenge update is never reached.
    expect(challengesApi.update).not.toHaveBeenCalled();

    // Dialog stays open so the operator can retry.
    expect(screen.getByTestId("unified-edit-dialog")).toBeTruthy();
  });
});
