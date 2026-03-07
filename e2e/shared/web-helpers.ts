import { expect, type Locator, type Page } from '@playwright/test';
import { config } from './config';
import {
  getOperatorToken,
  getOperatorRefreshToken,
  getOperatorUser,
  refreshAndStoreTokens,
  syncOperatorSession,
} from './auth';

let operatorSessionBootstrapped = false;
const preferStoredSession = /^https:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(config.baseUrl);

async function syncSessionFromBrowser(page: Page) {
  const raw = await page.evaluate(() => localStorage.getItem('pointfinder-auth'));
  if (!raw) {
    return;
  }

  try {
    const parsed = JSON.parse(raw) as {
      state?: {
        accessToken?: string | null;
        refreshToken?: string | null;
        user?: {
          id: string;
          email: string;
          name: string;
          role: string;
          createdAt: string;
        };
      };
    };

    syncOperatorSession({
      accessToken: parsed.state?.accessToken,
      refreshToken: parsed.state?.refreshToken,
      user: parsed.state?.user,
    });
  } catch {
    return;
  }
}

async function waitForPersistedOperatorSession(page: Page) {
  await page.waitForFunction(() => {
    const raw = localStorage.getItem('pointfinder-auth');
    if (!raw) {
      return false;
    }

    try {
      const parsed = JSON.parse(raw) as {
        state?: {
          refreshToken?: string | null;
          isAuthenticated?: boolean;
        };
      };

      return Boolean(parsed.state?.refreshToken && parsed.state?.isAuthenticated);
    } catch {
      return false;
    }
  }, { timeout: 10_000 });
}

async function injectStoredOperatorSession(page: Page) {
  try {
    const accessToken = getOperatorToken();
    const refreshToken = getOperatorRefreshToken();
    const user = getOperatorUser();

    if (!accessToken || !refreshToken || !user) {
      return false;
    }

    await page.goto('/login');
    await page.evaluate(
      ({ injectedAccessToken, injectedRefreshToken, injectedUser }) => {
        localStorage.setItem('pointfinder-lang', 'en');
        localStorage.setItem(
          'pointfinder-auth',
          JSON.stringify({
            state: {
              user: injectedUser,
              refreshToken: injectedRefreshToken,
              accessToken: injectedAccessToken,
              isAuthenticated: true,
            },
            version: 0,
          }),
        );
      },
      {
        injectedAccessToken: accessToken,
        injectedRefreshToken: refreshToken,
        injectedUser: user,
      },
    );

    await page.goto('/games');

    const atGames = await page.waitForURL(/\/games/, { timeout: 10_000 }).then(() => true).catch(() => false);
    if (!atGames) {
      return false;
    }

    await waitForPersistedOperatorSession(page);
    await syncSessionFromBrowser(page);
    return true;
  } catch {
    return false;
  }
}

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

  if (preferStoredSession && await injectStoredOperatorSession(page)) {
    operatorSessionBootstrapped = true;
    return;
  }

  if (operatorSessionBootstrapped) {
    try {
      await refreshAndStoreTokens();
      if (await injectStoredOperatorSession(page)) {
        operatorSessionBootstrapped = true;
        return;
      }
    } catch {
      // Fall through to UI form login/bootstrap
    }
  }

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
      await waitForPersistedOperatorSession(page);
      await syncSessionFromBrowser(page);
      loggedIn = true;
      operatorSessionBootstrapped = true;
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
    await waitForPersistedOperatorSession(page);
    await syncSessionFromBrowser(page);
    operatorSessionBootstrapped = true;
  }
}

export async function dismissErrorAlerts(page: Page) {
  const dismissBtn = page.locator('button', { hasText: /dismiss/i }).first();

  while (await dismissBtn.isVisible({ timeout: 500 }).catch(() => false)) {
    await dismissBtn.click();
  }
}

export async function waitForVisibleWithReload(
  page: Page,
  locator: Locator,
  options: { attempts?: number; timeout?: number } = {},
): Promise<boolean> {
  const attempts = options.attempts ?? 2;
  const timeout = options.timeout ?? 5_000;

  for (let attempt = 0; attempt <= attempts; attempt += 1) {
    if (await locator.first().isVisible({ timeout }).catch(() => false)) {
      return true;
    }

    await dismissErrorAlerts(page);

    if (attempt < attempts) {
      await page.reload();
      await page.waitForLoadState('domcontentloaded').catch(() => {});
    }
  }

  return locator.first().isVisible({ timeout }).catch(() => false);
}

export async function waitForUrlOrAlert(
  page: Page,
  urlPattern: RegExp,
  timeout = 20_000,
): Promise<'url' | 'alert' | 'timeout'> {
  const navigated = await page.waitForURL(urlPattern, { timeout }).then(() => true).catch(() => false);
  if (navigated) {
    return 'url';
  }

  const alert = page.getByRole('alert').filter({ hasText: /503|request failed|service unavailable/i }).first();
  if (await alert.isVisible({ timeout: 1_000 }).catch(() => false)) {
    return 'alert';
  }

  return 'timeout';
}
