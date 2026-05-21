import { describe, expect, it } from 'vitest';

import { readVideoConfigFromEnv } from './video.config';

describe('readVideoConfigFromEnv', () => {
  const baseEnv = (): NodeJS.ProcessEnv => ({
    LEARNWREN_VIDEO_SOURCE_BUCKET: 'b',
    LEARNWREN_VIDEO_OUTPUT_BUCKET: 'out',
    LEARNWREN_VIDEO_TRANSCODER: 'fake',
  });

  it('returns config with provided bucket and default threshold of 30', () => {
    const cfg = readVideoConfigFromEnv(baseEnv());
    expect(cfg.sourceBucket).toBe('b');
    expect(cfg.outputBucket).toBe('out');
    expect(cfg.stuckThresholdMinutes).toBe(30);
    expect(cfg.pollIntervalMs).toBe(5000);
    expect(cfg.transcoderImpl).toBe('fake');
  });

  it('parses an override threshold', () => {
    const env = baseEnv();
    env.LEARNWREN_VIDEO_STUCK_THRESHOLD_MINUTES = '5';
    const cfg = readVideoConfigFromEnv(env);
    expect(cfg.stuckThresholdMinutes).toBe(5);
  });

  it('throws when a bucket is missing in production', () => {
    expect(() => readVideoConfigFromEnv({ NODE_ENV: 'production' })).toThrow(
      /LEARNWREN_VIDEO_SOURCE_BUCKET/,
    );
  });

  it('defaults the video stack to fake mode outside production', () => {
    // With no env at all the api must still boot — `nx serve` and the e2e
    // suite run credential-free.
    const cfg = readVideoConfigFromEnv({});
    expect(cfg.sourceBucket).toBeTruthy();
    expect(cfg.outputBucket).toBeTruthy();
    expect(cfg.transcoderImpl).toBe('fake');
    expect(cfg.playbackStorageImpl).toBe('fake');
  });

  it('throws on a non-numeric threshold', () => {
    const env = baseEnv();
    env.LEARNWREN_VIDEO_STUCK_THRESHOLD_MINUTES = 'abc';
    expect(() => readVideoConfigFromEnv(env)).toThrow(/positive number/);
  });

  it('throws on a non-positive threshold', () => {
    const env = baseEnv();
    env.LEARNWREN_VIDEO_STUCK_THRESHOLD_MINUTES = '0';
    expect(() => readVideoConfigFromEnv(env)).toThrow(/positive number/);
  });
});

describe('readVideoConfigFromEnv — slice B fields', () => {
  const baseEnv = (): NodeJS.ProcessEnv => ({
    LEARNWREN_VIDEO_SOURCE_BUCKET: 'src',
    LEARNWREN_VIDEO_STUCK_THRESHOLD_MINUTES: '30',
    LEARNWREN_VIDEO_OUTPUT_BUCKET: 'out',
    LEARNWREN_VIDEO_TRANSCODER: 'fake',
    LEARNWREN_WEB_VIDEO_POLL_INTERVAL_MS: '5000',
  });

  it('parses fake-transcoder config with output bucket', () => {
    const cfg = readVideoConfigFromEnv(baseEnv());
    expect(cfg.outputBucket).toBe('out');
    expect(cfg.transcoderImpl).toBe('fake');
  });

  it('requires LEARNWREN_VIDEO_OUTPUT_BUCKET in production', () => {
    const env = baseEnv();
    env.NODE_ENV = 'production';
    delete env.LEARNWREN_VIDEO_OUTPUT_BUCKET;
    expect(() => readVideoConfigFromEnv(env)).toThrow(/OUTPUT_BUCKET/);
  });

  it('requires gcp-specific vars when transcoderImpl=gcp', () => {
    const env = baseEnv();
    env.LEARNWREN_VIDEO_TRANSCODER = 'gcp';
    expect(() => readVideoConfigFromEnv(env)).toThrow(/LEARNWREN_GCP_PROJECT_ID/);
  });

  it('accepts a complete gcp config', () => {
    const env = baseEnv();
    env.LEARNWREN_VIDEO_TRANSCODER = 'gcp';
    env.LEARNWREN_GCP_PROJECT_ID = 'p1';
    env.LEARNWREN_TRANSCODER_LOCATION = 'us-central1';
    env.LEARNWREN_TRANSCODER_TOPIC = 'projects/p1/topics/t';
    env.LEARNWREN_TRANSCODER_WEBHOOK_AUDIENCE = 'https://x/api/internal/transcoder-events';
    env.LEARNWREN_TRANSCODER_INVOKER_SA_EMAIL = 'inv@p1.iam.gserviceaccount.com';
    const cfg = readVideoConfigFromEnv(env);
    expect(cfg.transcoderImpl).toBe('gcp');
    expect(cfg.gcpProjectId).toBe('p1');
    expect(cfg.transcoderLocation).toBe('us-central1');
    expect(cfg.transcoderTopic).toBe('projects/p1/topics/t');
    expect(cfg.webhookAudience).toMatch(/transcoder-events$/);
    expect(cfg.invokerSaEmail).toMatch(/iam\.gserviceaccount\.com$/);
  });

  it('rejects transcoderImpl=fake when NODE_ENV=production', () => {
    const env = baseEnv();
    env.NODE_ENV = 'production';
    expect(() => readVideoConfigFromEnv(env)).toThrow(/production/i);
  });

  it('rejects non-finite poll interval', () => {
    const env = baseEnv();
    env.LEARNWREN_WEB_VIDEO_POLL_INTERVAL_MS = 'banana';
    expect(() => readVideoConfigFromEnv(env)).toThrow(/poll/i);
  });
});

describe('readVideoConfigFromEnv — slice C fields', () => {
  const baseEnv = (): NodeJS.ProcessEnv => ({
    LEARNWREN_VIDEO_SOURCE_BUCKET: 'src',
    LEARNWREN_VIDEO_STUCK_THRESHOLD_MINUTES: '30',
    LEARNWREN_VIDEO_OUTPUT_BUCKET: 'out',
    LEARNWREN_VIDEO_TRANSCODER: 'fake',
    LEARNWREN_WEB_VIDEO_POLL_INTERVAL_MS: '5000',
  });

  it('defaults playbackSignedUrlTtlSec to 14400 (4 h) when unset', () => {
    const cfg = readVideoConfigFromEnv(baseEnv());
    expect(cfg.playbackSignedUrlTtlSec).toBe(14400);
  });

  it('parses LEARNWREN_VIDEO_PLAYBACK_SIGNED_URL_TTL_SEC when set', () => {
    const env = baseEnv();
    env.LEARNWREN_VIDEO_PLAYBACK_SIGNED_URL_TTL_SEC = '900';
    const cfg = readVideoConfigFromEnv(env);
    expect(cfg.playbackSignedUrlTtlSec).toBe(900);
  });

  it('rejects non-finite TTL', () => {
    const env = baseEnv();
    env.LEARNWREN_VIDEO_PLAYBACK_SIGNED_URL_TTL_SEC = 'banana';
    expect(() => readVideoConfigFromEnv(env)).toThrow(/LEARNWREN_VIDEO_PLAYBACK_SIGNED_URL_TTL_SEC/);
  });

  it('rejects non-positive TTL', () => {
    const env = baseEnv();
    env.LEARNWREN_VIDEO_PLAYBACK_SIGNED_URL_TTL_SEC = '0';
    expect(() => readVideoConfigFromEnv(env)).toThrow(/LEARNWREN_VIDEO_PLAYBACK_SIGNED_URL_TTL_SEC/);
  });
});

describe('readVideoConfigFromEnv — playback storage flag', () => {
  const baseEnv = (): NodeJS.ProcessEnv => ({
    LEARNWREN_VIDEO_SOURCE_BUCKET: 'src',
    LEARNWREN_VIDEO_STUCK_THRESHOLD_MINUTES: '30',
    LEARNWREN_VIDEO_OUTPUT_BUCKET: 'out',
    LEARNWREN_VIDEO_TRANSCODER: 'fake',
    LEARNWREN_WEB_VIDEO_POLL_INTERVAL_MS: '5000',
  });

  it('defaults playbackStorageImpl to "fake" outside production', () => {
    expect(readVideoConfigFromEnv(baseEnv()).playbackStorageImpl).toBe('fake');
  });

  it('defaults playbackStorageImpl to "real" in production', () => {
    const env: NodeJS.ProcessEnv = {
      NODE_ENV: 'production',
      LEARNWREN_VIDEO_SOURCE_BUCKET: 'src',
      LEARNWREN_VIDEO_OUTPUT_BUCKET: 'out',
      LEARNWREN_VIDEO_TRANSCODER: 'gcp',
      LEARNWREN_GCP_PROJECT_ID: 'p1',
      LEARNWREN_TRANSCODER_LOCATION: 'us-central1',
      LEARNWREN_TRANSCODER_TOPIC: 'projects/p1/topics/t',
      LEARNWREN_TRANSCODER_WEBHOOK_AUDIENCE: 'https://x/api/internal/transcoder-events',
      LEARNWREN_TRANSCODER_INVOKER_SA_EMAIL: 'inv@p1.iam.gserviceaccount.com',
    };
    expect(readVideoConfigFromEnv(env).playbackStorageImpl).toBe('real');
  });

  it('honors LEARNWREN_VIDEO_STORAGE_PLAYBACK_FAKE=true', () => {
    const env = baseEnv();
    env.LEARNWREN_VIDEO_STORAGE_PLAYBACK_FAKE = 'true';
    expect(readVideoConfigFromEnv(env).playbackStorageImpl).toBe('fake');
  });

  it('treats any non-"true" value as "real"', () => {
    const env = baseEnv();
    env.LEARNWREN_VIDEO_STORAGE_PLAYBACK_FAKE = 'yes';
    expect(readVideoConfigFromEnv(env).playbackStorageImpl).toBe('real');
  });

  it('rejects fake playback storage in production', () => {
    const env = baseEnv();
    env.LEARNWREN_VIDEO_STORAGE_PLAYBACK_FAKE = 'true';
    env.NODE_ENV = 'production';
    expect(() => readVideoConfigFromEnv(env)).toThrow(/production/i);
  });
});
