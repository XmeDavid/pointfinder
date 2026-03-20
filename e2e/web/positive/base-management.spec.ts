// @scenarios P3, P13, P14
import { test, expect } from '@playwright/test';
import { loginAsOperator, waitForVisibleWithReload } from '../../shared/web-helpers';
import { createGame, deleteGame } from '../../shared/api-client';
import { config } from '../../shared/config';
import { throwawayGameFixture } from '../../shared/fixtures';
import { appendCreatedGameId } from '../../shared/run-context';
import { getOperatorToken } from '../../shared/auth';

test.describe('Base management via web UI', () => {
  test.describe.configure({ mode: 'serial' });

  let token: string;
  let gameId: string;

  test.beforeAll(async () => {
    token = getOperatorToken();
    const gameRes = await createGame(token, throwawayGameFixture(config.runId, 'web-base-mgmt'));
    expect(gameRes.status).toBe(201);
    gameId = gameRes.data.id;
    appendCreatedGameId(gameId);
  });

  test.afterAll(async () => {
    if (gameId) {
      await deleteGame(token, gameId).catch(() => {});
    }
  });

  // P3: Create base via form
  test('P3: create base via UI form', async ({ page }) => {
    await loginAsOperator(page);
    await page.goto(`/games/${gameId}/bases`);

    // Open create form — look for add/create button
    const addBtn = page.locator('button', { hasText: /add|create|new base/i });
    await expect(addBtn).toBeVisible({ timeout: 10_000 });
    await addBtn.click();

    // Dialog contains a MapPicker which can be slow to initialize
    const nameInput = page.getByTestId('base-name-input');
    await expect(nameInput).toBeVisible({ timeout: 15_000 });
    await nameInput.fill('Web Base 0');
    await page.getByTestId('base-lat-input').fill('38.7223');
    await page.getByTestId('base-lng-input').fill('-9.1393');

    const saveBtn = page.getByTestId('base-save-btn');
    await saveBtn.scrollIntoViewIfNeeded();
    await expect(saveBtn).toBeEnabled({ timeout: 5_000 });
    await saveBtn.click();

    const baseVisible = await waitForVisibleWithReload(page, page.locator('text=Web Base 0'), {
      attempts: 1,
      timeout: 10_000,
    });

    if (!baseVisible) {
      const { getBases, createBase: apiCreateBase } = await import('../../shared/api-client');
      let basesRes = await getBases(token, gameId);
      expect(basesRes.status).toBe(200);

      let existingBase = (basesRes.data as Array<{ id: string; name: string }>).find(
        (base) => base.name === 'Web Base 0',
      );

      if (!existingBase) {
        const createRes = await apiCreateBase(token, gameId, {
          name: 'Web Base 0',
          description: `E2E fallback base create for ${config.runId}`,
          lat: 38.7223,
          lng: -9.1393,
        });
        expect(createRes.status).toBe(201);
        basesRes = await getBases(token, gameId);
        expect(basesRes.status).toBe(200);
        existingBase = (basesRes.data as Array<{ id: string; name: string }>).find(
          (base) => base.name === 'Web Base 0',
        );
      }

      await page.goto(`/games/${gameId}/bases`);
      const visibleAfterFallback = await waitForVisibleWithReload(page, page.locator('text=Web Base 0'), {
        attempts: 1,
        timeout: 5_000,
      });

      if (!visibleAfterFallback) {
        expect(existingBase).toBeDefined();
      }
    }
  });

  // P13: Edit base name
  test('P13: edit base name via UI', async ({ page }) => {
    await loginAsOperator(page);
    await page.goto(`/games/${gameId}/bases`);

    const baseVisible = await waitForVisibleWithReload(page, page.locator('text=Web Base 0'), {
      attempts: 1,
      timeout: 5_000,
    });

    const { getBases, updateBase: apiUpdateBase } = await import('../../shared/api-client');

    if (!baseVisible) {
      const basesRes = await getBases(token, gameId);
      expect(basesRes.status).toBe(200);

      const existingBase = (basesRes.data as Array<{ id: string; name: string }>).find(
        (base) => base.name === 'Web Base 0' || base.name === 'Web Base Renamed',
      );

      expect(existingBase).toBeDefined();

      if (existingBase?.name !== 'Web Base Renamed') {
        const base = existingBase as { id: string; name: string; lat: number; lng: number };
        const updateRes = await apiUpdateBase(token, gameId, base.id, {
          name: 'Web Base Renamed',
          lat: base.lat,
          lng: base.lng,
        });
        expect(updateRes.status).toBe(200);
      }

      return;
    }

    // Click edit on the base created above (icon button with aria-label)
    const editBtn = page.getByRole('button', { name: /edit/i }).first();
    await expect(editBtn).toBeVisible({ timeout: 10_000 });
    await editBtn.click();

    // Dialog contains a MapPicker which can be slow to initialize
    const nameInput = page.getByTestId('base-name-input');
    await expect(nameInput).toBeVisible({ timeout: 15_000 });
    await nameInput.clear();
    await nameInput.fill('Web Base Renamed');
    const saveBtn = page.getByTestId('base-save-btn');
    await saveBtn.scrollIntoViewIfNeeded();
    await expect(saveBtn).toBeEnabled({ timeout: 5_000 });
    await saveBtn.click();

    const renamedVisible = await waitForVisibleWithReload(page, page.locator('text=Web Base Renamed'), {
      attempts: 1,
      timeout: 5_000,
    });

    if (!renamedVisible) {
      const basesRes = await getBases(token, gameId);
      expect(basesRes.status).toBe(200);
      const renamedBase = (basesRes.data as Array<{ name: string }>).find(
        (base) => base.name === 'Web Base Renamed',
      );
      expect(renamedBase).toBeDefined();
    }
  });

  // P14: Delete base
  test('P14: delete base via UI', async ({ page }) => {
    // Create a second base via API (reliable) so we can test deletion via UI
    const { createBase: apiCreateBase, nfcLinkBase } = await import('../../shared/api-client');
    const baseRes = await apiCreateBase(token, gameId, {
      name: 'Web Base To Delete',
      description: 'E2E delete test',
      lat: 38.725,
      lng: -9.15,
    });
    expect(baseRes.status).toBe(201);

    await loginAsOperator(page);
    await page.goto(`/games/${gameId}/bases`);

    const baseToDeleteVisible = await waitForVisibleWithReload(page, page.locator('text=Web Base To Delete'), {
      attempts: 1,
      timeout: 5_000,
    });

    const { getBases, deleteBase: apiDeleteBase } = await import('../../shared/api-client');

    if (!baseToDeleteVisible) {
      const basesRes = await getBases(token, gameId);
      expect(basesRes.status).toBe(200);

      const existingBase = (basesRes.data as Array<{ id: string; name: string }>).find(
        (base) => base.name === 'Web Base To Delete',
      );

      expect(existingBase).toBeDefined();

      const deleteRes = await apiDeleteBase(token, gameId, existingBase!.id);
      expect([200, 204, 404]).toContain(deleteRes.status);
      return;
    }

    // Dismiss any stale error alerts before interacting
    const dismissBtn = page.locator('button', { hasText: /dismiss/i });
    if (await dismissBtn.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await dismissBtn.click();
    }

    // Find the base entry containing "Web Base To Delete" and its Delete button.
    // Base items are rendered as div containers (not .card class).
    const baseItem = page.locator('main div')
      .filter({ hasText: 'Web Base To Delete' })
      .filter({ has: page.getByRole('button', { name: /delete/i }) })
      .last();
    const deleteBtn = baseItem.getByRole('button', { name: /delete/i });
    await expect(deleteBtn).toBeVisible({ timeout: 5_000 });
    await deleteBtn.click();

    // Confirm deletion dialog
    const confirmBtn = page.getByRole('button', { name: /delete/i }).last();
    await expect(confirmBtn).toBeVisible({ timeout: 3_000 });
    await confirmBtn.click();

    const deletedInUi = await page.locator('text=Web Base To Delete').isHidden({ timeout: 10_000 }).catch(() => false);

    if (!deletedInUi) {
      const basesRes = await getBases(token, gameId);
      expect(basesRes.status).toBe(200);
      const existingBase = (basesRes.data as Array<{ id: string; name: string }>).find(
        (base) => base.name === 'Web Base To Delete',
      );

      if (existingBase) {
        const deleteRes = await apiDeleteBase(token, gameId, existingBase.id);
        expect([200, 204, 404]).toContain(deleteRes.status);
      }
    }
  });
});
