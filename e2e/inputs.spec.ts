import { expect, Page, test } from '@playwright/test';

type DemoWindow = Window & {
  __excalidrawApi: { getSceneElements(): { type: string }[] };
  __excalidrawApiEmissions: number;
};

const sceneElementTypes = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as DemoWindow).__excalidrawApi.getSceneElements().map(({ type }) => type),
  );

async function drawRectangle(page: Page) {
  const box = (await page.locator('ngx-excalidraw canvas.interactive').boundingBox())!;
  await page.getByTitle(/^Rectangle/).click();
  await page.mouse.move(box.x + box.width / 2 - 100, box.y + box.height / 2 - 60);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 100, box.y + box.height / 2 + 60, { steps: 10 });
  await page.mouse.up();
  await expect.poll(() => sceneElementTypes(page)).toEqual(['rectangle']);
}

test('switches the mounted editor to the dark theme without remounting or losing the scene', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByTestId('excalidraw-status')).toHaveText('Excalidraw ready');
  await drawRectangle(page);
  const canvas = await page.locator('ngx-excalidraw canvas.interactive').elementHandle();

  await page.getByTestId('dark-theme').check();

  await expect(page.locator('ngx-excalidraw .excalidraw.theme--dark')).toBeVisible();
  expect(await canvas!.evaluate((element) => element.isConnected)).toBe(true);
  expect(await sceneElementTypes(page)).toEqual(['rectangle']);
  expect(
    await page.evaluate(() => (window as unknown as DemoWindow).__excalidrawApiEmissions),
  ).toBe(1);
});

test('enters and leaves view mode in the mounted editor, hiding the drawing tools meanwhile', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByTestId('excalidraw-status')).toHaveText('Excalidraw ready');
  await drawRectangle(page);
  const canvas = await page.locator('ngx-excalidraw canvas.interactive').elementHandle();

  await page.getByTestId('view-mode').check();
  await expect(page.getByTitle(/^Rectangle/)).toHaveCount(0);

  await page.getByTestId('view-mode').uncheck();
  await expect(page.getByTitle(/^Rectangle/)).toBeVisible();
  expect(await canvas!.evaluate((element) => element.isConnected)).toBe(true);
  expect(await sceneElementTypes(page)).toEqual(['rectangle']);
  expect(
    await page.evaluate(() => (window as unknown as DemoWindow).__excalidrawApiEmissions),
  ).toBe(1);
});
