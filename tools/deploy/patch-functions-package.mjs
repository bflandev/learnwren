/**
 * Post-build patch for dist/apps/api/package.json.
 *
 * NxAppWebpackPlugin generates a package.json that carries the third-party
 * dependencies bundled into the api. This script ensures the file also has:
 *  - "main": "main.js"       — so firebase-tools discovers the function entry point
 *  - "engines": { "node": "22" }  — targets the Cloud Functions nodejs22 runtime
 *  - "firebase-functions" in dependencies — dynamically required at runtime in
 *    the Cloud Functions env (not bundled by webpack, must be installed there)
 *
 * Run ONLY as part of the deploy predeploy chain (firebase.deploy.json) — NOT
 * in the normal nx build flow so local/e2e builds are unaffected.
 *
 * Usage: node tools/deploy/patch-functions-package.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgPath = resolve(__dirname, '../../dist/apps/api/package.json');

// Read the root workspace package.json to get the pinned firebase-functions version.
const rootPkgPath = resolve(__dirname, '../../package.json');
const rootPkg = JSON.parse(readFileSync(rootPkgPath, 'utf8'));
const ffVersion =
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
