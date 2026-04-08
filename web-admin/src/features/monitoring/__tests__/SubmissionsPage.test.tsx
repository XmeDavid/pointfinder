import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import "@/i18n";

// --- Module mocks -----------------------------------------------------------
vi.mock("@/lib/api/submissions", () => ({
  submissionsApi: {
    listByGame: vi.fn(),
    review: vi.fn(),
  },
}));

vi.mock("@/lib/api/teams", () => ({
  teamsApi: {
    listByGame: vi.fn(),
    markCompleted: vi.fn(),
  },
}));

vi.mock("@/lib/api/challenges", () => ({
  challengesApi: {
    listByGame: vi.fn(),
  },
}));

vi.mock("@/lib/api/bases", () => ({
  basesApi: {
    listByGame: vi.fn(),
  },
}));

vi.mock("@/hooks/useGameWebSocket", () => ({
  useGameWebSocket: () => null,
}));

// AuthMedia hits the network — replace with a dumb stub.
vi.mock("@/components/AuthMedia", () => ({
  AuthMedia: ({ alt }: { alt: string }) => <span data-testid="auth-media-stub">{alt}</span>,
}));

import { submissionsApi } from "@/lib/api/submissions";
import { teamsApi } from "@/lib/api/teams";
import { challengesApi } from "@/lib/api/challenges";
import { basesApi } from "@/lib/api/bases";
import { SubmissionsPage } from "../SubmissionsPage";
import type { Submission, Team, Challenge, Base } from "@/types";

function makeSubmission(overrides: Partial<Submission> = {}): Submission {
  return {
    id: "sub-1",
    teamId: "t1",
    challengeId: "ch1",
    baseId: "b1",
    answer: "We did the task",
    status: "pending",
    submittedAt: "2026-04-08T10:00:00Z",
    ...overrides,
  };
}

function makeTeam(overrides: Partial<Team> = {}): Team {
  return {
    id: "t1",
    gameId: "g1",
    name: "Eagles",
    joinCode: "CODE-123",
    color: "#ff8800",
    ...overrides,
  };
}

function makeChallenge(overrides: Partial<Challenge> = {}): Challenge {
  return {
    id: "ch1",
    gameId: "g1",
    title: "Find the marker",
    description: "",
    content: "",
    completionContent: "",
    answerType: "text",
    autoValidate: false,
    points: 100,
    locationBound: false,
    requirePresenceToSubmit: false,
    ...overrides,
  };
}

function makeBase(overrides: Partial<Base> = {}): Base {
  return {
    id: "b1",
    gameId: "g1",
    name: "Alpha base",
    description: "",
    lat: 0,
    lng: 0,
    nfcLinked: true,
    hidden: false,
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
      <MemoryRouter initialEntries={["/games/g1/monitor/submissions"]}>
        <Routes>
          <Route path="/games/:gameId/monitor/submissions" element={<SubmissionsPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("SubmissionsPage — mark-completed rescue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(submissionsApi.listByGame).mockResolvedValue([makeSubmission()]);
    vi.mocked(teamsApi.listByGame).mockResolvedValue([makeTeam()]);
    vi.mocked(challengesApi.listByGame).mockResolvedValue([makeChallenge({ points: 120 })]);
    vi.mocked(basesApi.listByGame).mockResolvedValue([makeBase()]);
  });

  it("opens the mark-completed dialog with defaults prefilled from the challenge", async () => {
    renderPage();

    // Click the pending submission card to open the review dialog.
    await waitFor(() => {
      // The pending card renders with role="button" — pick the one that
      // wraps the challenge title. There is only one submission in the
      // list so the only role=button with that content is the card.
      const cards = screen.getAllByRole("button").filter((el) =>
        el.textContent?.includes("Find the marker"),
      );
      expect(cards.length).toBe(1);
    });
    const card = screen
      .getAllByRole("button")
      .filter((el) => el.textContent?.includes("Find the marker"))[0];
    fireEvent.click(card);

    await waitFor(() => {
      expect(screen.getByTestId("submission-mark-completed-btn")).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId("submission-mark-completed-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("mark-completed-dialog")).toBeTruthy();
    });

    const pointsInput = screen.getByTestId("mark-completed-points") as HTMLInputElement;
    expect(pointsInput.value).toBe("120");
  });

  it("calls teamsApi.markCompleted with the reason + points override on submit", async () => {
    vi.mocked(teamsApi.markCompleted).mockResolvedValue(
      makeSubmission({ id: "sub-1", status: "approved", points: 90 }),
    );
    renderPage();

    await waitFor(() => {
      // The pending card renders with role="button" — pick the one that
      // wraps the challenge title. There is only one submission in the
      // list so the only role=button with that content is the card.
      const cards = screen.getAllByRole("button").filter((el) =>
        el.textContent?.includes("Find the marker"),
      );
      expect(cards.length).toBe(1);
    });
    const card = screen
      .getAllByRole("button")
      .filter((el) => el.textContent?.includes("Find the marker"))[0];
    fireEvent.click(card);

    await waitFor(() => {
      expect(screen.getByTestId("submission-mark-completed-btn")).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId("submission-mark-completed-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("mark-completed-reason")).toBeTruthy();
    });

    fireEvent.change(screen.getByTestId("mark-completed-reason"), {
      target: { value: "NFC got stuck" },
    });
    fireEvent.change(screen.getByTestId("mark-completed-points"), {
      target: { value: "90" },
    });

    fireEvent.click(screen.getByTestId("mark-completed-confirm-btn"));

    await waitFor(() => {
      expect(teamsApi.markCompleted).toHaveBeenCalledWith(
        "g1",
        "t1",
        "b1",
        {
          challengeId: "ch1",
          reason: "NFC got stuck",
          pointsOverride: 90,
        },
      );
    });
  });

  it("passes undefined pointsOverride when the input is cleared", async () => {
    vi.mocked(teamsApi.markCompleted).mockResolvedValue(makeSubmission());
    renderPage();

    await waitFor(() => {
      // The pending card renders with role="button" — pick the one that
      // wraps the challenge title. There is only one submission in the
      // list so the only role=button with that content is the card.
      const cards = screen.getAllByRole("button").filter((el) =>
        el.textContent?.includes("Find the marker"),
      );
      expect(cards.length).toBe(1);
    });
    const card = screen
      .getAllByRole("button")
      .filter((el) => el.textContent?.includes("Find the marker"))[0];
    fireEvent.click(card);

    await waitFor(() => {
      expect(screen.getByTestId("submission-mark-completed-btn")).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId("submission-mark-completed-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("mark-completed-points")).toBeTruthy();
    });

    fireEvent.change(screen.getByTestId("mark-completed-points"), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByTestId("mark-completed-confirm-btn"));

    await waitFor(() => {
      expect(teamsApi.markCompleted).toHaveBeenCalledWith(
        "g1",
        "t1",
        "b1",
        {
          challengeId: "ch1",
          reason: undefined,
          pointsOverride: undefined,
        },
      );
    });
  });
});
