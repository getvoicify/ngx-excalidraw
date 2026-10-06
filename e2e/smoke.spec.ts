import { expect, test } from '@playwright/test';

test('server renders the app root content into the HTML response', async ({ request }) => {
  const response = await request.get('/');
  expect(response.status()).toBe(200);
  const html = await response.text();
  expect(html).toMatch(/<app-root[^>]*>[\s\S]*<h1[^>]*>ngx-excalidraw demo<\/h1>/);
});

test('loads the page without console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'ngx-excalidraw demo' })).toBeVisible();
  await page.waitForLoadState('networkidle');
  expect(errors).toEqual([]);
});
