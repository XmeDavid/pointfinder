import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Real i18n so useTranslation returns real keys and interpolation works.
import "@/i18n";

// --- Module mocks -----------------------------------------------------------
vi.mock("@/lib/api/teams", () => ({
  teamsApi: {
    listByGame: vi.fn(),
    getPlayers: vi.fn(),
    manualCheckIn: vi.fn(),
    createUnlockOverride: vi.fn(),
    removeUnlockOverride: vi.fn(),
    listUnlockOverrides: vi.fn(),
    removePlayer: vi.fn(),
    markCompleted: vi.fn(),
  },
}));

vi.mock("@/lib/api/submissions", () => ({
  submissionsApi: {
    listByTeam: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("@/lib/api/challenges", () => ({
  challengesApi: {
    listByGame: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("@/lib/api/bases", () => ({
  basesApi: {
    listByGame: vi.fn(),
  },
}));

vi.mock("@/lib/api/monitoring", () => ({
  monitoringApi: {
    getProgress: vi.fn(),
  },
}));


import { teamsApi, type BaseUnlockOverrideResponse } from "@/lib/api/teams";
import { basesApi } from "@/lib/api/bases";
import { monitoringApi } from "@/lib/api/monitoring";
import { TeamDetailPage } from "../TeamDetailPage";
import type { Team, Base, TeamBaseProgress } from "@/types";

function makeTeam(overrides: Partial<Team> = {}): Team {
  return {
    id: "t1",
    gameId: "g1",
    name: "Eagles",
    joinCode: "JOINCODE-123456789",
    color: "#ff8800",
    ...overrides,
  };
}

function makeBase(id: string, overrides: Partial<Base> = {}): Base {
  return {
    id,
    gameId: "g1",
    name: `Base ${id}`,
    description: "",
    lat: 40.0,
    lng: -8.0,
    nfcLinked: true,
    hidden: false,
    ...overrides,
  };
}

function makeOverride(
  baseId: string,
  overrides: Partial<BaseUnlockOverrideResponse> = {},
): BaseUnlockOverrideResponse {
  return {
    id: `override-${baseId}`,
    gameId: "g1",
    teamId: "t1",
    baseId,
    createdByOperatorId: "op-1",
    createdByDisplayName: "Jane Operator",
    reason: "Rain-out",
    createdAt: "2026-04-08T00:00:00Z",
    ...overrides,
  };
}

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
      <MemoryRouter initialEntries={["/games/g1/monitor/teams/t1"]}>
        <Routes>
          <Route path="/games/:gameId/monitor/teams/:teamId" element={<TeamDetailPage />} />
          <Route path="/games/:gameId/monitor/leaderboard" element={<div>leaderboard</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("TeamDetailPage — manual check-in reason field", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(teamsApi.listByGame).mockResolvedValue([makeTeam()]);
    vi.mocked(teamsApi.getPlayers).mockResolvedValue([]);
    vi.mocked(teamsApi.listUnlockOverrides).mockResolvedValue([]);
    vi.mocked(teamsApi.manualCheckIn).mockResolvedValue();
    vi.mocked(monitoringApi.getProgress).mockResolvedValue([]);
    vi.mocked(basesApi.listByGame).mockResolvedValue([makeBase("b1")]);
  });

  it("submits the reason through to teamsApi.manualCheckIn when provided", async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId("team-base-row-b1")).toBeTruthy();
    });

    // Open manual check-in dialog.
    fireEvent.click(screen.getAllByText(/Manual Check-in/i)[0]);

    await waitFor(() => {
      expect(screen.getByTestId("manual-check-in-reason")).toBeTruthy();
    });

    // Fill in reason and submit.
    fireEvent.change(screen.getByTestId("manual-check-in-reason"), {
      target: { value: "NFC hardware glitch" },
    });
    fireEvent.click(screen.getByTestId("manual-check-in-submit"));

    await waitFor(() => {
      expect(teamsApi.manualCheckIn).toHaveBeenCalledWith(
        "g1",
        "t1",
        "b1",
        { reason: "NFC hardware glitch" },
      );
    });
  });

  it("sends no body when the reason field is left empty", async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId("team-base-row-b1")).toBeTruthy();
    });

    fireEvent.click(screen.getAllByText(/Manual Check-in/i)[0]);

    await waitFor(() => {
      expect(screen.getByTestId("manual-check-in-submit")).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("manual-check-in-submit"));

    await waitFor(() => {
      expect(teamsApi.manualCheckIn).toHaveBeenCalledWith(
        "g1",
        "t1",
        "b1",
        undefined,
      );
    });
  });
});

describe("TeamDetailPage — unlock override UI", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(teamsApi.listByGame).mockResolvedValue([makeTeam()]);
    vi.mocked(teamsApi.getPlayers).mockResolvedValue([]);
    vi.mocked(monitoringApi.getProgress).mockResolvedValue([]);
    vi.mocked(teamsApi.createUnlockOverride).mockResolvedValue(
      makeOverride("b1", { reason: "Manual review" }),
    );
    vi.mocked(teamsApi.removeUnlockOverride).mockResolvedValue();
  });

  it("shows an override button on hidden bases with no active override, and calls the API on confirm", async () => {
    vi.mocked(teamsApi.listUnlockOverrides).mockResolvedValue([]);
    vi.mocked(basesApi.listByGame).mockResolvedValue([
      makeBase("b1", { hidden: true }),
    ]);

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId("unlock-override-btn-b1")).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("unlock-override-btn-b1"));

    await waitFor(() => {
      expect(screen.getByTestId("unlock-override-reason")).toBeTruthy();
    });

    fireEvent.change(screen.getByTestId("unlock-override-reason"), {
      target: { value: "Manual review" },
    });
    fireEvent.click(screen.getByTestId("unlock-override-submit"));

    await waitFor(() => {
      expect(teamsApi.createUnlockOverride).toHaveBeenCalledWith(
        "g1",
        "t1",
        "b1",
        { reason: "Manual review" },
      );
    });
  });

  it("shows an active override badge + remove button when the list endpoint returns a row", async () => {
    vi.mocked(teamsApi.listUnlockOverrides).mockResolvedValue([
      makeOverride("b1", { createdByDisplayName: "Alice Op" }),
    ]);
    vi.mocked(basesApi.listByGame).mockResolvedValue([
      makeBase("b1", { hidden: true }),
    ]);

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId("unlock-override-active-b1")).toBeTruthy();
    });

    // Badge mentions the operator display name.
    expect(screen.getByTestId("unlock-override-active-b1").textContent).toContain("Alice Op");
    expect(screen.getByTestId("unlock-override-remove-btn-b1")).toBeTruthy();

    // Removing opens a confirm dialog then calls the API.
    fireEvent.click(screen.getByTestId("unlock-override-remove-btn-b1"));

    await waitFor(() => {
      expect(screen.getByTestId("unlock-override-remove-submit")).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("unlock-override-remove-submit"));

    await waitFor(() => {
      expect(teamsApi.removeUnlockOverride).toHaveBeenCalledWith("g1", "t1", "b1");
    });
  });

  it("does NOT render the override button for bases that are visible (non-hidden)", async () => {
    vi.mocked(teamsApi.listUnlockOverrides).mockResolvedValue([]);
    vi.mocked(basesApi.listByGame).mockResolvedValue([
      makeBase("b1", { hidden: false }),
    ]);

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId("team-base-row-b1")).toBeTruthy();
    });

    expect(screen.queryByTestId("unlock-override-btn-b1")).toBeNull();
  });
});

function makeProgress(
  baseId: string,
  overrides: Partial<TeamBaseProgress> = {},
): TeamBaseProgress {
  return {
    baseId,
    teamId: "t1",
    status: "checked_in",
    challengeId: `ch-${baseId}`,
    ...overrides,
  };
}

describe("TeamDetailPage — mark completed UI", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(teamsApi.listByGame).mockResolvedValue([makeTeam()]);
    vi.mocked(teamsApi.getPlayers).mockResolvedValue([]);
    vi.mocked(teamsApi.listUnlockOverrides).mockResolvedValue([]);
    vi.mocked(teamsApi.markCompleted).mockResolvedValue({} as never);
    vi.mocked(basesApi.listByGame).mockResolvedValue([makeBase("b1")]);
    vi.mocked(monitoringApi.getProgress).mockResolvedValue([
      makeProgress("b1"),
    ]);
  });

  it("shows the mark-completed button when a base has a progress entry with a challengeId and is not completed", async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId("mark-completed-btn-b1")).toBeTruthy();
    });
  });

  it("does NOT show mark-completed button when base status is already completed", async () => {
    vi.mocked(monitoringApi.getProgress).mockResolvedValue([
      makeProgress("b1", { status: "completed" }),
    ]);

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId("team-base-row-b1")).toBeTruthy();
    });

    expect(screen.queryByTestId("mark-completed-btn-b1")).toBeNull();
  });

  it("clicking mark-completed opens the confirmation dialog", async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId("mark-completed-btn-b1")).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("mark-completed-btn-b1"));

    await waitFor(() => {
      expect(screen.getByTestId("mark-completed-submit")).toBeTruthy();
    });
  });

  it("confirming the dialog calls teamsApi.markCompleted with correct args", async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId("mark-completed-btn-b1")).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("mark-completed-btn-b1"));

    await waitFor(() => {
      expect(screen.getByTestId("mark-completed-submit")).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("mark-completed-submit"));

    await waitFor(() => {
      expect(teamsApi.markCompleted).toHaveBeenCalledWith(
        "g1",
        "t1",
        "b1",
        expect.objectContaining({ challengeId: "ch-b1" }),
      );
    });
  });
});
