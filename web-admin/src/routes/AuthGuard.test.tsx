import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthGuard } from "./AuthGuard";
import { useAuthStore } from "@/hooks/useAuth";

// Mock the API client so the session-verify query resolves or rejects as needed.
vi.mock("@/lib/api/client", () => {
  return {
    default: {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      interceptors: {
        request: { use: vi.fn() },
        response: { use: vi.fn() },
      },
    },
  };
});

import apiClient from "@/lib/api/client";

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });
}

function renderGuard(queryClient?: QueryClient) {
  const qc = queryClient ?? createTestQueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <AuthGuard>
          <div data-testid="protected-content">Dashboard</div>
        </AuthGuard>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("AuthGuard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      hasHydrated: false,
    });
  });

  it("shows loading spinner before store has hydrated", () => {
    useAuthStore.setState({ hasHydrated: false, isAuthenticated: false });
    const { container } = renderGuard();
    expect(container.querySelector(".animate-spin")).toBeTruthy();
    expect(screen.queryByTestId("protected-content")).toBeNull();
  });

  it("redirects to /login when not authenticated and hydrated", () => {
    useAuthStore.setState({ hasHydrated: true, isAuthenticated: false });
    const { container } = renderGuard();
    // Navigate renders nothing visible, children should not be rendered
    expect(screen.queryByTestId("protected-content")).toBeNull();
    expect(container.querySelector(".animate-spin")).toBeNull();
  });

  it("shows loading spinner while verifying session", () => {
    // Make the API call hang (never resolve) to keep isPending=true
    vi.mocked(apiClient.get).mockReturnValue(new Promise(() => {}));
    useAuthStore.setState({ hasHydrated: true, isAuthenticated: true });
    const { container } = renderGuard();
    // Should show spinner while session verification is in progress
    expect(container.querySelector(".animate-spin")).toBeTruthy();
    expect(screen.queryByTestId("protected-content")).toBeNull();
  });

  it("renders children when authenticated and session is valid", async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [] });
    useAuthStore.setState({ hasHydrated: true, isAuthenticated: true });
    renderGuard();

    await waitFor(() => {
      expect(screen.getByTestId("protected-content")).toBeTruthy();
    });
    expect(screen.getByText("Dashboard")).toBeTruthy();
  });

  it("calls handleAuthFailure when session verification fails", async () => {
    vi.mocked(apiClient.get).mockRejectedValue(new Error("401 Unauthorized"));
    useAuthStore.setState({ hasHydrated: true, isAuthenticated: true });
    const handleAuthFailureSpy = vi.fn();
    useAuthStore.setState({ handleAuthFailure: handleAuthFailureSpy });

    renderGuard();

    await waitFor(() => {
      expect(handleAuthFailureSpy).toHaveBeenCalled();
    });
  });

  it("verifies session by calling GET /games", async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [] });
    useAuthStore.setState({ hasHydrated: true, isAuthenticated: true });
    renderGuard();

    await waitFor(() => {
      expect(apiClient.get).toHaveBeenCalledWith("/games");
    });
  });

  it("does not attempt session verification when not authenticated", () => {
    useAuthStore.setState({ hasHydrated: true, isAuthenticated: false });
    renderGuard();
    expect(apiClient.get).not.toHaveBeenCalled();
  });
});
