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

export interface VideoTranscoder {
  submitJob(input: TranscoderJobInput): Promise<TranscoderJobHandle>;
  parseEvent(rawPubSubMessage: unknown): Promise<TranscoderEvent>;
  cancelJob(jobName: string): Promise<void>;
}
