import React from "react";
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { GuestGuard } from "./GuestGuard";
import { useAuthStore } from "@/hooks/useAuth";

function renderGuard() {
  return render(
    <MemoryRouter>
      <GuestGuard>
        <div data-testid="protected-content">Login Page</div>
      </GuestGuard>
    </MemoryRouter>
  );
}

describe("GuestGuard", () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      hasHydrated: false,
    });
  });

  it("shows loading spinner before store has hydrated", () => {
    useAuthStore.setState({ hasHydrated: false });
    const { container } = renderGuard();
    expect(container.querySelector(".animate-spin")).toBeTruthy();
    expect(screen.queryByTestId("protected-content")).toBeNull();
  });

  it("renders children when not authenticated and hydrated", () => {
    useAuthStore.setState({ hasHydrated: true, isAuthenticated: false });
    renderGuard();
    expect(screen.getByTestId("protected-content")).toBeTruthy();
    expect(screen.getByText("Login Page")).toBeTruthy();
  });

  it("redirects to /games when authenticated", () => {
    useAuthStore.setState({ hasHydrated: true, isAuthenticated: true });
    const { container } = renderGuard();
    // Navigate component renders nothing visible -- children should not appear
    expect(screen.queryByTestId("protected-content")).toBeNull();
    // The spinner should also not be visible
    expect(container.querySelector(".animate-spin")).toBeNull();
  });
});
