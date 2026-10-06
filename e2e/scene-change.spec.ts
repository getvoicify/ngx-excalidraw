import { expect, Page, test } from '@playwright/test';

type SceneElement = {
  type: string;
  x: number;
  version: number;
  versionNonce: number;
  isDeleted?: boolean;
};
type DemoWindow = Window & {
  __sceneChangeEmissions?: number;
  __framesSeen?: number;
  __excalidrawApi: {
    getSceneElements(): SceneElement[];
    updateScene(scene: {
      elements?: SceneElement[];
      appState?: { viewBackgroundColor?: string };
    }): void;
    onChange(callback: () => void): () => void;
  };
};

const sceneChangeEmissions = (page: Page) =>
  page.evaluate(() => (window as unknown as DemoWindow).__sceneChangeEmissions ?? 0);

const emissionsAndFrames = (page: Page) =>
  page.evaluate(() => {
    const demoWindow = window as unknown as DemoWindow;
    return { emissions: demoWindow.__sceneChangeEmissions ?? 0, frames: demoWindow.__framesSeen! };
  });

const countFrames = (page: Page) =>
  page.evaluate(() => {
    const demoWindow = window as unknown as DemoWindow;
    demoWindow.__framesSeen = 0;
    const tick = () => {
      demoWindow.__framesSeen!++;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

const nextFrames = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 100))),
      ),
  );

async function canvasCentre(page: Page) {
  const box = (await page.locator('ngx-excalidraw canvas.interactive').boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('excalidraw-status')).toHaveText('Excalidraw ready');
  await nextFrames(page);
});

test('reports a drawn rectangle through sceneChange at most once per frame during the drag', async ({
  page,
}) => {
  await countFrames(page);
  const centre = await canvasCentre(page);
  await page.getByTitle(/^Rectangle/).click();
  await page.mouse.move(centre.x - 100, centre.y - 60);
  await nextFrames(page);
  const before = await emissionsAndFrames(page);

  await page.mouse.down();
  await page.mouse.move(centre.x + 100, centre.y + 60, { steps: 40 });
  await page.mouse.up();

  await expect(page.getByTestId('scene-elements')).toHaveText('elements: 1');
  const after = await emissionsAndFrames(page);
  const emissions = after.emissions - before.emissions;
  expect(emissions).toBeGreaterThan(0);
  expect(emissions).toBeLessThanOrEqual(after.frames - before.frames);
});

test('coalesces scene updates landing within the same frame into one emission', async ({
  page,
}) => {
  const centre = await canvasCentre(page);
  await page.getByTitle(/^Rectangle/).click();
  await page.mouse.move(centre.x - 100, centre.y - 60);
  await page.mouse.down();
  await page.mouse.move(centre.x + 100, centre.y + 60, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByTestId('scene-elements')).toHaveText('elements: 1');
  await nextFrames(page);
  const before = await sceneChangeEmissions(page);

  const updates = await page.evaluate(
    () =>
      new Promise<number>((resolve) =>
        requestAnimationFrame(() => {
          const api = (window as unknown as DemoWindow).__excalidrawApi;
          const tasks = new MessageChannel();
          let applied = 0;
          tasks.port1.onmessage = () => {
            api.updateScene({
              elements: api.getSceneElements().map((element) => ({
                ...element,
                x: element.x + 1,
                version: element.version + 1,
                versionNonce: element.versionNonce + 1,
              })),
            });
            if (++applied < 10) tasks.port2.postMessage(null);
            else resolve(applied);
          };
          tasks.port2.postMessage(null);
        }),
      ),
  );
  await nextFrames(page);

  expect(updates).toBe(10);
  expect((await sceneChangeEmissions(page)) - before).toBeLessThanOrEqual(2);
});

test('emits nothing while the pointer only hovers or pans the canvas', async ({ page }) => {
  const centre = await canvasCentre(page);
  await page.mouse.move(centre.x - 150, centre.y - 100);
  await nextFrames(page);
  const before = await sceneChangeEmissions(page);

  await page.mouse.move(centre.x + 150, centre.y + 100, { steps: 30 });
  await page.mouse.wheel(120, 80);
  await nextFrames(page);

  expect(await sceneChangeEmissions(page)).toBe(before);
  await expect(page.getByTestId('scene-elements')).toHaveText('elements: 0');
});

test('delivers the last edit when the editor is removed while no frame can run', async ({
  page,
}) => {
  const centre = await canvasCentre(page);
  await page.getByTitle(/^Rectangle/).click();
  await page.mouse.move(centre.x - 100, centre.y - 60);
  await page.mouse.down();
  await page.mouse.move(centre.x + 100, centre.y + 60, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByTestId('scene-elements')).toHaveText('elements: 1');
  await nextFrames(page);

  await page.evaluate(() => {
    const api = (window as unknown as DemoWindow).__excalidrawApi;
    const removeEditor = document.querySelector<HTMLButtonElement>('[data-testid=remove-editor]')!;
    window.requestAnimationFrame = () => 0;
    const stopListening = api.onChange(() => {
      stopListening();
      queueMicrotask(() => removeEditor.click());
    });
    api.updateScene({
      elements: api.getSceneElements().map((element) => ({
        ...element,
        isDeleted: true,
        version: element.version + 1,
        versionNonce: element.versionNonce + 1,
      })),
    });
  });

  await expect(page.locator('ngx-excalidraw')).toHaveCount(0);
  await expect(page.getByTestId('scene-elements')).toHaveText('elements: 0');
});

test('emits once when only the canvas background changes', async ({ page }) => {
  const before = await sceneChangeEmissions(page);

  await page.evaluate(() =>
    (window as unknown as DemoWindow).__excalidrawApi.updateScene({
      appState: { viewBackgroundColor: '#ffc9c9' },
    }),
  );
  await nextFrames(page);

  expect((await sceneChangeEmissions(page)) - before).toBe(1);
});
