import type { ExecutionContext } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import type { Video, VideoId } from '@learnwren/shared-data-models';

import { currentVideoFactory } from './current-video.decorator';

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

function ctxFor(req: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

describe('currentVideoFactory (the @CurrentVideo param-decorator factory)', () => {
  it('returns req.video when EnrollmentOrOwnerGuard has attached it', () => {
    const out = currentVideoFactory(undefined, ctxFor({ video: VIDEO }));
    expect(out).toBe(VIDEO);
  });

  it('throws when req.video is missing (guard skipped)', () => {
    expect(() => currentVideoFactory(undefined, ctxFor({}))).toThrow(
      /@CurrentVideo\(\) used on a route without EnrollmentOrOwnerGuard\./,
    );
  });

  it('throws the exact diagnostic message verbatim', () => {
    // Pin the literal so StringLiteral mutants (replace -> "") are killed.
    try {
      currentVideoFactory(undefined, ctxFor({}));
      throw new Error('expected the factory to throw');
    } catch (err) {
      expect((err as Error).message).toBe(
        '@CurrentVideo() used on a route without EnrollmentOrOwnerGuard.',
      );
    }
  });

  it('ignores the (unused) data argument', () => {
    // Drives both branches of the `if (!req.video)` check + ensures _data is not consulted.
    const out = currentVideoFactory('arbitrary-data', ctxFor({ video: VIDEO }));
    expect(out).toBe(VIDEO);
  });
});
