/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Runs the REAL bundled ffmpeg/ffprobe against a generated 2-second 360p test
 * pattern, with a local-filesystem stand-in for object storage. Proves the
 * output matches the HLS naming contract and a segment decrypts with the key.
 */
import { execFile } from 'node:child_process';
import { createDecipheriv } from 'node:crypto';
import { mkdtemp, readdir, readFile, rm, writeFile, copyFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { VideoId, VideoKeyId } from '@learnwren/shared-data-models';

import type { VideoStoragePort } from '../video-storage.adapter';
import { resolveBinary } from './binaries';
import { FfmpegTranscoderAdapter, spawnRunner } from './ffmpeg-transcoder.adapter';

const pExecFile = promisify(execFile);
const ffmpegPath = resolveBinary(() => (require('@ffmpeg-installer/ffmpeg') as { path: string }).path, 'ffmpeg');
const ffprobePath = resolveBinary(() => (require('@ffprobe-installer/ffprobe') as { path: string }).path, 'ffprobe');

let root: string;
let objects: string; // local "bucket" root: <objects>/<bucket>/<path>

function localStorage(): VideoStoragePort {
  return {
    downloadObject: async ({ bucket, path, destination }) => {
      await copyFile(join(objects, bucket, path), destination);
    },
    uploadFile: async ({ localPath, bucket, path }) => {
      const dest = join(objects, bucket, path);
      await mkdir(dirname(dest), { recursive: true });
      await copyFile(localPath, dest);
    },
  } as unknown as VideoStoragePort;
}

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'lw-ffmpeg-it-'));
  objects = join(root, 'objects');
  await mkdir(join(objects, 'src', 'videos', 'v1'), { recursive: true });
  await pExecFile(ffmpegPath, [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=30',
    '-f', 'lavfi', '-i', 'sine=frequency=440',
    '-t', '2', '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-pix_fmt', 'yuv420p',
    join(objects, 'src', 'videos', 'v1', 'source.mp4'),
  ]);
}, 60_000);

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('FfmpegTranscoderAdapter with the real ffmpeg', () => {
  it('produces the contract HLS layout, encrypted, and reports success', async () => {
    const events: unknown[] = [];
    const key = new Uint8Array(16).map((_, i) => i * 3);
    const adapter = new FfmpegTranscoderAdapter({
      storage: localStorage(),
      runner: spawnRunner,
      ffmpegPath,
      ffprobePath,
      retryDelaysMs: [],
    });
    adapter.setSink(async (e) => {
      events.push(e);
      return { acted: true };
    });
    const { jobName } = await adapter.submitJob({
      videoId: 'v1' as VideoId,
      sourceUri: 'gs://src/videos/v1/source.mp4',
      outputUriPrefix: 'gs://out/videos/v1/hls/',
      encryptionKey: { id: 'k1' as VideoKeyId, bytes: key },
      sourceHeight: 360,
      topic: '',
    });
    await adapter.whenDone(jobName);

    expect(events).toHaveLength(1);
    if ((events[0] as { type: string }).type !== 'JOB_SUCCEEDED') throw new Error(JSON.stringify(events[0]));
    expect(events[0]).toMatchObject({ type: 'JOB_SUCCEEDED', jobName, manifestPath: 'videos/v1/hls/manifest.m3u8' });
    expect((events[0] as { durationSec: number }).durationSec).toBeGreaterThan(1.5);

    const outDir = join(objects, 'out', 'videos', 'v1', 'hls');
    const files = (await readdir(outDir)).sort();
    expect(files).toContain('manifest.m3u8');
    expect(files).toContain('hls_360p.m3u8');
    expect(files.filter((f) => /^hls_360p\d{10}\.ts$/.test(f)).length).toBeGreaterThan(0);
    expect(files.some((f) => f.startsWith('key') || f.startsWith('source'))).toBe(false);

    const master = await readFile(join(outDir, 'manifest.m3u8'), 'utf8');
    expect(master).toContain('#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360\nhls_360p.m3u8');
    const variant = await readFile(join(outDir, 'hls_360p.m3u8'), 'utf8');
    expect(variant).toMatch(/#EXT-X-KEY:METHOD=AES-128,URI="[^"]+",IV=0x[0-9a-fA-F]{32}/);
    expect(variant).toContain('#EXT-X-ENDLIST');

    // Decrypt the first segment with the key and the playlist's IV, then decode
    // every frame with ffmpeg. Not ffprobe: the linux-x64 static ffprobe build
    // CI installs segfaults on any MPEG-TS input (it reads mp4 fine).
    const ivHex = /IV=0x([0-9a-fA-F]{32})/.exec(variant)?.[1];
    const firstSegment = files.find((f) => /^hls_360p\d{10}\.ts$/.test(f));
    if (ivHex === undefined || firstSegment === undefined) throw new Error('playlist has no IV or no segment');
    const decipher = createDecipheriv('aes-128-cbc', key, Buffer.from(ivHex, 'hex'));
    const encrypted = await readFile(join(outDir, firstSegment));
    const plainPath = join(root, 'segment.ts');
    await writeFile(plainPath, Buffer.concat([decipher.update(encrypted), decipher.final()]));
    const { stderr } = await pExecFile(ffmpegPath, ['-hide_banner', '-i', plainPath, '-f', 'null', '-']);
    expect(stderr).toMatch(/Stream #\S+.*Video: h264.*, 640x360/);
  }, 120_000);
});
