import { describe, expect, it, vi } from 'vitest';

import type { VideoId, VideoKeyId } from '@learnwren/shared-data-models';

import { GcpTranscoderAdapter } from './gcp-transcoder.adapter';

interface MockClient {
  createJob: ReturnType<typeof vi.fn>;
  deleteJob: ReturnType<typeof vi.fn>;
  getJob: ReturnType<typeof vi.fn>;
}
interface MockSecrets {
  addSecretVersion: ReturnType<typeof vi.fn>;
  destroySecretVersion: ReturnType<typeof vi.fn>;
}

const SECRET = 'projects/proj/secrets/learnwren-video-keys';

function makeClient(): MockClient {
  return {
    createJob: vi.fn(async () => [{ name: 'projects/proj/locations/us-central1/jobs/abc' }]),
    deleteJob: vi.fn(),
    getJob: vi.fn(async () => [{ labels: { videoid: 'v1', keyversion: '7' } }]),
  };
}
function makeSecrets(): MockSecrets {
  return {
    addSecretVersion: vi.fn(async () => [{ name: `${SECRET}/versions/7` }]),
    destroySecretVersion: vi.fn(async () => [{}]),
  };
}

function makeAdapter(client: MockClient = makeClient(), secrets: MockSecrets = makeSecrets()): GcpTranscoderAdapter {
  type Opts = ConstructorParameters<typeof GcpTranscoderAdapter>[0];
  return new GcpTranscoderAdapter({
    client: client as unknown as Opts['client'],
    secrets: secrets as unknown as Opts['secrets'],
    keySecret: SECRET,
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
  it('stores the content key as a secret version in the documented JSON format (hex key)', async () => {
    const secrets = makeSecrets();
    await makeAdapter(makeClient(), secrets).submitJob(baseInput());
    const [req] = secrets.addSecretVersion.mock.calls[0]!;
    expect(req.parent).toBe(SECRET);
    const payload = JSON.parse(req.payload.data.toString());
    expect(payload.encryptionKeys).toHaveLength(1);
    expect(payload.encryptionKeys[0].key).toBe('07'.repeat(16));
    expect(payload.encryptionKeys[0].keyId).toMatch(/^[0-9a-f]{32}$/);
    expect(payload.encryptionKeys[0].keyUri).toMatch(/\/api\/playback\/keys\/v1$/);
  });

  it('references that version with aes_128 + ClearKey, and labels the JOB (not its config)', async () => {
    const client = makeClient();
    const handle = await makeAdapter(client).submitJob(baseInput());
    expect(handle.jobName).toBe('projects/proj/locations/us-central1/jobs/abc');
    const [arg] = client.createJob.mock.calls[0]!;
    expect(arg.parent).toBe('projects/proj/locations/us-central1');
    expect(arg.job.labels).toEqual({ videoid: 'v1', keyversion: '7' });
    expect(arg.job.config.labels).toBeUndefined();
    expect(arg.job.config.encryptions).toEqual([
      {
        id: 'k1',
        aes_128: {},
        drmSystems: { clearkey: {} },
        secretManagerKeySource: { secretVersion: `${SECRET}/versions/7` },
      },
    ]);
  });

  it('survives the real gRPC serializer intact (unknown fields are dropped silently)', async () => {
    // The bug this pins: `aes128` and config-level `labels` vanished in
    // transit, so every job reached Google with no encryption and was rejected.
    const client = makeClient();
    await makeAdapter(client).submitJob(baseInput());
    const [arg] = client.createJob.mock.calls[0]!;
    const protos = (await import('@google-cloud/video-transcoder/build/protos/protos')) as unknown as {
      google: { cloud: { video: { transcoder: { v1: { CreateJobRequest: {
        fromObject(o: unknown): unknown;
        encode(m: unknown): { finish(): Uint8Array };
        decode(b: Uint8Array): unknown;
        toObject(m: unknown): Record<string, unknown>;
      } } } } } };
    };
    const T = protos.google.cloud.video.transcoder.v1.CreateJobRequest;
    const sent = T.toObject(T.decode(T.encode(T.fromObject(arg)).finish())) as {
      job: { labels: Record<string, string>; config: { encryptions: Array<Record<string, unknown>> } };
    };
    expect(sent.job.labels).toEqual({ videoid: 'v1', keyversion: '7' });
    const enc = sent.job.config.encryptions[0]!;
    expect(enc['aes_128']).toBeDefined();
    expect(enc['drmSystems']).toEqual({ clearkey: {} });
    expect(enc['secretManagerKeySource']).toEqual({ secretVersion: `${SECRET}/versions/7` });
  });

  it('destroys the key version and rethrows when createJob fails', async () => {
    const client = makeClient();
    const secrets = makeSecrets();
    client.createJob.mockRejectedValue(new Error('quota exhausted'));
    await expect(makeAdapter(client, secrets).submitJob(baseInput())).rejects.toThrow(/quota/);
    expect(secrets.destroySecretVersion).toHaveBeenCalledWith({ name: `${SECRET}/versions/7` });
  });

  it('refuses to submit when Secret Manager returns no version name', async () => {
    const client = makeClient();
    const secrets = makeSecrets();
    secrets.addSecretVersion.mockResolvedValue([{}]);
    await expect(makeAdapter(client, secrets).submitJob(baseInput())).rejects.toThrow(/no version name/);
    expect(client.createJob).not.toHaveBeenCalled();
  });

  it('defaults the returned jobName to "" when createJob omits name', async () => {
    const client = makeClient();
    client.createJob.mockResolvedValue([{}]);
    expect((await makeAdapter(client).submitJob(baseInput())).jobName).toBe('');
  });

  it('matches the real SDK clients: every method it calls exists', async () => {
    const { TranscoderServiceClient } = await import('@google-cloud/video-transcoder');
    const { SecretManagerServiceClient } = await import('@google-cloud/secret-manager');
    for (const m of ['createJob', 'deleteJob', 'getJob']) {
      expect(typeof (TranscoderServiceClient.prototype as unknown as Record<string, unknown>)[m]).toBe('function');
    }
    for (const m of ['addSecretVersion', 'destroySecretVersion']) {
      expect(typeof (SecretManagerServiceClient.prototype as unknown as Record<string, unknown>)[m]).toBe('function');
    }
  });
});

function envelope(payload: object): unknown {
  return { message: { data: Buffer.from(JSON.stringify(payload)).toString('base64') } };
}

describe('GcpTranscoderAdapter.parseEvent', () => {
  it('returns JOB_SUCCEEDED (duration left to the probed value) and destroys the key version', async () => {
    const secrets = makeSecrets();
    const ev = await makeAdapter(makeClient(), secrets).parseEvent(
      envelope({ job: { name: 'j1', state: 'SUCCEEDED', labels: { videoid: 'v1', keyversion: '7' } } }),
    );
    expect(ev).toEqual({
      type: 'JOB_SUCCEEDED',
      jobName: 'j1',
      videoId: 'v1',
      manifestPath: 'videos/v1/hls/manifest.m3u8',
      durationSec: 0,
    });
    expect(secrets.destroySecretVersion).toHaveBeenCalledWith({ name: `${SECRET}/versions/7` });
  });

  it('returns JOB_FAILED with the reason and destroys the key version too', async () => {
    const secrets = makeSecrets();
    const ev = await makeAdapter(makeClient(), secrets).parseEvent(
      envelope({
        job: { name: 'j', state: 'FAILED', labels: { videoid: 'v1', keyversion: '7' }, error: { message: 'codec failure' } },
      }),
    );
    if (ev.type !== 'JOB_FAILED') throw new Error('expected FAILED');
    expect(ev.reason).toBe('codec failure');
    expect(secrets.destroySecretVersion).toHaveBeenCalledTimes(1);
  });

  it('still applies the result when destroying the version fails (best effort)', async () => {
    const secrets = makeSecrets();
    secrets.destroySecretVersion.mockRejectedValue(new Error('already destroyed'));
    const ev = await makeAdapter(makeClient(), secrets).parseEvent(
      envelope({ job: { name: 'j', state: 'SUCCEEDED', labels: { videoid: 'v1', keyversion: '7' } } }),
    );
    expect(ev.type).toBe('JOB_SUCCEEDED');
  });

  it('skips the destroy for a job without a keyversion label', async () => {
    const secrets = makeSecrets();
    await makeAdapter(makeClient(), secrets).parseEvent(
      envelope({ job: { name: 'j', state: 'SUCCEEDED', labels: { videoid: 'v1' } } }),
    );
    expect(secrets.destroySecretVersion).not.toHaveBeenCalled();
  });

  it('defaults jobName to "" and reason to "unknown", and caps the reason at 500 chars', async () => {
    const adapter = makeAdapter();
    const ok = await adapter.parseEvent(envelope({ job: { state: 'SUCCEEDED', labels: { videoid: 'v1' } } }));
    expect(ok.jobName).toBe('');
    const unknown = await adapter.parseEvent(envelope({ job: { name: 'j', state: 'FAILED', labels: { videoid: 'v1' } } }));
    if (unknown.type !== 'JOB_FAILED') throw new Error('expected FAILED');
    expect(unknown.reason).toBe('unknown');
    const long = await adapter.parseEvent(
      envelope({ job: { name: 'j', state: 'FAILED', labels: { videoid: 'v1' }, error: { message: 'x'.repeat(900) } } }),
    );
    if (long.type !== 'JOB_FAILED') throw new Error('expected FAILED');
    expect(long.reason).toBe('x'.repeat(500));
  });

  it('throws on an unexpected job.state without touching the key', async () => {
    const secrets = makeSecrets();
    await expect(
      makeAdapter(makeClient(), secrets).parseEvent(
        envelope({ job: { name: 'j', state: 'RUNNING', labels: { videoid: 'v1', keyversion: '7' } } }),
      ),
    ).rejects.toThrow(/Unexpected job\.state: RUNNING/);
    expect(secrets.destroySecretVersion).not.toHaveBeenCalled();
  });
});

describe('GcpTranscoderAdapter.parseEvent — malformed input', () => {
  it('throws on missing labels.videoid', async () => {
    const adapter = makeAdapter();
    await expect(
      adapter.parseEvent(envelope({ job: { name: 'j', state: 'SUCCEEDED', labels: {} } })),
    ).rejects.toThrow(/videoid/);
  });
  it('throws on missing message.data', async () => {
    const adapter = makeAdapter();
    await expect(adapter.parseEvent({ message: {} })).rejects.toThrow(/data/);
  });
  it('throws the explicit "missing message.data" error when the envelope has no message at all', async () => {
    // Defends `envelope.message?.data`: with no `message` key the optional chain
    // yields undefined → the explicit Error. Removing `?.` would throw a raw
    // TypeError reading `.data` of undefined instead.
    const adapter = makeAdapter();
    await expect(adapter.parseEvent({})).rejects.toThrow(
      'Pub/Sub envelope missing message.data.',
    );
  });
  it('throws the explicit "missing labels.videoid" error when job has no labels at all', async () => {
    // Defends `job.labels?.['videoid']`: a job with no `labels` key must surface
    // the explicit Error via the optional chain, not a TypeError.
    const adapter = makeAdapter();
    await expect(
      adapter.parseEvent(envelope({ job: { name: 'j', state: 'SUCCEEDED' } })),
    ).rejects.toThrow('Pub/Sub payload missing labels.videoid.');
  });
  it('throws on payload missing the job field', async () => {
    const adapter = makeAdapter();
    await expect(adapter.parseEvent(envelope({}))).rejects.toThrow(/missing job/);
  });
});

describe('GcpTranscoderAdapter.cancelJob', () => {
  it('stops the job with client.deleteJob (the API has no cancel)', async () => {
    const client = makeClient();
    client.deleteJob.mockResolvedValue([{}]);
    const adapter = makeAdapter(client);
    await adapter.cancelJob('projects/proj/locations/l/jobs/j1');
    expect(client.deleteJob).toHaveBeenCalledWith({ name: 'projects/proj/locations/l/jobs/j1', allowMissing: true });
  });

  it('destroys the job\'s key version first: a stopped job never reports back', async () => {
    const client = makeClient();
    const secrets = makeSecrets();
    await makeAdapter(client, secrets).cancelJob('projects/proj/locations/l/jobs/j1');
    expect(client.getJob).toHaveBeenCalledWith({ name: 'projects/proj/locations/l/jobs/j1' });
    expect(secrets.destroySecretVersion).toHaveBeenCalledWith({ name: `${SECRET}/versions/7` });
    expect(client.deleteJob).toHaveBeenCalled();
  });

  it('still stops the job when its key version cannot be looked up', async () => {
    const client = makeClient();
    const secrets = makeSecrets();
    client.getJob.mockRejectedValue(Object.assign(new Error('not found'), { code: 5 }));
    await makeAdapter(client, secrets).cancelJob('j');
    expect(secrets.destroySecretVersion).not.toHaveBeenCalled();
    expect(client.deleteJob).toHaveBeenCalledWith({ name: 'j', allowMissing: true });
  });

  it('swallows NOT_FOUND from the SDK', async () => {
    const client = makeClient();
    const notFound = Object.assign(new Error('not found'), { code: 5 });
    client.deleteJob.mockRejectedValue(notFound);
    const adapter = makeAdapter(client);
    await expect(adapter.cancelJob('j')).resolves.toBeUndefined();
  });
  it('propagates other errors', async () => {
    const client = makeClient();
    client.deleteJob.mockRejectedValue(new Error('boom'));
    const adapter = makeAdapter(client);
    await expect(adapter.cancelJob('j')).rejects.toThrow(/boom/);
  });
});
