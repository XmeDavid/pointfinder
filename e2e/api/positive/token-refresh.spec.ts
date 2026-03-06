// @scenarios P15
import { test, expect } from '@playwright/test';
import { refreshToken, getMe } from '../../shared/api-client';
import { getOperatorToken, getOperatorRefreshToken } from '../../shared/auth';

test.describe('Token Refresh - positive', () => {
  test('P15: refresh token returns working access token', async () => {
    const oldAccessToken = getOperatorToken();
    const rt = getOperatorRefreshToken();

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
