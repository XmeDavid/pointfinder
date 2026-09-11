import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test("a guest can return to Play and keep their participation without an account", async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const catalog = JSON.parse(
    readFileSync("../data/design/catalog.json", "utf8"),
  ) as { name: string; joinCode: string }[];
  const joinCode = catalog.find(
    (g) => g.name === "The lighthouse trail",
  )!.joinCode;
  await page.goto("/join");
  await page.getByTestId("player-join-code-input").fill(joinCode);
  await page.getByTestId("player-join-name-input").fill("Guest journey check");
  const joined = page.waitForResponse(
    (r) =>
      r.url().endsWith("/auth/player/join") && r.request().method() === "POST",
  );
  await page.getByTestId("player-join-submit-btn").click();
  const auth = await (await joined).json();
  try {
    await expect(
      page.getByRole("heading", { name: "The lighthouse trail" }),
    ).toBeVisible();
    await page.getByTestId("player-back-btn").click();
    await expect(page).toHaveURL(/dashboard\?view=play$/);
    await expect(
      page.getByRole("button", { name: /The lighthouse trail/ }),
    ).toBeVisible();
    await expect(page.locator(".ex-mobile-nav")).not.toContainText("Organize");
    await expect(
      page.getByRole("button", { name: "Save your progress" }).first(),
    ).toBeVisible();
    await page.getByRole("button", { name: /The lighthouse trail/ }).click();
    await page.getByTestId("player-tour-btn").click();
    await expect(page.getByTestId("tour-bubble")).toBeVisible();
    await page.getByTestId("tour-close").click();
    await page.getByTestId("player-back-btn").click();
    await page
      .getByRole("button", { name: "Save your progress" })
      .first()
      .click();
    await expect(page).toHaveURL(/\/account$/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  } finally {
    // Remove only the disposable guest created by this test, through its own player token.
    if (auth.token)
      await request.delete("/api/player/me", {
        headers: { Authorization: `Bearer ${auth.token}` },
      });
  }
});
