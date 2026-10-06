import { crc32 } from 'node:zlib';
import { expect, Page, test } from '@playwright/test';

type DemoWindow = Window & {
  __excalidrawApi: { getSceneElements(): { type: string; text?: string }[] };
  __filePickers: string[];
};

const sceneElementTypes = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as DemoWindow).__excalidrawApi.getSceneElements().map(({ type }) => type),
  );

const filePickers = (page: Page) =>
  page.evaluate(() => (window as unknown as DemoWindow).__filePickers);

async function recordFilePickers(page: Page) {
  await page.addInitScript(() => {
    const demoWindow = window as unknown as DemoWindow & Record<string, unknown>;
    demoWindow.__filePickers = [];
    const picker = (name: string) => async () => {
      demoWindow.__filePickers.push(name);
      throw new DOMException('closed by the test', 'AbortError');
    };
    demoWindow['showOpenFilePicker'] = picker('open');
    demoWindow['showSaveFilePicker'] = picker('save');
  });
}

async function openEditor(page: Page, url: string) {
  await page.goto(url);
  await expect(page.getByTestId('excalidraw-status')).toHaveText('Excalidraw ready');
}

async function drawRectangle(page: Page) {
  const box = (await page.locator('ngx-excalidraw canvas.interactive').boundingBox())!;
  await page.getByTitle(/^Rectangle/).click();
  await page.mouse.move(box.x + box.width / 2 - 100, box.y + box.height / 2 - 60);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 100, box.y + box.height / 2 + 60, { steps: 10 });
  await page.mouse.up();
  await expect.poll(() => sceneElementTypes(page)).toEqual(['rectangle']);
}

async function showMainMenu(page: Page) {
  await page.getByTestId('main-menu').dispatchEvent('click');
  await expect(page.getByTestId('main-menu-trigger')).toBeVisible();
}

async function pressInEditor(page: Page, shortcut: string) {
  await page.locator('ngx-excalidraw .excalidraw-container').focus();
  await page.keyboard.press(shortcut);
}

const ellipse = {
  id: 'dropped-ellipse',
  type: 'ellipse',
  x: 0,
  y: 0,
  width: 80,
  height: 40,
};
const sceneJson = JSON.stringify({
  type: 'excalidraw',
  version: 2,
  source: 'e2e',
  elements: [ellipse],
  appState: {},
  files: {},
});
const libraryJson = JSON.stringify({
  type: 'excalidrawlib',
  version: 2,
  source: 'e2e',
  libraryItems: [{ id: 'dropped-item', status: 'unpublished', created: 1, elements: [ellipse] }],
});
const plainPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

function pngWithTextChunk(keyword: string, text: string): Buffer {
  const data = Buffer.concat([Buffer.from(keyword, 'latin1'), Buffer.from([0]), Buffer.from(text)]);
  const typeAndData = Buffer.concat([Buffer.from('tEXt'), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  const iend = plainPng.length - 12;
  return Buffer.concat([
    plainPng.subarray(0, iend),
    length,
    typeAndData,
    crc,
    plainPng.subarray(iend),
  ]);
}

const svgWithScene = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><!-- payload-type:application/vnd.excalidraw+json --><!-- payload-version:2 --><!-- payload-start -->${Buffer.from(sceneJson).toString('base64')}<!-- payload-end --></svg>`;

interface DroppedFile {
  name: string;
  type: string;
  base64: string;
}

const file = (name: string, type: string, contents: Buffer | string): DroppedFile => ({
  name,
  type,
  base64: Buffer.from(contents).toString('base64'),
});

const plainImage = file('plain.png', 'image/png', plainPng);

async function dropFile(page: Page, dropped: DroppedFile) {
  await page
    .locator('ngx-excalidraw canvas.interactive')
    .evaluate((canvas, { name, type, base64 }) => {
      const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(new File([bytes], name, { type }));
      const { left, top, width, height } = canvas.getBoundingClientRect();
      const init = {
        bubbles: true,
        cancelable: true,
        clientX: left + width / 3,
        clientY: top + height / 3,
        dataTransfer,
      };
      for (const kind of ['dragenter', 'dragover', 'drop'])
        canvas.dispatchEvent(new DragEvent(kind, init));
    }, dropped);
}

test.describe('with the main menu hidden', () => {
  const shortcuts = [
    { name: 'open (ControlOrMeta+O)', keys: 'ControlOrMeta+o', effect: 'open' },
    { name: 'save (ControlOrMeta+S)', keys: 'ControlOrMeta+s', effect: 'save' },
  ];

  for (const { name, keys, effect } of shortcuts) {
    test(`ignores the ${name} shortcut and honours it once the menu is shown again`, async ({
      page,
    }) => {
      await recordFilePickers(page);
      await openEditor(page, '/?mainMenu=false');

      await pressInEditor(page, keys);
      await showMainMenu(page);
      await pressInEditor(page, keys);

      await expect.poll(() => filePickers(page)).toEqual([effect]);
    });
  }

  const dialogShortcuts = [
    {
      name: 'export image (ControlOrMeta+Shift+E)',
      keys: 'ControlOrMeta+Shift+e',
      dialog: '.ImageExportModal',
    },
    {
      name: 'reset canvas (ControlOrMeta+Backspace)',
      keys: 'ControlOrMeta+Backspace',
      dialog: '.confirm-dialog',
    },
    {
      name: 'reset canvas (ControlOrMeta+Delete)',
      keys: 'ControlOrMeta+Delete',
      dialog: '.confirm-dialog',
    },
    { name: 'help (?)', keys: '?', dialog: '.HelpDialog' },
  ];

  for (const { name, keys, dialog } of dialogShortcuts) {
    test(`ignores the ${name} shortcut and honours it once the menu is shown again`, async ({
      page,
    }) => {
      await openEditor(page, '/?mainMenu=false');

      await pressInEditor(page, keys);
      await showMainMenu(page);
      await expect(page.locator(dialog)).toHaveCount(0);

      await pressInEditor(page, keys);
      await expect(page.locator(dialog)).toBeVisible();
    });
  }

  test('hides the help button and shows it again with the menu', async ({ page }) => {
    await openEditor(page, '/?mainMenu=false');
    await expect(page.locator('ngx-excalidraw .help-icon')).toBeHidden();

    await showMainMenu(page);

    await expect(page.locator('ngx-excalidraw .help-icon')).toBeVisible();
  });

  test('still types a question mark into a text element', async ({ page }) => {
    await openEditor(page, '/?mainMenu=false');
    const box = (await page.locator('ngx-excalidraw canvas.interactive').boundingBox())!;

    await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
    await page.keyboard.type('why?');
    await page.keyboard.press('Escape');

    await expect
      .poll(() =>
        page.evaluate(() =>
          (window as unknown as DemoWindow).__excalidrawApi
            .getSceneElements()
            .map(({ text }) => text),
        ),
      )
      .toEqual(['why?']);
    await expect(page.locator('.HelpDialog')).toHaveCount(0);
  });

  test('still inserts a dropped plain image', async ({ page }) => {
    await openEditor(page, '/?mainMenu=false');
    await drawRectangle(page);

    await dropFile(page, plainImage);

    await expect.poll(() => sceneElementTypes(page)).toEqual(['rectangle', 'image']);
  });

  const sceneFiles = [
    file('scene.excalidraw', '', sceneJson),
    file('scene.json', 'application/json', sceneJson),
    file('scene.png', 'image/png', pngWithTextChunk('application/vnd.excalidraw+json', sceneJson)),
    file('scene.svg', 'image/svg+xml', svgWithScene),
  ];

  for (const sceneFile of sceneFiles) {
    test(`keeps the drawing when ${sceneFile.name} is dropped onto it`, async ({ page }) => {
      await openEditor(page, '/?mainMenu=false');
      await drawRectangle(page);

      await dropFile(page, sceneFile);
      await dropFile(page, plainImage);

      await expect.poll(() => sceneElementTypes(page)).toEqual(['rectangle', 'image']);
    });
  }

  test('ignores a dropped library file', async ({ page }) => {
    await openEditor(page, '/?mainMenu=false');
    await drawRectangle(page);

    await dropFile(page, file('shapes.excalidrawlib', '', libraryJson));
    await dropFile(page, plainImage);

    await expect.poll(() => sceneElementTypes(page)).toEqual(['rectangle', 'image']);
    await expect(page.getByTestId('library-items')).toHaveText('library: 0');
  });

  test('opens a dropped scene file again once the menu is shown', async ({ page }) => {
    await openEditor(page, '/?mainMenu=false');
    await drawRectangle(page);
    await showMainMenu(page);

    await dropFile(page, file('scene.excalidraw', '', sceneJson));

    await expect.poll(() => sceneElementTypes(page)).toEqual(['ellipse']);
  });
});
