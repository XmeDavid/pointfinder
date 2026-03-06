// @scenarios N1, N2
import { test, expect } from '@playwright/test';
import { login, getGame } from '../../shared/api-client';
import { config } from '../../shared/config';

test.describe('auth boundaries', { tag: '@negative' }, () => {
  test.describe.configure({ mode: 'serial' });

  // N1
  test('login with wrong password', async () => {
    const { status } = await login(config.operatorEmail, 'wrongpassword');
    expect(status).toBe(401);
  });

  // N2
  test('request with invalid token', async () => {
    const { status } = await getGame('invalid-jwt-token', '00000000-0000-0000-0000-000000000000');
    expect([401, 403]).toContain(status);
  });
});
