import { describe, expect, it } from 'vitest';
import { join } from 'node:path';

import { contentTypeFor, resolveRequestPath } from './static-server';

const ROOT = '/tmp/build-output';

describe('resolveRequestPath', () => {
  it('resolves a real asset path under the root', () => {
    expect(resolveRequestPath(ROOT, '/main-ABC123.js')).toBe(join(ROOT, 'main-ABC123.js'));
  });

  it('falls back to index.html for an extensionless SPA route', () => {
    expect(resolveRequestPath(ROOT, '/catalog/c-1')).toBe(join(ROOT, 'index.html'));
  });

  it('resolves the bare root to index.html', () => {
    expect(resolveRequestPath(ROOT, '/')).toBe(join(ROOT, 'index.html'));
  });

  it('strips a query string before resolving', () => {
    expect(resolveRequestPath(ROOT, '/main-ABC.js?v=2')).toBe(join(ROOT, 'main-ABC.js'));
  });

  it('returns null for a traversal attempt that escapes the root', () => {
    expect(resolveRequestPath(ROOT, '/../../etc/passwd')).toBeNull();
  });

  it('returns null for an encoded traversal attempt', () => {
    expect(resolveRequestPath(ROOT, '/%2e%2e/%2e%2e/etc/passwd')).toBeNull();
  });
});

describe('contentTypeFor', () => {
  it.each([
    ['/x/index.html', 'text/html; charset=utf-8'],
    ['/x/main.js', 'text/javascript; charset=utf-8'],
    ['/x/styles.css', 'text/css; charset=utf-8'],
    ['/x/tokens.json', 'application/json; charset=utf-8'],
    ['/x/logo.svg', 'image/svg+xml'],
    ['/x/photo.jpg', 'image/jpeg'],
    ['/x/icon.png', 'image/png'],
    ['/x/font.woff2', 'font/woff2'],
  ])('maps %s to %s', (path, expected) => {
    expect(contentTypeFor(path)).toBe(expected);
  });

  it('falls back to octet-stream for an unknown extension', () => {
    expect(contentTypeFor('/x/thing.xyz')).toBe('application/octet-stream');
  });
});
