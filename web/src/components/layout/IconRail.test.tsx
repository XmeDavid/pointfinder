import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { IconRail } from "./IconRail";
import { useWorkspaceStore } from "@/stores/workspace";
const platform = vi.hoisted(() => ({ native: false }));
vi.mock('@/platform/runtime', () => ({ isNative: () => platform.native, isNativeEntry: () => platform.native }));

// Wrap in router + query client since IconRail uses useNavigate / useLocation and react-query
function renderWithRouter(ui: React.ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/game/g']}><Routes><Route path="/game/:id" element={ui} /></Routes></MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("IconRail", () => {
  beforeEach(() => {
    platform.native = false;
    useWorkspaceStore.setState({
      mode: "build",
      settingsPanelOpen: false,
    });
  });

  it('uses six native phone items with settings and a combined home/account entry', () => {
    platform.native = true;
    renderWithRouter(<IconRail showModes={true} />);
    const nav = within(screen.getByTestId('icon-rail-mobile'));
    expect(nav.queryByTestId('nfc-tags-btn')).not.toBeInTheDocument();
    expect(nav.getByTestId('settings-btn')).toBeInTheDocument();
    expect(nav.getAllByRole('button')).toHaveLength(6);
    expect(nav.queryByTestId('language-picker-btn')).not.toBeInTheDocument();
  });

  it("removes the separate mobile PF button in favor of the account menu", () => {
    renderWithRouter(<IconRail showModes={true} />);
    const nav = within(screen.getByTestId('icon-rail-mobile'));
    expect(nav.queryByLabelText('Dashboard')).not.toBeInTheDocument();
    expect(nav.getByTestId('user-avatar-btn')).toBeInTheDocument();
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
