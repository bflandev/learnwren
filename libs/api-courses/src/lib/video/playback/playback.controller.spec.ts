import { Test } from '@nestjs/testing';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { FirebaseSessionGuard } from '@learnwren/api-auth';
import { FIREBASE_AUTH, FIRESTORE } from '@learnwren/api-firebase';
import type { Video, VideoId } from '@learnwren/shared-data-models';

import { CaptionsService } from '../captions/captions.service';
import { CaptionsNotFoundException } from '../errors/video.exception';
import { EnrollmentOrOwnerGuard } from './enrollment-or-owner.guard';
import { KeyService } from './key.service';
import { ManifestService } from './manifest.service';
import { PlaybackController } from './playback.controller';

const VIDEO: Video = {
  id: 'v1' as VideoId,
  ownerInstructorId: 'u1' as Video['ownerInstructorId'],
  courseId: 'c1' as Video['courseId'],
  lessonId: 'l1' as Video['lessonId'],
  state: 'READY',
  source: { bucket: 'src', path: 'p' },
  output: { bucket: 'out', manifestPath: 'videos/v1/hls/manifest.m3u8', durationSec: 60 },
  keyId: 'k1' as Video['keyId'],
  createdAt: 'now' as Video['createdAt'],
  updatedAt: 'now' as Video['updatedAt'],
};

function makeRes() {
  const headers: Record<string, string> = {};
  const res = {
    setHeader: vi.fn((k: string, v: string) => {
      headers[k.toLowerCase()] = v;
    }),
    send: vi.fn(),
    end: vi.fn(),
    headers,
  };
  return res;
}

async function buildController(
  manifestSvc: Partial<ManifestService>,
  keySvc: Partial<KeyService>,
  captionsSvc: Partial<CaptionsService> = {},
): Promise<PlaybackController> {
  const mod = await Test.createTestingModule({
    controllers: [PlaybackController],
    providers: [
      { provide: ManifestService, useValue: manifestSvc },
      { provide: KeyService, useValue: keySvc },
      { provide: CaptionsService, useValue: captionsSvc },
      { provide: FIRESTORE, useValue: {} },
      { provide: FIREBASE_AUTH, useValue: {} },
    ],
  })
    .overrideGuard(FirebaseSessionGuard)
    .useValue({ canActivate: () => true })
    .overrideGuard(EnrollmentOrOwnerGuard)
    .useValue({ canActivate: () => true })
    .compile();
  return mod.get(PlaybackController);
}

describe('PlaybackController.master', () => {
  let ctrl: PlaybackController;
  let ms: { fetchMaster: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    ms = { fetchMaster: vi.fn().mockResolvedValue('#EXTM3U\nbody') };
    ctrl = await buildController(ms as unknown as ManifestService, {} as KeyService);
  });

  it('returns the rewritten master with HLS content-type and no-store', async () => {
    const res = makeRes();
    await ctrl.master(VIDEO, res as unknown as import('express').Response);
    expect(ms.fetchMaster).toHaveBeenCalledWith(VIDEO);
    expect(res.headers['content-type']).toMatch(/application\/vnd\.apple\.mpegurl/);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.send).toHaveBeenCalledWith('#EXTM3U\nbody');
  });
});

describe('PlaybackController.rendition', () => {
  it('returns 404 RENDITION_NOT_FOUND for an unknown rendition (allow-list miss)', async () => {
    const ms = { fetchRendition: vi.fn() };
    const ctrl = await buildController(ms as unknown as ManifestService, {} as KeyService);
    await expect(
      ctrl.rendition(VIDEO, 'xyz', makeRes() as unknown as import('express').Response),
    ).rejects.toMatchObject({ code: 'RENDITION_NOT_FOUND' });
    expect(ms.fetchRendition).not.toHaveBeenCalled();
  });

  it('returns 200 with rewritten rendition for an allowed rendition (720p)', async () => {
    const ms = { fetchRendition: vi.fn().mockResolvedValue('#EXTM3U\n720p body') };
    const ctrl = await buildController(ms as unknown as ManifestService, {} as KeyService);
    const res = makeRes();
    await ctrl.rendition(VIDEO, '720p', res as unknown as import('express').Response);
    expect(ms.fetchRendition).toHaveBeenCalledWith(VIDEO, '720p');
    expect(res.headers['content-type']).toMatch(/application\/vnd\.apple\.mpegurl/);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.send).toHaveBeenCalledWith('#EXTM3U\n720p body');
  });

  it('accepts each of the four allow-list renditions', async () => {
    const ms = { fetchRendition: vi.fn().mockResolvedValue('#EXTM3U') };
    const ctrl = await buildController(ms as unknown as ManifestService, {} as KeyService);
    for (const r of ['1080p', '720p', '480p', '360p']) {
      const res = makeRes();
      await ctrl.rendition(VIDEO, r, res as unknown as import('express').Response);
    }
    expect(ms.fetchRendition).toHaveBeenCalledTimes(4);
  });
});

describe('PlaybackController.key', () => {
  it('returns 16-byte octet-stream with Content-Length: 16 and no-store', async () => {
    const buf = Buffer.from(Uint8Array.from({ length: 16 }, (_, i) => i));
    const ks = { fetch: vi.fn().mockResolvedValue(buf) };
    const ctrl = await buildController({} as ManifestService, ks as unknown as KeyService);
    const res = makeRes();
    await ctrl.key(VIDEO, res as unknown as import('express').Response);
    expect(ks.fetch).toHaveBeenCalledWith(VIDEO);
    expect(res.headers['content-type']).toBe('application/octet-stream');
    expect(res.headers['content-length']).toBe('16');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.end).toHaveBeenCalledWith(buf);
  });
});

describe('PlaybackController.captions', () => {
  it('streams text/vtt with the stored content', async () => {
    const captionsSvc = { getForDelivery: vi.fn().mockResolvedValue({ content: 'WEBVTT\nhi' }) };
    const ctrl = await buildController(
      {} as ManifestService,
      {} as KeyService,
      captionsSvc as unknown as CaptionsService,
    );
    const res = makeRes();
    await ctrl.captions(VIDEO, res as unknown as import('express').Response);
    expect(captionsSvc.getForDelivery).toHaveBeenCalledWith(VIDEO.id);
    expect(res.headers['content-type']).toBe('text/vtt; charset=utf-8');
    expect(res.send).toHaveBeenCalledWith('WEBVTT\nhi');
  });

  it('throws CaptionsNotFoundException when none exist', async () => {
    const captionsSvc = { getForDelivery: vi.fn().mockResolvedValue(null) };
    const ctrl = await buildController(
      {} as ManifestService,
      {} as KeyService,
      captionsSvc as unknown as CaptionsService,
    );
    await expect(
      ctrl.captions(VIDEO, makeRes() as unknown as import('express').Response),
    ).rejects.toBeInstanceOf(CaptionsNotFoundException);
  });
});
