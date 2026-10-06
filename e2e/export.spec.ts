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

test('previews the drawn scene exported as an SVG image', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/');
  await expect(page.getByTestId('excalidraw-status')).toHaveText('Excalidraw ready');
  await drawRectangle(page);

  await page.getByTestId('export-svg').click();

  const preview = page.getByTestId('exported-svg');
  await expect(preview).toHaveJSProperty('complete', true);
  expect(await preview.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(
    0,
  );
  expect(await preview.getAttribute('src')).toMatch(/^data:image\/svg\+xml/);
  const drawnShapes = await preview.evaluate(async (image: HTMLImageElement) => {
    const svg = new DOMParser().parseFromString(
      await (await fetch(image.src)).text(),
      'image/svg+xml',
    );
    return svg.querySelectorAll('rect, path').length;
  });
  expect(drawnShapes).toBeGreaterThan(0);
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
  await expect(page.getByTestId('exported-svg')).toHaveAttribute('src', /^data:image\/svg\+xml/);

  const fetchedByExport = (await loadedScripts(page)).filter((url) => !beforeExport.has(url));
  for (const url of fetchedByExport) {
    const source = await (await request.get(new URL(url).pathname)).text();
    expect(source.includes('excalidraw-container'), url).toBe(false);
  }
});
