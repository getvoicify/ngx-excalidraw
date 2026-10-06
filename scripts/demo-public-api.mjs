import { readdirSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import ts from 'typescript';

const allowedPackage = /^(?:@angular\/[^/]+(?:\/.*)?|rxjs(?:\/.*)?|@getvoicify\/ngx-excalidraw)$/;
const serverOnlyPackage = /^(?:express|node:.+)$/;
const serverEntries = new Set(['server.ts']);
const sourceExtension = /\.(?:ts|mts|js)$/;
const globalObjects = new Set(['window', 'globalThis', 'self']);
const globalWriters = new Set([
  'Object.assign',
  'Object.defineProperty',
  'Object.defineProperties',
  'Reflect.set',
  'Reflect.defineProperty',
]);

export function productionSources(srcRoot) {
  return readdirSync(srcRoot, { recursive: true })
    .filter(
      (file) =>
        sourceExtension.test(file) &&
        !/\.spec\.[mc]?[jt]s$/.test(file) &&
        !file.endsWith('.d.ts') &&
        file.split(sep)[0] !== 'e2e',
    )
    .map((file) => join(srcRoot, file));
}

export function publicApiViolations({ path, text, srcRoot }) {
  const diagnostics = ts.transpileModule(text, {
    fileName: path,
    reportDiagnostics: true,
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.Latest },
  }).diagnostics;
  if (diagnostics.length > 0) {
    return diagnostics.map(
      (diagnostic) =>
        `cannot parse: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ')}`,
    );
  }
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
  const isServerEntry = serverEntries.has(relative(srcRoot, path));
  const found = [];
  const visit = (node) => {
    const specifier = moduleReference(node);
    if (specifier !== undefined) {
      const problem = importProblem(specifier, { path, srcRoot, isServerEntry });
      if (problem) found.push(problem);
    }
    const underscored = underscoredName(node);
    if (underscored) found.push(`uses ${underscored}`);
    if (writesToGlobal(node)) found.push(`writes onto the global object: ${node.getText()}`);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

function moduleReference(node) {
  if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
    return literalText(node.moduleSpecifier);
  }
  if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
    return literalText(node.moduleReference.expression);
  }
  if (ts.isImportTypeNode(node)) {
    return ts.isLiteralTypeNode(node.argument) ? literalText(node.argument.literal) : null;
  }
  if (ts.isCallExpression(node) && isModuleLoader(node.expression)) {
    return node.arguments[0] ? literalText(node.arguments[0]) : null;
  }
  return undefined;
}

function isModuleLoader(callee) {
  return (
    callee.kind === ts.SyntaxKind.ImportKeyword ||
    (ts.isIdentifier(callee) && callee.text === 'require')
  );
}

function literalText(node) {
  return ts.isStringLiteralLike(node) ? node.text : null;
}

function importProblem(specifier, { path, srcRoot, isServerEntry }) {
  if (specifier === null) return 'loads a module whose name is not a string literal';
  if (specifier.startsWith('.')) {
    const target = relative(srcRoot, resolve(dirname(path), specifier));
    const segments = target.split(sep);
    const insideSources =
      target !== '' && !target.startsWith('..') && !isAbsolute(target) && segments[0] !== 'e2e';
    return insideSources && !segments.includes('node_modules')
      ? undefined
      : `imports ${specifier} from outside the demo sources`;
  }
  if (allowedPackage.test(specifier)) return undefined;
  if (isServerEntry && serverOnlyPackage.test(specifier)) return undefined;
  return `imports ${specifier}`;
}

function underscoredName(node) {
  if (ts.isIdentifier(node) || ts.isPrivateIdentifier(node)) {
    return node.text.startsWith('__') ? node.text : undefined;
  }
  if (ts.isStringLiteralLike(node) || ts.isTemplateHead(node)) {
    return node.text.startsWith('__') ? JSON.stringify(node.text) : undefined;
  }
  return undefined;
}

function writesToGlobal(node) {
  return (
    ts.isCallExpression(node) &&
    globalWriters.has(node.expression.getText()) &&
    node.arguments[0] !== undefined &&
    isGlobalObject(node.arguments[0])
  );
}

function isGlobalObject(expression) {
  const target = unwrap(expression);
  if (ts.isIdentifier(target)) return globalObjects.has(target.text);
  if (ts.isPropertyAccessExpression(target)) {
    return (
      (target.name.text === 'defaultView' && unwrap(target.expression).getText() === 'document') ||
      (globalObjects.has(target.name.text) && isGlobalObject(target.expression))
    );
  }
  return false;
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
