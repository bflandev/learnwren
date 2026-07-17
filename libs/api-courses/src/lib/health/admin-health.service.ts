import { Inject, Injectable } from '@nestjs/common';

import {
  FIREBASE_STORAGE,
  FIRESTORE,
  type FirebaseStorageHandle,
  type FirestoreHandle,
} from '@learnwren/api-firebase';
import { nowIso } from '@learnwren/shared-data-models';
import type {
  AdminHealthReport,
  HealthAlert,
  HealthServiceReport,
} from '@learnwren/shared-data-models';

import { VideoRepository } from '../video/video.repository';
import { HEALTH_CONFIG, type HealthConfig } from './health.config';

export const TRANSCODE_BACKLOG_ALERT_THRESHOLD = 10;
export const STORAGE_QUOTA_ALERT_RATIO = 0.8;

function failureDetail(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

/**
 * Live platform-health report (US-08-04). Every probe runs in parallel and a
 * failure degrades its service row to DOWN — the report itself always resolves.
 */
@Injectable()
export class AdminHealthService {
  constructor(
    @Inject(FIRESTORE) private readonly db: FirestoreHandle,
    @Inject(FIREBASE_STORAGE) private readonly storage: FirebaseStorageHandle,
    @Inject(HEALTH_CONFIG) private readonly config: HealthConfig,
    private readonly videos: VideoRepository,
  ) {}

  async getReport(): Promise<AdminHealthReport> {
    const [users, published, pending, storageBytes] = await Promise.allSettled([
      this.countUsers(),
      this.countPublishedCourses(),
      this.videos.countPendingTranscodes(),
      this.measureStorageBytes(),
    ]);

    const services: HealthServiceReport[] = [
      // The response arriving proves web + API are serving (see spec §2).
      { key: 'webServer', status: 'UP' },
      users.status === 'fulfilled'
        ? { key: 'database', status: 'UP' }
        : { key: 'database', status: 'DOWN', detail: failureDetail(users.reason) },
      pending.status === 'fulfilled'
        ? {
            key: 'transcodingQueue',
            status: 'UP',
            ...(this.config.transcoderImpl === 'fake' ? { detail: 'fake' } : {}),
          }
        : { key: 'transcodingQueue', status: 'DOWN', detail: failureDetail(pending.reason) },
      storageBytes.status === 'fulfilled'
        ? {
            key: 'objectStorage',
            status: 'UP',
            ...(this.config.storageImpl === 'fake' ? { detail: 'fake' } : {}),
          }
        : { key: 'objectStorage', status: 'DOWN', detail: failureDetail(storageBytes.reason) },
    ];

    const storageUsedBytes = storageBytes.status === 'fulfilled' ? storageBytes.value : 0;
    const pendingTranscodeJobs = pending.status === 'fulfilled' ? pending.value : 0;

    return {
      services,
      stats: {
        storageUsedBytes,
        ...(this.config.storageQuotaBytes !== undefined
          ? { storageQuotaBytes: this.config.storageQuotaBytes }
          : {}),
        registeredUsers: users.status === 'fulfilled' ? users.value : 0,
        publishedCourses: published.status === 'fulfilled' ? published.value : 0,
        pendingTranscodeJobs,
      },
      alerts: this.deriveAlerts({
        pending: pending.status === 'fulfilled' ? pending.value : null,
        usedBytes: storageBytes.status === 'fulfilled' ? storageBytes.value : null,
      }),
      generatedAt: nowIso(),
    };
  }

  private async countUsers(): Promise<number> {
    const snap = await this.db.collection('users').count().get();
    return snap.data().count;
  }

  private async countPublishedCourses(): Promise<number> {
    const snap = await this.db
      .collection('courses')
      .where('status', '==', 'PUBLISHED')
      .count()
      .get();
    return snap.data().count;
  }

  /**
   * One walk over both buckets yields the reachability probe and total bytes.
   * ponytail: un-cached full listing — fine at small-community scale; add a
   * short-TTL cache if the dashboard ever gets slow.
   */
  private async measureStorageBytes(): Promise<number> {
    if (this.config.storageImpl === 'fake') return 0;
    const buckets = [this.config.sourceBucket, this.config.outputBucket];
    const perBucket = await Promise.all(
      buckets.map(async (name) => {
        const [files] = await this.storage.bucket(name).getFiles();
        return files.reduce((sum, f) => sum + Number(f.metadata.size ?? 0), 0);
      }),
    );
    return perBucket.reduce((a, b) => a + b, 0);
  }

  /** null inputs mean "probe failed" — a failed probe never fires an alert. */
  private deriveAlerts(input: { pending: number | null; usedBytes: number | null }): HealthAlert[] {
    const alerts: HealthAlert[] = [];
    if (input.pending !== null && input.pending > TRANSCODE_BACKLOG_ALERT_THRESHOLD) {
      alerts.push({
        code: 'TRANSCODE_BACKLOG',
        message: `Transcoding queue has ${input.pending} pending jobs (threshold: ${TRANSCODE_BACKLOG_ALERT_THRESHOLD}).`,
      });
    }
    const quota = this.config.storageQuotaBytes;
    if (
      quota !== undefined &&
      input.usedBytes !== null &&
      input.usedBytes / quota > STORAGE_QUOTA_ALERT_RATIO
    ) {
      alerts.push({
        code: 'STORAGE_QUOTA',
        message: `Storage is at ${Math.round((input.usedBytes / quota) * 100)}% of the configured quota.`,
      });
    }
    return alerts;
  }
}
