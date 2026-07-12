import { Injectable } from '@nestjs/common';

import type { VideoId } from '@learnwren/shared-data-models';

import { buildJobConfig } from './transcoder-job.builder';
import {
  TranscoderEventLookupError,
  type TranscoderEvent,
  type TranscoderJobHandle,
  type TranscoderJobInput,
  type VideoTranscoder,
} from './transcoder.port';

// Canonical gRPC status code for NOT_FOUND (see google.rpc.Code).
const GRPC_NOT_FOUND = 5;

// Minimal structural type for the subset of TranscoderServiceClient we use.
export interface TranscoderClient {
  createJob(req: { parent: string; job: { config: unknown } }): Promise<[{ name?: string | null }]>;
  getJob(req: { name: string }): Promise<
    [{ name?: string | null; outputDurationSec?: number; output?: { uri?: string } }]
  >;
  cancelJob(req: { name: string }): Promise<[unknown]>;
}

interface PubSubEnvelope { message?: { data?: string } }

interface TranscoderPayload {
  job?: {
    name?: string;
    state?: 'SUCCEEDED' | 'FAILED';
    labels?: Record<string, string>;
    output?: { uri?: string };
    error?: { code?: number; message?: string };
  };
}

export interface GcpTranscoderAdapterOptions {
  client: TranscoderClient;
  projectId: string;
  location: string;
}

@Injectable()
export class GcpTranscoderAdapter implements VideoTranscoder {
  constructor(private readonly opts: GcpTranscoderAdapterOptions) {}

  async submitJob(input: TranscoderJobInput): Promise<TranscoderJobHandle> {
    const cfg = buildJobConfig(input);
    const sdkConfig = {
      ...cfg,
      // Stryker disable next-line OptionalChaining: equivalent — buildJobConfig always returns a non-empty `encryptions` array (the `?` in its return type is for the shared shape only), so cfg.encryptions is never nullish here and `?.map` vs `.map` are identical.
      encryptions: cfg.encryptions?.map((e) => ({
        id: e.id,
        aes128: { keyBytes: Buffer.from(input.encryptionKey.bytes) },
      })),
    };
    const parent = `projects/${this.opts.projectId}/locations/${this.opts.location}`;
    const [job] = await this.opts.client.createJob({ parent, job: { config: sdkConfig } });
    return { jobName: job.name ?? '' };
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

    if (job.state === 'SUCCEEDED') {
      // Structural parsing is done; getJob is I/O. Wrap its failures in the
      // typed lookup error so the controller retries (5xx) instead of acking
      // the event as MALFORMED and dropping it forever.
      let full: { outputDurationSec?: number };
      try {
        [full] = await this.opts.client.getJob({ name: jobName });
      } catch (err) {
        throw new TranscoderEventLookupError(
          `getJob failed for ${jobName}: ${(err as Error).message}`,
        );
      }
      const durationSec = Number(full.outputDurationSec ?? 0);
      return {
        type: 'JOB_SUCCEEDED',
        jobName,
        videoId: videoId as VideoId,
        manifestPath: `videos/${videoId}/hls/manifest.m3u8`,
        durationSec,
      };
    }
    if (job.state === 'FAILED') {
      return {
        type: 'JOB_FAILED',
        jobName,
        videoId: videoId as VideoId,
        reason: (job.error?.message ?? 'unknown').slice(0, 500),
      };
    }
    throw new Error(`Unexpected job.state: ${String(job.state)}`);
  }

  async cancelJob(jobName: string): Promise<void> {
    try {
      await this.opts.client.cancelJob({ name: jobName });
    } catch (err) {
      const code = (err as { code?: number }).code;
      if (code === GRPC_NOT_FOUND) return; // already deleted/never existed — tolerate.
      throw err;
    }
  }
}
