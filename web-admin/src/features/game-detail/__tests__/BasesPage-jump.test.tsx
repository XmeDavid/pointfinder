/**
 * Component tests for BasesPage Sub-wave C: dialog-level jump + URL param auto-open.
 *
 * Tests cover:
 *   - URL ?edit={validId} → edit dialog opens; URL is scrubbed
 *   - URL ?edit={unknownId} → dialog does NOT open; URL is scrubbed (graceful)
 *   - Dialog jump single link, clean form → no prompt, navigate() fires
 *   - Dialog jump single link, dirty form → confirm prompt; cancel → stays; discard → navigate()
 *   - Dialog jump multi-link → picker appears; selecting one fires navigate()
 */

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { BasesPage } from "../BasesPage";
import type { Base, Challenge, Assignment } from "@/types";

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

function makeAssignment(id: string, baseId: string, challengeId: string): Assignment {
  return { id, gameId: "g1", baseId, challengeId };
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

const navigateMock = vi.fn();

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

function renderPageAtUrl(path: string) {
  const qc = createTestQueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/games/:gameId/bases" element={<BasesPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function renderPage() {
  return renderPageAtUrl("/games/g1/bases");
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("BasesPage Sub-wave C — URL param auto-open", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    navigateMock.mockReset();
  });

  it("opens the edit dialog when mounted with ?edit={validId}", async () => {
    vi.mocked(basesApi.listByGame).mockResolvedValue([makeBase("b1", { name: "Praça" })]);
    vi.mocked(challengesApi.listByGame).mockResolvedValue([]);
    vi.mocked(assignmentsApi.listByGame).mockResolvedValue([]);

    renderPageAtUrl("/games/g1/bases?edit=b1");

    // The edit dialog for b1 should open — header title "Edit Base" and the name input populated
    await waitFor(() =>
      expect(screen.getByTestId("base-name-input")).toBeTruthy(),
    );
    const input = screen.getByTestId("base-name-input") as HTMLInputElement;
    expect(input.value).toBe("Praça");
  });

  it("does NOT open a dialog when ?edit={unknownId} — graceful orphan handling", async () => {
    vi.mocked(basesApi.listByGame).mockResolvedValue([makeBase("b1")]);
    vi.mocked(challengesApi.listByGame).mockResolvedValue([]);
    vi.mocked(assignmentsApi.listByGame).mockResolvedValue([]);

    renderPageAtUrl("/games/g1/bases?edit=does-not-exist");

    // Wait for data to load (base card appears)
    await waitFor(() => expect(screen.getByText("Base b1")).toBeTruthy());

    // No dialog should be open
    expect(screen.queryByTestId("base-name-input")).toBeNull();
  });
});

describe("BasesPage Sub-wave C — dialog jump button", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    navigateMock.mockReset();
  });

  // Helper: open the edit dialog for b1 via the pencil button
  async function openEditDialog() {
    vi.mocked(basesApi.listByGame).mockResolvedValue([makeBase("b1")]);
    vi.mocked(challengesApi.listByGame).mockResolvedValue([
      makeChallenge("c1", { title: "Guess the Landmark" }),
    ]);
    vi.mocked(assignmentsApi.listByGame).mockResolvedValue([
      makeAssignment("a1", "b1", "c1"),
    ]);

    renderPage();

    await waitFor(() => expect(screen.getByText("Base b1")).toBeTruthy());

    // Click edit pencil
    const editBtn = screen.getByRole("button", { name: /edit/i });
    fireEvent.click(editBtn);

    await waitFor(() =>
      expect(screen.getByTestId("base-dialog-jump-to-challenge")).toBeTruthy(),
    );
  }

  it("jump button absent when editing base has no linked challenges", async () => {
    vi.mocked(basesApi.listByGame).mockResolvedValue([makeBase("b1")]);
    vi.mocked(challengesApi.listByGame).mockResolvedValue([makeChallenge("c1")]);
    vi.mocked(assignmentsApi.listByGame).mockResolvedValue([]);

    renderPage();

    await waitFor(() => expect(screen.getByText("Base b1")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /edit/i }));

    await waitFor(() => expect(screen.getByTestId("base-name-input")).toBeTruthy());

    expect(screen.queryByTestId("base-dialog-jump-to-challenge")).toBeNull();
  });

  it("clean form + single link → jump fires navigate() without confirm", async () => {
    await openEditDialog();

    // Form is clean (not dirty) — click jump
    fireEvent.click(screen.getByTestId("base-dialog-jump-to-challenge"));

    // No confirm dialog, navigate called immediately
    expect(screen.queryByRole("dialog", { name: /discard/i })).toBeNull();
    expect(navigateMock).toHaveBeenCalledWith("/games/g1/challenges?edit=c1");
  });

  it("dirty form + single link → confirm dialog appears; cancel keeps dialog open", async () => {
    await openEditDialog();

    // Make form dirty by changing the name
    const nameInput = screen.getByTestId("base-name-input");
    fireEvent.change(nameInput, { target: { value: "Modified Name" } });

    // Click jump
    fireEvent.click(screen.getByTestId("base-dialog-jump-to-challenge"));

    // Confirm dialog should appear
    await waitFor(() =>
      expect(screen.getByText("Discard unsaved changes and jump?")).toBeTruthy(),
    );

    // Click cancel inside the confirm dialog (scoped to avoid hitting edit dialog's Cancel)
    const confirmDialog = screen.getByRole("dialog", { name: "Discard unsaved changes and jump?" });
    const cancelBtn = within(confirmDialog).getByRole("button", { name: /cancel/i });
    fireEvent.click(cancelBtn);

    // Navigate should NOT have been called
    expect(navigateMock).not.toHaveBeenCalled();

    // Edit dialog still open (name input still present)
    await waitFor(() => expect(screen.getByTestId("base-name-input")).toBeTruthy());
  });

  it("dirty form + single link → confirm discard → navigate() fires", async () => {
    await openEditDialog();

    // Make form dirty
    const nameInput = screen.getByTestId("base-name-input");
    fireEvent.change(nameInput, { target: { value: "Dirty Change" } });

    // Click jump
    fireEvent.click(screen.getByTestId("base-dialog-jump-to-challenge"));

    // Wait for confirm dialog
    await waitFor(() =>
      expect(screen.getByText("Discard unsaved changes and jump?")).toBeTruthy(),
    );

    // Click "Discard" confirm button
    const discardBtn = screen.getByRole("button", { name: /discard/i });
    fireEvent.click(discardBtn);

    // Navigate called with the correct target
    expect(navigateMock).toHaveBeenCalledWith("/games/g1/challenges?edit=c1");
  });

  it("multi-link dialog → picker opens; selecting item fires navigate()", async () => {
    vi.mocked(basesApi.listByGame).mockResolvedValue([makeBase("b1")]);
    vi.mocked(challengesApi.listByGame).mockResolvedValue([
      makeChallenge("c1", { title: "Alpha" }),
      makeChallenge("c2", { title: "Beta" }),
    ]);
    vi.mocked(assignmentsApi.listByGame).mockResolvedValue([
      makeAssignment("a1", "b1", "c1"),
      makeAssignment("a2", "b1", "c2"),
    ]);

    renderPage();

    await waitFor(() => expect(screen.getByText("Base b1")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /edit/i }));

    await waitFor(() =>
      expect(screen.getByTestId("base-dialog-jump-to-challenge")).toBeTruthy(),
    );

    // Click the jump picker button
    fireEvent.click(screen.getByTestId("base-dialog-jump-to-challenge"));

    // Picker should appear
    await waitFor(() =>
      expect(screen.getByTestId("base-dialog-jump-to-challenge-picker")).toBeTruthy(),
    );

    // Select the second challenge (Beta = c2)
    fireEvent.click(screen.getByTestId("base-dialog-jump-to-challenge-picker-item-c2"));

    expect(navigateMock).toHaveBeenCalledWith("/games/g1/challenges?edit=c2");
  });
});
