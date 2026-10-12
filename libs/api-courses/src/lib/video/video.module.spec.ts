import { MODULE_METADATA } from '@nestjs/common/constants';
import { OAuth2Client } from 'google-auth-library';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CoursesModule } from '../courses.module';
import { FakeTranscoderAdapter } from './transcoder/fake-transcoder.adapter';
import { FfmpegTranscoderAdapter } from './transcoder/ffmpeg-transcoder.adapter';
import { GcpTranscoderAdapter } from './transcoder/gcp-transcoder.adapter';
import { VIDEO_TRANSCODER } from './transcoder/transcoder.port';
import { VIDEO_CONFIG, type VideoConfig } from './video.config';
import { VideoModule } from './video.module';
import type { VideoStorageAdapter } from './video-storage.adapter';
import { ID_TOKEN_VERIFIER } from './webhook/pubsub-push.guard';

interface FactoryProvider {
  provide: unknown;
  useFactory: (...args: unknown[]) => unknown;
}

function factoryFor(token: unknown): FactoryProvider['useFactory'] {
  const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, VideoModule) as FactoryProvider[];
  const found = providers.find((p) => p.provide === token);
  if (!found) throw new Error(`no provider for ${String(token)}`);
  return found.useFactory;
}

const baseCfg: VideoConfig = {
  sourceBucket: 'src',
  outputBucket: 'out',
  stuckThresholdMinutes: 30,
  pollIntervalMs: 5000,
  transcoderImpl: 'fake',
};
const storage = {} as VideoStorageAdapter;

describe('VideoModule providers', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it('builds VIDEO_CONFIG from process.env', () => {
    process.env['LEARNWREN_VIDEO_SOURCE_BUCKET'] = 'src-from-env';
    expect((factoryFor(VIDEO_CONFIG)() as VideoConfig).sourceBucket).toBe('src-from-env');
  });

  it("wires the fake transcoder for transcoderImpl 'fake'", () => {
    expect(factoryFor(VIDEO_TRANSCODER)(baseCfg, storage)).toBeInstanceOf(FakeTranscoderAdapter);
  });

  it("wires the ffmpeg transcoder over the video storage for transcoderImpl 'ffmpeg'", () => {
    const t = factoryFor(VIDEO_TRANSCODER)({ ...baseCfg, transcoderImpl: 'ffmpeg' }, storage);
    expect(t).toBeInstanceOf(FfmpegTranscoderAdapter);
    const opts = (t as unknown as { opts: { storage: unknown; ffmpegPath: string; ffprobePath: string } }).opts;
    expect(opts.storage).toBe(storage);
    expect(opts.ffmpegPath).toMatch(/ffmpeg/);
    expect(opts.ffprobePath).toMatch(/ffprobe/);
  });

  it('wires the GCP transcoder with the configured project and location otherwise', () => {
    const t = factoryFor(VIDEO_TRANSCODER)(
      { ...baseCfg, transcoderImpl: 'gcp', gcpProjectId: 'proj-1', transcoderLocation: 'us-central1' } as VideoConfig,
      storage,
    );
    expect(t).toBeInstanceOf(GcpTranscoderAdapter);
    expect((t as unknown as { opts: { projectId: string; location: string } }).opts).toMatchObject({
      projectId: 'proj-1',
      location: 'us-central1',
    });
  });

  it('provides an OAuth2Client as the Pub/Sub push ID-token verifier', () => {
    expect(factoryFor(ID_TOKEN_VERIFIER)()).toBeInstanceOf(OAuth2Client);
  });
});

describe('VideoModule fake-transcoder webhook gate (evaluated at import)', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  async function loadWith(env: Record<string, string | undefined>) {
    vi.resetModules();
    process.env = { ...saved };
    for (const [k, v] of Object.entries(env)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    const mod = await import('./video.module');
    const { FakeTranscoderController } = await import('./webhook/fake-transcoder.controller');
    const controllers = Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, mod.VideoModule) as unknown[];
    return controllers.includes(FakeTranscoderController);
  }

  it('mounts the fake webhook outside production when the transcoder is fake', async () => {
    expect(await loadWith({ NODE_ENV: 'test', LEARNWREN_VIDEO_TRANSCODER: 'fake' })).toBe(true);
  });

  it('does not mount it when no transcoder is configured', async () => {
    expect(await loadWith({ NODE_ENV: 'test', LEARNWREN_VIDEO_TRANSCODER: undefined })).toBe(false);
  });

  it('does not mount it in production with a real transcoder', async () => {
    expect(await loadWith({ NODE_ENV: 'production', LEARNWREN_VIDEO_TRANSCODER: 'gcp' })).toBe(false);
  });

  it('refuses to load when the fake transcoder is configured in production', async () => {
    await expect(loadWith({ NODE_ENV: 'production', LEARNWREN_VIDEO_TRANSCODER: 'fake' })).rejects.toThrow(
      'Refusing to start: LEARNWREN_VIDEO_TRANSCODER=fake is incompatible with NODE_ENV=production',
    );
  });
});

describe('VideoModule imports', () => {
  it('reaches CoursesModule through forwardRef (the module cycle)', () => {
    const refs = (Reflect.getMetadata(MODULE_METADATA.IMPORTS, VideoModule) as Array<{ forwardRef?: () => unknown }>)
      .filter((i) => typeof i.forwardRef === 'function')
      .map((i) => i.forwardRef!());
    expect(refs).toEqual([CoursesModule]);
  });
});
