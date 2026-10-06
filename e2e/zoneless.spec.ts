import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

function calledFunctionNames(path: string): string[] {
  const source = ts.createSourceFile(
    path,
    readFileSync(path, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  const names: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression))
      names.push(node.expression.text);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return names;
}

test('the demo is configured without zone.js', () => {
  const angularJson = JSON.parse(readFileSync('angular.json', 'utf8'));
  const buildOptions = angularJson.projects.demo.architect.build.options;
  expect(buildOptions.polyfills ?? []).not.toContain('zone.js');
  for (const path of [
    'projects/demo/src/main.ts',
    'projects/demo/src/app/app.config.ts',
    'projects/demo/src/app/app.config.server.ts',
  ]) {
    expect(calledFunctionNames(path), path).not.toContain('provideZoneChangeDetection');
  }
});

test('server HTML references no polyfills or zone chunk', async ({ request }) => {
  const html = await (await request.get('/')).text();
  expect(html).not.toMatch(/(?:src|href)="[^"]*(?:polyfills|zone)[^"]*"/);
});

test('signals and outputs alone drive the ready status without zone.js', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('excalidraw-status')).toHaveText('Excalidraw ready');
  expect(await page.evaluate(() => typeof (window as unknown as { Zone?: unknown }).Zone)).toBe(
    'undefined',
  );
});
