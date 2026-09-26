import { execFile as nodeExecFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';

import { OBJECT_STORAGE, type ObjectStorage } from '@learnwren/api-object-storage';
import type { ISODateString } from '@learnwren/shared-data-models';

import { hlsStreamInf, hlsVariantPlaylistName, MUX_KEY_PREFIX } from './hls-naming';
import { resolveBinary } from './transcoder/binaries';
import { RENDITIONS } from './transcoder/transcoder-job.builder';
import { VideoUploadSessions } from './upload/video-upload-sessions';
import { VIDEO_CONFIG, type VideoConfig } from './video.config';

const promisifiedExecFile = promisify(nodeExecFile);

/**
 * Renditions the fake playback storage emits, mirroring the production ladder.
 * The variant playlist + segment NAMES are derived from `hls-naming.ts` (the
 * same seam the transcoder job builder and the playback rewriter use) so the
 * fake can never drift from the real GCP output shape — the drift that once
 * broke real playback while a hand-invented fake layout masked it.
 */
const FAKE_RENDITIONS: ReadonlyArray<{ name: string; streamInf: string }> = RENDITIONS.map((r) => ({
  name: r.name,
  streamInf: hlsStreamInf(r.name, r.bitrateBps),
}));

const ffprobeBinaryPath = resolveBinary(
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  () => (require('@ffprobe-installer/ffprobe') as { path: string }).path,
  // Stryker disable next-line StringLiteral: unreachable fallback — the installer package resolves in every test/runtime environment
  'ffprobe',
);

export interface ResumableSession {
  uri: string;
  expiresAt: ISODateString;
}

export interface ObjectMetadata {
  size: number;
}

export interface SourceProbe {
  height: number;
  durationSec: number;
}

export type FfprobeRunner = (binary: string, args: string[]) => Promise<{ stdout: string }>;

/** Route the browser PUTs chunks to when the api proxies video uploads (S3 mode). */
export const VIDEO_UPLOAD_PROXY_PATH = '/api/internal/uploads/videos';

export interface VideoStoragePort {
  createResumableSession(input: {
    bucket: string;
    path: string;
    contentType: string;
    videoId: string;
  }): Promise<ResumableSession>;
  headObject(input: { bucket: string; path: string }): Promise<ObjectMetadata | null>;
  deleteObject(input: { bucket: string; path: string }): Promise<void>;
  deletePrefix(input: { bucket: string; prefix: string }): Promise<void>;
  probeSource(input: { bucket: string; path: string }): Promise<SourceProbe>;
  readManifestObject(input: { bucket: string; path: string }): Promise<string>;
  signObjectUrl(input: { bucket: string; path: string; ttlSec: number }): Promise<string>;
  downloadObject(input: { bucket: string; path: string; destination: string }): Promise<void>;
  uploadFile(input: { localPath: string; bucket: string; path: string; contentType: string }): Promise<void>;
  openObjectReadStream(input: { bucket: string; path: string }): NodeJS.ReadableStream;
}

@Injectable()
export class VideoStorageAdapter implements VideoStoragePort, OnModuleInit {
  // Stryker disable next-line ArrowFunction: default runner, overridden via __setRunner in tests
  private runner: FfprobeRunner = (binary, args) => promisifiedExecFile(binary, args);

  constructor(
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    @Inject(VIDEO_CONFIG) private readonly cfg: VideoConfig,
    private readonly sessions: VideoUploadSessions,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.storage.ensureBucket(this.cfg.sourceBucket);
    await this.storage.ensureBucket(this.cfg.outputBucket);
  }

  /** Test hook — never called in production code paths. */
  __setRunner(runner: FfprobeRunner): void {
    this.runner = runner;
  }

  async createResumableSession(input: {
    bucket: string;
    path: string;
    contentType: string;
    videoId: string;
  }): Promise<ResumableSession> {
    const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString() as ISODateString;
    if (this.storage.kind === 's3') {
      // The store is not exposed to browsers: the api carries the chunks
      // (VideoUploadProxyController) and needs to know the target up front.
      this.sessions.open(input.videoId, {
        bucket: input.bucket,
        path: input.path,
        contentType: input.contentType,
      });
      return { uri: `${VIDEO_UPLOAD_PROXY_PATH}/${input.videoId}`, expiresAt };
    }
    // CORS origin on the GCS resumable upload session: scope to the
    // application's own origin so a leaked upload URI cannot be exercised
    // from a third-party domain via a browser. Falls back to the SPA's local
    // dev URL when the env var is unset (dev-only configuration).
    const origin = process.env['LEARNWREN_PUBLIC_URL'] ?? 'http://localhost:4200';
    const uri = await this.storage.createResumableUpload({
      bucket: input.bucket,
      path: input.path,
      contentType: input.contentType,
      metadata: { videoId: input.videoId },
      origin,
    });
    return { uri, expiresAt };
  }

  headObject(input: { bucket: string; path: string }): Promise<ObjectMetadata | null> {
    return this.storage.headObject(input);
  }

  deleteObject(input: { bucket: string; path: string }): Promise<void> {
    return this.storage.deleteObject(input);
  }

  async deletePrefix(input: { bucket: string; prefix: string }): Promise<void> {
    try {
      await this.storage.deletePrefix(input);
    } catch {
      // best-effort; caller logs
    }
  }

  async probeSource(input: { bucket: string; path: string }): Promise<SourceProbe> {
    // Credential-free seam: v4 signed URLs require Application Default
    // Credentials, which don't exist in the emulator. Return a static probe
    // (the fake transcoder also doesn't care about real dimensions). Match
    // the playback-storage fake pattern in signObjectUrl / readManifestObject.
    if (this.cfg.sourceProbeImpl === 'fake') {
      return { height: 240, durationSec: 1 };
    }
    if (this.cfg.sourceProbeImpl === 'local') {
      // Self-hosted: no signing credentials, so probe a downloaded copy.
      // ponytail: the ffmpeg transcoder downloads the source again for
      // encoding; one extra download per upload is accepted over sharing a
      // temp file across two adapters.
      const dir = await mkdtemp(join(tmpdir(), 'lw-probe-'));
      const destination = join(dir, 'source');
      try {
        await this.downloadObject({ ...input, destination });
        return await this.runFfprobe(destination);
      } finally {
        // Stryker disable next-line BooleanLiteral: equivalent — mkdtemp guarantees the directory exists
        await rm(dir, { recursive: true, force: true });
      }
    }
    const signedUrl = await this.storage.signReadUrl({ ...input, ttlSec: 60 });
    return this.runFfprobe(signedUrl);
  }

  /** Run ffprobe against a signed URL and parse the height + duration. */
  private async runFfprobe(signedUrl: string): Promise<SourceProbe> {
    const { stdout } = await this.runner(ffprobeBinaryPath, [
      '-v', 'error',
      '-print_format', 'json',
      '-show_streams',
      '-show_format',
      signedUrl,
    ]);
    const parsed = JSON.parse(stdout) as {
      streams?: { codec_type?: string; height?: number }[];
      format?: { duration?: string };
    };
    const videoStream = parsed.streams?.find((s) => s.codec_type === 'video');
    if (!videoStream || typeof videoStream.height !== 'number') {
      throw new Error('ffprobe found no video stream in source.');
    }
    return {
      height: videoStream.height,
      // Stryker disable next-line StringLiteral: equivalent — Number('') === Number('0') === 0, so the fallback literal is unobservable
      durationSec: Number(parsed.format?.duration ?? '0'),
    };
  }

  async readManifestObject(input: { bucket: string; path: string }): Promise<string> {
    if (this.cfg.playbackStorageImpl === 'fake') {
      return this.fakeReadManifest(input.path);
    }
    const buf = await this.storage.getObject(input);
    return buf.toString('utf-8');
  }

  async signObjectUrl(input: { bucket: string; path: string; ttlSec: number }): Promise<string> {
    if (this.cfg.playbackStorageImpl === 'fake') {
      return `gs-stub://${input.bucket}/${input.path}?ttl=${input.ttlSec}`;
    }
    return this.storage.signReadUrl(input);
  }

  downloadObject(input: { bucket: string; path: string; destination: string }): Promise<void> {
    return this.storage.downloadToFile(input);
  }

  uploadFile(input: { localPath: string; bucket: string; path: string; contentType: string }): Promise<void> {
    return this.storage.putFile(input);
  }

  openObjectReadStream(input: { bucket: string; path: string }): NodeJS.ReadableStream {
    return this.storage.openReadStream(input);
  }

  // Mirror the REAL GCP Transcoder HLS layout: a master `manifest.m3u8` whose
  // variant URIs are flat `hls_<rendition>.m3u8` filenames, and each variant
  // playlist whose segment URIs are flat `hls_<rendition>NNNNNNNNNN.ts`
  // filenames in the same directory. (This previously invented a fictional
  // `<rendition>/playlist.m3u8` subdirectory layout, which masked the
  // playback-layer naming bug from every test and from local dev.)
  private fakeReadManifest(p: string): string {
    const base = p.slice(p.lastIndexOf('/') + 1);
    if (base === 'manifest.m3u8') {
      return [
        '#EXTM3U',
        '#EXT-X-VERSION:6',
        ...FAKE_RENDITIONS.flatMap((r) => [r.streamInf, hlsVariantPlaylistName(r.name)]),
        '',
      ].join('\n');
    }
    if (base.startsWith(MUX_KEY_PREFIX) && base.endsWith('.m3u8')) {
      const muxKey = base.slice(0, -'.m3u8'.length); // e.g. 'hls_720p'
      return [
        '#EXTM3U',
        '#EXT-X-VERSION:6',
        '#EXT-X-TARGETDURATION:6',
        '#EXT-X-KEY:METHOD=AES-128,URI="https://example.invalid/k",IV=0xABCDEF0123456789ABCDEF0123456789',
        '#EXTINF:6.000,',
        `${muxKey}0000000000.ts`,
        '#EXTINF:6.000,',
        `${muxKey}0000000001.ts`,
        '#EXT-X-ENDLIST',
        '',
      ].join('\n');
    }
    throw new Error(`fake storage: unknown manifest path ${p}`);
  }
}
