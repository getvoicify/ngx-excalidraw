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

test.describe('main menu', () => {
  const trigger = (page: Page) => page.getByTestId('main-menu-trigger');
  const menu = (page: Page) => page.getByTestId('dropdown-menu');

  async function ready(page: Page, url = '/') {
    await page.goto(url);
    await expect(page.getByTestId('excalidraw-status')).toHaveText('Excalidraw ready');
  }

  test('shows the main menu trigger by default', async ({ page }) => {
    await ready(page);
    await expect(trigger(page)).toBeVisible();
  });

  test('hides the main menu at runtime without remounting or losing the scene, and brings it back', async ({
    page,
  }) => {
    await ready(page);
    await drawRectangle(page);
    const canvas = await page.locator('ngx-excalidraw canvas.interactive').elementHandle();

    await page.getByTestId('main-menu').uncheck();

    await expect(trigger(page)).toBeHidden();
    expect(await canvas!.evaluate((element) => element.isConnected)).toBe(true);
    expect(await sceneElementTypes(page)).toEqual(['rectangle']);

    await page.getByTestId('main-menu').check();

    await expect(trigger(page)).toBeVisible();
    await trigger(page).click();
    await expect(menu(page)).toBeVisible();
    expect(await canvas!.evaluate((element) => element.isConnected)).toBe(true);
    expect(
      await page.evaluate(() => (window as unknown as DemoWindow).__excalidrawApiEmissions),
    ).toBe(1);
  });

  test('closes the open main menu when it gets hidden', async ({ page }) => {
    await ready(page);
    await trigger(page).click();
    await expect(menu(page)).toBeVisible();

    await page.getByTestId('main-menu').dispatchEvent('click');

    await expect(page.getByTestId('main-menu')).not.toBeChecked();
    await expect(menu(page)).toHaveCount(0);
  });

  test('hides the main menu on a phone-sized viewport too', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await ready(page);
    await expect(trigger(page)).toBeVisible();

    await page.getByTestId('main-menu').uncheck();

    await expect(trigger(page)).toBeHidden();
  });

  test('server-renders the hidden main menu state on the editor host', async ({ request }) => {
    const html = await (await request.get('/?mainMenu=false')).text();
    expect(html).toMatch(/<ngx-excalidraw[^>]*class="[^"]*ngx-excalidraw--no-main-menu/);
  });

  test('hides the trigger from the first mount when the page starts with the main menu off', async ({
    page,
  }) => {
    await ready(page, '/?mainMenu=false');
    await expect(page.getByTestId('main-menu')).not.toBeChecked();
    await expect(trigger(page)).toBeHidden();
  });
});
