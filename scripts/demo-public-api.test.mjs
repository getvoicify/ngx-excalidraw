import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const appDir = join(root, 'projects/demo/src/app');
const allowedModule = /^(?:@angular\/|rxjs(?:\/|$)|ngx-excalidraw$|\.{1,2}\/)/;
const globalObjects = new Set(['window', 'globalThis', 'self']);

const appFiles = readdirSync(appDir, { recursive: true })
  .filter((file) => file.endsWith('.ts') && !file.endsWith('.spec.ts'))
  .map((file) => join(appDir, file));

function parse(file) {
  return ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
}

function moduleSpecifiers(source) {
  const specifiers = [];
  const visit = (node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      specifiers.push(node.moduleSpecifier.text);
    }
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      specifiers.push(node.arguments[0].text);
    }
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
      specifiers.push(node.argument.literal.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return specifiers;
}

function unwrap(expression) {
  while (
    ts.isParenthesizedExpression(expression) ||
    ts.isAsExpression(expression) ||
    ts.isTypeAssertionExpression(expression) ||
    ts.isNonNullExpression(expression) ||
    ts.isSatisfiesExpression(expression)
  ) {
    expression = expression.expression;
  }
  return expression;
}

function globalAliases(source) {
  const aliases = new Set(globalObjects);
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const value = unwrap(node.initializer);
      if (ts.isIdentifier(value) && aliases.has(value.text)) aliases.add(node.name.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return aliases;
}

function underscoredGlobals(source) {
  const globals = globalAliases(source);
  const found = [];
  const visit = (node) => {
    const name = ts.isPropertyAccessExpression(node)
      ? node.name.text
      : ts.isElementAccessExpression(node) && ts.isStringLiteralLike(node.argumentExpression)
        ? node.argumentExpression.text
        : undefined;
    if (name?.startsWith('__')) {
      const target = unwrap(node.expression);
      if (ts.isIdentifier(target) && globals.has(target.text)) {
        found.push(`${target.text}.${name}`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

test('the demo app has source files to check', () => {
  assert.ok(appFiles.length > 0);
});

for (const file of appFiles) {
  const name = relative(root, file);

  test(`${name} imports only Angular, rxjs, ngx-excalidraw and its own files`, () => {
    assert.deepEqual(
      moduleSpecifiers(parse(file)).filter((specifier) => !allowedModule.test(specifier)),
      [],
    );
  });

  test(`${name} keeps no test hooks on the global object`, () => {
    assert.deepEqual(underscoredGlobals(parse(file)), []);
  });
}
