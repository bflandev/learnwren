import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import type { VideoId, VideoKeyId } from '@learnwren/shared-data-models';

import type { VideoStoragePort } from '../video-storage.adapter';
import {
  FfmpegTranscoderAdapter,
  type FfmpegRunner,
  type TranscodeEventSink,
} from './ffmpeg-transcoder.adapter';

const input = (sourceHeight = 720) => ({
  videoId: 'v1' as VideoId,
  sourceUri: 'gs://src/videos/v1/source.mp4',
  outputUriPrefix: 'gs://out/videos/v1/hls/',
  encryptionKey: { id: 'k1' as VideoKeyId, bytes: new Uint8Array(16).fill(7) },
  sourceHeight,
  topic: '',
});

const PROBE_JSON = JSON.stringify({
  streams: [{ codec_type: 'video', height: 720 }],
  format: { duration: '12.5' },
});

interface Call { binary: string; args: string[]; cwd: string }

/**
 * A runner that behaves like ffprobe (JSON on stdout) and like ffmpeg (writes
 * the playlist + two segments named by its own args into cwd).
 */
function fakeRunner(opts: { fail?: boolean; hang?: boolean } = {}): { runner: FfmpegRunner; calls: Call[]; killed: number } {
  const calls: Call[] = [];
  const state = { killed: 0 };
  const runner: FfmpegRunner = (binary, args, { cwd }) => {
    calls.push({ binary, args, cwd });
    if (binary.endsWith('ffprobe')) {
      return { done: Promise.resolve({ stdout: PROBE_JSON }), kill: () => undefined };
    }
    if (opts.hang) {
      let reject!: (e: Error) => void;
      const done = new Promise<{ stdout: string }>((_, rej) => (reject = rej));
      return { done, kill: () => { state.killed++; reject(new Error('killed')); } };
    }
    if (opts.fail) {
      return { done: Promise.reject(new Error('libx264 exploded')), kill: () => undefined };
    }
    const segPattern = args[args.indexOf('-hls_segment_filename') + 1]!;
    const playlist = args.at(-1)!;
    const done = (async () => {
      const seg = (n: number) => segPattern.replace('%010d', String(n).padStart(10, '0'));
      await writeFile(join(cwd, playlist), `#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="key.bin"\n${seg(0)}\n${seg(1)}\n`);
      await writeFile(join(cwd, seg(0)), 'ts0');
      await writeFile(join(cwd, seg(1)), 'ts1');
      return { stdout: '' };
    })();
    return { done, kill: () => undefined };
  };
  return { runner, calls, get killed() { return state.killed; } };
}

function fakeStorage(): VideoStoragePort & { uploads: { path: string; contentType: string; bucket: string }[] } {
  const uploads: { path: string; contentType: string; bucket: string }[] = [];
  return {
    uploads,
    downloadObject: vi.fn(async ({ destination }: { destination: string }) => {
      await mkdir(join(destination, '..'), { recursive: true });
      await writeFile(destination, 'mp4');
    }),
    uploadFile: vi.fn(async ({ path, contentType, bucket }: { path: string; contentType: string; bucket: string }) => {
      uploads.push({ path, contentType, bucket });
    }),
  } as unknown as VideoStoragePort & { uploads: { path: string; contentType: string; bucket: string }[] };
}

function make(
  runnerBits = fakeRunner(),
  sink: TranscodeEventSink = vi.fn(async () => ({ acted: true })),
  retryDelaysMs: number[] = [0, 0],
) {
  const storage = fakeStorage();
  const adapter = new FfmpegTranscoderAdapter({
    storage,
    runner: runnerBits.runner,
    ffmpegPath: '/bin/ffmpeg',
    ffprobePath: '/bin/ffprobe',
    retryDelaysMs,
  });
  adapter.setSink(sink);
  return { adapter, storage, sink, ...runnerBits };
}

describe('FfmpegTranscoderAdapter.submitJob', () => {
  it('returns an ffmpeg-prefixed job name derived from the videoId', async () => {
    const { adapter } = make();
    const handle = await adapter.submitJob(input());
    expect(handle.jobName).toMatch(/^ffmpeg-v1-\d+-0$/);
    await adapter.whenDone(handle.jobName);
  });

  it('refuses a source below the lowest rendition before starting any work', async () => {
    const { adapter, calls } = make();
    await expect(adapter.submitJob(input(200))).rejects.toThrow(/below the lowest supported rendition/);
    expect(calls).toHaveLength(0);
  });

  it('encodes one ffmpeg run per fitting rendition with the AES-128 HLS contract args', async () => {
    const { adapter, calls } = make();
    const { jobName } = await adapter.submitJob(input(720));
    await adapter.whenDone(jobName);
    const ffmpegCalls = calls.filter((c) => c.binary === '/bin/ffmpeg');
    expect(ffmpegCalls.map((c) => c.args.at(-1))).toEqual(['hls_720p.m3u8', 'hls_480p.m3u8', 'hls_360p.m3u8']);
    const a = ffmpegCalls[0]!.args;
    expect(a).toContain('-hls_key_info_file');
    expect(a[a.indexOf('-hls_key_info_file') + 1]).toBe('key.info');
    expect(a[a.indexOf('-hls_segment_filename') + 1]).toBe('hls_720p%010d.ts');
    expect(a[a.indexOf('-vf') + 1]).toBe('scale=-2:720');
    expect(a[a.indexOf('-b:v') + 1]).toBe('3000000');
    expect(a).toEqual(expect.arrayContaining(['-hls_time', '6', '-hls_playlist_type', 'vod', '-c:v', 'libx264', '-g', '60', '-sc_threshold', '0']));
    // Every run works in the same temp dir, on the downloaded source.
    expect(new Set(calls.map((c) => c.cwd)).size).toBe(1);
    expect(a[a.indexOf('-i') + 1]).toBe('source.mp4');
  });

  it('uploads the master, variants and segments under the output prefix and never the key or source', async () => {
    const { adapter, storage } = make();
    const { jobName } = await adapter.submitJob(input(480));
    await adapter.whenDone(jobName);
    const names = storage.uploads.map((u) => u.path).sort();
    expect(names).toEqual([
      'videos/v1/hls/hls_360p.m3u8',
      'videos/v1/hls/hls_360p0000000000.ts',
      'videos/v1/hls/hls_360p0000000001.ts',
      'videos/v1/hls/hls_480p.m3u8',
      'videos/v1/hls/hls_480p0000000000.ts',
      'videos/v1/hls/hls_480p0000000001.ts',
      'videos/v1/hls/manifest.m3u8',
    ]);
    expect(storage.uploads.every((u) => u.bucket === 'out')).toBe(true);
    expect(storage.uploads.find((u) => u.path.endsWith('.m3u8'))!.contentType).toBe('application/vnd.apple.mpegurl');
    expect(storage.uploads.find((u) => u.path.endsWith('.ts'))!.contentType).toBe('video/mp2t');
  });

  it('writes a master manifest that the shared naming contract can parse', async () => {
    const { adapter, calls } = make();
    const { jobName } = await adapter.submitJob(input(480));
    await adapter.whenDone(jobName);
    expect(adapter.__lastMasterBody()).toBe(
      '#EXTM3U\n#EXT-X-VERSION:6\n' +
        '#EXT-X-STREAM-INF:BANDWIDTH=1500000,RESOLUTION=854x480\nhls_480p.m3u8\n' +
        '#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360\nhls_360p.m3u8\n',
    );
    expect(existsSync(calls[0]!.cwd)).toBe(false); // temp dir removed
  });

  it('delivers JOB_SUCCEEDED with the manifest path and the probed duration', async () => {
    const { adapter, sink } = make();
    const { jobName } = await adapter.submitJob(input());
    await adapter.whenDone(jobName);
    expect(sink).toHaveBeenCalledTimes(1);
    expect(sink).toHaveBeenCalledWith({
      type: 'JOB_SUCCEEDED',
      jobName,
      videoId: 'v1',
      manifestPath: 'videos/v1/hls/manifest.m3u8',
      durationSec: 12.5,
    });
  });

  it('delivers JOB_FAILED with the sliced reason and removes the temp dir when ffmpeg fails', async () => {
    const bits = fakeRunner({ fail: true });
    const { adapter, sink, calls } = make(bits);
    const { jobName } = await adapter.submitJob(input(360));
    await adapter.whenDone(jobName);
    expect(sink).toHaveBeenCalledWith({ type: 'JOB_FAILED', jobName, videoId: 'v1', reason: 'libx264 exploded' });
    expect(existsSync(calls[0]!.cwd)).toBe(false);
  });

  it('caps the failure reason at 500 chars', async () => {
    const long = 'x'.repeat(600);
    const storage = fakeStorage();
    (storage.downloadObject as ReturnType<typeof vi.fn>).mockRejectedValue(new Error(long));
    const sink = vi.fn(async () => ({ acted: true }));
    const adapter = new FfmpegTranscoderAdapter({ storage, runner: fakeRunner().runner, ffmpegPath: 'f', ffprobePath: 'p', retryDelaysMs: [] });
    adapter.setSink(sink);
    const { jobName } = await adapter.submitJob(input(360));
    await adapter.whenDone(jobName);
    expect((sink.mock.calls[0]![0] as { reason: string }).reason).toHaveLength(500);
  });
});

describe('FfmpegTranscoderAdapter.cancelJob', () => {
  it('kills the running encode and delivers no event', async () => {
    const bits = fakeRunner({ hang: true });
    const { adapter, sink } = make(bits);
    const { jobName } = await adapter.submitJob(input(360));
    await vi.waitFor(() => expect(bits.calls.some((c) => c.binary === '/bin/ffmpeg')).toBe(true));
    await adapter.cancelJob(jobName);
    await adapter.whenDone(jobName);
    expect(bits.killed).toBe(1);
    expect(sink).not.toHaveBeenCalled();
  });

  it('ignores unknown job names', async () => {
    const { adapter } = make();
    await expect(adapter.cancelJob('nope')).resolves.toBeUndefined();
  });
});

describe('FfmpegTranscoderAdapter delivery retries (finalize race)', () => {
  it('redelivers on JOB_NAME_MISMATCH / WRONG_STATE until the event is acted on', async () => {
    const sink = vi
      .fn<TranscodeEventSink>()
      .mockResolvedValueOnce({ acted: false, reason: 'JOB_NAME_MISMATCH' })
      .mockResolvedValueOnce({ acted: false, reason: 'WRONG_STATE' })
      .mockResolvedValueOnce({ acted: true });
    const { adapter } = make(fakeRunner(), sink, [0, 0, 0, 0]);
    const { jobName } = await adapter.submitJob(input(360));
    await adapter.whenDone(jobName);
    expect(sink).toHaveBeenCalledTimes(3);
  });

  it('retries a throwing sink the same way', async () => {
    const sink = vi
      .fn<TranscodeEventSink>()
      .mockRejectedValueOnce(new Error('firestore hiccup'))
      .mockResolvedValueOnce({ acted: true });
    const { adapter } = make(fakeRunner(), sink, [0, 0]);
    const { jobName } = await adapter.submitJob(input(360));
    await adapter.whenDone(jobName);
    expect(sink).toHaveBeenCalledTimes(2);
  });

  it('stops at once on VIDEO_NOT_FOUND and ALREADY_APPLIED', async () => {
    for (const reason of ['VIDEO_NOT_FOUND', 'ALREADY_APPLIED']) {
      const sink = vi.fn<TranscodeEventSink>().mockResolvedValue({ acted: false, reason });
      const { adapter } = make(fakeRunner(), sink, [0, 0, 0]);
      const { jobName } = await adapter.submitJob(input(360));
      await adapter.whenDone(jobName);
      expect(sink).toHaveBeenCalledTimes(1);
    }
  });

  it('gives up after the retry schedule is exhausted', async () => {
    const sink = vi.fn<TranscodeEventSink>().mockResolvedValue({ acted: false, reason: 'JOB_NAME_MISMATCH' });
    const { adapter } = make(fakeRunner(), sink, [0, 0]);
    const { jobName } = await adapter.submitJob(input(360));
    await adapter.whenDone(jobName);
    expect(sink).toHaveBeenCalledTimes(3); // first attempt + one per delay
  });

  it('runs the job without a sink but logs the undeliverable event', async () => {
    const storage = fakeStorage();
    const adapter = new FfmpegTranscoderAdapter({ storage, runner: fakeRunner().runner, ffmpegPath: 'f', ffprobePath: 'p', retryDelaysMs: [] });
    const { jobName } = await adapter.submitJob(input(360));
    await expect(adapter.whenDone(jobName)).resolves.toBeUndefined();
  });
});

describe('FfmpegTranscoderAdapter.parseEvent', () => {
  it('rejects: there is no push channel', async () => {
    const { adapter } = make();
    await expect(adapter.parseEvent({})).rejects.toThrow(/no push channel/);
  });
});
