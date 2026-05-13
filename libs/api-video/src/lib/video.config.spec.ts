import { describe, expect, it } from 'vitest';

import { readVideoConfigFromEnv } from './video.config';

describe('readVideoConfigFromEnv', () => {
  it('returns config with provided bucket and default threshold of 30', () => {
    const cfg = readVideoConfigFromEnv({ LEARNWREN_VIDEO_SOURCE_BUCKET: 'b' });
    expect(cfg).toEqual({ sourceBucket: 'b', stuckThresholdMinutes: 30 });
  });

  it('parses an override threshold', () => {
    const cfg = readVideoConfigFromEnv({
      LEARNWREN_VIDEO_SOURCE_BUCKET: 'b',
      LEARNWREN_VIDEO_STUCK_THRESHOLD_MINUTES: '5',
    });
    expect(cfg.stuckThresholdMinutes).toBe(5);
  });

  it('throws when bucket is missing', () => {
    expect(() => readVideoConfigFromEnv({})).toThrow(
      /LEARNWREN_VIDEO_SOURCE_BUCKET/,
    );
  });

  it('throws on a non-numeric threshold', () => {
    expect(() =>
      readVideoConfigFromEnv({
        LEARNWREN_VIDEO_SOURCE_BUCKET: 'b',
        LEARNWREN_VIDEO_STUCK_THRESHOLD_MINUTES: 'abc',
      }),
    ).toThrow(/positive number/);
  });

  it('throws on a non-positive threshold', () => {
    expect(() =>
      readVideoConfigFromEnv({
        LEARNWREN_VIDEO_SOURCE_BUCKET: 'b',
        LEARNWREN_VIDEO_STUCK_THRESHOLD_MINUTES: '0',
      }),
    ).toThrow(/positive number/);
  });
});
