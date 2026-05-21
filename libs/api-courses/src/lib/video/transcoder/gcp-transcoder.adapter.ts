import { Injectable } from '@nestjs/common';

import type { VideoId } from '@learnwren/shared-data-models';

import { buildJobConfig } from './transcoder-job.builder';
import type {
  TranscoderEvent,
  TranscoderJobHandle,
  TranscoderJobInput,
  VideoTranscoder,
} from './transcoder.port';

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
      const [full] = await this.opts.client.getJob({ name: jobName });
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
      if (code === 5) return; // gRPC NOT_FOUND — tolerate.
      throw err;
    }
  }
}
