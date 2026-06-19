import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * `firebase.smoke.json` (used by `pnpm smoke`) and `firebase.deploy.json` (the
 * real deploy) maintain their `hosting.headers` blocks independently. They are
 * meant to be byte-identical so the smoke proof exercises the exact security +
 * cache headers production ships. This test fails if they drift, so a CSP/HSTS
 * change can't pass smoke yet reach prod (or vice versa).
 */
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

function hostingHeaders(file: string): unknown {
  const cfg = JSON.parse(readFileSync(join(repoRoot, file), 'utf8'));
  return cfg.hosting.headers;
}

describe('smoke/deploy hosting header parity', () => {
  it('firebase.smoke.json hosting.headers match firebase.deploy.json', () => {
    expect(hostingHeaders('firebase.smoke.json')).toEqual(
      hostingHeaders('firebase.deploy.json'),
    );
  });
});
