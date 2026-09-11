import { expect, test } from "@playwright/test";

test("local account enters a real game and opens a real operator workspace", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/home");
  await expect(
    page.getByText(/Design in progress|Example game for design/),
  ).toHaveCount(0);
  await expect(page.locator(".ex-mobile-nav a")).toHaveText([
    "Home",
    "Play",
    "Organize",
  ]);
  await page.getByRole("button", { name: "Continue playing" }).click();
  await expect(page).toHaveURL(/5188\/$/);
  await expect(page.getByText("The trailhead", { exact: true })).toBeVisible();
  await page.getByTestId("player-tour-btn").click();
  await expect(page.getByTestId("tour-bubble-title")).toBeVisible();
  await expect(page.getByTestId("tour-bubble").locator("img")).toBeVisible();
  await expect(page.getByTestId("tour-spotlight")).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        Number(
          getComputedStyle(
            document.querySelector('[data-testid="tour-bubble"]')!,
          ).zIndex,
        ) >
        Number(
          getComputedStyle(
            document.querySelector('[data-testid="tour-spotlight"]')!,
          ).zIndex,
        ),
    ),
  ).toBe(true);
  await expect(page.getByTestId("tour-bubble")).toHaveCSS("opacity", "1");
  await page.screenshot({
    path: "../artifacts/user-home-review/v8-tour-layer.png",
  });
  await page.getByTestId("tour-next").click();
  await page.getByTestId("tour-close").click();
  await page.getByTestId("player-settings-btn").click();
  await expect(page.getByTestId("settings-account-linked")).toBeVisible();
  await expect(page.getByTestId("settings-delete-account-btn")).toHaveCount(0);
  await page.getByRole("link", { name: "Map", exact: true }).click();
  await page.getByTestId("player-back-btn").click();
  await expect(page).toHaveURL(/dashboard\?view=play$/);
  await page.getByRole("button", { name: /The lighthouse trail/ }).click();
  await expect(page).toHaveURL(/5188\/$/);
  await page.goto("/organize");
  await page.getByRole("button", { name: /River expedition/ }).click();
  await expect(page).toHaveURL(/\/game\/[a-f0-9-]+$/);
  await expect(page.getByTestId("operator-back-btn")).toBeVisible();
  await page.getByTestId("operator-back-btn").click();
  await expect(page).toHaveURL(/dashboard\?view=organize$/);
});

test("discovery belongs to Home and the map is optional", async ({ page }) => {
  await page.goto("/explore");
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.locator(".ex-discovery-map")).toHaveCount(0);
  await page.getByRole("button", { name: "Map", exact: true }).click();
  await expect(page.locator(".ex-discovery-map")).toBeVisible();
  await page.getByRole("button", { name: "Featured", exact: true }).click();
  await expect(page.locator(".ex-discovery-card")).toHaveCount(2);
  await page
    .getByRole("textbox", { name: "Search games or places" })
    .fill("nothing here");
  await expect(page.getByText("No games here yet")).toBeVisible();
  await page.getByRole("button", { name: "Show all games" }).click();
  await expect(page.locator(".ex-discovery-card")).toHaveCount(3);
  await page.locator(".ex-discovery-card").first().click();
  await expect(page.getByRole("dialog")).toContainText("Salt, sand");
  await expect(page.getByRole("dialog")).not.toContainText("Example");
  await page.keyboard.press("Escape");
});

test("nearby discovery remains opt-in", async ({ page, context }) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ longitude: -8.8708, latitude: 40.0797 });
  await page.goto("/home");
  await page.getByRole("button", { name: "Near me" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Games within 50 km" }),
  ).toBeVisible();
  await expect(page.locator(".ex-discovery-card").first()).toContainText(
    "0.1 km away",
  );
});

for (const width of [360, 390, 768, 1280])
  for (const locale of ["en", "pt", "de"])
    for (const dark of [false, true]) {
      test(`${width}px ${locale} ${dark ? "dark" : "light"} mobile-first layout`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.emulateMedia({
          reducedMotion: "reduce",
          colorScheme: dark ? "dark" : "light",
        });
        await page.addInitScript(
          (lang) => localStorage.setItem("pointfinder-lang", lang),
          locale,
        );
        await page.goto("/dashboard");
        await expect(
          page
            .locator(".ex-mobile-nav a, .ex-desktop-nav a")
            .filter({ hasText: /Organize|Organizar|Organisieren/ })
            .first(),
        ).toBeAttached();
        for (const route of ["/home", "/play", "/organize", "/me"]) {
          await page.goto(route);
          await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
          expect(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
          ).toBe(true);
        }
        if (locale === "en" && (width === 390 || width === 1280)) {
          await page.goto("/home");
          await expect(
            page.getByRole("button", { name: "Continue playing" }),
          ).toBeEnabled();
          await page.screenshot({
            path: `../artifacts/user-home-review/v4-${width}-${dark ? "dark" : "light"}.png`,
            fullPage: true,
          });
        }
      });
    }

test("an existing map base opens in the content editor", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dashboard?view=organize");
  await page.getByRole("button", { name: /River expedition/ }).click();
  await expect(page.getByTestId("operator-back-btn")).toBeVisible();
  await page.getByTestId("open-content-panel").click();
  const routeBox = await page.getByTestId("arrange-route-btn").boundingBox();
  const assignmentsBox = await page
    .getByTestId("assignment-grid-btn")
    .boundingBox();
  expect(Math.abs(routeBox!.y - assignmentsBox!.y)).toBeLessThan(2);
  const autoLink = page.getByRole("button", {
    name: "Auto-link challenges",
    exact: true,
  });
  const autoBox = await autoLink.boundingBox();
  expect(Math.abs(autoBox!.y - assignmentsBox!.y)).toBeLessThan(2);
  await expect(page.getByTestId("assignment-grid-btn")).toHaveText(
    "Link challenges",
  );
  await page.screenshot({
    path: "../artifacts/user-home-review/v7-mobile-route.png",
  });
  await page.getByRole("button", { name: /The trailhead/ }).click();
  await expect(page.getByTestId("base-name-input")).toBeVisible();
  await page.screenshot({
    path: "../artifacts/user-home-review/v4-mobile-base-editor.png",
  });
});

test("profile and shared documents use the local account's real records", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Continue playing" }).click();
  await page.getByTestId("player-documents-btn").click();
  await page.getByRole("link", { name: /Your lighthouse trail guide/ }).click();
  await expect(
    page.getByRole("heading", { name: "Your lighthouse trail guide" }),
  ).toBeVisible();
  await page.screenshot({
    path: "../artifacts/user-home-review/v4-mobile-game-guide.png",
    fullPage: true,
  });
  await page.goto("/profile");
  await expect(
    page.getByText("Along the river", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("71 XP", { exact: true })).toBeVisible();
  await page.screenshot({
    path: "../artifacts/user-home-review/v4-mobile-profile.png",
    fullPage: true,
  });
  await page.goto("/dashboard?view=play");
  await page.getByRole("button", { name: "Ended", exact: true }).click();
  await page.getByRole("button", { name: /Along the river/ }).click();
  await expect(page).toHaveURL(/profile\?game=/);
  await expect(
    page.getByText("Along the river", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Place 1 of 2", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Play", exact: true }).click();
  await expect(page).toHaveURL(/dashboard\?view=play$/);
});

test("placing a base opens its editor and creates an empty challenge for every team", async ({
  page,
  request,
}) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dashboard?view=organize");
  await expect(
    page.getByRole("button", { name: /River expedition/ }),
  ).toBeVisible();
  const login = await request.post("/api/auth/login", {
    data: { email: "david@pointfinder.local", password: "Trailhead2026!" },
  });
  const { accessToken } = await login.json();
  const headers = { Authorization: `Bearer ${accessToken}` };
  const created = await request.post("/api/games", {
    headers,
    data: { name: "Base editor journey check", defaultCheckInMethod: "QR" },
  });
  expect(created.ok()).toBe(true);
  const { id } = await created.json();
  try {
    await page.goto(`/game/${id}`);
    await expect(
      page.getByText("Place your first base", { exact: true }),
    ).toBeVisible();
    await page.getByTestId("open-content-panel").click();
    await page.getByRole("button", { name: "New Base", exact: true }).click();
    await page
      .locator(".workspace-map canvas")
      .click({ position: { x: 180, y: 300 } });
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByTestId("base-name-input")).toHaveValue("New base");
    expect(
      await (
        await request.get(`/api/games/${id}/challenges`, { headers })
      ).json(),
    ).toHaveLength(0);
    await page.getByTestId("base-name-input").fill("The lookout");
    await page.getByTestId("save-base-btn").click();
    await page
      .getByRole("button", { name: "Open QR code for The lookout" })
      .click();
    await expect(
      page.getByRole("dialog", { name: "The lookout" }),
    ).toBeVisible();
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Save image" }).click();
    expect((await download).suggestedFilename()).toBe("The lookout-QR.png");
    await page.screenshot({
      path: "../artifacts/user-home-review/v7-mobile-qr-viewer.png",
    });
    await page
      .getByRole("button", { name: "Close", exact: true })
      .last()
      .click();
    await page.getByTestId("create-empty-challenge-btn").click();
    await expect(page.getByTestId("challenge-title-input")).toHaveValue(
      "New challenge",
    );
    await expect(page.getByTestId("answer-type-none")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByTestId("auto-validate-toggle")).toHaveCount(0);
    await expect(page.getByTestId("correct-answer-input")).toHaveCount(0);
    await expect(page.getByTestId("points-input")).toBeVisible();
    await page.screenshot({
      path: "../artifacts/user-home-review/v6-mobile-empty-challenge.png",
    });
    await page.getByTestId("answer-type-text").click();
    const automatic = page.getByRole("switch", {
      name: "Check answers automatically",
    });
    await expect(automatic).not.toBeChecked();
    await automatic.click();
    await expect(page.getByTestId("correct-answer-input")).toBeVisible();
    await automatic.click();
    await expect(page.getByTestId("correct-answer-input")).toHaveCount(0);
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      for (const theme of ["light", "dark"]) {
        await page.evaluate(
          (value) =>
            document.documentElement.classList.toggle("dark", value === "dark"),
          theme,
        );
        await page.getByTestId("points-input").scrollIntoViewIfNeeded();
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        await page.screenshot({
          path: `../artifacts/user-home-review/v6-editor-${width}-${theme}.png`,
        });
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    const bases = await (
      await request.get(`/api/games/${id}/bases`, { headers })
    ).json();
    const challenges = await (
      await request.get(`/api/games/${id}/challenges`, { headers })
    ).json();
    const assignments = await (
      await request.get(`/api/games/${id}/assignments`, { headers })
    ).json();
    expect(bases).toHaveLength(1);
    expect(challenges).toHaveLength(1);
    expect(challenges[0]).toMatchObject({
      answerType: "none",
      content: "",
      description: "",
      points: 0,
      autoValidate: false,
    });
    expect(assignments).toHaveLength(1);
    expect(assignments[0]).toMatchObject({
      baseId: bases[0].id,
      challengeId: challenges[0].id,
      teamId: null,
    });
    await page.getByTestId("detail-back").click();
    await expect(page.getByTestId("base-name-input")).toHaveValue(
      "The lookout",
    );
    const team = await (
      await request.post(`/api/games/${id}/teams`, {
        headers,
        data: { name: "Trail team" },
      })
    ).json();
    expect(
      (
        await request.patch(`/api/games/${id}/status`, {
          headers,
          data: { status: "live" },
        })
      ).ok(),
    ).toBe(true);
    // Use the guest origin for this disposable game so David's permanent history stays untouched.
    await page.goto("http://127.0.0.1:5189/join");
    await page.getByTestId("player-join-code-input").fill(team.joinCode);
    await page.getByTestId("player-join-name-input").fill("Trail guest");
    await page.getByTestId("player-join-submit-btn").click();
    await expect(
      page.getByRole("heading", { name: "Base editor journey check" }),
    ).toBeVisible();
    expect(
      (
        await request.patch(`/api/games/${id}/status`, {
          headers,
          data: { status: "ended" },
        })
      ).ok(),
    ).toBe(true);
    await expect(page.getByTestId("player-game-result")).toContainText("XP");
    await page.screenshot({
      path: "../artifacts/user-home-review/v4-mobile-game-result.png",
    });
    await page.getByTestId("player-back-btn").click();
    await expect(page).toHaveURL(/dashboard\?view=play$/);
  } finally {
    await request.delete(`/api/games/${id}`, { headers });
  }
});

test("publish, discover, join and unpublish through the existing app", async ({
  page,
  request,
}) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dashboard?view=organize");
  await expect(
    page.getByRole("button", { name: /River expedition/ }),
  ).toBeVisible();
  const { accessToken } = await (
    await request.post("/api/auth/login", {
      data: { email: "david@pointfinder.local", password: "Trailhead2026!" },
    })
  ).json();
  const headers = { Authorization: `Bearer ${accessToken}` };
  const created = await request.post("/api/games", {
    headers,
    data: {
      name: "Private game workshop",
      description: "PRIVATE CLUE never in Explore",
      defaultCheckInMethod: "QR",
      uniformAssignment: true,
    },
  });
  expect(created.ok()).toBe(true);
  const { id } = await created.json();
  try {
    const team = await (
      await request.post(`/api/games/${id}/teams`, {
        headers,
        data: { name: "Trail team" },
      })
    ).json();
    const base = await (
      await request.post(`/api/games/${id}/bases`, {
        headers,
        data: {
          name: "Private hidden stop",
          lat: 40.1,
          lng: -8.9,
          checkInMethod: "QR",
        },
      })
    ).json();
    const challenge = await (
      await request.post(`/api/games/${id}/challenges`, {
        headers,
        data: {
          title: "Look around",
          description: "Find a detail",
          answerType: "text",
          points: 10,
        },
      })
    ).json();
    expect(
      (
        await request.post(`/api/games/${id}/assignments`, {
          headers,
          data: { baseId: base.id, challengeId: challenge.id },
        })
      ).ok(),
    ).toBe(true);
    await page.goto(`/game/${id}`);
    await expect(page.getByTestId("operator-back-btn")).toBeVisible();
    await page.locator('[data-testid="settings-btn"]:visible').click();
    await page.getByRole("switch", { name: "Make it public" }).click();
    const form = page.getByTestId("publication-form");
    await expect(form.getByLabel("Public title")).toHaveCount(0);
    await form
      .getByLabel("Description")
      .fill("Follow the water and discover the stories of the old harbour.");
    await form.getByLabel("Place or area").fill("Figueira da Foz");
    await form.getByLabel("How people join").selectOption(team.id);
    await form.getByRole("button", { name: "Save changes" }).click();
    await expect
      .poll(async () =>
        (await request.get(`/api/explore/games/${id}`, { headers })).status(),
      )
      .toBe(200);
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      for (const theme of ["light", "dark"]) {
        await page.evaluate(
          (value) =>
            document.documentElement.classList.toggle("dark", value === "dark"),
          theme,
        );
        await form.getByRole("switch").scrollIntoViewIfNeeded();
        await page.screenshot({
          path: `../artifacts/user-home-review/v7-publication-${width}-${theme}.png`,
        });
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/dashboard");
    await page
      .getByRole("textbox", { name: "Search games or places" })
      .fill("Private game workshop");
    await page
      .locator(".ex-discovery-card")
      .filter({ hasText: "Private game workshop" })
      .click();
    const detail = page.getByRole("dialog");
    await expect(detail).toContainText("This game is getting ready");
    await expect(detail).not.toContainText("PRIVATE CLUE");
    await expect(detail).not.toContainText(team.joinCode);
    await expect(
      detail.getByRole("button", { name: "Start exploring" }),
    ).toHaveCount(0);
    await page.keyboard.press("Escape");
    expect(
      (
        await request.patch(`/api/games/${id}/status`, {
          headers,
          data: { status: "live" },
        })
      ).ok(),
    ).toBe(true);
    await page.reload();
    await page
      .getByRole("textbox", { name: "Search games or places" })
      .fill("Private game workshop");
    await page
      .locator(".ex-discovery-card")
      .filter({ hasText: "Private game workshop" })
      .click();
    await detail.getByRole("button", { name: "Start exploring" }).click();
    await expect(page).toHaveURL(/5188\/$/);
    await expect(
      page.getByRole("heading", { name: "Private game workshop" }),
    ).toBeVisible();
    const me = await (await request.get("/api/account/me", { headers })).json();
    expect(
      me.participations.find((p: { gameId: string }) => p.gameId === id),
    ).toMatchObject({ teamName: "Trail team" });
    await page.goto(`/game/${id}`);
    await expect(page.getByTestId("operator-back-btn")).toBeVisible();
    await page.getByTestId("open-content-panel").click();
    await page.getByRole("button", { name: "Documents", exact: true }).click();
    await page.getByTestId("resource-new-document").click();
    await page
      .getByRole("textbox", { name: "Document title" })
      .fill("Field guide");
    await page
      .locator('[data-testid="resource-browser"] [contenteditable="true"]')
      .fill("Meet your team by the old harbour.");
    await page
      .getByTestId("resource-browser")
      .getByRole("button", { name: "Save", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Field guide", exact: true }),
    ).toBeVisible();
    await page.getByRole("switch", { name: "Share with players" }).click();
    await expect(
      page.getByRole("switch", { name: "Share with players" }),
    ).toBeChecked();
    await page
      .getByTestId("resource-upload-input")
      .setInputFiles({
        name: "Meeting point.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("Meet by the harbour."),
      });
    await expect(
      page.getByRole("button", { name: "Meeting point.txt", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Meeting point.txt", exact: true })
      .locator('xpath=ancestor::div[contains(@class,"group")][1]')
      .getByRole("switch")
      .click();
    await expect(page.getByRole("button", {name: "Documents", exact: true})).toBeInViewport();
    await page.screenshot({
      path: "../artifacts/user-home-review/v9-organizer-documents.png",
    });
    await page.goto("/");
    await page.getByTestId("player-documents-btn").click();
    const fileLink = page.getByRole("link", { name: /Meeting point/ });
    await expect(fileLink).toBeVisible();
    const fileDownload = await request.get(
      (await fileLink.getAttribute("href"))!,
    );
    expect(fileDownload.ok()).toBe(true);
    expect(await fileDownload.text()).toBe("Meet by the harbour.");
    await page.getByRole("link", { name: /Field guide/ }).click();
    await expect(
      page.getByText("Meet your team by the old harbour.", { exact: true }),
    ).toBeVisible();

    await page.goto(`/game/${id}`);
    await expect(page.getByTestId("operator-back-btn")).toBeVisible();
    await page.locator('[data-testid="settings-btn"]:visible').click();
    await page.getByRole("switch", { name: "Make it public" }).click();
    await page
      .getByTestId("publication-form")
      .getByRole("button", { name: "Save changes" })
      .click();
    await expect
      .poll(async () =>
        (await request.get(`/api/explore/games/${id}`, { headers })).status(),
      )
      .toBe(404);
    expect(
      (await request.get(`/api/explore/games/${id}`, { headers })).status(),
    ).toBe(404);
  } finally {
    expect((await request.delete(`/api/games/${id}`, { headers })).ok()).toBe(
      true,
    );
  }
});

test("offline discovery keeps visible listings and waits for reconnection before joining", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dashboard");
  await expect(page.locator(".ex-discovery-card")).toHaveCount(3);
  await page.locator(".ex-discovery-card").first().click();
  await context.setOffline(true);
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("status")).toContainText("You’re offline");
  await expect(
    dialog.getByRole("button", { name: /Start exploring|Continue playing/ }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Back to discoveries" }).click();
  await expect(page.locator(".ex-discovery-card")).toHaveCount(3);
  await context.setOffline(false);
  await page.locator(".ex-discovery-card").first().click();
  await expect(
    dialog.getByRole("button", { name: /Start exploring|Continue playing/ }),
  ).toBeEnabled();
});
