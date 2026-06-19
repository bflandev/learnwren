import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * Architectural guard: every feature controller must be authenticated by default.
 *
 * Authn/authz is per-controller in this codebase (no global APP_GUARD for auth),
 * and the gen2 `api` function is publicly invokable (the Hosting /api/** rewrite
 * requires it). That combination means a NEW controller that ships without a
 * session guard is reachable on the public internet with no auth. This test
 * fails CI the moment such a controller appears, unless it is added to the
 * explicit public allowlist below with a deliberate justification.
 *
 * Rule: each `*.controller.ts` under libs/ must EITHER apply `FirebaseSessionGuard`
 * in a `@UseGuards(...)` (class- or method-level) OR be on PUBLIC_ALLOWLIST.
 * (apps/api's AppController is the deliberately-public /health shell and is out
 * of scope — it lives outside libs/.)
 */

// Lib-relative path suffixes for controllers that are public BY DESIGN.
const PUBLIC_ALLOWLIST = new Set([
  // Pre-auth endpoints (login/register/reset/unlock/logout); /me self-guards.
  'api-auth/src/lib/auth.controller.ts',
  // Public, read-only course discovery.
  'api-courses/src/lib/catalog/catalog.controller.ts',
  // Returns only the non-sensitive { fakePlayback } flag.
  'api-courses/src/lib/video/playback/playback-config.controller.ts',
  // Authenticated by OIDC via PubSubPushGuard, not a session cookie.
  'api-courses/src/lib/video/webhook/transcoder-events.controller.ts',
]);

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const libsDir = join(repoRoot, 'libs');

function appliesSessionGuard(src: string): boolean {
  // A @UseGuards(...) — class or method — whose argument list names the session
  // guard. Admin/instructor/owner guards always chain it, so this matches them
  // too; a bare import of the symbol does not satisfy the regex.
  return src
    .split('\n')
    .some((line) => /@UseGuards\([^)]*FirebaseSessionGuard/.test(line));
}

const controllerFiles = readdirSync(libsDir, { recursive: true, encoding: 'utf8' })
  .map((p) => p.replace(/\\/g, '/'))
  .filter((p) => p.endsWith('.controller.ts') && !p.endsWith('.spec.ts'));

describe('controller guard coverage', () => {
  it('discovers the feature controllers (guards against a broken glob)', () => {
    // If this drops to ~0 the scan silently broke and the suite below is moot.
    expect(controllerFiles.length).toBeGreaterThan(10);
  });

  it.each(controllerFiles)('%s is session-guarded or explicitly public', (rel) => {
    if (PUBLIC_ALLOWLIST.has(rel)) return;
    const src = readFileSync(join(libsDir, rel), 'utf8');
    expect(
      appliesSessionGuard(src),
      `${rel} applies no FirebaseSessionGuard and is not on PUBLIC_ALLOWLIST — ` +
        `a publicly-invokable function must not expose an unauthenticated controller. ` +
        `Add @UseGuards(FirebaseSessionGuard, …) or, if intentionally public, allowlist it.`,
    ).toBe(true);
  });
});
