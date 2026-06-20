import { describe, expect, it } from 'vitest';

import type { VideoId, VideoKeyId } from '@learnwren/shared-data-models';

import { FakeTranscoderAdapter } from './fake-transcoder.adapter';

const baseInput = () => ({
  videoId: 'v1' as VideoId,
  sourceUri: 'gs://src/videos/v1/source.mp4',
  outputUriPrefix: 'gs://out/videos/v1/hls/',
  encryptionKey: { id: 'k1' as VideoKeyId, bytes: new Uint8Array(16) },
  sourceHeight: 1080,
  topic: 'projects/p/topics/t',
});

describe('FakeTranscoderAdapter.submitJob', () => {
  it('returns a synthetic job name derived from videoId', async () => {
    const adapter = new FakeTranscoderAdapter();
    const { jobName } = await adapter.submitJob(baseInput());
    expect(jobName).toMatch(/^fake-job-v1-/);
  });

  it('records the job for later lookup', async () => {
    const adapter = new FakeTranscoderAdapter();
    const { jobName } = await adapter.submitJob(baseInput());
    expect(adapter.peekJob(jobName)).toBeDefined();
  });

  it('stores the submitted input and an initial cancelled=false flag', async () => {
    // Defends the `{ input, cancelled: false }` object literal and the `false`
    // boolean literal: a freshly recorded job must carry its input and start
    // not-cancelled.
    const adapter = new FakeTranscoderAdapter();
    const input = baseInput();
    const { jobName } = await adapter.submitJob(input);
    const rec = adapter.peekJob(jobName);
    expect(rec?.cancelled).toBe(false);
    expect(rec?.input).toEqual(input);
  });
});

function pubsubEnvelope(payload: object): unknown {
  return {
    message: {
      data: Buffer.from(JSON.stringify(payload)).toString('base64'),
      messageId: 'm1',
      publishTime: '2026-05-13T00:00:00Z',
    },
    subscription: 'projects/p/subscriptions/s',
  };
}

describe('FakeTranscoderAdapter.parseEvent', () => {
  it('parses a JOB_SUCCEEDED payload', async () => {
    const adapter = new FakeTranscoderAdapter();
    const env = pubsubEnvelope({
      job: {
        name: 'projects/p/locations/l/jobs/j1',
        state: 'SUCCEEDED',
        labels: { videoid: 'v1' },
        output: { uri: 'gs://out/videos/v1/hls/' },
      },
      eventTime: '2026-05-13T00:00:00Z',
    });
    const ev = await adapter.parseEvent(env);
    if (ev.type !== 'JOB_SUCCEEDED') throw new Error('expected SUCCEEDED');
    expect(ev.videoId).toBe('v1');
    expect(ev.manifestPath).toBe('videos/v1/hls/manifest.m3u8');
    expect(ev.durationSec).toBeGreaterThan(0);
  });

  it('parses a JOB_FAILED payload', async () => {
    const adapter = new FakeTranscoderAdapter();
    const env = pubsubEnvelope({
      job: {
        name: 'projects/p/locations/l/jobs/j1',
        state: 'FAILED',
        labels: { videoid: 'v1' },
        output: { uri: 'gs://out/videos/v1/hls/' },
        error: { code: 3, message: 'unsupported codec' },
      },
      eventTime: '2026-05-13T00:00:00Z',
    });
    const ev = await adapter.parseEvent(env);
    if (ev.type !== 'JOB_FAILED') throw new Error('expected FAILED');
    expect(ev.reason).toContain('unsupported codec');
  });

  it('throws on missing labels.videoid', async () => {
    const adapter = new FakeTranscoderAdapter();
    const env = pubsubEnvelope({
      job: { name: 'n', state: 'SUCCEEDED', labels: {} },
      eventTime: 'x',
    });
    await expect(adapter.parseEvent(env)).rejects.toThrow(/videoid/);
  });

  it('caps reason at 500 chars', async () => {
    const adapter = new FakeTranscoderAdapter();
    const long = 'x'.repeat(600);
    const env = pubsubEnvelope({
      job: {
        name: 'n',
        state: 'FAILED',
        labels: { videoid: 'v1' },
        error: { code: 13, message: long },
      },
      eventTime: 'x',
    });
    const ev = await adapter.parseEvent(env);
    if (ev.type !== 'JOB_FAILED') throw new Error('expected FAILED');
    expect(ev.reason.length).toBe(500);
  });

  it('throws on missing message.data', async () => {
    const adapter = new FakeTranscoderAdapter();
    await expect(adapter.parseEvent({ message: {} })).rejects.toThrow(/data/);
  });

  it('throws the explicit "missing message.data" error when the envelope has no message', async () => {
    // Defends `envelope.message?.data`: no `message` key → explicit Error via the
    // optional chain; removing `?.` would throw a TypeError instead.
    const adapter = new FakeTranscoderAdapter();
    await expect(adapter.parseEvent({})).rejects.toThrow(
      'Pub/Sub envelope missing message.data.',
    );
  });

  it('throws the explicit "missing labels.videoid" error when job has no labels', async () => {
    // Defends `job.labels?.['videoid']`: no `labels` key → explicit Error via the
    // optional chain, not a TypeError.
    const adapter = new FakeTranscoderAdapter();
    await expect(
      adapter.parseEvent(pubsubEnvelope({ job: { name: 'n', state: 'SUCCEEDED' } })),
    ).rejects.toThrow('Pub/Sub payload missing labels.videoid.');
  });

  it('throws on payload missing the job field', async () => {
    const adapter = new FakeTranscoderAdapter();
    await expect(adapter.parseEvent(pubsubEnvelope({}))).rejects.toThrow(/missing job/);
  });

  it('throws on an unexpected job.state (neither SUCCEEDED nor FAILED)', async () => {
    const adapter = new FakeTranscoderAdapter();
    const env = pubsubEnvelope({
      job: { name: 'n', state: 'RUNNING', labels: { videoid: 'v1' } },
    });
    await expect(adapter.parseEvent(env)).rejects.toThrow(/Unexpected job\.state: RUNNING/);
  });
});

describe('FakeTranscoderAdapter.parseEvent — optional-field fallbacks', () => {
  // Pin the right side of each `?? ` operator. Without these tests, a mutant
  // that drops the fallback can pass every other test in this file.
  it('defaults jobName to "" when job.name is absent', async () => {
    const adapter = new FakeTranscoderAdapter();
    const env = pubsubEnvelope({
      job: { state: 'SUCCEEDED', labels: { videoid: 'v1' } },
    });
    const ev = await adapter.parseEvent(env);
    expect(ev.jobName).toBe('');
  });

  it('defaults reason to "unknown" on FAILED when error.message is absent', async () => {
    const adapter = new FakeTranscoderAdapter();
    const env = pubsubEnvelope({
      job: { name: 'n', state: 'FAILED', labels: { videoid: 'v1' } },
    });
    const ev = await adapter.parseEvent(env);
    if (ev.type !== 'JOB_FAILED') throw new Error('expected FAILED');
    expect(ev.reason).toBe('unknown');
  });
});

describe('FakeTranscoderAdapter.cancelJob', () => {
  it('is a no-op for unknown jobs', async () => {
    const adapter = new FakeTranscoderAdapter();
    await expect(adapter.cancelJob('unknown')).resolves.toBeUndefined();
  });

  it('marks known jobs cancelled', async () => {
    const adapter = new FakeTranscoderAdapter();
    const { jobName } = await adapter.submitJob(baseInput());
    await adapter.cancelJob(jobName);
    expect(adapter.peekJob(jobName)?.cancelled).toBe(true);
  });
});
