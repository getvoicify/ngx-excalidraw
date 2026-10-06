import { Dialog, expect, Page, test } from '@playwright/test';

type DemoWindow = Window & {
  __excalidrawApi: {
    updateLibrary(options: { libraryItems: unknown[]; merge?: boolean }): Promise<unknown>;
  };
};

function recordDialogs(page: Page, respond: (dialog: Dialog) => Promise<void>) {
  const dialogs: string[] = [];
  page.on('dialog', (dialog) => {
    dialogs.push(dialog.type());
    void respond(dialog);
  });
  return dialogs;
}

const storedLibraryItemCount = (page: Page) =>
  page.evaluate(
    () =>
      (JSON.parse(localStorage.getItem('ngx-excalidraw-library') ?? '{}').libraryItems ?? [])
        .length as number,
  );

const addLibraryHash = (libraryUrl: string) =>
  `/#addLibrary=${encodeURIComponent(libraryUrl)}&token=e2e`;

async function importSampleLibrary(page: Page, baseURL: string) {
  const dialogs = recordDialogs(page, (dialog) => dialog.accept());
  await page.goto(addLibraryHash(new URL('/sample.excalidrawlib', baseURL).href));
  await expect(page.getByTestId('library-items')).toHaveText('library: 2');
  return dialogs;
}

test('imports a library from an #addLibrary link after confirmation and cleans the link', async ({
  page,
  baseURL,
}) => {
  const dialogs = await importSampleLibrary(page, baseURL!);

  expect(dialogs).toEqual(['confirm']);
  await expect.poll(() => new URL(page.url()).hash).not.toContain('addLibrary');
});

test('restores the imported library from localStorage after a reload', async ({
  page,
  baseURL,
}) => {
  const dialogs = await importSampleLibrary(page, baseURL!);
  await expect.poll(() => new URL(page.url()).hash).not.toContain('addLibrary');
  await expect.poll(() => storedLibraryItemCount(page)).toBe(2);

  await page.reload();

  await expect(page.getByTestId('excalidraw-status')).toHaveText('Excalidraw ready');
  await expect(page.getByTestId('library-items')).toHaveText('library: 2');
  expect(dialogs).toEqual(['confirm']);
});

const officialLibraryUrl = 'https://libraries.excalidraw.com/libraries/e2e/sample.excalidrawlib';

async function serveOfficialLegacyLibrary(page: Page) {
  await page.route(officialLibraryUrl, (route) =>
    route.fulfill({
      path: 'e2e/fixtures/legacy-v1.excalidrawlib',
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
    }),
  );
}

test('imports a legacy v1 library from the official libraries site via Add to Excalidraw', async ({
  page,
}) => {
  await serveOfficialLegacyLibrary(page);
  const dialogs = recordDialogs(page, (dialog) => dialog.accept());

  await page.goto(addLibraryHash(officialLibraryUrl));

  const disallowed = page.getByText(/Invalid or disallowed library URL/);
  await expect(page.getByText('library: 3', { exact: true }).or(disallowed)).toBeVisible();
  await expect(disallowed).toHaveCount(0);
  await expect(page.getByTestId('library-items')).toHaveText('library: 3');
  expect(dialogs).toEqual(['confirm']);
});

test('restores a library imported from the official site after a reload', async ({ page }) => {
  await serveOfficialLegacyLibrary(page);
  recordDialogs(page, (dialog) => dialog.accept());
  await page.goto(addLibraryHash(officialLibraryUrl));
  await expect(page.getByTestId('library-items')).toHaveText('library: 3');
  await expect.poll(() => storedLibraryItemCount(page)).toBe(3);

  await page.reload();

  await expect(page.getByTestId('excalidraw-status')).toHaveText('Excalidraw ready');
  await expect(page.getByTestId('library-items')).toHaveText('library: 3');
});

test('refuses a library from a host that only looks like the official libraries site', async ({
  page,
}) => {
  const lookalike = 'https://libraries.excalidraw.com.evil.com/libraries/e2e/sample.excalidrawlib';
  await page.route(lookalike, (route) =>
    route.fulfill({
      path: 'e2e/fixtures/legacy-v1.excalidrawlib',
      contentType: 'application/json',
    }),
  );
  const dialogs = recordDialogs(page, (dialog) => dialog.accept());

  await page.goto(addLibraryHash(lookalike));

  await expect(page.getByText(/Invalid or disallowed library URL/)).toBeVisible();
  await expect(page.getByTestId('library-items')).toHaveText('library: 0');
  expect(dialogs).toEqual([]);
});

test('refuses to import a library from an origin the validator does not allow', async ({
  page,
  baseURL,
}) => {
  const dialogs = recordDialogs(page, (dialog) => dialog.accept());
  const foreign = new URL('/sample.excalidrawlib', baseURL);
  foreign.hostname = '127.0.0.1';

  await page.goto(addLibraryHash(foreign.href));

  await expect(page.getByText(/Invalid or disallowed library URL/)).toBeVisible();
  await expect(page.getByTestId('library-items')).toHaveText('library: 0');
  expect(dialogs).toEqual([]);
});

test('reports library items added programmatically through the imperative API', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByTestId('excalidraw-status')).toHaveText('Excalidraw ready');

  await page.evaluate(() =>
    (window as unknown as DemoWindow).__excalidrawApi.updateLibrary({
      libraryItems: [
        {
          id: 'seeded',
          status: 'unpublished',
          created: 1,
          elements: [{ id: 'seeded-rect', type: 'rectangle', x: 0, y: 0, width: 40, height: 40 }],
        },
      ],
      merge: true,
    }),
  );

  await expect(page.getByTestId('library-items')).toHaveText('library: 1');
});
