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
