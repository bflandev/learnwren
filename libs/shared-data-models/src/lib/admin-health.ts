import type { ISODateString } from './common';

export type HealthServiceKey = 'webServer' | 'database' | 'transcodingQueue' | 'objectStorage';

export type HealthServiceStatus = 'UP' | 'DOWN';

export interface HealthServiceReport {
  key: HealthServiceKey;
  status: HealthServiceStatus;
  /** e.g. 'fake', or a one-line failure summary when DOWN. */
  detail?: string;
}

export type HealthAlertCode = 'TRANSCODE_BACKLOG' | 'STORAGE_QUOTA';

export interface HealthAlert {
  code: HealthAlertCode;
  message: string;
}

export interface AdminHealthReport {
  services: HealthServiceReport[];
  stats: {
    storageUsedBytes: number;
    /** Absent when LEARNWREN_STORAGE_QUOTA_GB is not configured. */
    storageQuotaBytes?: number;
    registeredUsers: number;
    publishedCourses: number;
    pendingTranscodeJobs: number;
  };
  alerts: HealthAlert[];
  generatedAt: ISODateString;
}
