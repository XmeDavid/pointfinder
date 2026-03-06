import { expect, type Page } from '@playwright/test';
import { getOperatorToken, getOperatorRefreshToken, getOperatorUser, refreshAndStoreTokens } from './auth';

/** Force English locale so hostname detection (.pt → Portuguese) doesn't interfere with tests. */
export async function forceEnglishLocale(page: Page) {
  // addInitScript runs before any JS on every navigation — ideal for locale
  await page.addInitScript(() => {
    localStorage.setItem('pointfinder-lang', 'en');
  });
}

// Cache refresh time so we don't call refresh for every single test
let lastRefreshTime = 0;
const REFRESH_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes

/**
 * Helper to inject auth tokens into localStorage via page.evaluate().
 * Requires the page to already be on the correct domain.
 */
async function injectAuth(page: Page, accessToken: string, refreshToken: string, user: unknown) {
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
    { accessToken, refreshToken, user },
  );
}

/**
 * Inject operator auth tokens into localStorage so the app hydrates as
 * authenticated. This avoids hitting the login API (and nginx rate limits)
 * on every test. Refreshes the token periodically to avoid expiry.
 */
export async function loginAsOperator(page: Page) {
  // Refresh tokens if they might be stale
  if (Date.now() - lastRefreshTime > REFRESH_INTERVAL_MS) {
    await refreshAndStoreTokens();
    lastRefreshTime = Date.now();
  }

  // Navigate to base URL to establish domain context for localStorage
  await page.goto('/', { waitUntil: 'commit' });

  // Inject tokens directly via evaluate (more reliable than addInitScript)
  await injectAuth(page, getOperatorToken(), getOperatorRefreshToken(), getOperatorUser());

  await page.goto('/games');

  // If we ended up on login, force a full token refresh and retry
  if (page.url().includes('/login')) {
    await refreshAndStoreTokens();
    lastRefreshTime = Date.now();

    await injectAuth(page, getOperatorToken(), getOperatorRefreshToken(), getOperatorUser());
    await page.goto('/games');
  }

  await expect(page).toHaveURL(/\/games/, { timeout: 15_000 });
}
