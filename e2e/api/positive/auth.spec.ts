// @scenarios P1, P15
import { test, expect } from '@playwright/test';
import { login, refreshToken, getMe } from '../../shared/api-client';
import { config } from '../../shared/config';

test.describe('Auth - positive', { tag: '@smoke' }, () => {
  test.describe.configure({ mode: 'serial' });

  let accessToken: string;
  let refreshTokenStr: string;

  test('P1: login with valid credentials', async () => {
    const { status, data } = await login(config.operatorEmail, config.operatorPassword);
    expect(status).toBe(200);
    expect(data).toHaveProperty('accessToken');
    expect(data).toHaveProperty('refreshToken');
    expect(data.accessToken.length).toBeGreaterThan(0);
    expect(data.refreshToken.length).toBeGreaterThan(0);
    accessToken = data.accessToken;
    refreshTokenStr = data.refreshToken;
  });

  test('P15: refresh token returns new access token', async () => {
    const { status, data } = await refreshToken(refreshTokenStr);
    expect(status).toBe(200);
    expect(data).toHaveProperty('accessToken');
    expect(data.accessToken.length).toBeGreaterThan(0);

    const meRes = await getMe(data.accessToken);
    expect(meRes.status).toBe(200);
  });
});
