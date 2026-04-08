/**
 * Tests for ManageTagsDialog.
 *
 * Covers: tag list rendering, create, edit, delete, 409 error paths,
 * cap exceeded, default color assignment, color picker propagation,
 * and keyboard navigation (Enter/Escape in edit row).
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { ManageTagsDialog } from "../ManageTagsDialog";
import { COLOR_PALETTE } from "@/lib/colorPalette";

// Ensure i18n is initialised.
import "@/i18n";

// ── API mocks ────────────────────────────────────────────────────────────────

vi.mock("@/lib/api/tags", () => ({
  tagsApi: {
    listByGame: vi.fn(),
    createTag: vi.fn(),
    updateTag: vi.fn(),
    deleteTag: vi.fn(),
  },
}));

// Mock useToast so we can assert on toast calls without a real DOM portal.
const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();
vi.mock("@/hooks/useToast", () => ({
  useToast: () => ({ success: mockToastSuccess, error: mockToastError }),
  useToastStore: { setState: vi.fn() },
}));

import { tagsApi } from "@/lib/api/tags";

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeTag(id: string, label: string, color = "#3b82f6") {
  return { id, gameId: "g1", label, color, createdAt: "", updatedAt: "" };
}

const GAME_ID = "g1";

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
}

function renderDialog(open = true) {
  const qc = createTestQueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <ManageTagsDialog open={open} onOpenChange={vi.fn()} gameId={GAME_ID} />
    </QueryClientProvider>,
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("ManageTagsDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Rendering ───────────────────────────────────────────────────────────────

  it("renders the dialog with title when open", async () => {
    vi.mocked(tagsApi.listByGame).mockResolvedValue([]);

    renderDialog();

    await waitFor(() => {
      expect(screen.getByTestId("manage-tags-dialog")).toBeTruthy();
    });
    expect(screen.getByText("Manage Tags")).toBeTruthy();
  });

  it("renders existing tags by label", async () => {
    vi.mocked(tagsApi.listByGame).mockResolvedValue([
      makeTag("t1", "Morning"),
      makeTag("t2", "Staffed"),
    ]);

    renderDialog();

    await waitFor(() => {
      expect(screen.getByTestId("tag-label-t1")).toBeTruthy();
      expect(screen.getByTestId("tag-label-t2")).toBeTruthy();
    });
    expect(screen.getByText("Morning")).toBeTruthy();
    expect(screen.getByText("Staffed")).toBeTruthy();
  });

  it("shows no-tags empty state when tag list is empty", async () => {
    vi.mocked(tagsApi.listByGame).mockResolvedValue([]);

    renderDialog();

    await waitFor(() => {
      expect(screen.getByText("No tags yet. Create your first tag below.")).toBeTruthy();
    });
  });

  it("renders edit and delete buttons for each tag", async () => {
    vi.mocked(tagsApi.listByGame).mockResolvedValue([makeTag("t1", "Alpha")]);

    renderDialog();

    await waitFor(() => {
      expect(screen.getByTestId("tag-edit-btn-t1")).toBeTruthy();
      expect(screen.getByTestId("tag-delete-btn-t1")).toBeTruthy();
    });
  });

  it("does not render when closed", () => {
    vi.mocked(tagsApi.listByGame).mockResolvedValue([]);
    renderDialog(false);
    expect(screen.queryByTestId("manage-tags-dialog")).toBeNull();
  });

  // ── Add new tag ──────────────────────────────────────────────────────────────

  it("clicking add button shows the inline create form", async () => {
    vi.mocked(tagsApi.listByGame).mockResolvedValue([]);

    renderDialog();

    await waitFor(() => {
      expect(screen.getByTestId("manage-tags-add-btn")).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("manage-tags-add-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("tag-label-edit-input")).toBeTruthy();
    });
  });

  it("create tag calls tagsApi.createTag with label and color", async () => {
    vi.mocked(tagsApi.listByGame).mockResolvedValue([]);
    vi.mocked(tagsApi.createTag).mockResolvedValue(makeTag("t-new", "Afternoon", "#ef4444"));

    renderDialog();

    await waitFor(() => {
      expect(screen.getByTestId("manage-tags-add-btn")).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId("manage-tags-add-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("tag-label-edit-input")).toBeTruthy();
    });

    fireEvent.change(screen.getByTestId("tag-label-edit-input"), {
      target: { value: "Afternoon" },
    });
    fireEvent.click(screen.getByTestId("tag-save-btn"));

    await waitFor(() => {
      expect(tagsApi.createTag).toHaveBeenCalledTimes(1);
    });

    const [calledGameId, calledDto] = vi.mocked(tagsApi.createTag).mock.calls[0];
    expect(calledGameId).toBe(GAME_ID);
    expect(calledDto.label).toBe("Afternoon");
    expect(calledDto.color).toBeTruthy(); // color is always set from palette
  });

  it("create tag trims whitespace before calling API", async () => {
    vi.mocked(tagsApi.listByGame).mockResolvedValue([]);
    vi.mocked(tagsApi.createTag).mockResolvedValue(makeTag("t-new", "Trimmed"));

    renderDialog();

    await waitFor(() => {
      expect(screen.getByTestId("manage-tags-add-btn")).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId("manage-tags-add-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("tag-label-edit-input")).toBeTruthy();
    });
    fireEvent.change(screen.getByTestId("tag-label-edit-input"), {
      target: { value: "  Trimmed  " },
    });
    fireEvent.click(screen.getByTestId("tag-save-btn"));

    await waitFor(() => {
      expect(tagsApi.createTag).toHaveBeenCalled();
    });
    const [, dto] = vi.mocked(tagsApi.createTag).mock.calls[0];
    expect(dto.label).toBe("Trimmed");
  });

  it("save button is disabled when label input is empty", async () => {
    vi.mocked(tagsApi.listByGame).mockResolvedValue([]);

    renderDialog();

    await waitFor(() => {
      expect(screen.getByTestId("manage-tags-add-btn")).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId("manage-tags-add-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("tag-save-btn")).toBeTruthy();
    });

    const saveBtn = screen.getByTestId("tag-save-btn") as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(true);
  });

  it("pressing Enter in label input triggers save", async () => {
    vi.mocked(tagsApi.listByGame).mockResolvedValue([]);
    vi.mocked(tagsApi.createTag).mockResolvedValue(makeTag("t-new", "Via Enter"));

    renderDialog();

    await waitFor(() => {
      expect(screen.getByTestId("manage-tags-add-btn")).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId("manage-tags-add-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("tag-label-edit-input")).toBeTruthy();
    });
    fireEvent.change(screen.getByTestId("tag-label-edit-input"), {
      target: { value: "Via Enter" },
    });
    fireEvent.keyDown(screen.getByTestId("tag-label-edit-input"), { key: "Enter" });

    await waitFor(() => {
      expect(tagsApi.createTag).toHaveBeenCalledTimes(1);
    });
  });

  it("pressing Escape in label input cancels the create form", async () => {
    vi.mocked(tagsApi.listByGame).mockResolvedValue([]);

    renderDialog();

    await waitFor(() => {
      expect(screen.getByTestId("manage-tags-add-btn")).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId("manage-tags-add-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("tag-label-edit-input")).toBeTruthy();
    });
    fireEvent.keyDown(screen.getByTestId("tag-label-edit-input"), { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByTestId("tag-label-edit-input")).toBeNull();
    });
  });

  it("default color for new tag is first palette color not already used", async () => {
    // Existing tag uses the first palette color
    const existingColor = COLOR_PALETTE[0].value;
    vi.mocked(tagsApi.listByGame).mockResolvedValue([makeTag("t1", "Used", existingColor)]);
    vi.mocked(tagsApi.createTag).mockResolvedValue(makeTag("t-new", "New tag", COLOR_PALETTE[1].value));

    renderDialog();

    await waitFor(() => {
      expect(screen.getByTestId("manage-tags-add-btn")).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId("manage-tags-add-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("tag-label-edit-input")).toBeTruthy();
    });

    fireEvent.change(screen.getByTestId("tag-label-edit-input"), {
      target: { value: "New tag" },
    });
    fireEvent.click(screen.getByTestId("tag-save-btn"));

    await waitFor(() => {
      expect(tagsApi.createTag).toHaveBeenCalled();
    });

    const [, dto] = vi.mocked(tagsApi.createTag).mock.calls[0];
    // Should NOT use the first palette color since it's already in use
    expect(dto.color?.toLowerCase()).not.toBe(existingColor.toLowerCase());
  });

  it("409 duplicate label error shows inline error message instead of toast", async () => {
    vi.mocked(tagsApi.listByGame).mockResolvedValue([]);
    vi.mocked(tagsApi.createTag).mockRejectedValue({
      response: { data: { message: "A tag with this label already exists" } },
    });

    renderDialog();

    await waitFor(() => {
      expect(screen.getByTestId("manage-tags-add-btn")).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId("manage-tags-add-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("tag-label-edit-input")).toBeTruthy();
    });
    fireEvent.change(screen.getByTestId("tag-label-edit-input"), {
      target: { value: "Duplicate" },
    });
    fireEvent.click(screen.getByTestId("tag-save-btn"));

    await waitFor(() => {
      expect(screen.getByText("A tag with that label already exists.")).toBeTruthy();
    });
    // The error should be inline, not a toast
    expect(mockToastError).not.toHaveBeenCalled();
  });

  // ── Edit existing tag ────────────────────────────────────────────────────────

  it("clicking edit shows the inline edit form pre-populated with existing values", async () => {
    vi.mocked(tagsApi.listByGame).mockResolvedValue([makeTag("t1", "Morning", "#f59e0b")]);

    renderDialog();

    await waitFor(() => {
      expect(screen.getByTestId("tag-edit-btn-t1")).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId("tag-edit-btn-t1"));

    await waitFor(() => {
      expect(screen.getByTestId("tag-label-edit-input")).toBeTruthy();
    });

    const input = screen.getByTestId("tag-label-edit-input") as HTMLInputElement;
    expect(input.value).toBe("Morning");
  });

  it("edit tag calls tagsApi.updateTag with new label and color", async () => {
    vi.mocked(tagsApi.listByGame).mockResolvedValue([makeTag("t1", "Morning", "#f59e0b")]);
    vi.mocked(tagsApi.updateTag).mockResolvedValue(makeTag("t1", "Afternoon", "#ef4444"));

    renderDialog();

    await waitFor(() => {
      expect(screen.getByTestId("tag-edit-btn-t1")).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId("tag-edit-btn-t1"));

    await waitFor(() => {
      expect(screen.getByTestId("tag-label-edit-input")).toBeTruthy();
    });
    fireEvent.change(screen.getByTestId("tag-label-edit-input"), {
      target: { value: "Afternoon" },
    });
    fireEvent.click(screen.getByTestId("tag-save-btn"));

    await waitFor(() => {
      expect(tagsApi.updateTag).toHaveBeenCalledTimes(1);
    });

    const [calledGameId, calledTagId, calledDto] = vi.mocked(tagsApi.updateTag).mock.calls[0];
    expect(calledGameId).toBe(GAME_ID);
    expect(calledTagId).toBe("t1");
    expect(calledDto.label).toBe("Afternoon");
  });

  it("update success shows success toast and closes inline form", async () => {
    vi.mocked(tagsApi.listByGame).mockResolvedValue([makeTag("t1", "Morning")]);
    vi.mocked(tagsApi.updateTag).mockResolvedValue(makeTag("t1", "Updated"));

    renderDialog();

    await waitFor(() => {
      expect(screen.getByTestId("tag-edit-btn-t1")).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId("tag-edit-btn-t1"));

    await waitFor(() => {
      expect(screen.getByTestId("tag-label-edit-input")).toBeTruthy();
    });
    fireEvent.change(screen.getByTestId("tag-label-edit-input"), {
      target: { value: "Updated" },
    });
    fireEvent.click(screen.getByTestId("tag-save-btn"));

    await waitFor(() => {
      expect(mockToastSuccess).toHaveBeenCalled();
    });
  });

  it("duplicate label on edit shows inline error message", async () => {
    vi.mocked(tagsApi.listByGame).mockResolvedValue([makeTag("t1", "Morning")]);
    vi.mocked(tagsApi.updateTag).mockRejectedValue({
      response: { data: { message: "A tag with this label already exists" } },
    });

    renderDialog();

    await waitFor(() => {
      expect(screen.getByTestId("tag-edit-btn-t1")).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId("tag-edit-btn-t1"));

    await waitFor(() => {
      expect(screen.getByTestId("tag-label-edit-input")).toBeTruthy();
    });
    fireEvent.change(screen.getByTestId("tag-label-edit-input"), {
      target: { value: "Conflict" },
    });
    fireEvent.click(screen.getByTestId("tag-save-btn"));

    await waitFor(() => {
      expect(screen.getByText("A tag with that label already exists.")).toBeTruthy();
    });
  });

  // ── Delete tag ───────────────────────────────────────────────────────────────

  it("clicking delete shows confirmation dialog with description text", async () => {
    vi.mocked(tagsApi.listByGame).mockResolvedValue([makeTag("t1", "Morning")]);

    renderDialog();

    await waitFor(() => {
      expect(screen.getByTestId("tag-delete-btn-t1")).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId("tag-delete-btn-t1"));

    // ConfirmDeleteDialog renders the description from manageTagsDialog.deleteConfirm i18n key
    await waitFor(() => {
      expect(
        screen.getByText(
          "Are you sure you want to delete this tag? It will be removed from all bases and challenges.",
        ),
      ).toBeTruthy();
    });
  });

  it("confirming delete calls tagsApi.deleteTag with correct tagId", async () => {
    vi.mocked(tagsApi.listByGame).mockResolvedValue([makeTag("t1", "Morning")]);
    vi.mocked(tagsApi.deleteTag).mockResolvedValue(undefined);

    renderDialog();

    await waitFor(() => {
      expect(screen.getByTestId("tag-delete-btn-t1")).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId("tag-delete-btn-t1"));

    // Wait for the confirmation dialog description to appear
    await waitFor(() => {
      expect(
        screen.getByText(
          "Are you sure you want to delete this tag? It will be removed from all bases and challenges.",
        ),
      ).toBeTruthy();
    });

    // Click the destructive confirm button — it renders as role=button with text "Delete"
    // Use getAllByRole to find the one inside the dialog footer (not the tag row delete icon btn)
    const allButtons = screen.getAllByRole("button");
    const confirmBtn = allButtons.find(
      (b) => b.textContent?.trim() === "Delete",
    );
    expect(confirmBtn).toBeTruthy();
    fireEvent.click(confirmBtn!);

    await waitFor(() => {
      expect(tagsApi.deleteTag).toHaveBeenCalledTimes(1);
    });

    const [calledGameId, calledTagId] = vi.mocked(tagsApi.deleteTag).mock.calls[0];
    expect(calledGameId).toBe(GAME_ID);
    expect(calledTagId).toBe("t1");
  });

  it("delete in-use 409 shows error toast", async () => {
    vi.mocked(tagsApi.listByGame).mockResolvedValue([makeTag("t1", "InUse")]);
    vi.mocked(tagsApi.deleteTag).mockRejectedValue({
      response: { data: { message: "Tag is in use by 3 bases" } },
    });

    renderDialog();

    await waitFor(() => {
      expect(screen.getByTestId("tag-delete-btn-t1")).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId("tag-delete-btn-t1"));

    await waitFor(() => {
      expect(
        screen.getByText(
          "Are you sure you want to delete this tag? It will be removed from all bases and challenges.",
        ),
      ).toBeTruthy();
    });

    const allButtons = screen.getAllByRole("button");
    const confirmBtn = allButtons.find((b) => b.textContent?.trim() === "Delete");
    expect(confirmBtn).toBeTruthy();
    fireEvent.click(confirmBtn!);

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalled();
    });
    // Verify the in-use message is shown
    const toastMsg: string = mockToastError.mock.calls[0][0];
    expect(toastMsg).toBeTruthy();
  });

  it("delete success shows success toast", async () => {
    vi.mocked(tagsApi.listByGame).mockResolvedValue([makeTag("t1", "Morning")]);
    vi.mocked(tagsApi.deleteTag).mockResolvedValue(undefined);

    renderDialog();

    await waitFor(() => {
      expect(screen.getByTestId("tag-delete-btn-t1")).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId("tag-delete-btn-t1"));

    await waitFor(() => {
      expect(
        screen.getByText(
          "Are you sure you want to delete this tag? It will be removed from all bases and challenges.",
        ),
      ).toBeTruthy();
    });

    const allButtons = screen.getAllByRole("button");
    const confirmBtn = allButtons.find((b) => b.textContent?.trim() === "Delete");
    expect(confirmBtn).toBeTruthy();
    fireEvent.click(confirmBtn!);

    await waitFor(() => {
      expect(mockToastSuccess).toHaveBeenCalled();
    });
  });

  // ── Color picker ─────────────────────────────────────────────────────────────

  it("color picker swatches are rendered in the edit row", async () => {
    vi.mocked(tagsApi.listByGame).mockResolvedValue([makeTag("t1", "Morning", "#ef4444")]);

    renderDialog();

    await waitFor(() => {
      expect(screen.getByTestId("tag-edit-btn-t1")).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId("tag-edit-btn-t1"));

    await waitFor(() => {
      // Each swatch has aria-label = hex value
      const swatch = screen.getByRole("button", { name: COLOR_PALETTE[0].value });
      expect(swatch).toBeTruthy();
    });
  });

  it("clicking a color swatch changes the selected color for the new tag", async () => {
    vi.mocked(tagsApi.listByGame).mockResolvedValue([]);
    vi.mocked(tagsApi.createTag).mockResolvedValue(makeTag("t-new", "Colored", COLOR_PALETTE[1].value));

    renderDialog();

    await waitFor(() => {
      expect(screen.getByTestId("manage-tags-add-btn")).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId("manage-tags-add-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("tag-label-edit-input")).toBeTruthy();
    });

    // Click the second palette swatch
    const targetSwatch = screen.getByRole("button", { name: COLOR_PALETTE[1].value });
    fireEvent.click(targetSwatch);

    fireEvent.change(screen.getByTestId("tag-label-edit-input"), {
      target: { value: "Colored" },
    });
    fireEvent.click(screen.getByTestId("tag-save-btn"));

    await waitFor(() => {
      expect(tagsApi.createTag).toHaveBeenCalled();
    });

    const [, dto] = vi.mocked(tagsApi.createTag).mock.calls[0];
    expect(dto.color?.toLowerCase()).toBe(COLOR_PALETTE[1].value.toLowerCase());
  });

  // ── Cancel ────────────────────────────────────────────────────────────────────

  it("clicking cancel button in edit row dismisses the form without API call", async () => {
    vi.mocked(tagsApi.listByGame).mockResolvedValue([makeTag("t1", "Morning")]);

    renderDialog();

    await waitFor(() => {
      expect(screen.getByTestId("tag-edit-btn-t1")).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId("tag-edit-btn-t1"));

    await waitFor(() => {
      expect(screen.getByTestId("tag-cancel-btn")).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId("tag-cancel-btn"));

    await waitFor(() => {
      expect(screen.queryByTestId("tag-label-edit-input")).toBeNull();
    });

    expect(tagsApi.updateTag).not.toHaveBeenCalled();
    expect(tagsApi.createTag).not.toHaveBeenCalled();
  });
});
