import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import "@/i18n";

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("@/lib/api/notifications", () => ({
  notificationsApi: {
    listByGame: vi.fn(),
    send: vi.fn(),
  },
}));

vi.mock("@/lib/api/teams", () => ({
  teamsApi: {
    listByGame: vi.fn(),
  },
}));

vi.mock("@/hooks/useGameWebSocket", () => ({
  useGameWebSocket: vi.fn().mockReturnValue(null),
}));

vi.mock("@/hooks/useToast", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

import { notificationsApi } from "@/lib/api/notifications";
import { teamsApi } from "@/lib/api/teams";
import { NotificationsPage } from "../NotificationsPage";
import type { GameNotification } from "@/types";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeNotification(id: string, overrides: Partial<GameNotification> = {}): GameNotification {
  return {
    id,
    gameId: "g1",
    message: `Notification ${id}`,
    sentAt: "2026-06-01T10:00:00Z",
    sentBy: "op1",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Render helper
// ---------------------------------------------------------------------------

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
}

function renderPage() {
  const qc = createTestQueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/games/g1/notifications"]}>
        <Routes>
          <Route path="/games/:gameId/notifications" element={<NotificationsPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("NotificationsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(notificationsApi.listByGame).mockResolvedValue([]);
    vi.mocked(teamsApi.listByGame).mockResolvedValue([]);
  });

  it("renders the notifications page heading", async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1 })).toBeTruthy();
    });
  });

  it("renders the message textarea with correct data-testid", async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId("notification-message-input")).toBeTruthy();
    });
  });

  it("send button is disabled when the message input is empty", async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId("notification-send-btn")).toBeTruthy();
    });

    expect(screen.getByTestId("notification-send-btn").hasAttribute("disabled")).toBe(true);
  });

  it("send button becomes enabled when a non-empty message is typed", async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId("notification-message-input")).toBeTruthy();
    });

    fireEvent.change(screen.getByTestId("notification-message-input"), {
      target: { value: "Rally at the main square!" },
    });

    expect(screen.getByTestId("notification-send-btn").hasAttribute("disabled")).toBe(false);
  });

  it("calls notificationsApi.send with gameId and message on form submit", async () => {
    vi.mocked(notificationsApi.send).mockResolvedValue(makeNotification("n-new"));
    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId("notification-message-input")).toBeTruthy();
    });

    fireEvent.change(screen.getByTestId("notification-message-input"), {
      target: { value: "Meet at base camp" },
    });
    fireEvent.click(screen.getByTestId("notification-send-btn"));

    await waitFor(() => {
      expect(notificationsApi.send).toHaveBeenCalledWith(
        expect.objectContaining({
          gameId: "g1",
          message: "Meet at base camp",
        }),
      );
    });
  });
});
