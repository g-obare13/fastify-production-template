import path from 'node:path';
import js from '@eslint/js';
import jsdoc from 'eslint-plugin-jsdoc';
import tseslint from 'typescript-eslint';

const repoRoot = process.cwd();

/**
 * Custom ESLint rule enforcing root-anchored imports:
 * 1. Disallows any import containing '../'
 * 2. Disallows any './' import that points to a subfolder ('./* / *')
 * 3. Disallows root-anchored imports for files in the same folder (must use './file.js')
 */
const rootAnchoredImportsRule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Enforce root-anchored (#src/, #test/, #packages/) imports with same-folder (./file.js) relative imports.',
    },
    schema: [],
    messages: {
      noParentRelative: 'Parent relative imports ("../") are forbidden. Use root-anchored import ("#src/...", "#test/...", or "#packages/...") instead.',
      noSubfolderRelative: 'Subfolder relative imports ("./sub/...") are forbidden. Use root-anchored import ("#src/...", "#test/...", or "#packages/...") instead.',
      noRootForSameFolder: 'Root-anchored imports for files in the same folder are forbidden. Use same-folder relative import ("./{{fileName}}") instead.',
    },
  },
  create(context) {
    const filename = path.normalize(context.filename || context.getFilename());
    const fileDir = path.dirname(filename);

    function checkSpecifier(node, specifier) {
      if (!specifier || typeof specifier !== 'string') return;

      // Rule 1: No '../' allowed
      if (specifier.includes('../')) {
        context.report({
          node,
          messageId: 'noParentRelative',
        });
        return;
      }

      // Rule 2: No './' that goes into a subfolder (e.g. './sub/file.js')
      if (specifier.startsWith('./') && specifier.slice(2).includes('/')) {
        context.report({
          node,
          messageId: 'noSubfolderRelative',
        });
        return;
      }

      // Rule 3: No root-anchored import for files in the same folder
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

        const absTarget = path.resolve(repoRoot, relPath);
        const targetDir = path.dirname(absTarget);

        if (targetDir === fileDir) {
          context.report({
            node,
            messageId: 'noRootForSameFolder',
            data: {
              fileName: path.basename(specifier),
            },
          });
        }
      }
    }

    return {
      ImportDeclaration(node) {
        checkSpecifier(node.source, node.source.value);
      },
      ExportNamedDeclaration(node) {
        if (node.source) {
          checkSpecifier(node.source, node.source.value);
        }
      },
      ExportAllDeclaration(node) {
        if (node.source) {
          checkSpecifier(node.source, node.source.value);
        }
      },
      CallExpression(node) {
        // dynamic import(), require(), vi.mock(), jest.mock()
        const isImport = node.callee.type === 'Import';
        const isRequire = node.callee.type === 'Identifier' && node.callee.name === 'require';
        const isMock =
          node.callee.type === 'MemberExpression' &&
          ((node.callee.object.name === 'vi' && node.callee.property.name === 'mock') ||
            (node.callee.object.name === 'jest' && node.callee.property.name === 'mock'));

        if (isImport || isRequire || isMock) {
          const arg = node.arguments[0];
          if (arg && arg.type === 'Literal') {
            checkSpecifier(arg, arg.value);
          }
        }
      },
    };
  },
};

const customImportsPlugin = {
  rules: {
    'root-anchored': rootAnchoredImportsRule,
  },
};

export default [
  // Global ignore
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      'packages/sdk/dist/**',
      'packages/sdk/src/schema.d.ts',
      'packages/sdk/src/graphql.ts',
      'src/graphql/persisted-queries.json',
      'src/db/migrations/**',
    ],
  },
  // Base JS/TS configuration for imports checking
  {
    files: ['src/**/*.{ts,js}', 'test/**/*.{ts,js}', 'scripts/**/*.{ts,js}', 'packages/**/*.{ts,js}'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    plugins: {
      'custom-imports': customImportsPlugin,
    },
    rules: {
      'custom-imports/root-anchored': 'error',
    },
  },
  // JSDoc linting configuration for src and packages
  {
    files: ['src/**/*.{ts,js}', 'packages/**/*.{ts,js}'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    plugins: {
      jsdoc,
    },
    rules: {
      'jsdoc/require-jsdoc': [
        'error',
        {
          require: {
            FunctionDeclaration: true,
            MethodDefinition: true,
            ClassDeclaration: true,
            ArrowFunctionExpression: false,
            FunctionExpression: false,
          },
          contexts: [
            'ExportNamedDeclaration[declaration]',
          ],
        },
      ],
      'jsdoc/require-description': 'error',
      'jsdoc/require-param': ['error', { checkDestructured: false }],
      'jsdoc/require-param-description': 'error',
      'jsdoc/require-returns': ['error', { checkGetters: false, checkConstructors: false }],
      'jsdoc/require-returns-description': 'error',
      'jsdoc/check-param-names': ['error', { checkDestructured: false }],
      'jsdoc/no-types': 'error',
    },
  },
];
