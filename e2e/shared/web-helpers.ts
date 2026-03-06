import { expect, type Page } from '@playwright/test';
import { config } from './config';

export async function loginAsOperator(page: Page) {
  await page.goto('/login');
  await page.getByTestId('login-email').fill(config.operatorEmail);
  await page.getByTestId('login-password').fill(config.operatorPassword);
  await page.getByTestId('login-submit').click();
  await expect(page).toHaveURL(/\/games/, { timeout: 15_000 });
}
