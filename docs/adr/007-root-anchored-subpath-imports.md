# ADR 007: Root-Anchored Subpath Imports with Same-Folder Relative Imports

## Status
Accepted

## Context
In large Node.js and TypeScript codebases, deeply nested relative imports (e.g. `../../../../src/lib/errors.js`) lead to brittle code that breaks whenever files are moved, refactored, or reorganized. Relative imports spanning directory trees also obfuscate the architectural boundary being crossed. Conversely, using build-time bundler aliases (such as `@/`) creates impedance mismatches between development tools (`tsx`, Vitest) and runtime execution (`node dist/...`), requiring build steps or runtime loaders to translate paths.

## Decision
We adopted native Node.js Subpath Imports (`#src/*`, `#test/*`, `#packages/*`) configured in `package.json` and mirrored in `tsconfig.json`:

1. **Same-Folder Imports Only for Relative Paths**:
   - An import of project code may be relative **only** when the target file resides in the exact same directory as the importing file (`./service.js`).
   - Any relative import containing `../` is forbidden.
   - Any `./` import that reaches into a subfolder (`./sub/file.js`) is forbidden.
2. **Root-Anchored for Cross-Folder Imports**:
   - Any file importing code from another folder must use root-anchored subpath imports (`#src/...`, `#test/...`, or `#packages/...`).
   - Root-anchored imports for a file located in the same folder are forbidden (must use `./file.js` to ensure uniform conventions).
3. **Native Runtime Resolution Without Bundler**:
   - Defined in `package.json` under `"imports"`:
     ```json
     "imports": {
       "#src/*": {
         "production": "./dist/src/*",
         "default": "./src/*"
       },
       "#test/*": "./test/*",
       "#packages/*": {
         "production": "./dist/packages/*",
         "default": "./packages/*"
       }
     }
     ```
   - In production containers and Docker images, `NODE_OPTIONS="--conditions=production"` resolves `#src/*` directly from `./dist/src/*` without extra tooling.
4. **Automated Codemod & Lint Enforcement**:
   - Migrated using an AST codemod (`scripts/codemods/rewrite-imports.ts`) using `ts-morph`.
   - Enforced in CI via a custom ESLint rule (`custom-imports/root-anchored`) in `eslint.config.imports.js`.

## Consequences
- **Positive**:
  - Eliminates brittle `../` traversal chains.
  - Zero-overhead runtime resolution supported natively by Node.js 22 LTS, TypeScript 5, tsx, Vitest, and Docker runtime.
  - Consistent import discipline across entire codebase.
- **Negative**:
  - Developers must use `#src/` instead of navigating up directory trees.
