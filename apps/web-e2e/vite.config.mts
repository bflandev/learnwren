/// <reference types='vitest' />
import { defineConfig } from 'vite';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';

export default defineConfig(() => ({
  root: __dirname,
  cacheDir: '../../node_modules/.vite/apps/web-e2e',
  plugins: [nxViteTsPaths()],
  test: {
    name: 'web-e2e',
    watch: false,
    globals: true,
    environment: 'node',
    // Scoped to the plain-Node helpers only: the rest of apps/web-e2e/src is
    // Playwright *.spec.ts files, which fail if picked up by vitest.
    include: ['src/_helpers/**/*.spec.ts'],
    reporters: ['default'],
    passWithNoTests: true,
    coverage: {
      reportsDirectory: '../../coverage/apps/web-e2e',
      provider: 'v8' as const,
    },
  },
}));
