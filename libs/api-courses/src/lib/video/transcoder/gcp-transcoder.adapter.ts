import { randomBytes } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';

import { publicUrl } from '@learnwren/api-auth';
import type { VideoId } from '@learnwren/shared-data-models';

import { buildJobConfig } from './transcoder-job.builder';
import {
  type TranscoderEvent,
  type TranscoderJobHandle,
  type TranscoderJobInput,
  type VideoTranscoder,
} from './transcoder.port';

// Canonical gRPC status code for NOT_FOUND (see google.rpc.Code).
const GRPC_NOT_FOUND = 5;

/** The subset of TranscoderServiceClient we use (video.module checks each exists). */
export interface TranscoderClient {
  createJob(req: {
    parent: string;
    job: { config: unknown; labels: Record<string, string> };
  }): Promise<[{ name?: string | null }]>;
  // The Transcoder API has no cancel: deleteJob is how a running job is
  // stopped and removed. (A `cancelJob` here once compiled behind a cast and
  // threw at runtime on every delete, so jobs ran on, billed.)
  deleteJob(req: { name: string; allowMissing?: boolean }): Promise<[unknown]>;
  getJob(req: { name: string }): Promise<[{ labels?: Record<string, string> | null }]>;
}

/** The subset of SecretManagerServiceClient we use (video.module checks each exists). */
export interface KeySecretClient {
  addSecretVersion(req: { parent: string; payload: { data: Buffer } }): Promise<[{ name?: string | null }]>;
  destroySecretVersion(req: { name: string }): Promise<[unknown]>;
}

interface PubSubEnvelope { message?: { data?: string } }

interface TranscoderPayload {
  job?: {
    name?: string;
    state?: 'SUCCEEDED' | 'FAILED';
    labels?: Record<string, string>;
    error?: { code?: number; message?: string };
  };
}

export interface GcpTranscoderAdapterOptions {
  client: TranscoderClient;
  secrets: KeySecretClient;
  /** `projects/{p}/secrets/{id}`: each job's content key is one version of it. */
  keySecret: string;
  projectId: string;
  location: string;
}

@Injectable()
export class GcpTranscoderAdapter implements VideoTranscoder {
  // Stryker disable next-line StringLiteral: Logger label is log-only.
  private readonly logger = new Logger('GcpTranscoderAdapter');

  constructor(private readonly opts: GcpTranscoderAdapterOptions) {}

  /**
   * The Transcoder API takes an AES-128 key only from a Secret Manager
   * version holding `{"encryptionKeys":[{keyId,key,keyUri}]}` (hex key). The
   * key stays in videoKeys for playback; the version only lives until the
   * job reports back (versions are billed while active).
   */
  async submitJob(input: TranscoderJobInput): Promise<TranscoderJobHandle> {
    const secretVersion = await this.addKeyVersion(input);
    const parent = `projects/${this.opts.projectId}/locations/${this.opts.location}`;
    try {
      const [job] = await this.opts.client.createJob({
        parent,
        job: {
          config: buildJobConfig(input, secretVersion),
          // On the Job, not its config: JobConfig has no labels field and the
          // gRPC client drops unknown fields silently.
          labels: { videoid: input.videoId as string, keyversion: versionNumber(secretVersion) },
        },
      });
      return { jobName: job.name ?? '' };
    } catch (err) {
      await this.destroyKeyVersion(secretVersion);
      throw err;
    }
  }

  async parseEvent(raw: unknown): Promise<TranscoderEvent> {
    const envelope = raw as PubSubEnvelope;
    const dataB64 = envelope.message?.data;
    if (!dataB64) throw new Error('Pub/Sub envelope missing message.data.');
    const payload = JSON.parse(Buffer.from(dataB64, 'base64').toString('utf-8')) as TranscoderPayload;
    const job = payload.job;
    if (!job) throw new Error('Pub/Sub payload missing job.');
    const videoId = job.labels?.['videoid'];
    if (!videoId) throw new Error('Pub/Sub payload missing labels.videoid.');
    const jobName = job.name ?? '';

    if (job.state !== 'SUCCEEDED' && job.state !== 'FAILED') {
      throw new Error(`Unexpected job.state: ${String(job.state)}`);
    }
    // The job is done with its key either way; a redelivered event re-runs
    // this harmlessly (an already destroyed version is tolerated).
    const keyVersion = job.labels?.['keyversion'];
    if (keyVersion) await this.destroyKeyVersion(`${this.opts.keySecret}/versions/${keyVersion}`);

    if (job.state === 'SUCCEEDED') {
      return {
        type: 'JOB_SUCCEEDED',
        jobName,
        videoId: videoId as VideoId,
        manifestPath: `videos/${videoId}/hls/manifest.m3u8`,
        // A Job exposes no output duration (there was once a getJob call for
        // a field that does not exist); the repository uses the probed one.
        durationSec: 0,
      };
    }
    return {
      type: 'JOB_FAILED',
      jobName,
      videoId: videoId as VideoId,
      reason: (job.error?.message ?? 'unknown').slice(0, 500),
    };
  }

  async cancelJob(jobName: string): Promise<void> {
    // A stopped job never reports back, so parseEvent will not destroy its
    // key version: do it here (billed while active, and it holds the key of a
    // video being deleted). Best effort — the stop itself matters more.
    await this.destroyKeyVersionOf(jobName);
    try {
      await this.opts.client.deleteJob({ name: jobName, allowMissing: true });
    } catch (err) {
      const code = (err as { code?: number }).code;
      if (code === GRPC_NOT_FOUND) return; // already deleted/never existed — tolerate.
      throw err;
    }
  }

  private async addKeyVersion(input: TranscoderJobInput): Promise<string> {
    const payload = {
      encryptionKeys: [
        {
          // ClearKey wants a 16-byte hex key id; HLS AES-128 never uses it.
          keyId: randomBytes(16).toString('hex'),
          key: Buffer.from(input.encryptionKey.bytes).toString('hex'),
          // Written into EXT-X-KEY; the playback rewriter replaces it anyway.
          keyUri: publicUrl(`/api/playback/keys/${input.videoId}`),
        },
      ],
    };
    const [version] = await this.opts.secrets.addSecretVersion({
      parent: this.opts.keySecret,
      payload: { data: Buffer.from(JSON.stringify(payload)) },
    });
    if (!version.name) throw new Error('Secret Manager returned no version name.');
    return version.name;
  }

  private async destroyKeyVersionOf(jobName: string): Promise<void> {
    let keyVersion: string | undefined;
    try {
      const [job] = await this.opts.client.getJob({ name: jobName });
      keyVersion = job.labels?.['keyversion'];
    } catch (err) {
      // Stryker disable next-line StringLiteral: log-only message.
      this.logger.warn(`reading job ${jobName} for its key version failed: ${(err as Error).message}`);
      return;
    }
    if (keyVersion) await this.destroyKeyVersion(`${this.opts.keySecret}/versions/${keyVersion}`);
  }

  private async destroyKeyVersion(name: string): Promise<void> {
    try {
      await this.opts.secrets.destroySecretVersion({ name });
    } catch (err) {
      // Best effort: a leaked version costs a few cents a month, and the job
      // result must still be applied.
      // Stryker disable next-line StringLiteral: log-only message.
      this.logger.warn(`destroying key version ${name} failed: ${(err as Error).message}`);
    }
  }
}

/** `projects/p/secrets/s/versions/7` → `7` (a valid label value). */
function versionNumber(versionName: string): string {
  return versionName.slice(versionName.lastIndexOf('/') + 1);
}
