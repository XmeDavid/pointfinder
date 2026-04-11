import { expect, type Locator, type Page } from '@playwright/test';
import { config } from './config';
import {
  getOperatorToken,
  getOperatorRefreshToken,
  getOperatorUser,
  refreshAndStoreTokens,
  syncOperatorSession,
} from './auth';

export type WorkspaceMode = 'build' | 'command' | 'review' | 'results';
export type DrawerTab = 'bases' | 'challenges' | 'teams' | 'stages';

/**
 * Navigate to the game workspace and optionally switch to a specific mode.
 * The workspace defaults to build mode on load.
 */
export async function navigateToGameWorkspace(
  page: Page,
  gameId: string,
  mode?: WorkspaceMode,
) {
  await page.goto(`/game/${gameId}`);
  await expect(page.getByTestId('map-wrapper')).toBeVisible({ timeout: 15_000 });

  if (mode && mode !== 'build') {
    await switchWorkspaceMode(page, mode);
  }
}

/**
 * Switch workspace mode by clicking the mode button in the IconRail.
 */
export async function switchWorkspaceMode(page: Page, mode: WorkspaceMode) {
  const label = mode.charAt(0).toUpperCase() + mode.slice(1); // Build, Command, Review, Results
  // Desktop IconRail has mode buttons with aria-label matching the mode name
  const modeBtn = page.getByRole('button', { name: label, exact: true }).first();
  await expect(modeBtn).toBeVisible({ timeout: 5_000 });
  await modeBtn.click();
  // Small wait for mode transition animation
  await page.waitForTimeout(300);
}

/**
 * Open the content drawer in build mode and switch to a specific tab.
 */
export async function openDrawerTab(page: Page, tab: DrawerTab) {
  // Ensure we're in build mode and drawer is open
  const openPanelBtn = page.getByTestId('open-content-panel');
  if (await openPanelBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await openPanelBtn.click();
  }
  // Wait for drawer to be visible
  await expect(page.getByTestId('drawer-tabs')).toBeVisible({ timeout: 5_000 });
  // Click the desired tab
  await page.getByTestId(`tab-${tab}`).click();
  await page.waitForTimeout(200);
}

/**
 * Navigate to game workspace in build mode with a specific drawer tab open.
 * Replaces old routes like /games/:id/bases, /games/:id/challenges, etc.
 */
export async function navigateToBuildTab(
  page: Page,
  gameId: string,
  tab: DrawerTab,
) {
  await navigateToGameWorkspace(page, gameId, 'build');
  await openDrawerTab(page, tab);
}

/**
 * Open the settings panel in the game workspace.
 * Replaces old route /games/:id/settings.
 */
export async function openSettingsPanel(page: Page, gameId: string) {
  await navigateToGameWorkspace(page, gameId);
  const settingsBtn = page.getByTestId('settings-btn');
  await expect(settingsBtn).toBeVisible({ timeout: 5_000 });
  await settingsBtn.click();
  await expect(page.getByTestId('game-settings-panel')).toBeVisible({ timeout: 5_000 });
}

/**
 * Open the notification sender in command mode.
 * Replaces old route /games/:id/notifications.
 */
export async function openNotificationSender(page: Page, gameId: string) {
  await navigateToGameWorkspace(page, gameId, 'command');
  const rescueBtn = page.getByTestId('rescue-btn');
  await expect(rescueBtn).toBeVisible({ timeout: 5_000 });
  await rescueBtn.click();
  await expect(page.getByTestId('notification-sender')).toBeVisible({ timeout: 5_000 });
}

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

    await page.goto('/dashboard');

    const atDashboard = await page.waitForURL(/\/app\/dashboard/, { timeout: 10_000 }).then(() => true).catch(() => false);
    if (!atDashboard) {
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
  await page.getByTestId('login-email').fill(config.operatorEmail);
  await page.getByTestId('login-password').fill(config.operatorPassword);

  const loginResponsePromise = page.waitForResponse(
    (resp) => resp.url().includes('/auth/login'),
  );

  await page.getByTestId('login-submit').click();

  let loggedIn = false;

  try {
    const resp = await loginResponsePromise;

    if (resp.status() === 200) {
      await expect(page).toHaveURL(/\/app\/dashboard/, { timeout: 10_000 });
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

    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/app\/dashboard/, { timeout: 15_000 });
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
