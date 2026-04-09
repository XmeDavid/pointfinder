/**
 * Component tests for ChallengesPage Sub-wave C: dialog-level jump + URL param auto-open.
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

import { ChallengesPage } from "../ChallengesPage";
import type { Base, Challenge, Assignment } from "@/types";

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

vi.mock("@/components/common/RichTextEditor", () => ({
  RichTextEditor: ({ value, onChange }: { value: string; onChange: (html: string) => void }) => (
    <textarea
      data-testid="rich-text-editor-stub"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

vi.mock("@hello-pangea/dnd", () => ({
  DragDropContext: ({ children }: { children: unknown }) => children,
  Droppable: ({ children }: { children: (p: { droppableProps: object; innerRef: () => void; placeholder: null }, s: { isDraggingOver: boolean }) => unknown }) =>
    children({ droppableProps: {}, innerRef: () => {}, placeholder: null }, { isDraggingOver: false }),
  Draggable: ({ children }: { children: (p: { draggableProps: object; dragHandleProps: null; innerRef: () => void }, s: { isDragging: boolean }) => unknown }) =>
    children({ draggableProps: {}, dragHandleProps: null, innerRef: () => {} }, { isDragging: false }),
}));

vi.mock("dompurify", () => ({ default: { sanitize: (s: string) => s } }));

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
          <Route path="/games/:gameId/challenges" element={<ChallengesPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function renderPage() {
  return renderPageAtUrl("/games/g1/challenges");
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ChallengesPage Sub-wave C — URL param auto-open", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    navigateMock.mockReset();
  });

  it("opens the edit dialog when mounted with ?edit={validId}", async () => {
    vi.mocked(challengesApi.listByGame).mockResolvedValue([
      makeChallenge("c1", { title: "Find the Red Door" }),
    ]);
    vi.mocked(basesApi.listByGame).mockResolvedValue([]);
    vi.mocked(assignmentsApi.listByGame).mockResolvedValue([]);

    renderPageAtUrl("/games/g1/challenges?edit=c1");

    // The edit dialog opens — the title input should be populated with "Find the Red Door"
    await waitFor(() =>
      expect(screen.getByTestId("challenge-title-input")).toBeTruthy(),
    );
    const input = screen.getByTestId("challenge-title-input") as HTMLInputElement;
    expect(input.value).toBe("Find the Red Door");
  });

  it("does NOT open a dialog when ?edit={unknownId} — graceful orphan handling", async () => {
    vi.mocked(challengesApi.listByGame).mockResolvedValue([
      makeChallenge("c1", { title: "Solo Challenge" }),
    ]);
    vi.mocked(basesApi.listByGame).mockResolvedValue([]);
    vi.mocked(assignmentsApi.listByGame).mockResolvedValue([]);

    renderPageAtUrl("/games/g1/challenges?edit=does-not-exist");

    // Wait for data to load
    await waitFor(() => expect(screen.getByText("Solo Challenge")).toBeTruthy());

    // No dialog should be open
    expect(screen.queryByTestId("challenge-title-input")).toBeNull();
  });
});

describe("ChallengesPage Sub-wave C — dialog jump button", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    navigateMock.mockReset();
  });

  // Helper: set up one challenge linked to one base and open edit dialog
  async function openEditDialog() {
    vi.mocked(challengesApi.listByGame).mockResolvedValue([
      makeChallenge("c1", { title: "Find the Red Door" }),
    ]);
    vi.mocked(basesApi.listByGame).mockResolvedValue([
      makeBase("b1", { name: "Station Alpha" }),
    ]);
    vi.mocked(assignmentsApi.listByGame).mockResolvedValue([
      makeAssignment("a1", "b1", "c1"),
    ]);

    renderPage();

    await waitFor(() => expect(screen.getByText("Find the Red Door")).toBeTruthy());

    const editBtn = screen.getByRole("button", { name: /edit/i });
    fireEvent.click(editBtn);

    await waitFor(() =>
      expect(screen.getByTestId("challenge-dialog-jump-to-base")).toBeTruthy(),
    );
  }

  it("jump button absent when editing challenge has no linked bases", async () => {
    vi.mocked(challengesApi.listByGame).mockResolvedValue([
      makeChallenge("c1", { title: "Isolated Challenge" }),
    ]);
    vi.mocked(basesApi.listByGame).mockResolvedValue([makeBase("b1")]);
    vi.mocked(assignmentsApi.listByGame).mockResolvedValue([]);

    renderPage();

    await waitFor(() => expect(screen.getByText("Isolated Challenge")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /edit/i }));

    await waitFor(() => expect(screen.getByTestId("challenge-title-input")).toBeTruthy());

    expect(screen.queryByTestId("challenge-dialog-jump-to-base")).toBeNull();
  });

  it("clean form + single link → jump fires navigate() to bases page without confirm", async () => {
    await openEditDialog();

    fireEvent.click(screen.getByTestId("challenge-dialog-jump-to-base"));

    // No confirm dialog, navigate fires immediately
    expect(screen.queryByText("Discard unsaved changes and jump?")).toBeNull();
    expect(navigateMock).toHaveBeenCalledWith("/games/g1/bases?edit=b1");
  });

  it("dirty form + single link → confirm dialog appears; cancel keeps dialog open", async () => {
    await openEditDialog();

    // Make form dirty
    const titleInput = screen.getByTestId("challenge-title-input");
    fireEvent.change(titleInput, { target: { value: "Find the Red Door at Dusk" } });

    fireEvent.click(screen.getByTestId("challenge-dialog-jump-to-base"));

    await waitFor(() =>
      expect(screen.getByText("Discard unsaved changes and jump?")).toBeTruthy(),
    );

    // Click cancel inside the confirm dialog (scoped to avoid hitting edit dialog's Cancel)
    const confirmDialog = screen.getByRole("dialog", { name: "Discard unsaved changes and jump?" });
    const cancelBtn = within(confirmDialog).getByRole("button", { name: /cancel/i });
    fireEvent.click(cancelBtn);

    expect(navigateMock).not.toHaveBeenCalled();

    // Edit dialog still open
    await waitFor(() => expect(screen.getByTestId("challenge-title-input")).toBeTruthy());
  });

  it("dirty form + single link → confirm discard → navigate() fires", async () => {
    await openEditDialog();

    // Make form dirty
    const titleInput = screen.getByTestId("challenge-title-input");
    fireEvent.change(titleInput, { target: { value: "Find the Red Door at Dusk" } });

    fireEvent.click(screen.getByTestId("challenge-dialog-jump-to-base"));

    await waitFor(() =>
      expect(screen.getByText("Discard unsaved changes and jump?")).toBeTruthy(),
    );

    const discardBtn = screen.getByRole("button", { name: /discard/i });
    fireEvent.click(discardBtn);

    expect(navigateMock).toHaveBeenCalledWith("/games/g1/bases?edit=b1");
  });

  it("multi-link dialog → picker opens; selecting item fires navigate()", async () => {
    vi.mocked(challengesApi.listByGame).mockResolvedValue([
      makeChallenge("c1", { title: "Wide Challenge" }),
    ]);
    vi.mocked(basesApi.listByGame).mockResolvedValue([
      makeBase("b1", { name: "Alpha Base" }),
      makeBase("b2", { name: "Beta Base" }),
    ]);
    vi.mocked(assignmentsApi.listByGame).mockResolvedValue([
      makeAssignment("a1", "b1", "c1"),
      makeAssignment("a2", "b2", "c1"),
    ]);

    renderPage();

    await waitFor(() => expect(screen.getByText("Wide Challenge")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /edit/i }));

    await waitFor(() =>
      expect(screen.getByTestId("challenge-dialog-jump-to-base")).toBeTruthy(),
    );

    // Click picker button
    fireEvent.click(screen.getByTestId("challenge-dialog-jump-to-base"));

    await waitFor(() =>
      expect(screen.getByTestId("challenge-dialog-jump-to-base-picker")).toBeTruthy(),
    );

    // Select b1
    fireEvent.click(screen.getByTestId("challenge-dialog-jump-to-base-picker-item-b1"));

    expect(navigateMock).toHaveBeenCalledWith("/games/g1/bases?edit=b1");
  });
});
