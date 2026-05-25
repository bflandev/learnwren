import { describe, expect, it, vi } from 'vitest';

import type { VideoId, VideoKeyId } from '@learnwren/shared-data-models';

import { GcpTranscoderAdapter } from './gcp-transcoder.adapter';

interface MockClient {
  createJob: ReturnType<typeof vi.fn>;
  getJob: ReturnType<typeof vi.fn>;
  cancelJob: ReturnType<typeof vi.fn>;
}

function makeClient(): MockClient {
  return { createJob: vi.fn(), getJob: vi.fn(), cancelJob: vi.fn() };
}

function makeAdapter(client: MockClient): GcpTranscoderAdapter {
  return new GcpTranscoderAdapter({
    client: client as unknown as ConstructorParameters<typeof GcpTranscoderAdapter>[0]['client'],
    projectId: 'proj',
    location: 'us-central1',
  });
}

const baseInput = () => ({
  videoId: 'v1' as VideoId,
  sourceUri: 'gs://src/videos/v1/source.mp4',
  outputUriPrefix: 'gs://out/videos/v1/hls/',
  encryptionKey: { id: 'k1' as VideoKeyId, bytes: new Uint8Array(16).fill(7) },
  sourceHeight: 1080,
  topic: 'projects/proj/topics/t',
});

describe('GcpTranscoderAdapter.submitJob', () => {
  it('passes the built JobConfig + key bytes to the client and returns the job name', async () => {
    const client = makeClient();
    client.createJob.mockResolvedValue([
      { name: 'projects/proj/locations/us-central1/jobs/abc' },
    ]);
    const adapter = makeAdapter(client);
    const handle = await adapter.submitJob(baseInput());
    expect(handle.jobName).toBe('projects/proj/locations/us-central1/jobs/abc');
    expect(client.createJob).toHaveBeenCalledTimes(1);
    const [arg] = client.createJob.mock.calls[0]!;
    expect(arg.parent).toBe('projects/proj/locations/us-central1');
    expect(arg.job.config.elementaryStreams.some((s: { videoStream?: unknown }) => s.videoStream)).toBe(true);
    const enc = arg.job.config.encryptions?.[0];
    expect(enc?.id).toBe('k1');
    expect(enc?.aes128?.keyBytes).toEqual(Buffer.from(baseInput().encryptionKey.bytes));
  });

  it('propagates createJob errors', async () => {
    const client = makeClient();
    client.createJob.mockRejectedValue(new Error('quota exhausted'));
    const adapter = makeAdapter(client);
    await expect(adapter.submitJob(baseInput())).rejects.toThrow(/quota/);
  });
});

function envelope(payload: object): unknown {
  return { message: { data: Buffer.from(JSON.stringify(payload)).toString('base64') } };
}

describe('GcpTranscoderAdapter.parseEvent — JOB_SUCCEEDED', () => {
  it('calls getJob to obtain output duration and returns a JOB_SUCCEEDED event', async () => {
    const client = makeClient();
    client.getJob.mockResolvedValue([
      {
        name: 'projects/proj/locations/l/jobs/j1',
        output: { uri: 'gs://out/videos/v1/hls/' },
        outputDurationSec: 123,
      },
    ]);
    const adapter = makeAdapter(client);
    const ev = await adapter.parseEvent(
      envelope({
        job: {
          name: 'projects/proj/locations/l/jobs/j1',
          state: 'SUCCEEDED',
          labels: { videoid: 'v1' },
          output: { uri: 'gs://out/videos/v1/hls/' },
        },
      }),
    );
    if (ev.type !== 'JOB_SUCCEEDED') throw new Error('expected SUCCEEDED');
    expect(client.getJob).toHaveBeenCalledTimes(1);
    expect(ev.durationSec).toBe(123);
    expect(ev.manifestPath).toBe('videos/v1/hls/manifest.m3u8');
    expect(ev.videoId).toBe('v1');
  });

  it('propagates getJob failure (webhook returns 5xx so Pub/Sub retries)', async () => {
    const client = makeClient();
    client.getJob.mockRejectedValue(new Error('transient'));
    const adapter = makeAdapter(client);
    await expect(
      adapter.parseEvent(
        envelope({
          job: { name: 'j', state: 'SUCCEEDED', labels: { videoid: 'v1' }, output: { uri: 'gs://x/y/' } },
        }),
      ),
    ).rejects.toThrow(/transient/);
  });
});

describe('GcpTranscoderAdapter.parseEvent — JOB_FAILED', () => {
  it('does not call getJob and returns a JOB_FAILED event', async () => {
    const client = makeClient();
    const adapter = makeAdapter(client);
    const ev = await adapter.parseEvent(
      envelope({
        job: { name: 'j', state: 'FAILED', labels: { videoid: 'v1' }, error: { code: 3, message: 'codec failure' } },
      }),
    );
    if (ev.type !== 'JOB_FAILED') throw new Error('expected FAILED');
    expect(client.getJob).not.toHaveBeenCalled();
    expect(ev.reason).toContain('codec failure');
  });
});

describe('GcpTranscoderAdapter.parseEvent — malformed input', () => {
  it('throws on missing labels.videoid', async () => {
    const adapter = makeAdapter(makeClient());
    await expect(
      adapter.parseEvent(envelope({ job: { name: 'j', state: 'SUCCEEDED', labels: {} } })),
    ).rejects.toThrow(/videoid/);
  });
  it('throws on missing message.data', async () => {
    const adapter = makeAdapter(makeClient());
    await expect(adapter.parseEvent({ message: {} })).rejects.toThrow(/data/);
  });
  it('throws on payload missing the job field', async () => {
    const adapter = makeAdapter(makeClient());
    await expect(adapter.parseEvent(envelope({}))).rejects.toThrow(/missing job/);
  });
  it('throws on an unexpected job.state (neither SUCCEEDED nor FAILED)', async () => {
    const adapter = makeAdapter(makeClient());
    await expect(
      adapter.parseEvent(
        envelope({ job: { name: 'j', state: 'RUNNING', labels: { videoid: 'v1' } } }),
      ),
    ).rejects.toThrow(/Unexpected job\.state: RUNNING/);
  });
});

describe('GcpTranscoderAdapter.parseEvent — optional-field fallbacks', () => {
  // Pin the right side of each `?? ` operator in parseEvent. Without these,
  // a mutant that removes the fallback can pass every other test.
  it('defaults jobName to "" when job.name is absent', async () => {
    const client = makeClient();
    client.getJob.mockResolvedValue([{ outputDurationSec: 10 }]);
    const adapter = makeAdapter(client);
    const ev = await adapter.parseEvent(
      envelope({ job: { state: 'SUCCEEDED', labels: { videoid: 'v1' } } }),
    );
    expect(ev.jobName).toBe('');
    // getJob is invoked with the same fallback name — the contract is
    // tested but the wire call is what matters operationally.
    expect(client.getJob).toHaveBeenCalledWith({ name: '' });
  });
  it('defaults durationSec to 0 when outputDurationSec is missing on SUCCEEDED', async () => {
    const client = makeClient();
    client.getJob.mockResolvedValue([{ name: 'j' }]); // no outputDurationSec
    const adapter = makeAdapter(client);
    const ev = await adapter.parseEvent(
      envelope({ job: { name: 'j', state: 'SUCCEEDED', labels: { videoid: 'v1' } } }),
    );
    if (ev.type !== 'JOB_SUCCEEDED') throw new Error('expected SUCCEEDED');
    expect(ev.durationSec).toBe(0);
  });
  it('defaults reason to "unknown" on FAILED when error.message is absent', async () => {
    const adapter = makeAdapter(makeClient());
    const ev = await adapter.parseEvent(
      envelope({ job: { name: 'j', state: 'FAILED', labels: { videoid: 'v1' } } }),
    );
    if (ev.type !== 'JOB_FAILED') throw new Error('expected FAILED');
    expect(ev.reason).toBe('unknown');
  });
});

describe('GcpTranscoderAdapter.cancelJob', () => {
  it('calls client.cancelJob with the job name', async () => {
    const client = makeClient();
    client.cancelJob.mockResolvedValue([{}]);
    const adapter = makeAdapter(client);
    await adapter.cancelJob('projects/proj/locations/l/jobs/j1');
    expect(client.cancelJob).toHaveBeenCalledWith({ name: 'projects/proj/locations/l/jobs/j1' });
  });
  it('swallows NOT_FOUND from the SDK', async () => {
    const client = makeClient();
    const notFound = Object.assign(new Error('not found'), { code: 5 });
    client.cancelJob.mockRejectedValue(notFound);
    const adapter = makeAdapter(client);
    await expect(adapter.cancelJob('j')).resolves.toBeUndefined();
  });
  it('propagates other errors', async () => {
    const client = makeClient();
    client.cancelJob.mockRejectedValue(new Error('boom'));
    const adapter = makeAdapter(client);
    await expect(adapter.cancelJob('j')).rejects.toThrow(/boom/);
  });
});
