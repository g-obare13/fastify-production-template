/**
 * @file ts-morph codemod rewriting relative cross-folder imports into native root-anchored subpaths.
 * @module scripts/codemods/rewrite-imports
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Project, type StringLiteral, SyntaxKind } from 'ts-morph';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

/**
 * Normalizes a specifier to either same-folder './file.js' or root-anchored '#src/...', '#test/...', '#packages/...'.
 *
 * @param specifier Original import or export specifier string.
 * @param sourceFilePath Absolute path to the importing source file.
 * @param root Repository root directory path.
 * @returns Normalized root-anchored or same-folder relative specifier.
 */
export function normalizeSpecifier(
  specifier: string,
  sourceFilePath: string,
  root: string = repoRoot
): string {
  // Ignore external packages and node: built-ins
  if (
    specifier.startsWith('node:') ||
    specifier.startsWith('http:') ||
    specifier.startsWith('https:') ||
    specifier.startsWith('virtual:')
  ) {
    return specifier;
  }

  const normalizedSource = path.normalize(sourceFilePath);
  const sourceDir = path.dirname(normalizedSource);

  // Check if it's already a root-anchored import: #src/*, #test/*, #packages/*
  if (
    specifier.startsWith('#src/') ||
    specifier.startsWith('#test/') ||
    specifier.startsWith('#packages/')
  ) {
    let relPath = '';
    if (specifier.startsWith('#src/')) {
      relPath = path.join('src', specifier.slice(5));
    } else if (specifier.startsWith('#test/')) {
      relPath = path.join('test', specifier.slice(6));
    } else if (specifier.startsWith('#packages/')) {
      relPath = path.join('packages', specifier.slice(10));
    }
    const absTarget = path.resolve(root, relPath);
    const targetDir = path.dirname(absTarget);

    // Rule: Root-anchored import for a file in the SAME folder is NOT allowed. Must be './file.js'
    if (targetDir === sourceDir) {
      return `./${path.basename(specifier)}`;
    }
    return specifier;
  }

  // Check if it is a relative import: starts with ./ or ../
  if (specifier.startsWith('./') || specifier.startsWith('../')) {
    const absTarget = path.resolve(sourceDir, specifier);
    const targetDir = path.dirname(absTarget);

    // Rule: If target is in the exact same directory, normalize to './file.js'
    if (targetDir === sourceDir) {
      return `./${path.basename(specifier)}`;
    }

    // Rule: If target is in another directory (subfolder or parent folder), must be root-anchored
    const relToRoot = path.relative(root, absTarget).replace(/\\/g, '/');

    if (relToRoot.startsWith('src/')) {
      return `#src/${relToRoot.slice(4)}`;
    }
    if (relToRoot.startsWith('test/')) {
      return `#test/${relToRoot.slice(5)}`;
    }
    if (relToRoot.startsWith('packages/')) {
      return `#packages/${relToRoot.slice(9)}`;
    }

    return specifier;
  }

  // Third-party imports (e.g. 'fastify', 'zod') remain untouched
  return specifier;
}

export function runCodemod(): {
  filesScanned: number;
  filesRewritten: number;
  totalImportsRewritten: number;
} {
  const project = new Project({
    tsConfigFilePath: path.resolve(repoRoot, 'tsconfig.json'),
    skipAddingFilesFromTsConfig: true,
  });

  // Add source, test, script, and package TypeScript files
  project.addSourceFilesAtPaths([
    path.resolve(repoRoot, 'src/**/*.ts'),
    path.resolve(repoRoot, 'src/**/*.d.ts'),
    path.resolve(repoRoot, 'test/**/*.ts'),
    path.resolve(repoRoot, 'scripts/**/*.ts'),
    path.resolve(repoRoot, 'packages/sdk/src/**/*.ts'),
  ]);

  const sourceFiles = project.getSourceFiles();
  let filesRewritten = 0;
  let totalImportsRewritten = 0;

  for (const sourceFile of sourceFiles) {
    const filePath = sourceFile.getFilePath();
    let fileChanged = false;

    const processLiteral = (literalNode: StringLiteral | undefined) => {
      if (!literalNode) return;
      const originalValue = literalNode.getLiteralValue();
      const updatedValue = normalizeSpecifier(originalValue, filePath, repoRoot);
      if (updatedValue !== originalValue) {
        literalNode.setLiteralValue(updatedValue);
        fileChanged = true;
        totalImportsRewritten++;
      }
    };

    // 1. Static imports: import ... from '...'
    for (const importDecl of sourceFile.getImportDeclarations()) {
      processLiteral(importDecl.getModuleSpecifier());
    }

    // 2. Static exports: export ... from '...'
    for (const exportDecl of sourceFile.getExportDeclarations()) {
      processLiteral(exportDecl.getModuleSpecifier());
    }

    // 3. Dynamic imports, vi.mock, jest.mock, require calls
    for (const callExpr of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      const expr = callExpr.getExpression();
      const isDynamicImport = expr.getKind() === SyntaxKind.ImportKeyword;
      const isRequire = expr.getText() === 'require';
      const isMock = expr.getText() === 'vi.mock' || expr.getText() === 'jest.mock';

      if (isDynamicImport || isRequire || isMock) {
        const args = callExpr.getArguments();
        const firstArg = args[0];
        if (firstArg && firstArg.getKind() === SyntaxKind.StringLiteral) {
          processLiteral(firstArg as StringLiteral);
        }
      }
    }

    // 4. Type imports: import('...').Type
    for (const importType of sourceFile.getDescendantsOfKind(SyntaxKind.ImportType)) {
      const arg = importType.getArgument();
      if (arg) {
        const strLiteral =
          arg.asKind(SyntaxKind.LiteralType)?.getFirstChildByKind(SyntaxKind.StringLiteral) ??
          (arg as unknown as { asKind?(k: SyntaxKind): StringLiteral | undefined }).asKind?.(
            SyntaxKind.StringLiteral
          );
        if (strLiteral) {
          processLiteral(strLiteral);
        }
      }
    }

    if (fileChanged) {
      sourceFile.saveSync();
      filesRewritten++;
    }
  }

  return {
    filesScanned: sourceFiles.length,
    filesRewritten,
    totalImportsRewritten,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = runCodemod();
  process.stdout.write(
    `[rewrite-imports] Scanned ${result.filesScanned} files, rewritten ${result.filesRewritten} files (${result.totalImportsRewritten} import specifiers normalized).\n`
  );
}
