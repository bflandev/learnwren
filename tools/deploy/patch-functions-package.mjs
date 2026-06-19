/**
 * Post-build patch for dist/apps/api/package.json.
 *
 * NxAppWebpackPlugin generates a package.json that carries the third-party
 * dependencies bundled into the api. This script ensures the file also has:
 *  - "main": "main.js"       — so firebase-tools discovers the function entry point
 *  - "engines": { "node": "22" }  — targets the Cloud Functions nodejs22 runtime
 *  - "firebase-functions" in dependencies — dynamically required at runtime in
 *    the Cloud Functions env (not bundled by webpack, must be installed there)
 *  - copies .env.learn-wren (rendered via `pnpm secrets:render:deploy`) into
 *    dist/apps/api so `firebase deploy` picks it up as gen2 runtime env; with
 *    --require-deploy-env (the deploy predeploy chain) a missing file is fatal
 *  - writes dist/apps/api/.secret.local so the functions emulator can resolve
 *    the SMTP_PASS secret binding during `pnpm smoke`
 *
 * Run ONLY as part of the deploy predeploy chain (firebase.deploy.json) — NOT
 * in the normal nx build flow so local/e2e builds are unaffected.
 *
 * Usage: node tools/deploy/patch-functions-package.mjs [--require-deploy-env]
 */

import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const requireDeployEnv = process.argv.includes('--require-deploy-env');
const pkgPath = resolve(__dirname, '../../dist/apps/api/package.json');

// Determine the firebase-functions specifier to write into the dist manifest.
// It MUST match the specifier recorded in the Nx-generated pruned lockfile
// (dist/apps/api/pnpm-lock.yaml), or the Cloud Functions buildpack's
// `pnpm install --frozen-lockfile` aborts with ERR_PNPM_OUTDATED_LOCKFILE
// (e.g. lockfile `6.6.0` vs a root-derived `^6.6.0`). The lockfile pins the
// exact resolved version as the importer specifier, so read it from there and
// fall back to the root package.json only when the lockfile is absent.
const rootPkgPath = resolve(__dirname, '../../package.json');
const rootPkg = JSON.parse(readFileSync(rootPkgPath, 'utf8'));

function readLockfileFfSpecifier() {
  const lockPath = resolve(__dirname, '../../dist/apps/api/pnpm-lock.yaml');
  if (!existsSync(lockPath)) return undefined;
  const lock = readFileSync(lockPath, 'utf8');
  // Match the importers block entry (`firebase-functions:\n  specifier: <x>`);
  // the package-list entries look like `firebase-functions@6.6.0:` and don't
  // have a following `specifier:` line, so they won't match.
  const m = lock.match(/\n\s+firebase-functions:\n\s+specifier:\s*(\S+)/);
  return m?.[1];
}

const ffVersion =
  readLockfileFfSpecifier() ??
  rootPkg.dependencies?.['firebase-functions'] ??
  rootPkg.devDependencies?.['firebase-functions'] ??
  '^6.6.0';

let pkg;
try {
  pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
} catch (err) {
  console.error(`[patch-functions-package] Cannot read ${pkgPath}: ${err.message}`);
  console.error('  Run `pnpm exec nx build api --configuration=production` first.');
  process.exit(1);
}

let changed = false;

if (pkg.main !== 'main.js') {
  pkg.main = 'main.js';
  changed = true;
}

const wantEngines = { node: '22' };
if (JSON.stringify(pkg.engines) !== JSON.stringify(wantEngines)) {
  pkg.engines = wantEngines;
  changed = true;
}

// firebase-functions is dynamically required at runtime (not bundled by
// webpack). The Cloud Functions runtime installs pkg.dependencies before
// serving the function, so it must appear here.
if (!pkg.dependencies) pkg.dependencies = {};
if (pkg.dependencies['firebase-functions'] !== ffVersion) {
  pkg.dependencies['firebase-functions'] = ffVersion;
  changed = true;
}

if (changed) {
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
  console.log('[patch-functions-package] Patched dist/apps/api/package.json (main, engines.node, firebase-functions dep)');
} else {
  console.log('[patch-functions-package] dist/apps/api/package.json already correct, nothing to patch.');
}

// ── Deploy env delivery ──────────────────────────────────────────────────
// `firebase deploy` reads dotenv files (.env.<projectId>) from the functions
// SOURCE directory. The webpack build wipes dist/apps/api (output.clean:true),
// so the rendered env file must be copied in AFTER the build — i.e. here.
const distDir = resolve(__dirname, '../../dist/apps/api');
const envSrc = resolve(__dirname, '../../.env.learn-wren');
if (existsSync(envSrc)) {
  copyFileSync(envSrc, resolve(distDir, '.env.learn-wren'));
  console.log('[patch-functions-package] Copied .env.learn-wren into dist/apps/api/');
} else if (requireDeployEnv) {
  console.error(
    '[patch-functions-package] FATAL: .env.learn-wren not found at the repo root.\n' +
      '  A production deploy without runtime env crashes at boot (prod guards).\n' +
      '  Render it first: pnpm secrets:render:deploy',
  );
  process.exit(1);
} else {
  console.warn(
    '[patch-functions-package] WARNING: .env.learn-wren not found — env copy skipped ' +
      '(fine for local smoke runs; required for pnpm deploy:prod).',
  );
}

// Emulator-only secret placeholder: lets the functions emulator (pnpm smoke)
// resolve the `secrets: ['SMTP_PASS']` binding without Cloud Secret Manager.
// Real deploys ignore .secret.local; the placeholder value is not sensitive.
writeFileSync(resolve(distDir, '.secret.local'), 'SMTP_PASS=smoke-placeholder\n', 'utf8');
console.log('[patch-functions-package] Wrote dist/apps/api/.secret.local (emulator-only)');
