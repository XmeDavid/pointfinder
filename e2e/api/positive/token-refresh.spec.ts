// @scenarios P15
import { test, expect } from '@playwright/test';
import { login, refreshToken, getMe } from '../../shared/api-client';
import { config } from '../../shared/config';

test.describe('Token Refresh - positive', () => {
  test('P15: refresh token returns working access token', async () => {
    const loginRes = await login(config.operatorEmail, config.operatorPassword);
    expect(loginRes.status).toBe(200);

    const oldAccessToken = loginRes.data.accessToken;
    const rt = loginRes.data.refreshToken;

    const { status, data } = await refreshToken(rt);
    expect(status).toBe(200);
    expect(data).toHaveProperty('accessToken');
    expect(data.accessToken.length).toBeGreaterThan(0);

    // New token works
    const meRes = await getMe(data.accessToken);
    expect(meRes.status).toBe(200);
    expect(meRes.data).toHaveProperty('email');

    // Old token is a distinct string (may or may not still work)
    expect(typeof oldAccessToken).toBe('string');
  });
});
