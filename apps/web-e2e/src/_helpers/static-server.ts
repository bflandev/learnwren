import { createServer, type Server } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';

const PARENT_SEGMENT = '..';

/**
 * Serves a built Angular browser bundle for the performance suite.
 *
 * The a11y and responsive sweeps serve `nx serve web` — the dev server —
 * which is fine for axe scans and overflow checks and useless for timing:
 * dev bundles are unminified, untree-shaken, and run dev-mode change
 * detection. The perf gate measures the artefact the deploy actually ships,
 * so it serves `dist/apps/web/browser` statically instead.
 *
 * Deliberately dependency-free (node:http + node:fs). The workspace has no
 * static server and `express` is only present transitively under
 * @nestjs/platform-express; adding `serve` or `http-server` would buy
 * nothing these ~60 lines do not already do for this single use.
 */

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

export function contentTypeFor(filePath: string): string {
  return CONTENT_TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream';
}

const API_PATH_REGEX = /^\/?api\//;

/**
 * Strip the query string and percent-decode a raw request path. Returns null
 * for malformed percent-encoding (a `decodeURIComponent` throw) — that input
 * is not a path we are willing to guess at.
 *
 * This is the ONE decode site for the whole request. `isApiRequest` and
 * `resolveRequestPath` both consume its output rather than decoding
 * independently: decoding twice is exactly how a request like
 * `/%61pi/catalog` used to slip past an `isApiRequest` check written against
 * the raw path (it fails a literal `api/` regex) and then decode to
 * `api/catalog` inside `resolveRequestPath` — reaching the SPA-shell
 * fallback under a different name than the one it was blocked by.
 */
export function decodeRequestPath(urlPath: string): string | null {
  const withoutQuery = urlPath.split('?')[0] ?? '/';
  try {
    return decodeURIComponent(withoutQuery);
  } catch {
    return null;
  }
}

/**
 * True for a decoded request path beginning with `api/` (leading slash
 * optional). Expects its input already decoded via `decodeRequestPath` —
 * see that function's doc for why decoding happens exactly once.
 *
 * The perf suite is hermetic — every real API call the app makes is
 * intercepted by a Playwright route stub before it reaches the network. So
 * any `/api/...` request that lands on THIS static server is by definition
 * an unstubbed call: a route added to `PERF_ROUTES` without its matching
 * stub, or a stub URL pattern that doesn't match what the app actually
 * requests. Without this check that request falls through to the
 * extensionless-path branch below and gets `index.html` back at HTTP 200 —
 * a test-authoring bug disguised as a successful page load, surfacing later
 * as a client-side JSON parse error instead of a legible 404. Kept separate
 * from `resolveRequestPath` (rather than folded into it) so that function's
 * `string | null` contract keeps its single meaning: null means "escapes
 * the root". Overloading null to also mean "blocked API path" would make
 * both cases indistinguishable to the caller.
 */
export function isApiRequest(decodedPath: string): boolean {
  return API_PATH_REGEX.test(decodedPath);
}

/**
 * Map an already-decoded request path to a file inside `rootDir`, or null if
 * it escapes. Expects its input already decoded via `decodeRequestPath` (see
 * that function's doc) — this function does no decoding of its own.
 *
 * Extensionless paths fall back to index.html so Angular's client-side
 * routes (/catalog/c-1, /learn/c-1/l-1) resolve — without this every perf
 * navigation past the root would 404 and the LCP measurement would time a
 * "not found" page.
 *
 * The traversal check runs on the *relative* path (leading slashes
 * stripped) before it ever touches `root`. Checking the resolved absolute
 * path instead is unsafe: `path.normalize('/../../etc/passwd')` collapses
 * to `/etc/passwd` because POSIX treats a leading-slash string as already
 * rooted, so a resolve-then-compare check never sees an escape — the
 * traversal silently lands inside `root` instead of being rejected.
 */
export function resolveRequestPath(rootDir: string, decodedPath: string): string | null {
  const root = resolve(rootDir);
  const relativePath = normalize(decodedPath.replace(/^\/+/, ''));
  if (relativePath === PARENT_SEGMENT || relativePath.startsWith(PARENT_SEGMENT + sep)) {
    return null;
  }

  if (!extname(relativePath)) {
    return join(root, 'index.html');
  }
  return join(root, relativePath);
}

export async function startStaticServer(
  rootDir: string,
  port: number,
): Promise<{ url: string; close: () => Promise<void> }> {
  const root = resolve(rootDir);
  if (!existsSync(join(root, 'index.html'))) {
    throw new Error(
      `Static server root "${root}" has no index.html. ` +
        `Run \`pnpm exec nx build web\` first — the perf target declares ` +
        `dependsOn: ["web:build"], so this means the build output moved.`,
    );
  }

  const server: Server = createServer((req, res) => {
    const decodedPath = decodeRequestPath(req.url ?? '/');
    if (decodedPath === null) {
      // Malformed percent-encoding fails safe as a plain 404, same as an
      // escape attempt below — never reaches the filesystem.
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    if (isApiRequest(decodedPath)) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found: unstubbed /api request reached the static server');
      return;
    }
    const filePath = resolveRequestPath(root, decodedPath);
    if (!filePath || !existsSync(filePath) || !statSync(filePath).isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    // LOAD-BEARING OMISSION: no Last-Modified, no ETag, no Cache-Control.
    // Without validators or a freshness lifetime the browser cannot reuse a
    // cached response, so every perf navigation refetches the whole bundle —
    // which is exactly the "cold first visit, every sample" model all four
    // load-time budgets were calibrated against (spec §5). Adding cache
    // headers here would silently make every sample a warm load, drop the
    // medians, and invalidate those budgets with no test going red. Do not
    // add them.
    res.writeHead(200, { 'Content-Type': contentTypeFor(filePath) });
    createReadStream(filePath).pipe(res);
  });

  // Without an 'error' listener a failed listen (EADDRINUSE from an orphaned
  // server on this port — the perf config uses reuseExistingServer: false, so
  // that is the likely first failure) never settles this promise: node's
  // uncaught-exception handler kills the process before the CLI's .catch can
  // print anything. Reject with the port named instead.
  await new Promise<void>((done, fail) => {
    server.once('error', (err: NodeJS.ErrnoException) =>
      fail(
        new Error(
          `Static server failed to listen on port ${port}` +
            (err.code === 'EADDRINUSE'
              ? ' — something else is already bound to it (an orphaned server from an earlier run?).'
              : `: ${err.message}`),
        ),
      ),
    );
    server.listen(port, done);
  });

  return {
    url: `http://localhost:${port}`,
    close: () => new Promise<void>((done, fail) =>
      server.close((err) => (err ? fail(err) : done())),
    ),
  };
}
