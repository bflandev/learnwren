/// <reference types='vitest' />
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import angular from '@analogjs/vite-plugin-angular';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { nxCopyAssetsPlugin } from '@nx/vite/plugins/nx-copy-assets.plugin';

export default defineConfig(() => ({
  root: __dirname,
  cacheDir: '../../node_modules/.vite/libs/web-enrollment',
  plugins: [angular(), nxViteTsPaths(), nxCopyAssetsPlugin(['*.md'])],
  // The course-enrollment-panel spec imports AuthService from
  // @learnwren/web-auth, and that barrel re-exports LoginPageComponent (which
  // has a templateUrl). @analogjs/vite-plugin-angular fetches the templateUrl
  // via `?raw`, and vite's default server.fs.allow only includes this lib's
  // root — so we widen to the workspace root.
  server: {
    fs: {
      allow: [resolve(__dirname, '..', '..')],
    },
  },
  test: {
    name: 'web-enrollment',
    watch: false,
    globals: true,
    environment: 'jsdom',
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    setupFiles: ['src/test-setup.ts'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../coverage/libs/web-enrollment',
      provider: 'v8' as const,
    },
  },
}));
