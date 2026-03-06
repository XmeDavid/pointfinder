// @scenarios P1, P15
import { test, expect } from '@playwright/test';
import { login, refreshToken, getMe } from '../../shared/api-client';
import { config } from '../../shared/config';
import { getOperatorRefreshToken } from '../../shared/auth';

test.describe('Auth - positive', { tag: '@smoke' }, () => {
  test('P1: login with valid credentials', async () => {
    const { status, data } = await login(config.operatorEmail, config.operatorPassword);
    expect(status).toBe(200);
    expect(data).toHaveProperty('accessToken');
    expect(data).toHaveProperty('refreshToken');
    expect(data.accessToken.length).toBeGreaterThan(0);
    expect(data.refreshToken.length).toBeGreaterThan(0);
  });

  test('P15: refresh token returns new access token', async () => {
    // Use the stored refresh token from setup to avoid rate limiting
    const rt = getOperatorRefreshToken();
    const { status, data } = await refreshToken(rt);
    expect(status).toBe(200);
    expect(data).toHaveProperty('accessToken');
    expect(data.accessToken.length).toBeGreaterThan(0);

    const meRes = await getMe(data.accessToken);
    expect(meRes.status).toBe(200);
  });
});
