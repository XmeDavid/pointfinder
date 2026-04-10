import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { IconRail } from "./IconRail";
import { useWorkspaceStore } from "@/stores/workspace";

// Wrap in router since IconRail uses useNavigate / useLocation
function renderWithRouter(ui: React.ReactNode) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe("IconRail", () => {
  beforeEach(() => {
    useWorkspaceStore.setState({
      mode: "build",
      settingsPanelOpen: false,
    });
  });

  it("renders PF logo", () => {
    renderWithRouter(<IconRail showModes={true} />);
    const logos = screen.getAllByLabelText("Dashboard");
    expect(logos.length).toBeGreaterThan(0);
    expect(logos[0].textContent).toBe("PF");
  });

  it("shows mode icons when showModes is true", () => {
    renderWithRouter(<IconRail showModes={true} />);
    expect(screen.getAllByLabelText("Build").length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText("Command").length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText("Review").length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText("Results").length).toBeGreaterThan(0);
  });

  it("hides mode icons when showModes is false", () => {
    renderWithRouter(<IconRail showModes={false} />);
    expect(screen.queryByLabelText("Build")).toBeNull();
    expect(screen.queryByLabelText("Command")).toBeNull();
    expect(screen.queryByLabelText("Review")).toBeNull();
    expect(screen.queryByLabelText("Results")).toBeNull();
  });

  it("renders settings button when showModes is true", () => {
    renderWithRouter(<IconRail showModes={true} />);
    expect(screen.getAllByTestId("settings-btn").length).toBeGreaterThan(0);
  });

  it("hides settings button when showModes is false", () => {
    renderWithRouter(<IconRail showModes={false} />);
    expect(screen.queryByTestId("settings-btn")).toBeNull();
  });
});
