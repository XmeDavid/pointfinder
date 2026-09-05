import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { SearchInput } from "./SearchInput";

describe("SearchInput", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders with placeholder text", () => {
    render(<SearchInput value="" onChange={() => {}} placeholder="Find a game" />);
    expect(screen.getByPlaceholderText("Find a game")).toBeDefined();
  });

  it("shows clear button when value is non-empty", () => {
    const { rerender } = render(<SearchInput value="" onChange={() => {}} />);
    expect(screen.queryByLabelText("Clear search")).toBeNull();

    rerender(<SearchInput value="hello" onChange={() => {}} />);
    expect(screen.getByLabelText("Clear search")).toBeDefined();
  });

  it("fires onChange with debounced value", () => {
    const handleChange = vi.fn();

    render(<SearchInput value="" onChange={handleChange} debounceMs={200} />);

    const input = screen.getByPlaceholderText("Search...");

    fireEvent.change(input, { target: { value: "abc" } });

    // onChange should not have been called yet (debounce pending)
    expect(handleChange).not.toHaveBeenCalled();

    // Advance past debounce
    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(handleChange).toHaveBeenCalledTimes(1);
    expect(handleChange).toHaveBeenCalledWith("abc");
  });

  it("clears input when X is clicked", () => {
    const handleChange = vi.fn();

    render(<SearchInput value="test" onChange={handleChange} />);

    const clearBtn = screen.getByLabelText("Clear search");
    fireEvent.click(clearBtn);

    // Clear fires immediately, no debounce
    expect(handleChange).toHaveBeenCalledWith("");
  });
});
