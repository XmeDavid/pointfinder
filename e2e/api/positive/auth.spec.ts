// @scenarios P1
import { test, expect } from '@playwright/test';
import { login } from '../../shared/api-client';
import { config } from '../../shared/config';

test.describe('Auth - positive', { tag: '@smoke' }, () => {
  test('P1: login with valid credentials', async () => {
    const { status, data } = await login(config.operatorEmail, config.operatorPassword);
    expect(status).toBe(200);
    expect(data).toHaveProperty('accessToken');
    expect(data).toHaveProperty('refreshToken');
    expect(data.accessToken.length).toBeGreaterThan(0);
    expect(data.refreshToken.length).toBeGreaterThan(0);
    expect(data).toMatchObject({
      accessToken: expect.any(String),
      refreshToken: expect.any(String),
      user: {
        id: expect.any(String),
        email: expect.any(String),
        name: expect.any(String),
        role: expect.any(String),
      },
    });
  });
});
