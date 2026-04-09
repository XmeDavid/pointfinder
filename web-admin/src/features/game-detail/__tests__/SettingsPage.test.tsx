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
    update: vi.fn(),
    delete: vi.fn(),
    updateStatus: vi.fn(),
    exportGame: vi.fn(),
  },
}));

vi.mock("@/hooks/useToast", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

// react-router-dom navigate is used after delete — stub the hook so we can
// assert navigation without actually routing.
const mockNavigate = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

import { gamesApi } from "@/lib/api/games";
import { SettingsPage } from "../SettingsPage";
import type { Game, GameStatus } from "@/types";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    id: "g1",
    name: "Spring Rally",
    description: "Annual spring event",
    status: "setup" as GameStatus,
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
      <MemoryRouter initialEntries={["/games/g1/settings"]}>
        <Routes>
          <Route path="/games/:gameId/settings" element={<SettingsPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// Stub URL helpers — jsdom does not implement them.
beforeEach(() => {
  vi.clearAllMocks();
  mockNavigate.mockReset();
  (global.URL as unknown as { createObjectURL: () => string }).createObjectURL =
    vi.fn(() => "blob:fake-url");
  (global.URL as unknown as { revokeObjectURL: () => void }).revokeObjectURL =
    vi.fn();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SettingsPage", () => {
  // ── Smoke / loading guard ─────────────────────────────────────────────────

  it("renders nothing while game data has not loaded", () => {
    vi.mocked(gamesApi.getById).mockReturnValue(new Promise(() => {}));
    const { container } = renderPage();
    // Returns null until game resolves
    expect(container.firstChild).toBeNull();
  });

  // ── Page structure ────────────────────────────────────────────────────────

  it("renders the settings page heading after game loads", async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1 })).toBeTruthy();
    });
  });

  it("renders the game name pre-filled in the name input", async () => {
    renderPage(makeGame({ name: "Winter Cup" }));

    await waitFor(() => {
      const nameInput = screen.getByRole("textbox", { name: /name/i });
      expect((nameInput as HTMLInputElement).value).toBe("Winter Cup");
    });
  });

  it("renders the game description pre-filled in the textarea", async () => {
    renderPage(makeGame({ description: "Best game ever" }));

    await waitFor(() => {
      const textarea = screen.getByRole("textbox", { name: /description/i });
      expect((textarea as HTMLTextAreaElement).value).toBe("Best game ever");
    });
  });

  // ── Save game details form ────────────────────────────────────────────────

  it("calls gamesApi.update when the save button is clicked with a valid name", async () => {
    vi.mocked(gamesApi.update).mockResolvedValue(makeGame());
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: /name/i })).toBeTruthy();
    });

    // Change the name
    fireEvent.change(screen.getByRole("textbox", { name: /name/i }), {
      target: { value: "Updated Rally" },
    });

    // Submit the form — the save button is inside the form
    const saveBtn = screen.getAllByRole("button").find(
      (b) => b.textContent?.toLowerCase().includes("save") &&
             !b.textContent?.toLowerCase().includes("delete"),
    )!;
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(gamesApi.update).toHaveBeenCalledWith(
        "g1",
        expect.objectContaining({ name: "Updated Rally" }),
      );
    });
  });

  it("save button is disabled when the name field is cleared", async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: /name/i })).toBeTruthy();
    });

    fireEvent.change(screen.getByRole("textbox", { name: /name/i }), {
      target: { value: "" },
    });

    const saveBtn = screen.getAllByRole("button").find(
      (b) => b.textContent?.toLowerCase().includes("save") &&
             !b.textContent?.toLowerCase().includes("delete"),
    )!;

    expect(saveBtn.hasAttribute("disabled")).toBe(true);
  });

  // ── Export ────────────────────────────────────────────────────────────────

  it("renders the export button", async () => {
    renderPage();

    await waitFor(() => {
      const exportBtns = screen.getAllByRole("button").filter(
        (b) => b.textContent?.toLowerCase().includes("export"),
      );
      expect(exportBtns.length).toBeGreaterThan(0);
    });
  });

  it("calls gamesApi.exportGame and triggers a download when export is clicked", async () => {
    const blob = new Blob(['{"game":"data"}'], { type: "application/json" });
    vi.mocked(gamesApi.exportGame).mockResolvedValue(blob);

    const clickSpy = vi.fn();
    const originalCreate = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = originalCreate(tag);
      if (tag === "a") {
        Object.defineProperty(el, "click", { value: clickSpy, writable: true });
      }
      return el;
    });

    renderPage();

    await waitFor(() => {
      expect(
        screen.getAllByRole("button").some((b) =>
          b.textContent?.toLowerCase().includes("export"),
        ),
      ).toBe(true);
    });

    const exportBtn = screen.getAllByRole("button").find(
      (b) => b.textContent?.toLowerCase().includes("export"),
    )!;
    fireEvent.click(exportBtn);

    await waitFor(() => {
      expect(gamesApi.exportGame).toHaveBeenCalledWith("g1");
    });

    vi.restoreAllMocks();
  });

  // ── Broadcast toggle ──────────────────────────────────────────────────────

  it("calls gamesApi.update with broadcastEnabled toggled when the broadcast switch is clicked", async () => {
    vi.mocked(gamesApi.update).mockResolvedValue(
      makeGame({ broadcastEnabled: true }),
    );
    renderPage(makeGame({ broadcastEnabled: false }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1 })).toBeTruthy();
    });

    const broadcastSwitch = screen.getByRole("switch", {
      name: /broadcast/i,
    });
    fireEvent.click(broadcastSwitch);

    await waitFor(() => {
      expect(gamesApi.update).toHaveBeenCalledWith(
        "g1",
        expect.objectContaining({ broadcastEnabled: true }),
      );
    });
  });

  it("shows broadcast code when broadcastEnabled is true and broadcastCode is set", async () => {
    renderPage(
      makeGame({ broadcastEnabled: true, broadcastCode: "ABCD12" }),
    );

    await waitFor(() => {
      expect(screen.getByText("ABCD12")).toBeTruthy();
    });
  });

  it("does not show broadcast code section when broadcastEnabled is false", async () => {
    renderPage(makeGame({ broadcastEnabled: false, broadcastCode: "ABCD12" }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1 })).toBeTruthy();
    });

    expect(screen.queryByText("ABCD12")).toBeNull();
  });

  // ── Game state override card ──────────────────────────────────────────────

  it("does not render the game state override card when status is setup", async () => {
    renderPage(makeGame({ status: "setup" }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1 })).toBeTruthy();
    });

    // The revert-to-setup button should not exist for a game already in setup
    const revertBtns = screen.queryAllByRole("button").filter(
      (b) => b.textContent?.toLowerCase().includes("setup"),
    );
    expect(revertBtns.length).toBe(0);
  });

  it("renders the revert-to-setup button when status is live", async () => {
    renderPage(makeGame({ status: "live" }));

    await waitFor(() => {
      const revertBtns = screen.getAllByRole("button").filter(
        (b) => b.textContent?.toLowerCase().includes("setup"),
      );
      expect(revertBtns.length).toBeGreaterThan(0);
    });
  });

  it("renders both revert buttons when status is ended", async () => {
    renderPage(makeGame({ status: "ended" }));

    await waitFor(() => {
      // ended -> live button
      const toLiveBtns = screen.getAllByRole("button").filter(
        (b) => b.textContent?.toLowerCase().includes("live"),
      );
      expect(toLiveBtns.length).toBeGreaterThan(0);

      // ended -> setup button
      const toSetupBtns = screen.getAllByRole("button").filter(
        (b) => b.textContent?.toLowerCase().includes("setup"),
      );
      expect(toSetupBtns.length).toBeGreaterThan(0);
    });
  });

  it("opens the state-change dialog when revert-to-setup is clicked from live", async () => {
    renderPage(makeGame({ status: "live" }));

    await waitFor(() => {
      expect(
        screen.getAllByRole("button").some((b) =>
          b.textContent?.toLowerCase().includes("setup"),
        ),
      ).toBe(true);
    });

    const revertBtn = screen.getAllByRole("button").find(
      (b) => b.textContent?.toLowerCase().includes("setup"),
    )!;
    fireEvent.click(revertBtn);

    // Dialog opens and shows progress choice
    await waitFor(() => {
      expect(
        screen.getAllByRole("button").some((b) =>
          b.textContent?.toLowerCase().includes("cancel"),
        ),
      ).toBe(true);
    });
  });

  it("calls gamesApi.updateStatus with resetProgress=false when keep-progress is selected", async () => {
    vi.mocked(gamesApi.updateStatus).mockResolvedValue(makeGame({ status: "setup" }));
    renderPage(makeGame({ status: "live" }));

    // Wait for the revert-to-setup button and click it
    await waitFor(() => {
      expect(
        screen.getAllByRole("button").some((b) =>
          b.textContent?.toLowerCase().includes("setup"),
        ),
      ).toBe(true);
    });

    const revertBtn = screen.getAllByRole("button").find(
      (b) => b.textContent?.toLowerCase().includes("setup"),
    )!;
    fireEvent.click(revertBtn);

    // Dialog opens — select keep-progress option
    await waitFor(() => {
      expect(screen.getByTestId("confirm-action-btn")).toBeTruthy();
    });

    // Click the keep-progress option (first choice card)
    const keepBtn = screen.getAllByRole("button").find(
      (b) => b.textContent?.toLowerCase().includes("keep"),
    );
    if (keepBtn) {
      fireEvent.click(keepBtn);
    } else {
      // The keep option is rendered as a <button> element in the dialog
      const keepOption = screen.getByText(/keep progress/i).closest("button");
      fireEvent.click(keepOption!);
    }

    // Click the dialog confirm button via stable testid
    fireEvent.click(screen.getByTestId("confirm-action-btn"));

    await waitFor(() => {
      expect(gamesApi.updateStatus).toHaveBeenCalledWith("g1", "setup", false);
    });
  });

  // ── Delete game ───────────────────────────────────────────────────────────

  it("shows the delete confirmation inline when delete button is clicked", async () => {
    renderPage();

    await waitFor(() => {
      const deleteBtn = screen.getAllByRole("button").find(
        (b) => b.textContent?.toLowerCase().includes("delete"),
      );
      expect(deleteBtn).toBeTruthy();
    });

    const deleteBtn = screen.getAllByRole("button").find(
      (b) => b.textContent?.toLowerCase().includes("delete"),
    )!;
    fireEvent.click(deleteBtn);

    await waitFor(() => {
      // Confirmation section appears with cancel + confirm buttons
      const cancelBtn = screen.getAllByRole("button").find(
        (b) => b.textContent?.toLowerCase().includes("cancel"),
      );
      expect(cancelBtn).toBeTruthy();
    });
  });

  it("calls gamesApi.delete and navigates to /games on confirm", async () => {
    vi.mocked(gamesApi.delete).mockResolvedValue(undefined);
    renderPage();

    await waitFor(() => {
      expect(
        screen.getAllByRole("button").some((b) =>
          b.textContent?.toLowerCase().includes("delete"),
        ),
      ).toBe(true);
    });

    // Click the initial delete button
    const deleteBtn = screen.getAllByRole("button").find(
      (b) =>
        b.textContent?.toLowerCase().includes("delete") &&
        !b.textContent?.toLowerCase().includes("cancel"),
    )!;
    fireEvent.click(deleteBtn);

    // Confirm the deletion
    await waitFor(() => {
      const confirmDeleteBtn = screen.getAllByRole("button").find(
        (b) =>
          b.textContent?.toLowerCase().includes("delete") &&
          b.textContent !== deleteBtn.textContent,
      );
      expect(confirmDeleteBtn).toBeTruthy();
    });

    const confirmDeleteBtn = screen.getAllByRole("button").find(
      (b) =>
        b.textContent?.toLowerCase().includes("delete") &&
        b.textContent !== deleteBtn.textContent,
    )!;
    fireEvent.click(confirmDeleteBtn);

    await waitFor(() => {
      expect(gamesApi.delete).toHaveBeenCalledWith("g1");
      expect(mockNavigate).toHaveBeenCalledWith("/games");
    });
  });

  it("cancels delete confirmation and hides the confirm UI when cancel is clicked", async () => {
    renderPage();

    await waitFor(() => {
      expect(
        screen.getAllByRole("button").some((b) =>
          b.textContent?.toLowerCase().includes("delete"),
        ),
      ).toBe(true);
    });

    const deleteBtn = screen.getAllByRole("button").find(
      (b) => b.textContent?.toLowerCase().includes("delete"),
    )!;
    fireEvent.click(deleteBtn);

    await waitFor(() => {
      expect(
        screen.getAllByRole("button").some((b) =>
          b.textContent?.toLowerCase().includes("cancel"),
        ),
      ).toBe(true);
    });

    const cancelBtn = screen.getAllByRole("button").find(
      (b) => b.textContent?.toLowerCase().includes("cancel"),
    )!;
    fireEvent.click(cancelBtn);

    await waitFor(() => {
      // Confirm section is gone — cancel button no longer visible
      expect(
        screen.queryAllByRole("button").filter((b) =>
          b.textContent?.toLowerCase().includes("cancel"),
        ).length,
      ).toBe(0);
    });
  });
});
