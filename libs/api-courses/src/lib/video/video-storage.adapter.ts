import { execFile as nodeExecFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { Inject, Injectable } from '@nestjs/common';

import { FIREBASE_STORAGE, type FirebaseStorageHandle } from '@learnwren/api-firebase';
import type { ISODateString } from '@learnwren/shared-data-models';

import { hlsStreamInf, hlsVariantPlaylistName, MUX_KEY_PREFIX } from './hls-naming';
import { resolveBinary } from './transcoder/binaries';
import { VIDEO_CONFIG, type VideoConfig } from './video.config';

const promisifiedExecFile = promisify(nodeExecFile);

/**
 * Renditions the fake playback storage emits, mirroring the production ladder.
 * The variant playlist + segment NAMES are derived from `hls-naming.ts` (the
 * same seam the transcoder job builder and the playback rewriter use) so the
 * fake can never drift from the real GCP output shape — the drift that once
 * broke real playback while a hand-invented fake layout masked it.
 */
const FAKE_RENDITIONS: ReadonlyArray<{ name: string; streamInf: string }> = [
  { name: '1080p', streamInf: hlsStreamInf('1080p', 5_000_000) },
  { name: '720p', streamInf: hlsStreamInf('720p', 3_000_000) },
  { name: '480p', streamInf: hlsStreamInf('480p', 1_500_000) },
  { name: '360p', streamInf: hlsStreamInf('360p', 800_000) },
];

const ffprobeBinaryPath = resolveBinary('@ffprobe-installer/ffprobe', 'ffprobe');

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

/** GCS errors expose a numeric `code`; 404 is the canonical "object missing" signal. */
function isNotFound(err: unknown): boolean {
  return (err as { code?: number }).code === 404;
}

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
export class VideoStorageAdapter implements VideoStoragePort {
  // Stryker disable next-line ArrowFunction: default runner, overridden via __setRunner in tests
  private runner: FfprobeRunner = (binary, args) => promisifiedExecFile(binary, args);

  constructor(
    @Inject(FIREBASE_STORAGE) private readonly storage: FirebaseStorageHandle,
    @Inject(VIDEO_CONFIG) private readonly cfg: VideoConfig,
  ) {}

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
    // CORS origin on the GCS resumable upload session: scope to the
    // application's own origin so a leaked upload URI cannot be exercised
    // from a third-party domain via a browser. Falls back to the SPA's local
    // dev URL when the env var is unset (dev-only configuration).
    const origin = process.env['LEARNWREN_PUBLIC_URL'] ?? 'http://localhost:4200';
    const [uri] = await this.fileRef(input).createResumableUpload({
      metadata: {
        contentType: input.contentType,
        metadata: { videoId: input.videoId },
      },
      origin,
    });
    return {
      uri,
      expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString() as ISODateString,
    };
  }

  async headObject(input: { bucket: string; path: string }): Promise<ObjectMetadata | null> {
    try {
      const [meta] = await this.fileRef(input).getMetadata();
      // Stryker disable next-line ConditionalExpression: equivalent — for number inputs Number(n)===n, so forcing the string branch is observably identical
      const size = typeof meta.size === 'string' ? Number(meta.size) : (meta.size as number);
      return { size };
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }
  }

  async deleteObject(input: { bucket: string; path: string }): Promise<void> {
    try {
      await this.fileRef(input).delete();
    } catch (err) {
      if (isNotFound(err)) return;
      throw err;
    }
  }

  async deletePrefix(input: { bucket: string; prefix: string }): Promise<void> {
    try {
      await this.storage.bucket(input.bucket).deleteFiles({ prefix: input.prefix });
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
        await rm(dir, { recursive: true, force: true });
      }
    }
    const [signedUrl] = await this.fileRef(input).getSignedUrl({
      action: 'read',
      expires: Date.now() + 60_000,
      version: 'v4',
    });
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
    const [buf] = await this.fileRef(input).download();
    return buf.toString('utf-8');
  }

  async signObjectUrl(input: { bucket: string; path: string; ttlSec: number }): Promise<string> {
    if (this.cfg.playbackStorageImpl === 'fake') {
      return `gs-stub://${input.bucket}/${input.path}?ttl=${input.ttlSec}`;
    }
    const [url] = await this.fileRef(input).getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + input.ttlSec * 1000,
    });
    return url;
  }

  async downloadObject(input: { bucket: string; path: string; destination: string }): Promise<void> {
    await this.fileRef(input).download({ destination: input.destination });
  }

  async uploadFile(input: {
    localPath: string;
    bucket: string;
    path: string;
    contentType: string;
  }): Promise<void> {
    await this.storage.bucket(input.bucket).upload(input.localPath, {
      destination: input.path,
      contentType: input.contentType,
      resumable: false,
    });
  }

  openObjectReadStream(input: { bucket: string; path: string }): NodeJS.ReadableStream {
    return this.fileRef(input).createReadStream();
  }

  private fileRef(input: { bucket: string; path: string }) {
    return this.storage.bucket(input.bucket).file(input.path);
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
