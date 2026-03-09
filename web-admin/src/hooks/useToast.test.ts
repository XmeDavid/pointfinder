import { describe, expect, it, beforeEach, vi, afterEach } from "vitest";
import { useToastStore } from "./useToast";

describe("useToastStore", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useToastStore.setState({ toasts: [] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts with no toasts", () => {
    expect(useToastStore.getState().toasts).toEqual([]);
  });

  it("adds a toast with default variant 'info'", () => {
    useToastStore.getState().addToast("Hello");
    const toasts = useToastStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0].message).toBe("Hello");
    expect(toasts[0].variant).toBe("info");
    expect(toasts[0].id).toBeTruthy();
  });

  it("adds a toast with specified variant", () => {
    useToastStore.getState().addToast("Error occurred", "error");
    const toasts = useToastStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0].variant).toBe("error");
  });

  it("supports success variant", () => {
    useToastStore.getState().addToast("Saved", "success");
    expect(useToastStore.getState().toasts[0].variant).toBe("success");
  });

  it("generates unique IDs for each toast", () => {
    useToastStore.getState().addToast("First");
    useToastStore.getState().addToast("Second");
    const toasts = useToastStore.getState().toasts;
    expect(toasts).toHaveLength(2);
    expect(toasts[0].id).not.toBe(toasts[1].id);
  });

  it("removes a toast by id", () => {
    useToastStore.getState().addToast("Remove me");
    const id = useToastStore.getState().toasts[0].id;
    useToastStore.getState().removeToast(id);
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it("removeToast is a no-op for non-existent id", () => {
    useToastStore.getState().addToast("Stay here");
    useToastStore.getState().removeToast("non-existent-id");
    expect(useToastStore.getState().toasts).toHaveLength(1);
  });

  it("auto-removes toast after 4 seconds", () => {
    useToastStore.getState().addToast("Temporary");
    expect(useToastStore.getState().toasts).toHaveLength(1);

    vi.advanceTimersByTime(3999);
    expect(useToastStore.getState().toasts).toHaveLength(1);

    vi.advanceTimersByTime(1);
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it("auto-removes only the specific toast, not others", () => {
    useToastStore.getState().addToast("First");
    vi.advanceTimersByTime(2000);
    useToastStore.getState().addToast("Second");

    // After 2 more seconds, first should be removed (4s total)
    vi.advanceTimersByTime(2000);
    const toasts = useToastStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0].message).toBe("Second");

    // After 2 more seconds, second should also be removed
    vi.advanceTimersByTime(2000);
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it("handles multiple concurrent toasts", () => {
    useToastStore.getState().addToast("One");
    useToastStore.getState().addToast("Two");
    useToastStore.getState().addToast("Three");
    expect(useToastStore.getState().toasts).toHaveLength(3);

    // All added at the same time, so all expire together
    vi.advanceTimersByTime(4000);
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it("manual remove before auto-remove does not cause errors", () => {
    useToastStore.getState().addToast("Quick dismiss");
    const id = useToastStore.getState().toasts[0].id;

    // Manually remove
    useToastStore.getState().removeToast(id);
    expect(useToastStore.getState().toasts).toHaveLength(0);

    // Auto-remove timer fires but toast is already gone -- should not throw
    vi.advanceTimersByTime(4000);
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });
});
