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
    getOperators: vi.fn(),
    removeOperator: vi.fn(),
  },
}));

vi.mock("@/lib/api/invites", () => ({
  invitesApi: {
    listByGame: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("@/hooks/useToast", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

// useAuthStore is used to determine if the current user can kick operators.
// Default: admin user who can always kick.
vi.mock("@/hooks/useAuth", () => ({
  useAuthStore: vi.fn(() => ({
    user: { id: "op1", email: "op1@test.com", name: "Op One", role: "admin", createdAt: "2026-01-01T00:00:00Z" },
  })),
}));

import { gamesApi } from "@/lib/api/games";
import { invitesApi } from "@/lib/api/invites";
import { useAuthStore } from "@/hooks/useAuth";
import { GameOperatorsPage } from "../GameOperatorsPage";
import type { Game, User, OperatorInvite } from "@/types";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    id: "g1",
    name: "Spring Rally",
    description: "",
    status: "setup",
    startDate: null,
    endDate: null,
    createdBy: "op1",
    operatorIds: ["op1"],
    uniformAssignment: false,
    broadcastEnabled: false,
    broadcastCode: null,
    tileSource: "osm-classic",
    unlockTrigger: "CHECK_IN",
    ...overrides,
  };
}

function makeOperator(id: string, overrides: Partial<User> = {}): User {
  return {
    id,
    email: `${id}@test.com`,
    name: `Operator ${id}`,
    role: "operator",
    createdAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeInvite(id: string, overrides: Partial<OperatorInvite> = {}): OperatorInvite {
  return {
    id,
    gameId: "g1",
    email: `invite-${id}@test.com`,
    status: "pending",
    invitedBy: "op1",
    createdAt: "2026-06-01T09:00:00Z",
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

function renderPage(game = makeGame()) {
  const qc = createTestQueryClient();
  vi.mocked(gamesApi.getById).mockResolvedValue(game);
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/games/g1/operators"]}>
        <Routes>
          <Route path="/games/:gameId/operators" element={<GameOperatorsPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GameOperatorsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset useAuthStore to the default admin user after any per-test override.
    vi.mocked(useAuthStore).mockReturnValue({
      user: { id: "op1", email: "op1@test.com", name: "Op One", role: "admin", createdAt: "2026-01-01T00:00:00Z" },
    } as ReturnType<typeof useAuthStore>);
    vi.mocked(gamesApi.getOperators).mockResolvedValue([]);
    vi.mocked(invitesApi.listByGame).mockResolvedValue([]);
  });

  // ── Smoke / loading guard ─────────────────────────────────────────────────

  it("renders nothing while game data has not loaded", () => {
    vi.mocked(gamesApi.getById).mockReturnValue(new Promise(() => {}));
    const { container } = renderPage();
    expect(container.firstChild).toBeNull();
  });

  // ── Page structure ────────────────────────────────────────────────────────

  it("renders the game operators page heading", async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1 })).toBeTruthy();
    });
  });

  it("renders the invite operator button", async () => {
    renderPage();

    await waitFor(() => {
      const inviteBtns = screen.getAllByRole("button").filter(
        (b) => b.textContent?.toLowerCase().includes("invite"),
      );
      expect(inviteBtns.length).toBeGreaterThan(0);
    });
  });

  // ── Operators list ────────────────────────────────────────────────────────

  it("renders a card for each operator returned by the API", async () => {
    vi.mocked(gamesApi.getOperators).mockResolvedValue([
      makeOperator("op1", { name: "Alice Admin" }),
      makeOperator("op2", { name: "Bob Operator" }),
    ]);
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Alice Admin")).toBeTruthy();
      expect(screen.getByText("Bob Operator")).toBeTruthy();
    });
  });

  it("renders the owner badge for the game creator operator", async () => {
    vi.mocked(gamesApi.getOperators).mockResolvedValue([
      makeOperator("op1", { name: "Alice Admin" }),
    ]);
    renderPage(makeGame({ createdBy: "op1" }));

    await waitFor(() => {
      // Owner badge text comes from i18n key "gameOperators.owner"
      const ownerBadges = screen.queryAllByText(/owner/i);
      expect(ownerBadges.length).toBeGreaterThan(0);
    });
  });

  it("does not show a remove button for the game creator", async () => {
    vi.mocked(gamesApi.getOperators).mockResolvedValue([
      makeOperator("op1", { name: "Creator" }),
    ]);
    renderPage(makeGame({ createdBy: "op1" }));

    await waitFor(() => {
      expect(screen.getByText("Creator")).toBeTruthy();
    });

    // The trash icon button for removing the creator should not be present
    const removeButtons = screen.queryAllByRole("button").filter((b) => {
      const ariaLabel = b.getAttribute("aria-label") ?? "";
      return ariaLabel.toLowerCase().includes("remove") || ariaLabel.toLowerCase().includes("delete");
    });
    // Creator card should have no removable button — only owner badge
    expect(removeButtons.length).toBe(0);
  });

  it("shows a remove button for non-creator operators when user is admin", async () => {
    vi.mocked(gamesApi.getOperators).mockResolvedValue([
      makeOperator("op1", { name: "Creator" }),
      makeOperator("op2", { name: "Assistant" }),
    ]);
    // Current user is admin (op1 is admin in the mock store)
    renderPage(makeGame({ createdBy: "op1" }));

    await waitFor(() => {
      expect(screen.getByText("Assistant")).toBeTruthy();
    });

    // There should be at least one trash/remove button for the non-creator
    const trashButtons = screen.queryAllByRole("button").filter(
      (b) => b.querySelector("svg") !== null && !b.textContent?.toLowerCase().includes("invite"),
    );
    expect(trashButtons.length).toBeGreaterThan(0);
  });

  it("does not show remove buttons when current user is not admin and not the creator", async () => {
    vi.mocked(useAuthStore).mockReturnValue({
      user: { id: "op3", email: "op3@test.com", name: "Op Three", role: "operator", createdAt: "2026-01-01T00:00:00Z" },
    } as ReturnType<typeof useAuthStore>);

    vi.mocked(gamesApi.getOperators).mockResolvedValue([
      makeOperator("op1", { name: "Creator" }),
      makeOperator("op2", { name: "Assistant" }),
    ]);
    renderPage(makeGame({ createdBy: "op1" }));

    await waitFor(() => {
      expect(screen.getByText("Assistant")).toBeTruthy();
    });

    // Non-admin, non-creator: canKick = false → no remove buttons
    const removeButtons = screen.queryAllByRole("button").filter((b) => {
      const ariaLabel = b.getAttribute("aria-label") ?? "";
      return ariaLabel.toLowerCase().includes("remove");
    });
    expect(removeButtons.length).toBe(0);
  });

  // ── Remove operator ───────────────────────────────────────────────────────

  it("opens the remove-operator confirm dialog when the trash button is clicked", async () => {
    vi.mocked(gamesApi.getOperators).mockResolvedValue([
      makeOperator("op1", { name: "Creator" }),
      makeOperator("op2", { name: "To Remove" }),
    ]);
    renderPage(makeGame({ createdBy: "op1" }));

    await waitFor(() => {
      expect(screen.getByText("To Remove")).toBeTruthy();
    });

    // Click the trash icon for the non-creator operator.
    // Ghost icon-only buttons have no text content — that distinguishes them
    // from "Invite Operator" and other labelled buttons.
    const trashButtons = screen.queryAllByRole("button").filter(
      (b) => b.querySelector("svg") !== null && (b.textContent?.trim() ?? "") === "",
    );
    expect(trashButtons.length).toBeGreaterThan(0);
    fireEvent.click(trashButtons[0]);

    // ConfirmDeleteDialog should appear
    await waitFor(() => {
      const dialogBtns = screen.getAllByRole("button");
      const hasCancelOrConfirm = dialogBtns.some(
        (b) =>
          b.textContent?.toLowerCase().includes("cancel") ||
          b.textContent?.toLowerCase().includes("delete") ||
          b.textContent?.toLowerCase().includes("confirm"),
      );
      expect(hasCancelOrConfirm).toBe(true);
    });
  });

  it("calls gamesApi.removeOperator with the operator id on confirm", async () => {
    vi.mocked(gamesApi.getOperators).mockResolvedValue([
      makeOperator("op1", { name: "Creator" }),
      makeOperator("op2", { name: "To Remove" }),
    ]);
    vi.mocked(gamesApi.removeOperator).mockResolvedValue(undefined);
    renderPage(makeGame({ createdBy: "op1" }));

    await waitFor(() => {
      expect(screen.getByText("To Remove")).toBeTruthy();
    });

    // Icon-only ghost buttons have empty text content — distinguishes from labelled buttons.
    const trashButtons = screen.queryAllByRole("button").filter(
      (b) => b.querySelector("svg") !== null && (b.textContent?.trim() ?? "") === "",
    );
    fireEvent.click(trashButtons[0]);

    // ConfirmDeleteDialog renders a "Delete" button (i18n key "common.delete").
    // Wait for the dialog to open, then find the confirm button by its text.
    await waitFor(() => {
      const dialogBtns = screen.getAllByRole("button");
      const confirmBtn = dialogBtns.find(
        (b) =>
          b.textContent?.toLowerCase().includes("delete") ||
          b.textContent?.toLowerCase().includes("confirm"),
      );
      expect(confirmBtn).toBeTruthy();
    });

    const confirmBtn = screen.getAllByRole("button").find(
      (b) =>
        b.textContent?.toLowerCase().includes("delete") ||
        b.textContent?.toLowerCase().includes("confirm"),
    )!;
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(gamesApi.removeOperator).toHaveBeenCalledWith("g1", "op2");
    });
  });

  // ── Invite operator ───────────────────────────────────────────────────────

  it("opens the invite dialog when the invite button is clicked", async () => {
    renderPage();

    await waitFor(() => {
      expect(
        screen.getAllByRole("button").some((b) =>
          b.textContent?.toLowerCase().includes("invite"),
        ),
      ).toBe(true);
    });

    const inviteBtn = screen.getAllByRole("button").find(
      (b) => b.textContent?.toLowerCase().includes("invite"),
    )!;
    fireEvent.click(inviteBtn);

    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: /email/i })).toBeTruthy();
    });
  });

  it("calls invitesApi.create with the entered email when the invite form is submitted", async () => {
    vi.mocked(invitesApi.create).mockResolvedValue(makeInvite("inv-new"));
    renderPage();

    await waitFor(() => {
      expect(
        screen.getAllByRole("button").some((b) =>
          b.textContent?.toLowerCase().includes("invite"),
        ),
      ).toBe(true);
    });

    const inviteBtn = screen.getAllByRole("button").find(
      (b) => b.textContent?.toLowerCase().includes("invite"),
    )!;
    fireEvent.click(inviteBtn);

    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: /email/i })).toBeTruthy();
    });

    fireEvent.change(screen.getByRole("textbox", { name: /email/i }), {
      target: { value: "newop@example.com" },
    });

    // Submit the form — find the Send/Submit button inside the dialog
    const submitBtns = screen.getAllByRole("button").filter(
      (b) =>
        b.textContent?.toLowerCase().includes("send") ||
        b.textContent?.toLowerCase().includes("invite") ||
        b.getAttribute("type") === "submit",
    );
    const sendBtn = submitBtns.find(
      (b) => b.getAttribute("type") === "submit" ||
             b.textContent?.toLowerCase().includes("send"),
    )!;
    fireEvent.click(sendBtn);

    await waitFor(() => {
      expect(invitesApi.create).toHaveBeenCalledWith(
        expect.objectContaining({
          email: "newop@example.com",
          gameId: "g1",
        }),
      );
    });
  });

  it("closes the invite dialog and clears the input after a successful invite", async () => {
    vi.mocked(invitesApi.create).mockResolvedValue(makeInvite("inv-new"));
    renderPage();

    await waitFor(() => {
      expect(
        screen.getAllByRole("button").some((b) =>
          b.textContent?.toLowerCase().includes("invite"),
        ),
      ).toBe(true);
    });

    // Open dialog
    const inviteBtn = screen.getAllByRole("button").find(
      (b) => b.textContent?.toLowerCase().includes("invite"),
    )!;
    fireEvent.click(inviteBtn);

    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: /email/i })).toBeTruthy();
    });

    fireEvent.change(screen.getByRole("textbox", { name: /email/i }), {
      target: { value: "another@example.com" },
    });

    // The send/submit button is the non-cancel button in the dialog footer.
    // It has type="submit" on the form or text matching "send"/"invite".
    const dialogButtons = screen.getAllByRole("button").filter(
      (b) =>
        b.getAttribute("type") === "submit" ||
        b.textContent?.toLowerCase().includes("send"),
    );
    const sendBtn = dialogButtons[dialogButtons.length - 1]!;
    fireEvent.click(sendBtn);

    await waitFor(() => {
      expect(invitesApi.create).toHaveBeenCalledWith(
        expect.objectContaining({ email: "another@example.com" }),
      );
    });

    // After success, dialog closes — the email input leaves the DOM.
    await waitFor(() => {
      expect(screen.queryByRole("textbox", { name: /email/i })).toBeNull();
    });
  });

  // ── Pending invites ───────────────────────────────────────────────────────

  it("renders the pending invitations section when pending invites exist", async () => {
    vi.mocked(invitesApi.listByGame).mockResolvedValue([
      makeInvite("inv1", { email: "pending@example.com" }),
    ]);
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("pending@example.com")).toBeTruthy();
    });
  });

  it("does not render the pending invitations section when there are no pending invites", async () => {
    vi.mocked(invitesApi.listByGame).mockResolvedValue([
      makeInvite("inv1", { email: "accepted@example.com", status: "accepted" }),
    ]);
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1 })).toBeTruthy();
    });

    expect(screen.queryByText("accepted@example.com")).toBeNull();
  });

  it("calls invitesApi.delete when the revoke button is clicked on a pending invite", async () => {
    vi.mocked(invitesApi.listByGame).mockResolvedValue([
      makeInvite("inv1", { email: "pending@example.com" }),
    ]);
    vi.mocked(invitesApi.delete).mockResolvedValue(undefined);
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("pending@example.com")).toBeTruthy();
    });

    // The revoke button is a trash icon button next to the invite row
    const revokeButtons = screen.queryAllByRole("button").filter(
      (b) => b.querySelector("svg") !== null &&
             !b.textContent?.toLowerCase().includes("invite") &&
             !b.textContent?.toLowerCase().includes("operator"),
    );
    expect(revokeButtons.length).toBeGreaterThan(0);
    fireEvent.click(revokeButtons[revokeButtons.length - 1]);

    await waitFor(() => {
      expect(invitesApi.delete).toHaveBeenCalledWith("inv1");
    });
  });
});
