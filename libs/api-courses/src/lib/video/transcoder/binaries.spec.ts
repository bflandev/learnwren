/* eslint-disable @typescript-eslint/no-require-imports */
import { accessSync, constants, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { ensureExecutable, resolveBinary } from './binaries';

describe('ensureExecutable', () => {
  const dirs: string[] = [];
  afterEach(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

  it('adds the execute bit to a binary that was installed without it', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lw-bin-')); dirs.push(dir);
    const bin = join(dir, 'ffprobe');
    writeFileSync(bin, '#!/bin/sh\n', { mode: 0o644 });
    expect(() => accessSync(bin, constants.X_OK)).toThrow();
    expect(ensureExecutable(bin)).toBe(bin);
    expect(() => accessSync(bin, constants.X_OK)).not.toThrow();
  });

  it('returns the path untouched when it is missing (the spawn reports it later)', () => {
    expect(ensureExecutable('/nonexistent/ffmpeg')).toBe('/nonexistent/ffmpeg');
  });
});

describe('resolveBinary', () => {
  it('resolves the installer package path and makes it executable', () => {
    const p = resolveBinary(() => (require('@ffprobe-installer/ffprobe') as { path: string }).path, 'ffprobe');
    expect(p).toMatch(/ffprobe$/);
    expect(() => accessSync(p, constants.X_OK)).not.toThrow();
  });

  it('falls back to the bare command name when the package is absent', () => {
    expect(resolveBinary(() => { throw new Error('absent'); }, 'ffmpeg')).toBe('ffmpeg');
  });
});
