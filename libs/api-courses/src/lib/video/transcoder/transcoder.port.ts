import type { VideoId, VideoKeyId } from '@learnwren/shared-data-models';

export const VIDEO_TRANSCODER = Symbol.for('learnwren.api-video.transcoder');

export interface TranscoderJobInput {
  videoId: VideoId;
  sourceUri: string; // 'gs://<src-bucket>/videos/{vid}/source.<ext>'
  outputUriPrefix: string; // 'gs://<out-bucket>/videos/{vid}/hls/'
  encryptionKey: {
    id: VideoKeyId;
    bytes: Uint8Array; // exactly 16 bytes
  };
  sourceHeight: number; // from ffprobe; drives skip-upscale
  topic: string; // full Pub/Sub topic path; per JobConfig.pubsubDestination
}

export interface TranscoderJobHandle {
  jobName: string; // GCP Transcoder API job resource name
}

export type TranscoderEvent =
  | {
      type: 'JOB_SUCCEEDED';
      jobName: string;
      videoId: VideoId;
      manifestPath: string; // 'videos/{vid}/hls/manifest.m3u8'
      durationSec: number; // from transcoderClient.getJob output
    }
  | {
      type: 'JOB_FAILED';
      jobName: string;
      videoId: VideoId;
      reason: string; // sliced to 500 chars at construction
    };

/**
 * I/O failure while enriching a structurally-valid event (e.g. a transient
 * getJob failure). Distinct from a structural parse error: the webhook must
 * answer 5xx so Pub/Sub redelivers, NOT ack the message as MALFORMED — acking
 * would permanently drop the notification (video stuck TRANSCODING forever;
 * no reconciler exists).
 */
export class TranscoderEventLookupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TranscoderEventLookupError';
  }
}

export interface VideoTranscoder {
  submitJob(input: TranscoderJobInput): Promise<TranscoderJobHandle>;
  parseEvent(rawPubSubMessage: unknown): Promise<TranscoderEvent>;
  cancelJob(jobName: string): Promise<void>;
}
