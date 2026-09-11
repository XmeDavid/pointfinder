import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "@/test/msw/server";
import { useAuthStore } from "@/lib/auth/store";
import { createMockGame } from "@/test/factories/game";
import { PublicationSection } from "./PublicationSection";

beforeEach(() => {
  useAuthStore.setState({
    user: {
      id: "owner",
      name: "Owner",
      email: "owner@example.test",
      role: "operator",
      createdAt: "2026-09-10",
    },
    isAuthenticated: false,
  });
  server.use(
    http.get(
      "/api/games/game-1/publication",
      () => new HttpResponse(null, { status: 404 }),
    ),
  );
});
afterEach(() => useAuthStore.setState({ user: null }));
function renderSection(createdBy = "owner") {
  const query = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={query}>
      <PublicationSection
        game={createMockGame({
          id: "game-1",
          createdBy,
          name: "River adventure",
          description: "Private clue",
        })}
      />
    </QueryClientProvider>,
  );
}
it("uses the game title, omits a pinpoint and preserves entered details after a failed save", async () => {
  let payload: unknown;
  const save = vi.fn(async ({ request }: { request: Request }) => {
    payload = await request.json();
    return HttpResponse.json({ message: "Unavailable" }, { status: 503 });
  });
  server.use(http.put("/api/games/game-1/publication", save));
  renderSection();
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("switch", { name: "Make it public" }),
  );
  expect(screen.queryByLabelText("Public title")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Latitude")).not.toBeInTheDocument();
  expect(screen.getByLabelText("Description")).toHaveValue("");
  await user.type(
    screen.getByLabelText("Description"),
    "A public description.",
  );
  await user.type(screen.getByLabelText("Place or area"), "Lavos");
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  await screen.findByRole("alert");
  expect(screen.getByLabelText("Description")).toHaveValue(
    "A public description.",
  );
  expect(payload).toMatchObject({
    title: "River adventure",
    summary: "A public description.",
    lat: null,
    lng: null,
  });
  expect(save).toHaveBeenCalledOnce();
});
it("switching off a published game saves through the unpublish endpoint", async () => {
  server.use(
    http.get("/api/games/game-1/publication", () =>
      HttpResponse.json({
        listed: true,
        title: "Old title",
        summary: "Description",
        place: "Area",
        updatedAt: "one",
      }),
    ),
  );
  const unpublish = vi.fn(() =>
    HttpResponse.json({ listed: false, updatedAt: "two" }),
  );
  server.use(http.post("/api/games/game-1/publication/unpublish", unpublish));
  renderSection();
  const toggle = await screen.findByRole("switch", { name: "Make it public" });
  expect(toggle).toBeChecked();
  await userEvent.click(toggle);
  expect(screen.queryByLabelText("Description")).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
  expect(unpublish).toHaveBeenCalledOnce();
});
it("does not offer publication mutations to a co-operator", async () => {
  renderSection("someone-else");
  await screen.findByText(
    "The game owner or a club game administrator can manage this listing.",
  );
  expect(screen.queryByTestId("publication-form")).not.toBeInTheDocument();
});
