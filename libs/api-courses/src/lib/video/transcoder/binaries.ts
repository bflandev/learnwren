import { accessSync, chmodSync, constants } from 'node:fs';

/**
 * Bundled ffmpeg/ffprobe binaries. `@ffprobe-installer/ffprobe` ships its
 * binary without the execute bit on some platforms (seen on macOS arm64 and
 * in the linux-arm64 Docker image: `spawn ... EACCES`), so resolution always
 * repairs the mode. Falls back to the bare command on PATH when the package
 * is not installed.
 */
export function ensureExecutable(path: string): string {
  try {
    accessSync(path, constants.X_OK);
  } catch {
    try {
      chmodSync(path, 0o755);
    } catch {
      // Missing file or read-only install: leave it; the spawn error will say why.
    }
  }
  return path;
}

/**
 * `load` must contain a literal `require('<pkg>')`: webpack resolves literal
 * requires when bundling the api and cannot resolve a variable one, which
 * would silently fall back to the bare command at runtime.
 */
export function resolveBinary(load: () => string, fallback: string): string {
  try {
    return ensureExecutable(load());
  } catch {
    return fallback;
  }
}
