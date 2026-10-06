import { expect, test } from '@playwright/test';

test('server renders only the placeholder, never the Excalidraw editor', async ({ request }) => {
  const html = await (await request.get('/')).text();
  expect(html).toMatch(/<ngx-excalidraw[^>]*>[\s\S]*class="ngx-excalidraw-placeholder"/);
  expect(html).not.toMatch(/class="(?:[^"]*\s)?excalidraw(?:\s[^"]*)?"/);
  expect(html).not.toContain('<canvas');
});

test('initial HTML does not preload or load the Excalidraw bundle', async ({ request }) => {
  const html = await (await request.get('/')).text();
  const referenced = [...html.matchAll(/<(?:script|link)\b[^>]*(?:src|href)="([^"]+\.js)"/g)].map(
    (m) => m[1],
  );
  expect(referenced.length).toBeGreaterThan(0);
  for (const url of referenced) {
    const source = await (await request.get(`/${url.replace(/^\//, '')}`)).text();
    expect(source, url).not.toContain('excalidraw-container');
  }
});

test('mounts the real Excalidraw in the browser and lets the user draw a rectangle', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/');
  await expect(page.getByTestId('excalidraw-status')).toHaveText('Excalidraw ready');
  await expect(page.locator('ngx-excalidraw .excalidraw')).toBeVisible();
  const canvas = page.locator('ngx-excalidraw canvas.interactive');
  await expect(canvas).toBeVisible();
  await expect(page.locator('ngx-excalidraw .ngx-excalidraw-placeholder')).toHaveCount(0);

  const box = (await canvas.boundingBox())!;
  await page.getByTitle(/^Rectangle/).click();
  await page.mouse.move(box.x + box.width / 2 - 100, box.y + box.height / 2 - 60);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 100, box.y + box.height / 2 + 60, { steps: 10 });
  await page.mouse.up();

  await expect
    .poll(() =>
      page.evaluate(() =>
        (
          window as unknown as { __excalidrawApi: { getSceneElements(): { type: string }[] } }
        ).__excalidrawApi
          .getSceneElements()
          .map((element) => element.type),
      ),
    )
    .toEqual(['rectangle']);
  expect(errors).toEqual([]);
});

test('requests the Excalidraw bundle only after the app first becomes stable', async ({
  page,
  request,
}) => {
  await page.goto('/');
  await expect(page.getByTestId('excalidraw-status')).toHaveText('Excalidraw ready');
  const { stableAt, scripts } = await page.evaluate(() => ({
    stableAt: (window as unknown as { __appFirstStableAt?: number }).__appFirstStableAt,
    scripts: performance
      .getEntriesByType('resource')
      .filter((entry) => entry.name.endsWith('.js'))
      .map((entry) => ({ url: entry.name, startTime: entry.startTime })),
  }));
  expect(stableAt).toEqual(expect.any(Number));

  const excalidrawChunks = [];
  for (const script of scripts) {
    const source = await (await request.get(new URL(script.url).pathname)).text();
    if (source.includes('excalidraw-container')) excalidrawChunks.push(script);
  }
  expect(excalidrawChunks.length).toBeGreaterThan(0);
  for (const chunk of excalidrawChunks) expect(chunk.startTime).toBeGreaterThanOrEqual(stableAt!);
});
