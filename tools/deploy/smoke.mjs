/**
 * Smoke harness for the deploy wiring.
 *
 * Boots Firebase emulators on non-default ports (avoids conflicting with the
 * user's long-lived emulators on 8080/9099/9199/4000), then exercises the
 * hosting + functions wiring end-to-end via tools/deploy/smoke-assert.mjs.
 *
 * Assertions verified:
 *   (a) GET http://127.0.0.1:7050/           -> 200 text/html  (SPA index)
 *   (b) GET http://127.0.0.1:7050/some/route -> 200 index.html (SPA fallback)
 *   (c) GET http://127.0.0.1:7050/api/health -> 200 JSON       (rewrite → function)
 *   (d) index.html: no-cache; hashed JS: immutable
 *
 * Prerequisites (run once before smoke):
 *   pnpm exec nx build api --configuration=production --skip-nx-cache
 *   node tools/deploy/patch-functions-package.mjs
 *   pnpm exec nx build web --configuration=production --skip-nx-cache
 *
 * Usage:
 *   node tools/deploy/smoke.mjs
 *   # or:
 *   pnpm smoke
 */

import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../..');
const PROJECT = 'demo-learnwren-smoke';

// ─── Pre-flight checks ────────────────────────────────────────────────────────

function abort(msg) {
  console.error(`\n[smoke] ABORT: ${msg}`);
  process.exit(1);
}

function checkBuiltArtifacts() {
  const apiMain = resolve(REPO_ROOT, 'dist/apps/api/main.js');
  const webIndex = resolve(REPO_ROOT, 'dist/apps/web/browser/index.html');

  if (!existsSync(apiMain)) {
    abort(`dist/apps/api/main.js not found. Build first:
    pnpm exec nx build api --configuration=production --skip-nx-cache
    node tools/deploy/patch-functions-package.mjs`);
  }
  if (!existsSync(webIndex)) {
    abort(`dist/apps/web/browser/index.html not found. Build first:
    pnpm exec nx build web --configuration=production --skip-nx-cache`);
  }

  const apiPkg = JSON.parse(readFileSync(resolve(REPO_ROOT, 'dist/apps/api/package.json'), 'utf8'));
  if (!apiPkg.engines?.node) {
    abort('dist/apps/api/package.json missing engines.node — run: node tools/deploy/patch-functions-package.mjs');
  }
  if (!apiPkg.dependencies?.['firebase-functions']) {
    abort('dist/apps/api/package.json missing firebase-functions — run: node tools/deploy/patch-functions-package.mjs');
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('[smoke] Pre-flight checks...');
  checkBuiltArtifacts();
  console.log('[smoke] Artifacts OK.\n');
  console.log('[smoke] Starting Firebase emulators on smoke ports:');
  console.log('  hosting=7050  functions=7051  firestore=7080  auth=7099  storage=7199');
  console.log('[smoke] Using project:', PROJECT);
  console.log('[smoke] This may take 30-60 s for a cold start.\n');

  // The functions emulator inherits process.env from firebase-tools, which
  // in turn inherits from this process. We set the fake/emulator env vars
  // here so the NestJS api boots in emulator mode without real credentials.
  const smokeEnv = {
    ...process.env,
    // firebase-admin emulator hosts — smoke ports, not the user's ports.
    FIRESTORE_EMULATOR_HOST: '127.0.0.1:7080',
    FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:7099',
    FIREBASE_STORAGE_EMULATOR_HOST: '127.0.0.1:7199',
    // Non-production mode: fake adapters + permissive CORS defaults.
    NODE_ENV: 'development',
    // Required by readCoverConfigFromEnv at boot (not functionally used in smoke).
    LEARNWREN_COVER_BUCKET: 'learnwren-smoke-covers',
    LEARNWREN_COVER_PUBLIC_BASE_URL: 'http://127.0.0.1:7199/v0/b/learnwren-smoke-covers/o',
    LEARNWREN_PICTURE_BUCKET: 'learnwren-smoke-pictures',
    LEARNWREN_PICTURE_PUBLIC_BASE_URL: 'http://127.0.0.1:7199/v0/b/learnwren-smoke-pictures/o',
    // Video: fake transcoder + fake playback (no GCP credentials needed).
    LEARNWREN_VIDEO_SOURCE_BUCKET: 'learnwren-smoke-source',
    LEARNWREN_VIDEO_OUTPUT_BUCKET: 'learnwren-smoke-output',
    LEARNWREN_VIDEO_TRANSCODER: 'fake',
    LEARNWREN_VIDEO_STORAGE_PLAYBACK_FAKE: 'true',
    // Materials: fake passthrough.
    LEARNWREN_MATERIALS_STORAGE_FAKE: 'true',
    // Email: log to console (no SMTP).
    LEARNWREN_EMAIL_TRANSPORT: 'console',
  };

  const configPath = resolve(REPO_ROOT, 'firebase.smoke.json');
  const assertScript = resolve(REPO_ROOT, 'tools/deploy/smoke-assert.mjs');

  // Use `pnpm exec firebase` so the locally-installed firebase-tools is found
  // even when the firebase CLI is not on the shell PATH.
  const proc = spawn(
    'pnpm',
    [
      'exec', 'firebase',
      'emulators:exec',
      '--config', configPath,
      '--project', PROJECT,
      `node ${assertScript}`,
    ],
    {
      cwd: REPO_ROOT,
      env: smokeEnv,
      stdio: 'inherit',
      shell: false,
    },
  );

  proc.on('close', (code) => {
    if (code === 0) {
      console.log('\n[smoke] All assertions PASSED.');
    } else {
      console.error(`\n[smoke] Smoke test FAILED (exit ${code}).`);
    }
    process.exit(code ?? 1);
  });

  proc.on('error', (err) => {
    console.error('[smoke] Failed to start process:', err.message);
    process.exit(1);
  });
}

main().catch((err) => {
  console.error('[smoke] Unexpected error:', err);
  process.exit(1);
});
