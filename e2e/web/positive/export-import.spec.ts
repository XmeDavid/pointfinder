// @scenarios P16
import { test, expect } from '@playwright/test';
import { loginAsOperator } from '../../shared/web-helpers';
import {
  exportGame,
  importGame,
  deleteGame,
  updateGameStatus,
  getBases,
  getChallenges,
} from '../../shared/api-client';
import { loadRunContext, appendCreatedGameId } from '../../shared/run-context';
import { getOperatorToken } from '../../shared/auth';
import { config } from '../../shared/config';

test.describe('Export / Import via web UI', () => {
  test.describe.configure({ mode: 'serial' });

  let token: string;
  let mainGameId: string;
  let importedGameId: string;

  test.beforeAll(async () => {
    const ctx = loadRunContext();
    mainGameId = ctx.mainGameId;
    token = getOperatorToken();
  });

  test.afterAll(async () => {
    if (importedGameId) {
      await updateGameStatus(token, importedGameId, 'ended').catch(() => {});
      await deleteGame(token, importedGameId).catch(() => {});
    }
  });

  // P16: Export game via API (game JSON export is no longer available in the settings panel UI)
  test('P16: export game via API returns valid JSON', async () => {
    const { status, data } = await exportGame(token, mainGameId);
    expect(status).toBe(200);
    expect(data).toBeDefined();
    // Exported data should have game structure
    expect(typeof data === 'object').toBe(true);
  });

  // P16: Export via API and import via UI
  test('P16: import game via UI creates new game', async ({ page }) => {
    // Export the game data via API (source of truth)
    const { status: exportStatus, data: exportData } = await exportGame(token, mainGameId);
    expect(exportStatus).toBe(200);

    await loginAsOperator(page);
    await page.goto('/dashboard');

    // Look for import button on games list
    const importBtn = page.locator('button, a', { hasText: /import/i });
    await expect(importBtn).toBeVisible({ timeout: 10_000 });
    await importBtn.click();

    // File input or JSON paste area
    const fileInput = page.locator('input[type="file"]');
    const jsonInput = page.locator('textarea, [data-testid*="import"]');

    if (await fileInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
      // Create a temp file and upload it
      const jsonContent = JSON.stringify(exportData);
      await fileInput.setInputFiles({
        name: 'export.json',
        mimeType: 'application/json',
        buffer: Buffer.from(jsonContent),
      });
    } else if (await jsonInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await jsonInput.fill(JSON.stringify(exportData));
    }

    const confirmImportBtn = page.locator('button', { hasText: /import|confirm/i }).last();
    if (await confirmImportBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await confirmImportBtn.click();
    }

    // Should redirect to new game or show success
    await expect(page).toHaveURL(/\/app\/game\/[^/]+/, { timeout: 15_000 });

    const url = page.url();
    const match = url.match(/\/app\/game\/([^/]+)/);
    if (match && match[1] !== mainGameId) {
      importedGameId = match[1];
      appendCreatedGameId(importedGameId);
    }
  });

  // P16: Fallback — import via API and verify structure matches
  test('P16: API import produces game with same structure', async () => {
    const { status: exportStatus, data: exportData } = await exportGame(token, mainGameId);
    expect(exportStatus).toBe(200);

    const originalBasesRes = await getBases(token, mainGameId);
    const originalChallengesRes = await getChallenges(token, mainGameId);
    expect(originalBasesRes.status).toBe(200);
    expect(originalChallengesRes.status).toBe(200);

    const { status: importStatus, data: importData } = await importGame(token, exportData);
    expect(importStatus).toBe(201);
    expect(importData).toHaveProperty('id');

    const newGameId = importData.id;
    appendCreatedGameId(newGameId);
    // Track for cleanup if UI import didn't run
    if (!importedGameId) importedGameId = newGameId;

    const basesRes = await getBases(token, newGameId);
    expect(basesRes.status).toBe(200);
    expect(basesRes.data.length).toBe(originalBasesRes.data.length);

    const challengesRes = await getChallenges(token, newGameId);
    expect(challengesRes.status).toBe(200);
    expect(challengesRes.data.length).toBe(originalChallengesRes.data.length);
  });
});
