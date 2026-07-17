import { describe, expect, it, vi } from 'vitest';

import type { HealthConfig } from './health.config';
import { AdminHealthService } from './admin-health.service';

const FAKE_CONFIG: HealthConfig = {
  sourceBucket: 'src-bucket',
  outputBucket: 'out-bucket',
  storageImpl: 'fake',
  transcoderImpl: 'fake',
};

interface Overrides {
  users?: number | Error;
  published?: number | Error;
  pending?: number | Error;
  config?: HealthConfig;
  /** files per bucket, keyed by bucket name; sizes in bytes */
  bucketFiles?: Record<string, number[]>;
  bucketError?: Error;
}

function countSnap(count: number) {
  return { data: () => ({ count }) };
}

function makeService(o: Overrides = {}) {
  const usersCount = vi.fn(() =>
    o.users instanceof Error ? Promise.reject(o.users) : Promise.resolve(countSnap(o.users ?? 0)),
  );
  const publishedCount = vi.fn(() =>
    o.published instanceof Error
      ? Promise.reject(o.published)
      : Promise.resolve(countSnap(o.published ?? 0)),
  );
  const db = {
    collection: vi.fn((name: string) => {
      if (name === 'users') return { count: () => ({ get: usersCount }) };
      // 'courses'
      return { where: () => ({ count: () => ({ get: publishedCount }) }) };
    }),
  };
  const storage = {
    bucket: vi.fn((name: string) => ({
      getFiles: vi.fn(() => {
        if (o.bucketError) return Promise.reject(o.bucketError);
        const sizes = o.bucketFiles?.[name] ?? [];
        return Promise.resolve([sizes.map((s) => ({ metadata: { size: s } }))]);
      }),
    })),
  };
  const videos = {
    countPendingTranscodes: vi.fn(() =>
      o.pending instanceof Error ? Promise.reject(o.pending) : Promise.resolve(o.pending ?? 0),
    ),
  };
  const svc = new AdminHealthService(
    db as never,
    storage as never,
    o.config ?? FAKE_CONFIG,
    videos as never,
  );
  return { svc, db, storage };
}

function row(report: Awaited<ReturnType<AdminHealthService['getReport']>>, key: string) {
  const r = report.services.find((s) => s.key === key);
  if (!r) throw new Error(`missing service row ${key}`);
  return r;
}

describe('AdminHealthService.getReport', () => {
  it('reports all four services UP on the happy path', async () => {
    const { svc } = makeService({ users: 5, published: 2, pending: 1 });
    const report = await svc.getReport();
    expect(report.services.map((s) => s.key).sort()).toEqual([
      'database',
      'objectStorage',
      'transcodingQueue',
      'webServer',
    ]);
    for (const s of report.services) expect(s.status).toBe('UP');
    expect(report.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('returns stats from the aggregate counts', async () => {
    const { svc } = makeService({ users: 42, published: 7, pending: 3 });
    const report = await svc.getReport();
    expect(report.stats.registeredUsers).toBe(42);
    expect(report.stats.publishedCourses).toBe(7);
    expect(report.stats.pendingTranscodeJobs).toBe(3);
  });

  it('fake storage mode: objectStorage is UP with detail "fake", 0 bytes, buckets never listed', async () => {
    const { svc, storage } = makeService();
    const report = await svc.getReport();
    expect(row(report, 'objectStorage')).toEqual({
      key: 'objectStorage',
      status: 'UP',
      detail: 'fake',
    });
    expect(report.stats.storageUsedBytes).toBe(0);
    expect(storage.bucket).not.toHaveBeenCalled();
  });

  it('real storage mode: sums object sizes across source and output buckets', async () => {
    const { svc } = makeService({
      config: { ...FAKE_CONFIG, storageImpl: 'real' },
      bucketFiles: { 'src-bucket': [100, 200], 'out-bucket': [300] },
    });
    const report = await svc.getReport();
    expect(report.stats.storageUsedBytes).toBe(600);
    expect(row(report, 'objectStorage').status).toBe('UP');
  });

  it('a failing probe degrades its row to DOWN with a detail, and the call still resolves', async () => {
    const { svc } = makeService({ users: new Error('firestore unreachable') });
    const report = await svc.getReport();
    expect(row(report, 'database')).toEqual({
      key: 'database',
      status: 'DOWN',
      detail: 'firestore unreachable',
    });
    expect(report.stats.registeredUsers).toBe(0);
    expect(row(report, 'webServer').status).toBe('UP');
  });

  it('a failing bucket listing degrades objectStorage to DOWN', async () => {
    const { svc } = makeService({
      config: { ...FAKE_CONFIG, storageImpl: 'real' },
      bucketError: new Error('bucket 403'),
    });
    const report = await svc.getReport();
    expect(row(report, 'objectStorage').status).toBe('DOWN');
    expect(row(report, 'objectStorage').detail).toBe('bucket 403');
    expect(report.stats.storageUsedBytes).toBe(0);
  });

  it('fake transcoder mode carries detail "fake" on the transcodingQueue row', async () => {
    const { svc } = makeService();
    const report = await svc.getReport();
    expect(row(report, 'transcodingQueue').detail).toBe('fake');
  });

  it('no TRANSCODE_BACKLOG alert at exactly 10 pending jobs', async () => {
    const { svc } = makeService({ pending: 10 });
    const report = await svc.getReport();
    expect(report.alerts).toEqual([]);
  });

  it('TRANSCODE_BACKLOG alert at 11 pending jobs', async () => {
    const { svc } = makeService({ pending: 11 });
    const report = await svc.getReport();
    expect(report.alerts).toEqual([
      { code: 'TRANSCODE_BACKLOG', message: 'Transcoding queue has 11 pending jobs (threshold: 10).' },
    ]);
  });

  it('no STORAGE_QUOTA alert when no quota is configured, whatever the usage', async () => {
    const { svc } = makeService({
      config: { ...FAKE_CONFIG, storageImpl: 'real' },
      bucketFiles: { 'src-bucket': [10_000_000_000], 'out-bucket': [] },
    });
    const report = await svc.getReport();
    expect(report.alerts).toEqual([]);
    expect(report.stats.storageQuotaBytes).toBeUndefined();
  });

  it('no STORAGE_QUOTA alert at exactly 80% of quota', async () => {
    const { svc } = makeService({
      config: { ...FAKE_CONFIG, storageImpl: 'real', storageQuotaBytes: 1000 },
      bucketFiles: { 'src-bucket': [800], 'out-bucket': [] },
    });
    const report = await svc.getReport();
    expect(report.alerts).toEqual([]);
  });

  it('STORAGE_QUOTA alert above 80% of quota, and quota surfaces in stats', async () => {
    const { svc } = makeService({
      config: { ...FAKE_CONFIG, storageImpl: 'real', storageQuotaBytes: 1000 },
      bucketFiles: { 'src-bucket': [801], 'out-bucket': [] },
    });
    const report = await svc.getReport();
    expect(report.stats.storageQuotaBytes).toBe(1000);
    expect(report.alerts).toEqual([
      { code: 'STORAGE_QUOTA', message: 'Storage is at 80% of the configured quota.' },
    ]);
  });

  it('a DOWN storage probe does not fire a false STORAGE_QUOTA alert', async () => {
    const { svc } = makeService({
      config: { ...FAKE_CONFIG, storageImpl: 'real', storageQuotaBytes: 1000 },
      bucketError: new Error('unreachable'),
    });
    const report = await svc.getReport();
    expect(report.alerts).toEqual([]);
  });
});
