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

export function resolveBinary(pkg: string, fallback: string): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return ensureExecutable((require(pkg) as { path: string }).path);
  } catch {
    return fallback;
  }
}
