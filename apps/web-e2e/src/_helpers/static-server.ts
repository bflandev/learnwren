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

/**
 * Map a request path to a file inside `rootDir`, or null if it escapes.
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
export function resolveRequestPath(rootDir: string, urlPath: string): string | null {
  const withoutQuery = urlPath.split('?')[0] ?? '/';
  let decoded: string;
  try {
    decoded = decodeURIComponent(withoutQuery);
  } catch {
    // Malformed percent-encoding is not a path we are willing to guess at.
    return null;
  }

  const root = resolve(rootDir);
  const relativePath = normalize(decoded.replace(/^\/+/, ''));
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
    const filePath = resolveRequestPath(root, req.url ?? '/');
    if (!filePath || !existsSync(filePath) || !statSync(filePath).isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentTypeFor(filePath) });
    createReadStream(filePath).pipe(res);
  });

  await new Promise<void>((done) => server.listen(port, done));

  return {
    url: `http://localhost:${port}`,
    close: () => new Promise<void>((done, fail) =>
      server.close((err) => (err ? fail(err) : done())),
    ),
  };
}
