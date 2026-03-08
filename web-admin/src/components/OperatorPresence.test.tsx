import React from "react";
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { OperatorPresence } from "./OperatorPresence";
import { useOperatorPresenceStore } from "@/hooks/useOperatorPresence";

describe("OperatorPresence", () => {
  beforeEach(() => {
    useOperatorPresenceStore.setState({ operators: [] });
  });

  it("renders nothing when no operators", () => {
    const { container } = render(<OperatorPresence />);
    expect(container.firstChild).toBeNull();
  });

  it("renders operator initials", () => {
    useOperatorPresenceStore.setState({
      operators: [
        { id: "1", name: "David Marques", initials: "DM" },
        { id: "2", name: "Maria Silva", initials: "MS" },
      ],
    });
    render(<OperatorPresence />);
    expect(screen.getByText("DM")).toBeTruthy();
    expect(screen.getByText("MS")).toBeTruthy();
  });

  it("shows overflow indicator for many operators", () => {
    useOperatorPresenceStore.setState({
      operators: [
        { id: "1", name: "A", initials: "A" },
        { id: "2", name: "B", initials: "B" },
        { id: "3", name: "C", initials: "C" },
        { id: "4", name: "D", initials: "D" },
        { id: "5", name: "E", initials: "E" },
        { id: "6", name: "F", initials: "F" },
      ],
    });
    render(<OperatorPresence />);
    expect(screen.getByText("+2")).toBeTruthy();
  });

  it("shows full names in title/tooltip", () => {
    useOperatorPresenceStore.setState({
      operators: [{ id: "1", name: "David Marques", initials: "DM" }],
    });
    render(<OperatorPresence />);
    expect(screen.getByTitle("David Marques")).toBeTruthy();
  });
});
