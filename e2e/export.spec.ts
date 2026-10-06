import { expect, test, type Page } from '@playwright/test';

async function drawRectangle(page: Page): Promise<void> {
  const canvas = page.locator('ngx-excalidraw canvas.interactive');
  await expect(canvas).toBeVisible();
  const box = (await canvas.boundingBox())!;
  await page.getByTitle(/^Rectangle/).click();
  await page.mouse.move(box.x + box.width / 2 - 100, box.y + box.height / 2 - 60);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 100, box.y + box.height / 2 + 60, { steps: 10 });
  await page.mouse.up();
  await expect(page.getByTestId('scene-elements')).toHaveText('elements: 1');
}

function loadedScripts(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .filter((name) => name.endsWith('.js')),
  );
}

test('exports the drawn scene as an SVG through the lazy data service', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/');
  await expect(page.getByTestId('excalidraw-status')).toHaveText('Excalidraw ready');
  await drawRectangle(page);

  await page.getByTestId('export-svg').click();

  const exported = page.getByTestId('exported-svg').locator('svg');
  await expect(exported).toHaveCount(1);
  await expect(exported.locator('rect, path').first()).toBeAttached();
  expect(errors).toEqual([]);
});

test('exporting reuses the Excalidraw chunk the editor already loaded', async ({
  page,
  request,
}) => {
  await page.goto('/');
  await expect(page.getByTestId('excalidraw-status')).toHaveText('Excalidraw ready');
  await drawRectangle(page);
  const beforeExport = new Set(await loadedScripts(page));

  await page.getByTestId('export-svg').click();
  await expect(page.getByTestId('exported-svg').locator('svg')).toHaveCount(1);

  const fetchedByExport = (await loadedScripts(page)).filter((url) => !beforeExport.has(url));
  for (const url of fetchedByExport) {
    const source = await (await request.get(new URL(url).pathname)).text();
    expect(source.includes('excalidraw-container'), url).toBe(false);
  }
});
