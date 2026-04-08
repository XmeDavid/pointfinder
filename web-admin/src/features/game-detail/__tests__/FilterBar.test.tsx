/**
 * Tests for the FilterBar component.
 *
 * Covers: tag chip rendering, toggle state, aria-pressed, AND semantics,
 * clear button visibility/behaviour, color swatch rendering, empty
 * vocabulary collapse, and i18n string presence.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { FilterBar, type FilterBarState } from "../FilterBar";
import type { Tag } from "@/types";

// Ensure i18n is initialised.
import "@/i18n";

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeTag(id: string, label: string, color: string): Tag {
  return { id, gameId: "g1", label, color, createdAt: "", updatedAt: "" };
}

const TAG_MORNING = makeTag("tag-morning", "Morning", "#f59e0b");
const TAG_STAFFED = makeTag("tag-staffed", "Staffed", "#10b981");
const TAG_AUTONOMOUS = makeTag("tag-autonomous", "Autonomous", "#6366f1");

function baseProps(overrides: Partial<FilterBarState> = {}): FilterBarState {
  return {
    allTagIds: [TAG_MORNING.id, TAG_STAFFED.id],
    tagCounts: new Map([
      [TAG_MORNING.id, 3],
      [TAG_STAFFED.id, 1],
    ]),
    selectedTagIds: [],
    toggleTag: vi.fn(),
    clearFilters: vi.fn(),
    hasActive: false,
    isVisible: true,
    resolvedTags: [TAG_MORNING, TAG_STAFFED],
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("FilterBar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Visibility ───────────────────────────────────────────────────────────────

  it("renders nothing when isVisible is false (empty vocabulary)", () => {
    const { container } = render(<FilterBar {...baseProps({ isVisible: false })} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders the filter bar when isVisible is true", () => {
    render(<FilterBar {...baseProps()} />);
    expect(screen.getByRole("search")).toBeTruthy();
  });

  // ── Tag chip rendering ────────────────────────────────────────────────────────

  it("renders a chip for each tag in allTagIds", () => {
    render(<FilterBar {...baseProps()} />);
    expect(screen.getByTestId(`filter-tag-${TAG_MORNING.id}`)).toBeTruthy();
    expect(screen.getByTestId(`filter-tag-${TAG_STAFFED.id}`)).toBeTruthy();
  });

  it("renders tag labels sourced from resolvedTags", () => {
    render(<FilterBar {...baseProps()} />);
    expect(screen.getByText("Morning")).toBeTruthy();
    expect(screen.getByText("Staffed")).toBeTruthy();
  });

  it("renders tag count in parentheses when tagCounts has entry", () => {
    render(<FilterBar {...baseProps()} />);
    // tagCounts has Morning → 3, so "(3)" must appear somewhere
    const chip = screen.getByTestId(`filter-tag-${TAG_MORNING.id}`);
    expect(chip.textContent).toContain("3");
  });

  it("falls back to tagId as label when tag is not in resolvedTags", () => {
    const props = baseProps({
      allTagIds: ["unknown-tag-id"],
      resolvedTags: [],
      tagCounts: new Map([["unknown-tag-id", 1]]),
    });
    render(<FilterBar {...props} />);
    expect(screen.getByTestId("filter-tag-unknown-tag-id")).toBeTruthy();
    // fallback label = tagId
    const chip = screen.getByTestId("filter-tag-unknown-tag-id");
    expect(chip.textContent).toContain("unknown-tag-id");
  });

  // ── aria-pressed reflects active state ───────────────────────────────────────

  it("aria-pressed is false for inactive chips", () => {
    render(<FilterBar {...baseProps({ selectedTagIds: [] })} />);
    const chip = screen.getByTestId(`filter-tag-${TAG_MORNING.id}`) as HTMLButtonElement;
    expect(chip.getAttribute("aria-pressed")).toBe("false");
  });

  it("aria-pressed is true for active (selected) chips", () => {
    render(<FilterBar {...baseProps({ selectedTagIds: [TAG_MORNING.id] })} />);
    const chip = screen.getByTestId(`filter-tag-${TAG_MORNING.id}`) as HTMLButtonElement;
    expect(chip.getAttribute("aria-pressed")).toBe("true");
  });

  it("aria-pressed is false for chips that are NOT selected even when other chips are", () => {
    render(<FilterBar {...baseProps({ selectedTagIds: [TAG_MORNING.id] })} />);
    const inactiveChip = screen.getByTestId(`filter-tag-${TAG_STAFFED.id}`) as HTMLButtonElement;
    expect(inactiveChip.getAttribute("aria-pressed")).toBe("false");
  });

  // ── Toggle callback ──────────────────────────────────────────────────────────

  it("clicking a chip fires onToggle with the chip tagId", () => {
    const toggleTag = vi.fn();
    render(<FilterBar {...baseProps({ toggleTag })} />);
    fireEvent.click(screen.getByTestId(`filter-tag-${TAG_MORNING.id}`));
    expect(toggleTag).toHaveBeenCalledWith(TAG_MORNING.id);
  });

  it("clicking a chip fires onToggle exactly once per click", () => {
    const toggleTag = vi.fn();
    render(<FilterBar {...baseProps({ toggleTag })} />);
    fireEvent.click(screen.getByTestId(`filter-tag-${TAG_STAFFED.id}`));
    fireEvent.click(screen.getByTestId(`filter-tag-${TAG_STAFFED.id}`));
    expect(toggleTag).toHaveBeenCalledTimes(2);
  });

  // ── Clear button ─────────────────────────────────────────────────────────────

  it("clear button is hidden when no filters are active", () => {
    render(<FilterBar {...baseProps({ hasActive: false })} />);
    expect(screen.queryByTestId("filter-clear")).toBeNull();
  });

  it("clear button is visible when at least one filter is active", () => {
    render(<FilterBar {...baseProps({ hasActive: true, selectedTagIds: [TAG_MORNING.id] })} />);
    expect(screen.getByTestId("filter-clear")).toBeTruthy();
  });

  it("clicking clear button fires clearFilters callback", () => {
    const clearFilters = vi.fn();
    render(
      <FilterBar
        {...baseProps({ hasActive: true, selectedTagIds: [TAG_MORNING.id], clearFilters })}
      />,
    );
    fireEvent.click(screen.getByTestId("filter-clear"));
    expect(clearFilters).toHaveBeenCalledTimes(1);
  });

  it("clear button text matches i18n filterBar.clear key", () => {
    render(
      <FilterBar {...baseProps({ hasActive: true, selectedTagIds: [TAG_MORNING.id] })} />,
    );
    const clearBtn = screen.getByTestId("filter-clear");
    expect(clearBtn.textContent).toContain("Clear");
  });

  // ── Color swatch ─────────────────────────────────────────────────────────────

  it("inactive chip renders a color dot with the tag's background color", () => {
    render(<FilterBar {...baseProps({ selectedTagIds: [] })} />);

    const chip = screen.getByTestId(`filter-tag-${TAG_MORNING.id}`);
    // The color dot is a <span> with aria-hidden=true and inline background-color.
    const dot = chip.querySelector('span[aria-hidden="true"]') as HTMLSpanElement | null;
    expect(dot).toBeTruthy();
    // backgroundColor is set from tag.color (#f59e0b → rgb(245, 158, 11))
    expect(dot?.style.backgroundColor).toBeTruthy();
  });

  it("active chip applies tag color as chip background via inline style", () => {
    render(
      <FilterBar
        {...baseProps({ selectedTagIds: [TAG_MORNING.id], hasActive: true })}
      />,
    );

    const chip = screen.getByTestId(`filter-tag-${TAG_MORNING.id}`) as HTMLElement;
    // When active, the chip itself gets style.backgroundColor from tag.color
    expect(chip.style.backgroundColor).toBeTruthy();
  });

  // ── role="search" + aria-label ───────────────────────────────────────────────

  it("bar container has role=search for accessibility", () => {
    render(<FilterBar {...baseProps()} />);
    expect(screen.getByRole("search")).toBeTruthy();
  });

  it("bar container has aria-label matching filterBar.ariaLabel i18n key", () => {
    render(<FilterBar {...baseProps()} />);
    const bar = screen.getByRole("search");
    expect(bar.getAttribute("aria-label")).toBe("Filter items");
  });

  // ── i18n presence ────────────────────────────────────────────────────────────

  it("renders the filterBar.label i18n text", () => {
    render(<FilterBar {...baseProps()} />);
    expect(screen.getByText("Filter:")).toBeTruthy();
  });

  // ── AND semantics at component level ─────────────────────────────────────────

  it("chip for each tag reflects correct pressed state when multiple are selected", () => {
    render(
      <FilterBar
        {...baseProps({
          selectedTagIds: [TAG_MORNING.id, TAG_STAFFED.id],
          hasActive: true,
        })}
      />,
    );

    const morningChip = screen.getByTestId(`filter-tag-${TAG_MORNING.id}`) as HTMLButtonElement;
    const staffedChip = screen.getByTestId(`filter-tag-${TAG_STAFFED.id}`) as HTMLButtonElement;

    expect(morningChip.getAttribute("aria-pressed")).toBe("true");
    expect(staffedChip.getAttribute("aria-pressed")).toBe("true");
  });

  it("only selected chips have aria-pressed=true — unselected chips remain false", () => {
    const props = baseProps({
      allTagIds: [TAG_MORNING.id, TAG_STAFFED.id, TAG_AUTONOMOUS.id],
      tagCounts: new Map([
        [TAG_MORNING.id, 2],
        [TAG_STAFFED.id, 1],
        [TAG_AUTONOMOUS.id, 1],
      ]),
      resolvedTags: [TAG_MORNING, TAG_STAFFED, TAG_AUTONOMOUS],
      selectedTagIds: [TAG_MORNING.id],
      hasActive: true,
    });

    render(<FilterBar {...props} />);

    expect(
      (screen.getByTestId(`filter-tag-${TAG_MORNING.id}`) as HTMLButtonElement).getAttribute(
        "aria-pressed",
      ),
    ).toBe("true");
    expect(
      (screen.getByTestId(`filter-tag-${TAG_STAFFED.id}`) as HTMLButtonElement).getAttribute(
        "aria-pressed",
      ),
    ).toBe("false");
    expect(
      (screen.getByTestId(`filter-tag-${TAG_AUTONOMOUS.id}`) as HTMLButtonElement).getAttribute(
        "aria-pressed",
      ),
    ).toBe("false");
  });

  // ── Keyboard navigation ───────────────────────────────────────────────────────

  it("chips are focusable buttons (keyboard navigable)", () => {
    render(<FilterBar {...baseProps()} />);
    const chip = screen.getByTestId(`filter-tag-${TAG_MORNING.id}`);
    expect(chip.tagName).toBe("BUTTON");
    // Buttons are tab-focusable by default (no tabIndex=-1 on these chips)
    expect((chip as HTMLButtonElement).tabIndex).not.toBe(-1);
  });
});
