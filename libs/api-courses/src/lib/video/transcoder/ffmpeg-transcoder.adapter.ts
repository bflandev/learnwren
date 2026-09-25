import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';

import { Injectable, Logger } from '@nestjs/common';

import { hlsStreamInf, hlsVariantPlaylistName } from '../hls-naming';
import type { VideoStoragePort } from '../video-storage.adapter';
import { RENDITIONS } from './transcoder-job.builder';
import type {
  TranscoderEvent,
  TranscoderJobHandle,
  TranscoderJobInput,
  VideoTranscoder,
} from './transcoder.port';

/**
 * Self-hosted transcoder (US-09-04 Slice B): the same AES-128 HLS layout the
 * GCP job produces (see hls-naming.ts), encoded in-process with ffmpeg.
 *
 * Completion has no push channel, so the adapter delivers its own event to a
 * sink (VideoService.handleTranscoderEvent, wired by FfmpegEventBridge) and
 * mimics Pub/Sub redelivery when the video is not yet TRANSCODING — the job
 * can finish before finalizeUploadWithJob commits the job name.
 *
 * ponytail: renditions encode sequentially, one ffmpeg run each; an api
 * restart loses in-flight jobs (the video stays TRANSCODING). Upgrade paths:
 * one run with -filter_complex split; a boot-time reconcile of TRANSCODING
 * videos with `ffmpeg-` job names.
 */

export type FfmpegRunner = (
  binary: string,
  args: string[],
  opts: { cwd: string },
) => { done: Promise<{ stdout: string }>; kill: () => void };

export type TranscodeEventSink = (
  event: TranscoderEvent,
) => Promise<{ acted: boolean; reason?: string }>;

export interface FfmpegTranscoderAdapterOptions {
  storage: Pick<VideoStoragePort, 'downloadObject' | 'uploadFile'>;
  runner: FfmpegRunner;
  ffmpegPath: string;
  ffprobePath: string;
  /** Backoff between redelivery attempts; defaults to ~60 s total. */
  retryDelaysMs?: number[];
}

/** Redelivery schedule (ms): first attempt + one retry per entry ≈ 60 s. */
export const DEFAULT_RETRY_DELAYS_MS = [1000, 2000, 4000, 8000, 16000, 29000];

/** Outcomes that mean "the event will never apply"; everything else is retried. */
const TERMINAL_REASONS = new Set(['VIDEO_NOT_FOUND', 'ALREADY_APPLIED']);

const SEGMENT_DURATION_S = 6;
const FRAME_RATE = 30;
const KEY_FRAME_INTERVAL_S = 2;
const AUDIO_BITRATE = '128k';
const MAX_REASON_CHARS = 500;

const CONTENT_TYPES: Record<string, string> = {
  '.m3u8': 'application/vnd.apple.mpegurl',
  '.ts': 'video/mp2t',
};

interface JobRecord {
  cancelled: boolean;
  kill?: () => void;
  done: Promise<void>;
}

/** Real runner: spawn the binary, collect stdout, reject on non-zero exit. */
export const spawnRunner: FfmpegRunner = (binary, args, { cwd }) => {
  // Stryker disable next-line ArrayDeclaration: equivalent — an empty stdio array means pipes for all three, and no child reads stdin
  const child = spawn(binary, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (d: Buffer) => (stdout += d.toString()));
  child.stderr.on('data', (d: Buffer) => (stderr += d.toString()));
  const done = new Promise<{ stdout: string }>((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code, signal) => {
      if (code === 0) resolve({ stdout });
      else reject(new Error(`${binary} exited with ${signal ?? code}: ${stderr.trim().slice(-400)}`));
    });
  });
  return { done, kill: () => child.kill('SIGKILL') };
};

function parseGsUri(uri: string): { bucket: string; path: string } {
  // Stryker disable next-line Regex: equivalent — dropping the trailing anchor changes nothing, `.*` already runs to the end
  const m = /^gs:\/\/([^/]+)\/(.*)$/.exec(uri);
  if (!m) throw new Error(`not a gs:// URI: ${uri}`);
  return { bucket: m[1]!, path: m[2]! };
}

@Injectable()
export class FfmpegTranscoderAdapter implements VideoTranscoder {
  // Stryker disable next-line StringLiteral: Logger constructor-name string, log-only, no behavior
  private readonly logger = new Logger('FfmpegTranscoderAdapter');
  private readonly jobs = new Map<string, JobRecord>();
  private sink?: TranscodeEventSink;
  private lastMasterBody = '';
  private readonly retryDelaysMs: number[];

  constructor(private readonly opts: FfmpegTranscoderAdapterOptions) {
    this.retryDelaysMs = opts.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
  }

  setSink(sink: TranscodeEventSink): void {
    this.sink = sink;
  }

  async submitJob(input: TranscoderJobInput): Promise<TranscoderJobHandle> {
    const renditions = RENDITIONS.filter((r) => r.height <= input.sourceHeight);
    if (renditions.length === 0) {
      throw new Error(
        `sourceHeight ${input.sourceHeight}px is below the lowest supported rendition ` +
          `(${RENDITIONS[RENDITIONS.length - 1]!.height}px).`,
      );
    }
    const jobName = `ffmpeg-${input.videoId}-${Date.now()}-${this.jobs.size}`;
    // Stryker disable next-line ObjectLiteral: equivalent — `cancelled` is only read for truthiness and `done` is reassigned on the next line
    const record: JobRecord = { cancelled: false, done: Promise.resolve() };
    this.jobs.set(jobName, record);
    record.done = this.runJob(jobName, record, input, renditions);
    return { jobName };
  }

  async parseEvent(): Promise<TranscoderEvent> {
    throw new Error('ffmpeg transcoder has no push channel');
  }

  async cancelJob(jobName: string): Promise<void> {
    const rec = this.jobs.get(jobName);
    if (!rec) return;
    rec.cancelled = true;
    rec.kill?.();
  }

  /** Test/ops hook: settles when the background work for a job has finished. */
  whenDone(jobName: string): Promise<void> {
    return this.jobs.get(jobName)?.done ?? Promise.resolve();
  }

  /** Test hook — the last master playlist body written. */
  __lastMasterBody(): string {
    return this.lastMasterBody;
  }

  private async runJob(
    jobName: string,
    record: JobRecord,
    input: TranscoderJobInput,
    renditions: ReadonlyArray<(typeof RENDITIONS)[number]>,
  ): Promise<void> {
    const dir = await mkdtemp(join(tmpdir(), 'lw-ffmpeg-'));
    let event: TranscoderEvent;
    try {
      const source = parseGsUri(input.sourceUri);
      const sourceFile = `source${extname(source.path) || '.bin'}`;
      await this.opts.storage.downloadObject({ ...source, destination: join(dir, sourceFile) });
      const durationSec = await this.probeDuration(record, dir, sourceFile);
      await this.writeKeyFiles(dir, input.encryptionKey.bytes);
      for (const r of renditions) {
        if (record.cancelled) return;
        await this.encodeRendition(record, dir, sourceFile, r);
      }
      this.lastMasterBody = this.masterBody(renditions);
      await writeFile(join(dir, 'manifest.m3u8'), this.lastMasterBody);
      if (record.cancelled) return;
      await this.uploadOutput(dir, input.outputUriPrefix);
      const out = parseGsUri(input.outputUriPrefix);
      event = {
        type: 'JOB_SUCCEEDED',
        jobName,
        videoId: input.videoId,
        manifestPath: `${out.path}manifest.m3u8`,
        durationSec,
      };
    } catch (err) {
      if (record.cancelled) return;
      event = {
        type: 'JOB_FAILED',
        jobName,
        videoId: input.videoId,
        reason: (err as Error).message.slice(0, MAX_REASON_CHARS),
      };
    } finally {
      // Stryker disable next-line BooleanLiteral: equivalent — the directory always exists here, so `force` never changes the outcome
      await rm(dir, { recursive: true, force: true });
    }
    await this.deliver(event);
  }

  private async run(record: JobRecord, binary: string, args: string[], cwd: string): Promise<string> {
    const child = this.opts.runner(binary, args, { cwd });
    record.kill = child.kill;
    try {
      return (await child.done).stdout;
    } finally {
      record.kill = undefined;
    }
  }

  private async probeDuration(record: JobRecord, dir: string, sourceFile: string): Promise<number> {
    const stdout = await this.run(
      record,
      this.opts.ffprobePath,
      ['-v', 'error', '-print_format', 'json', '-show_format', sourceFile],
      dir,
    );
    const parsed = JSON.parse(stdout) as { format?: { duration?: string } };
    // Stryker disable next-line StringLiteral: equivalent — Number('') === Number('0') === 0
    return Number(parsed.format?.duration ?? '0');
  }

  private async writeKeyFiles(dir: string, key: Uint8Array): Promise<void> {
    const keyPath = join(dir, 'key.bin');
    await writeFile(keyPath, key);
    // Three lines: the URI ffmpeg writes into the playlist (the playback
    // rewriter replaces it with /api/playback/keys/:vid), the key file, the IV.
    const iv = randomBytes(16).toString('hex');
    await writeFile(join(dir, 'key.info'), `key.bin\n${keyPath}\n${iv}\n`);
  }

  private encodeRendition(
    record: JobRecord,
    dir: string,
    sourceFile: string,
    r: (typeof RENDITIONS)[number],
  ): Promise<string> {
    const gop = String(FRAME_RATE * KEY_FRAME_INTERVAL_S);
    const args = [
      '-y', '-hide_banner', '-loglevel', 'error',
      '-i', sourceFile,
      '-vf', `scale=-2:${r.height}`,
      '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p',
      '-b:v', String(r.bitrateBps), '-maxrate', String(r.bitrateBps), '-bufsize', String(r.bitrateBps * 2),
      '-r', String(FRAME_RATE), '-g', gop, '-keyint_min', gop, '-sc_threshold', '0',
      '-c:a', 'aac', '-b:a', AUDIO_BITRATE,
      '-f', 'hls', '-hls_time', String(SEGMENT_DURATION_S), '-hls_playlist_type', 'vod',
      '-hls_flags', 'independent_segments',
      '-hls_key_info_file', 'key.info',
      // Stryker disable next-line Regex: equivalent — the variant name contains `.m3u8` exactly once, at the end
      '-hls_segment_filename', `${hlsVariantPlaylistName(r.name).replace(/\.m3u8$/, '')}%010d.ts`,
      hlsVariantPlaylistName(r.name),
    ];
    return this.run(record, this.opts.ffmpegPath, args, dir);
  }

  private masterBody(renditions: ReadonlyArray<(typeof RENDITIONS)[number]>): string {
    return (
      '#EXTM3U\n#EXT-X-VERSION:6\n' +
      renditions.map((r) => `${hlsStreamInf(r.name, r.bitrateBps)}\n${hlsVariantPlaylistName(r.name)}\n`).join('')
    );
  }

  private async uploadOutput(dir: string, outputUriPrefix: string): Promise<void> {
    const out = parseGsUri(outputUriPrefix);
    for (const name of await readdir(dir)) {
      const contentType = CONTENT_TYPES[extname(name)];
      if (!contentType) continue; // source.*, key.bin, key.info never leave the box
      await this.opts.storage.uploadFile({
        localPath: join(dir, name),
        bucket: out.bucket,
        path: `${out.path}${name}`,
        contentType,
      });
    }
  }

  private async deliver(event: TranscoderEvent): Promise<void> {
    if (!this.sink) {
      this.logger.error(`No event sink; dropping ${event.type} for ${event.videoId}`);
      return;
    }
    for (let attempt = 0; ; attempt++) {
      try {
        const outcome = await this.sink(event);
        // Stryker disable next-line StringLiteral: equivalent — any fallback that is not a terminal reason behaves the same
        if (outcome.acted || TERMINAL_REASONS.has(outcome.reason ?? '')) return;
        this.logger.warn(`${event.type} for ${event.videoId} not applied (${outcome.reason}); redelivering`);
      } catch (err) {
        this.logger.warn(`${event.type} for ${event.videoId} sink threw: ${(err as Error).message}`);
      }
      const delay = this.retryDelaysMs[attempt];
      if (delay === undefined) {
        this.logger.error(`Giving up on ${event.type} for ${event.videoId}; video may stay TRANSCODING`);
        return;
      }
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}
