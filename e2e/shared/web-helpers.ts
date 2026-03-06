import { expect, type Page } from '@playwright/test';
import { config } from './config';

const AUTH_DELAY_MS = 4_000;

export async function loginAsOperator(page: Page) {
  // Space out auth requests to stay within nginx rate limits
  await page.waitForTimeout(AUTH_DELAY_MS);

  // Force English locale — hostname detection (.pt) would otherwise pick Portuguese
  await page.addInitScript(() => {
    localStorage.setItem('pointfinder-lang', 'en');
  });
  await page.goto('/login');
  await page.getByTestId('login-email').fill(config.operatorEmail);
  await page.getByTestId('login-password').fill(config.operatorPassword);
  await page.getByTestId('login-submit').click();
  await expect(page).toHaveURL(/\/games/, { timeout: 15_000 });
}
