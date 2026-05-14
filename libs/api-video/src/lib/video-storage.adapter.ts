import { execFile as nodeExecFile } from 'node:child_process';
import { promisify } from 'node:util';

import { Inject, Injectable } from '@nestjs/common';

import { FIREBASE_STORAGE, type FirebaseStorageHandle } from '@learnwren/api-firebase';

import { VIDEO_CONFIG, type VideoConfig } from './video.config';

const promisifiedExecFile = promisify(nodeExecFile);

let ffprobeBinaryPath: string;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ffprobeBinaryPath = require('@ffprobe-installer/ffprobe').path;
} catch {
  ffprobeBinaryPath = 'ffprobe';
}

export interface ResumableSession {
  uri: string;
  expiresAt: string;
}

export interface ObjectMetadata {
  size: number;
}

export interface SourceProbe {
  height: number;
  durationSec: number;
}

export type FfprobeRunner = (binary: string, args: string[]) => Promise<{ stdout: string }>;

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
}

@Injectable()
export class VideoStorageAdapter implements VideoStoragePort {
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
    const file = this.storage.bucket(input.bucket).file(input.path);
    const [uri] = await file.createResumableUpload({
      metadata: {
        contentType: input.contentType,
        metadata: { videoId: input.videoId },
      },
      origin: '*',
    });
    return {
      uri,
      expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
    };
  }

  async headObject(input: { bucket: string; path: string }): Promise<ObjectMetadata | null> {
    const file = this.storage.bucket(input.bucket).file(input.path);
    try {
      const [meta] = await file.getMetadata();
      const size = typeof meta.size === 'string' ? Number(meta.size) : (meta.size as number);
      return { size };
    } catch (err) {
      const code = (err as { code?: number }).code;
      if (code === 404) return null;
      throw err;
    }
  }

  async deleteObject(input: { bucket: string; path: string }): Promise<void> {
    const file = this.storage.bucket(input.bucket).file(input.path);
    try {
      await file.delete();
    } catch (err) {
      const code = (err as { code?: number }).code;
      if (code === 404) return;
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
    const file = this.storage.bucket(input.bucket).file(input.path);
    const [signedUrl] = await file.getSignedUrl({
      action: 'read',
      expires: Date.now() + 60_000,
      version: 'v4',
    });
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
      durationSec: Number(parsed.format?.duration ?? '0'),
    };
  }

  async readManifestObject(input: { bucket: string; path: string }): Promise<string> {
    if (this.cfg.playbackStorageImpl === 'fake') {
      return this.fakeReadManifest(input.path);
    }
    const file = this.storage.bucket(input.bucket).file(input.path);
    const [buf] = await file.download();
    return buf.toString('utf-8');
  }

  async signObjectUrl(input: { bucket: string; path: string; ttlSec: number }): Promise<string> {
    if (this.cfg.playbackStorageImpl === 'fake') {
      return `gs-stub://${input.bucket}/${input.path}?ttl=${input.ttlSec}`;
    }
    const file = this.storage.bucket(input.bucket).file(input.path);
    const [url] = await file.getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + input.ttlSec * 1000,
    });
    return url;
  }

  private fakeReadManifest(p: string): string {
    if (p.endsWith('/manifest.m3u8')) {
      return [
        '#EXTM3U',
        '#EXT-X-VERSION:6',
        '#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080',
        '1080p/playlist.m3u8',
        '#EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=1280x720',
        '720p/playlist.m3u8',
        '#EXT-X-STREAM-INF:BANDWIDTH=1500000,RESOLUTION=854x480',
        '480p/playlist.m3u8',
        '#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360',
        '360p/playlist.m3u8',
        '',
      ].join('\n');
    }
    if (p.endsWith('/playlist.m3u8')) {
      return [
        '#EXTM3U',
        '#EXT-X-VERSION:6',
        '#EXT-X-TARGETDURATION:6',
        '#EXT-X-KEY:METHOD=AES-128,URI="https://example.invalid/k",IV=0xABCDEF0123456789ABCDEF0123456789',
        '#EXTINF:6.000,',
        'segment_001.ts',
        '#EXTINF:6.000,',
        'segment_002.ts',
        '#EXT-X-ENDLIST',
        '',
      ].join('\n');
    }
    throw new Error(`fake storage: unknown manifest path ${p}`);
  }
}
