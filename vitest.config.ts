import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/server.ts',
        'src/worker.ts',
        'src/db/client.ts',
        'src/db/migrate.ts',
        'src/db/seed.ts',
        'src/observability/instrumentation.ts',
        'src/lib/storage/s3.ts',
        'src/jobs/processors/**',
        'src/modules/**/repository.ts',
      ],
      thresholds: {
        lines: 65,
        functions: 65,
        branches: 65,
        statements: 65,
      },
    },
    testTimeout: 30000,
    hookTimeout: 30000,
  },
  resolve: {
    alias: {
      '#src': fileURLToPath(new URL('./src', import.meta.url)),
      '#test': fileURLToPath(new URL('./test', import.meta.url)),
      '#packages': fileURLToPath(new URL('./packages', import.meta.url)),
      graphql: fileURLToPath(new URL('./node_modules/graphql/index.js', import.meta.url)),
    },
  },
});
