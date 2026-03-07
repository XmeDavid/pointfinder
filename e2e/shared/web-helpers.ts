import { expect, type Page } from '@playwright/test';
import { config } from './config';
import { getOperatorToken, getOperatorRefreshToken, getOperatorUser, refreshAndStoreTokens } from './auth';

/** Force English locale so hostname detection (.pt → Portuguese) doesn't interfere with tests. */
export async function forceEnglishLocale(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('pointfinder-lang', 'en');
  });
}

/**
 * Log in as operator via the real login form.
 * Falls back to token injection if the form login fails (e.g. rate limiting).
 *
 * IMPORTANT: We do NOT use addInitScript for auth tokens. The SPA rotates
 * refresh tokens on each use, so addInitScript would overwrite the latest
 * rotated token with stale ones on every navigation, causing auth failures.
 * Instead, we let the SPA manage its own token lifecycle via Zustand persist.
 */
export async function loginAsOperator(page: Page) {
  // Set locale for all navigations (this is safe — no token rotation concern)
  await page.addInitScript(() => {
    localStorage.setItem('pointfinder-lang', 'en');
  });

  // Attempt form login
  await page.goto('/login');
  await page.getByRole('textbox', { name: /email/i }).fill(config.operatorEmail);
  await page.getByRole('textbox', { name: /password/i }).fill(config.operatorPassword);

  const loginResponsePromise = page.waitForResponse(
    (resp) => resp.url().includes('/auth/login'),
  );

  await page.getByRole('button', { name: /sign in/i }).click();

  let loggedIn = false;

  try {
    const resp = await loginResponsePromise;

    if (resp.status() === 200) {
      await expect(page).toHaveURL(/\/games/, { timeout: 10_000 });
      loggedIn = true;
    }
    // Non-200 (e.g. 429 rate limit) — fall through to token injection
  } catch {
    // Form login failed — fall back to token injection
  }

  if (!loggedIn) {
    await refreshAndStoreTokens();

    await page.evaluate(
      ({ accessToken, refreshToken, user }) => {
        localStorage.setItem('pointfinder-lang', 'en');
        localStorage.setItem(
          'pointfinder-auth',
          JSON.stringify({
            state: { user, refreshToken, accessToken, isAuthenticated: true },
            version: 0,
          }),
        );
      },
      {
        accessToken: getOperatorToken(),
        refreshToken: getOperatorRefreshToken(),
        user: getOperatorUser(),
      },
    );

    await page.goto('/games');
    await expect(page).toHaveURL(/\/games/, { timeout: 15_000 });
  }
}
