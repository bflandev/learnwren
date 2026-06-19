/**
 * Smoke assertions run INSIDE `firebase emulators:exec`.
 * Invoked by tools/deploy/smoke.mjs via:
 *   firebase emulators:exec --config firebase.smoke.json ... 'node tools/deploy/smoke-assert.mjs'
 *
 * Asserts:
 *  (a) GET http://127.0.0.1:7050/           -> 200 text/html  (SPA index)
 *  (b) GET http://127.0.0.1:7050/some/route -> 200 index.html (SPA fallback rewrite)
 *  (c) GET http://127.0.0.1:7050/api/health -> 200 JSON       (hosting rewrite → function)
 *  (d) index.html has no-cache Cache-Control; hashed JS has immutable
 */

import { readdirSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../..');
const HOSTING_PORT = 7050;

async function waitForHosting(maxAttempts = 60, delayMs = 1000) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${HOSTING_PORT}/`);
      if (r.status < 500) return true;
    } catch {
      // not yet
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return false;
}

function findHashedJs() {
  const browserDir = resolve(REPO_ROOT, 'dist/apps/web/browser');
  const files = readdirSync(browserDir);
  return files.find((f) => /chunk-[A-Z0-9]+\.js$/.test(f) || /main\.[A-Z0-9]+\.js$/.test(f)) ?? null;
}

async function run() {
  console.log('\n[smoke-assert] Waiting for hosting to become ready...');
  const ready = await waitForHosting();
  if (!ready) {
    console.error('[smoke-assert] ABORT: hosting did not respond within 60 s');
    process.exit(1);
  }

  let pass = 0;
  let fail = 0;

  async function check(label, fn) {
    try {
      await fn();
      console.log(`  [PASS] ${label}`);
      pass++;
    } catch (err) {
      console.error(`  [FAIL] ${label}: ${err.message}`);
      fail++;
    }
  }

  // (a) SPA index
  await check('(a) GET / -> 200 text/html', async () => {
    const r = await fetch(`http://127.0.0.1:${HOSTING_PORT}/`);
    if (r.status !== 200) throw new Error(`status ${r.status}`);
    const ct = r.headers.get('content-type') ?? '';
    if (!ct.includes('text/html')) throw new Error(`content-type: ${ct}`);
  });

  // (b) SPA fallback rewrite
  await check('(b) GET /some/spa/route -> 200 index.html fallback', async () => {
    const r = await fetch(`http://127.0.0.1:${HOSTING_PORT}/some/spa/route`);
    if (r.status !== 200) throw new Error(`status ${r.status}`);
    const body = await r.text();
    if (!body.includes('<html') && !body.includes('<!DOCTYPE')) {
      throw new Error('response body does not look like HTML');
    }
  });

  // (c) /api/health via hosting rewrite → Cloud Function
  await check('(c) GET /api/health -> 200 JSON through function rewrite', async () => {
    const r = await fetch(`http://127.0.0.1:${HOSTING_PORT}/api/health`);
    if (r.status !== 200) throw new Error(`status ${r.status}`);
    const body = await r.json();
    if (body.status !== 'ok') throw new Error(`body.status="${body.status}" expected "ok"`);
    if (typeof body.serverTime !== 'string') throw new Error('serverTime missing');
  });

  // (e) Security headers on document response
  await check('(e) index.html has Content-Security-Policy with frame-ancestors', async () => {
    const r = await fetch(`http://127.0.0.1:${HOSTING_PORT}/index.html`);
    const csp = r.headers.get('content-security-policy') ?? '';
    if (!csp.includes("frame-ancestors 'none'")) {
      throw new Error(`CSP missing frame-ancestors 'none' — got: "${csp}"`);
    }
  });

  await check("(e) index.html has X-Frame-Options: DENY", async () => {
    const r = await fetch(`http://127.0.0.1:${HOSTING_PORT}/index.html`);
    const xfo = r.headers.get('x-frame-options') ?? '';
    if (xfo.toUpperCase() !== 'DENY') {
      throw new Error(`X-Frame-Options: "${xfo}" (expected DENY)`);
    }
  });

  await check('(e) index.html has X-Content-Type-Options: nosniff', async () => {
    const r = await fetch(`http://127.0.0.1:${HOSTING_PORT}/index.html`);
    const xcto = r.headers.get('x-content-type-options') ?? '';
    if (xcto !== 'nosniff') {
      throw new Error(`X-Content-Type-Options: "${xcto}" (expected nosniff)`);
    }
  });

  await check('(e) index.html has Referrer-Policy', async () => {
    const r = await fetch(`http://127.0.0.1:${HOSTING_PORT}/index.html`);
    const rp = r.headers.get('referrer-policy') ?? '';
    if (!rp) {
      throw new Error('Referrer-Policy header missing');
    }
  });

  await check('(e) index.html has Strict-Transport-Security', async () => {
    const r = await fetch(`http://127.0.0.1:${HOSTING_PORT}/index.html`);
    const hsts = r.headers.get('strict-transport-security') ?? '';
    if (!hsts.includes('max-age=')) {
      throw new Error(`Strict-Transport-Security: "${hsts}" (expected max-age=...)`);
    }
  });

  // (d) Cache-Control headers
  await check('(d) index.html has no-cache Cache-Control', async () => {
    const r = await fetch(`http://127.0.0.1:${HOSTING_PORT}/index.html`);
    const cc = r.headers.get('cache-control') ?? '';
    if (!cc.includes('no-cache') && !cc.includes('no-store')) {
      throw new Error(`cache-control: "${cc}"`);
    }
  });

  // NOTE: the bare root "/" and rewritten SPA routes also need no-cache so
  // returning visitors get a new deploy immediately (firebase.deploy.json gives
  // the "**" block a no-cache Cache-Control for exactly this). That is NOT
  // asserted here: the Hosting EMULATOR does not apply "**"/"/" header globs to
  // the implicitly-served-or-rewritten index document (it returns an empty
  // Cache-Control for "/"), whereas production DOES apply "**" to "/" (the live
  // root carries the "**" security headers). This path is verified directly
  // against the deployed site after `pnpm deploy:prod`, not in the emulator.

  const hashedJs = findHashedJs();
  if (hashedJs) {
    await check(`(d) hashed asset ${hashedJs} has immutable Cache-Control`, async () => {
      const r = await fetch(`http://127.0.0.1:${HOSTING_PORT}/${hashedJs}`);
      const cc = r.headers.get('cache-control') ?? '';
      if (!cc.includes('immutable') && !cc.includes('max-age=31536000')) {
        throw new Error(`cache-control: "${cc}"`);
      }
    });
  } else {
    console.log('  [SKIP] (d) no hashed JS found in dist/apps/web/browser');
  }

  console.log('');
  console.log(`[smoke-assert] ${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('[smoke-assert] Unexpected error:', err);
  process.exit(1);
});
