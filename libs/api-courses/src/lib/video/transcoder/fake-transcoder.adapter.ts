import { Injectable } from '@nestjs/common';

import type { VideoId } from '@learnwren/shared-data-models';

import type {
  TranscoderEvent,
  TranscoderJobHandle,
  TranscoderJobInput,
  VideoTranscoder,
} from './transcoder.port';

interface FakeJobRecord {
  input: TranscoderJobInput;
  cancelled: boolean;
}

interface PubSubEnvelope {
  message?: { data?: string };
}

interface TranscoderPayload {
  job?: {
    name?: string;
    state?: 'SUCCEEDED' | 'FAILED';
    labels?: Record<string, string>;
    output?: { uri?: string };
    error?: { code?: number; message?: string };
  };
}

@Injectable()
export class FakeTranscoderAdapter implements VideoTranscoder {
  private readonly jobs = new Map<string, FakeJobRecord>();

  async submitJob(input: TranscoderJobInput): Promise<TranscoderJobHandle> {
    const jobName = `fake-job-${input.videoId}-${Date.now()}-${this.jobs.size}`;
    this.jobs.set(jobName, { input, cancelled: false });
    return { jobName };
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
      return {
        type: 'JOB_SUCCEEDED',
        jobName,
        videoId: videoId as VideoId,
        manifestPath: `videos/${videoId}/hls/manifest.m3u8`,
        durationSec: 60, // synthetic; tests assert > 0
      };
    }
    if (job.state === 'FAILED') {
      const raw = job.error?.message ?? 'unknown';
      return {
        type: 'JOB_FAILED',
        jobName,
        videoId: videoId as VideoId,
        reason: raw.slice(0, 500),
      };
    }
    throw new Error(`Unexpected job.state: ${String(job.state)}`);
  }

  async cancelJob(jobName: string): Promise<void> {
    const rec = this.jobs.get(jobName);
    if (rec) rec.cancelled = true;
  }

  // Test helper — not part of the VideoTranscoder interface.
  peekJob(jobName: string): FakeJobRecord | undefined {
    return this.jobs.get(jobName);
  }
}
