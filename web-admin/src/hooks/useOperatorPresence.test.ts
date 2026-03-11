import { describe, it, expect, beforeEach } from "vitest";
import { useOperatorPresenceStore, type OperatorPresence } from "./useOperatorPresence";

const op1: OperatorPresence = { id: "1", name: "Alice", initials: "A" };
const op2: OperatorPresence = { id: "2", name: "Bob", initials: "B" };
const op3: OperatorPresence = { id: "3", name: "Charlie", initials: "C" };

describe("useOperatorPresenceStore", () => {
  beforeEach(() => {
    useOperatorPresenceStore.getState().clear();
  });

  it("starts with an empty operators list", () => {
    expect(useOperatorPresenceStore.getState().operators).toEqual([]);
  });

  it("setOperators replaces the entire list", () => {
    useOperatorPresenceStore.getState().setOperators([op1, op2]);
    expect(useOperatorPresenceStore.getState().operators).toEqual([op1, op2]);

    useOperatorPresenceStore.getState().setOperators([op3]);
    expect(useOperatorPresenceStore.getState().operators).toEqual([op3]);
  });

  it("setOperators with empty array clears the list", () => {
    useOperatorPresenceStore.getState().setOperators([op1]);
    useOperatorPresenceStore.getState().setOperators([]);
    expect(useOperatorPresenceStore.getState().operators).toEqual([]);
  });

  it("clear resets operators to empty", () => {
    useOperatorPresenceStore.getState().setOperators([op1, op2, op3]);
    useOperatorPresenceStore.getState().clear();
    expect(useOperatorPresenceStore.getState().operators).toEqual([]);
  });

  it("preserves operator data integrity", () => {
    useOperatorPresenceStore.getState().setOperators([op1, op2]);
    const stored = useOperatorPresenceStore.getState().operators;
    expect(stored[0]).toEqual({ id: "1", name: "Alice", initials: "A" });
    expect(stored[1]).toEqual({ id: "2", name: "Bob", initials: "B" });
  });
});
