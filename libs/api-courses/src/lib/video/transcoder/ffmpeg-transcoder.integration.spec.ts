/**
 * Runs the REAL bundled ffmpeg/ffprobe against a generated 2-second 360p test
 * pattern, with a local-filesystem stand-in for object storage. Proves the
 * output matches the HLS naming contract and decrypts with the key on disk.
 */
import { execFile } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, writeFile, copyFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { VideoId, VideoKeyId } from '@learnwren/shared-data-models';

import type { VideoStoragePort } from '../video-storage.adapter';
import { FfmpegTranscoderAdapter, spawnRunner } from './ffmpeg-transcoder.adapter';

const pExecFile = promisify(execFile);
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ffmpegPath: string = require('@ffmpeg-installer/ffmpeg').path;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ffprobePath: string = require('@ffprobe-installer/ffprobe').path;

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

    // Decrypt-and-read the encrypted playlist with the key on disk: rewrite the
    // key URI to a local file and let ffprobe walk every segment.
    const keyPath = join(root, 'k.bin');
    await writeFile(keyPath, key);
    const playable = variant.replace(/URI="[^"]+"/, `URI="${keyPath}"`);
    const playablePath = join(outDir, 'local.m3u8');
    await writeFile(playablePath, playable);
    const { stdout } = await pExecFile(ffprobePath, [
      '-v', 'error', '-allowed_extensions', 'ALL', '-print_format', 'json', '-show_streams', playablePath,
    ]);
    const probed = JSON.parse(stdout) as { streams: { codec_type: string; height?: number }[] };
    expect(probed.streams.find((s) => s.codec_type === 'video')?.height).toBe(360);
  }, 120_000);
});
