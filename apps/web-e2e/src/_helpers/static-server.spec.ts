import { describe, expect, it } from 'vitest';
import { join } from 'node:path';

import { contentTypeFor, decodeRequestPath, isApiRequest, resolveRequestPath } from './static-server';

const ROOT = '/tmp/build-output';

describe('decodeRequestPath', () => {
  it('strips a query string', () => {
    expect(decodeRequestPath('/main-ABC.js?v=2')).toBe('/main-ABC.js');
  });

  it('percent-decodes the path', () => {
    expect(decodeRequestPath('/%2e%2e/%2e%2e/etc/passwd')).toBe('/../../etc/passwd');
  });

  it('percent-decodes a disguised /api path', () => {
    expect(decodeRequestPath('/%61pi/catalog')).toBe('/api/catalog');
  });

  it('returns null for malformed percent-encoding', () => {
    expect(decodeRequestPath('/%zz/catalog')).toBeNull();
  });
});

describe('resolveRequestPath (given an already-decoded path)', () => {
  it('resolves a real asset path under the root', () => {
    expect(resolveRequestPath(ROOT, '/main-ABC123.js')).toBe(join(ROOT, 'main-ABC123.js'));
  });

  it('falls back to index.html for an extensionless SPA route', () => {
    expect(resolveRequestPath(ROOT, '/catalog/c-1')).toBe(join(ROOT, 'index.html'));
  });

  it('resolves the bare root to index.html', () => {
    expect(resolveRequestPath(ROOT, '/')).toBe(join(ROOT, 'index.html'));
  });

  it('returns null for a traversal attempt that escapes the root', () => {
    expect(resolveRequestPath(ROOT, '/../../etc/passwd')).toBeNull();
  });

  it('returns null for a decoded traversal attempt', () => {
    const decoded = decodeRequestPath('/%2e%2e/%2e%2e/etc/passwd');
    expect(decoded).not.toBeNull();
    expect(resolveRequestPath(ROOT, decoded as string)).toBeNull();
  });
});

describe('isApiRequest (given an already-decoded path)', () => {
  it('is true for a path beginning with /api/', () => {
    expect(isApiRequest('/api/catalog')).toBe(true);
  });

  it('is true for an api path without a leading slash', () => {
    expect(isApiRequest('api/catalog')).toBe(true);
  });

  it('is false for a real asset path', () => {
    expect(isApiRequest('/main-ABC123.js')).toBe(false);
  });

  it('is false for an extensionless SPA route', () => {
    expect(isApiRequest('/catalog/c-1')).toBe(false);
  });

  it('is false for a path that merely contains "api" mid-segment', () => {
    expect(isApiRequest('/apiary/thing')).toBe(false);
  });
});

describe('decodeRequestPath + isApiRequest pipeline (regression: percent-encoded bypass)', () => {
  it('catches a fully percent-encoded /api path, e.g. /%61pi/catalog', () => {
    const decoded = decodeRequestPath('/%61pi/catalog');
    expect(decoded).not.toBeNull();
    expect(isApiRequest(decoded as string)).toBe(true);
  });

  it('catches a partially percent-encoded /api path, e.g. /ap%69/catalog', () => {
    const decoded = decodeRequestPath('/ap%69/catalog');
    expect(decoded).not.toBeNull();
    expect(isApiRequest(decoded as string)).toBe(true);
  });

  it('still ignores /apiary once decoded (not an /api path)', () => {
    const decoded = decodeRequestPath('/apiary/thing');
    expect(decoded).not.toBeNull();
    expect(isApiRequest(decoded as string)).toBe(false);
  });

  it('malformed encoding never reaches isApiRequest — the decode fails first', () => {
    expect(decodeRequestPath('/%zz/catalog')).toBeNull();
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
