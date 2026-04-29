import { expect, test } from '@playwright/test';

test('GET /api/health returns ok with a version and serverTime', async ({ request }) => {
  const response = await request.get('http://localhost:3333/api/health');
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.status).toBe('ok');
  expect(typeof body.version).toBe('string');
  expect(body.version.length).toBeGreaterThan(0);
  expect(typeof body.serverTime).toBe('string');
});
