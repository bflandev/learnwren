# US-08-04 Platform Health Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An ADMIN opens `/admin/health` and sees live service status (web server, database, transcoding queue, object storage), platform stats (storage used, registered users, published courses), and alerts (transcode backlog > 10; storage > 80% of an optional configured quota).

**Architecture:** One live-computed admin endpoint `GET /api/admin/health` in a new `health/` feature folder of `libs/api-courses` (mirrors `analytics/`), plus one lazy-loaded admin page in `libs/web-admin`. Probes run in parallel via `Promise.allSettled`; a failing probe degrades its row to `DOWN`, never 500s. No new collections, no scheduler, no polling.

**Tech Stack:** NestJS 11 (api-courses lib), Angular 21 standalone + signals (web-admin lib), Firestore aggregate `count()`, firebase-admin Storage `getFiles()`, Vitest unit tests, Playwright api-e2e.

**Spec:** `docs/superpowers/specs/2026-07-17-us-08-04-platform-health-design.md`

## Global Constraints

- Immutability everywhere; no mutation of shared objects.
- String-literal unions, branded IDs, ISO date strings on the wire (repo convention).
- TDD: write the failing test first for every behavioral change.
- Separate `.html` templateUrl for Angular components (Stryker skips templates).
- `inject()` over constructor injection in Angular; `OnPush` change detection.
- Guards: `FirebaseSessionGuard` + `AdminRoleGuard` (exact names, from `@learnwren/api-auth`).
- Env var: `LEARNWREN_STORAGE_QUOTA_GB` — optional positive number in ALL environments; invalid value fails startup.
- Thresholds: `TRANSCODE_BACKLOG_ALERT_THRESHOLD = 10` (alert when pending **> 10**), `STORAGE_QUOTA_ALERT_RATIO = 0.8` (alert when used ÷ quota **> 0.8**).
- Work happens in a git worktree branched from local `HEAD` (`git worktree add ../learnwren-health HEAD`), with `node_modules` symlinked to the parent; land via local `--no-ff` merge to main. Never `git add -A` (the symlink evades .gitignore). Per-command `cd <worktree> && pwd &&` prefix for every subagent command.

---

### Task 1: Shared types (`AdminHealthReport`)

**Files:**
- Create: `libs/shared-data-models/src/lib/admin-health.ts`
- Modify: `libs/shared-data-models/src/index.ts` (add export)

**Interfaces:**
- Consumes: `ISODateString` from `./common`.
- Produces: types `HealthServiceKey`, `HealthServiceStatus`, `HealthServiceReport`, `HealthAlertCode`, `HealthAlert`, `AdminHealthReport` — imported by Tasks 3–7 from `@learnwren/shared-data-models`.

- [ ] **Step 1: Create the types file**

```ts
// libs/shared-data-models/src/lib/admin-health.ts
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
```

- [ ] **Step 2: Export from the lib index**

In `libs/shared-data-models/src/index.ts`, add (alphabetical with the existing exports):

```ts
export * from './lib/admin-health';
```

- [ ] **Step 3: Typecheck and test the lib**

Run: `pnpm nx run-many -t typecheck test -p shared-data-models`
Expected: PASS (pure type file — no runtime code, no new spec needed).

- [ ] **Step 4: Commit**

```bash
git add libs/shared-data-models/src/lib/admin-health.ts libs/shared-data-models/src/index.ts
git commit -m "feat: shared AdminHealthReport types for US-08-04"
```

---

### Task 2: Health config (`HEALTH_CONFIG` + env reader)

**Files:**
- Create: `libs/api-courses/src/lib/health/health.config.ts`
- Test: `libs/api-courses/src/lib/health/health.config.spec.ts`

**Interfaces:**
- Consumes: `readVideoConfigFromEnv` from `../video/video.config` (already exists — DRY: buckets and impl flags are already env-derived there).
- Produces: `HEALTH_CONFIG` (symbol token), `interface HealthConfig { sourceBucket: string; outputBucket: string; storageImpl: 'real' | 'fake'; transcoderImpl: 'gcp' | 'fake'; storageQuotaBytes?: number }`, `readHealthConfigFromEnv(env: NodeJS.ProcessEnv): HealthConfig`. Used by Tasks 4–5.

- [ ] **Step 1: Write the failing test**

```ts
// libs/api-courses/src/lib/health/health.config.spec.ts
import { describe, expect, it } from 'vitest';

import { readHealthConfigFromEnv } from './health.config';

// Non-production base: video config falls back to fake mode with dev buckets.
const BASE_ENV: NodeJS.ProcessEnv = { NODE_ENV: 'test' };

describe('readHealthConfigFromEnv', () => {
  it('derives buckets and impl flags from the video config', () => {
    const cfg = readHealthConfigFromEnv({ ...BASE_ENV });
    expect(cfg.sourceBucket).toBe('learnwren-dev-source');
    expect(cfg.outputBucket).toBe('learnwren-dev-output');
    expect(cfg.storageImpl).toBe('fake');
    expect(cfg.transcoderImpl).toBe('fake');
  });

  it('leaves storageQuotaBytes undefined when the quota env var is unset', () => {
    const cfg = readHealthConfigFromEnv({ ...BASE_ENV });
    expect(cfg.storageQuotaBytes).toBeUndefined();
  });

  it('converts LEARNWREN_STORAGE_QUOTA_GB to bytes', () => {
    const cfg = readHealthConfigFromEnv({ ...BASE_ENV, LEARNWREN_STORAGE_QUOTA_GB: '2' });
    expect(cfg.storageQuotaBytes).toBe(2 * 1024 ** 3);
  });

  it('rejects a non-numeric quota', () => {
    expect(() =>
      readHealthConfigFromEnv({ ...BASE_ENV, LEARNWREN_STORAGE_QUOTA_GB: 'lots' }),
    ).toThrow(/LEARNWREN_STORAGE_QUOTA_GB/);
  });

  it('rejects a zero or negative quota', () => {
    expect(() =>
      readHealthConfigFromEnv({ ...BASE_ENV, LEARNWREN_STORAGE_QUOTA_GB: '0' }),
    ).toThrow(/LEARNWREN_STORAGE_QUOTA_GB/);
    expect(() =>
      readHealthConfigFromEnv({ ...BASE_ENV, LEARNWREN_STORAGE_QUOTA_GB: '-1' }),
    ).toThrow(/LEARNWREN_STORAGE_QUOTA_GB/);
  });

  it('treats an empty-string quota as unset', () => {
    const cfg = readHealthConfigFromEnv({ ...BASE_ENV, LEARNWREN_STORAGE_QUOTA_GB: '' });
    expect(cfg.storageQuotaBytes).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm nx test api-courses`
Expected: FAIL — cannot resolve `./health.config`.

- [ ] **Step 3: Implement**

```ts
// libs/api-courses/src/lib/health/health.config.ts
import { readVideoConfigFromEnv } from '../video/video.config';

export const HEALTH_CONFIG = Symbol.for('learnwren.api-health.config');

const BYTES_PER_GB = 1024 ** 3;

export interface HealthConfig {
  sourceBucket: string;
  outputBucket: string;
  storageImpl: 'real' | 'fake';
  transcoderImpl: 'gcp' | 'fake';
  /** Absent when LEARNWREN_STORAGE_QUOTA_GB is not configured. */
  storageQuotaBytes?: number;
}

export function readHealthConfigFromEnv(env: NodeJS.ProcessEnv): HealthConfig {
  const video = readVideoConfigFromEnv(env);

  const raw = env['LEARNWREN_STORAGE_QUOTA_GB'];
  let storageQuotaBytes: number | undefined;
  if (raw !== undefined && raw !== '') {
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) {
      throw new Error(`LEARNWREN_STORAGE_QUOTA_GB must be a positive number, got "${raw}".`);
    }
    storageQuotaBytes = n * BYTES_PER_GB;
  }

  return {
    sourceBucket: video.sourceBucket,
    outputBucket: video.outputBucket,
    storageImpl: video.playbackStorageImpl,
    transcoderImpl: video.transcoderImpl,
    ...(storageQuotaBytes !== undefined ? { storageQuotaBytes } : {}),
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm nx test api-courses`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/api-courses/src/lib/health/health.config.ts libs/api-courses/src/lib/health/health.config.spec.ts
git commit -m "feat: health config with optional storage quota (US-08-04)"
```

---

### Task 3: `VideoRepository.countPendingTranscodes()`

**Files:**
- Modify: `libs/api-courses/src/lib/video/video.repository.ts`
- Test: `libs/api-courses/src/lib/video/video.repository.spec.ts` (append to existing describe block or add a new one — follow the file's existing mock style; read the spec file first and reuse its Firestore stub helpers)

**Interfaces:**
- Consumes: the repository's existing `this.db` (`FirestoreHandle`).
- Produces: `countPendingTranscodes(): Promise<number>` — count of `videos` docs with `state IN ('UPLOADED', 'TRANSCODING')`. Used by Task 4.

- [ ] **Step 1: Write the failing test**

Follow the existing stub conventions in `video.repository.spec.ts` (read it first — reuse its firestore mock helper if one exists; otherwise add this minimal stub):

```ts
it('countPendingTranscodes counts videos in UPLOADED or TRANSCODING via an aggregate query', async () => {
  const get = vi.fn().mockResolvedValue({ data: () => ({ count: 3 }) });
  const count = vi.fn().mockReturnValue({ get });
  const where = vi.fn().mockReturnValue({ count });
  const collection = vi.fn().mockReturnValue({ where });
  const repo = new VideoRepository({ collection } as never);

  await expect(repo.countPendingTranscodes()).resolves.toBe(3);
  expect(collection).toHaveBeenCalledWith('videos');
  expect(where).toHaveBeenCalledWith('state', 'in', ['UPLOADED', 'TRANSCODING']);
});
```

(If `VideoRepository`'s constructor takes the Firestore handle differently — e.g. via `@Inject(FIRESTORE)` param position — match the instantiation style already used in that spec file.)

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm nx test api-courses`
Expected: FAIL — `countPendingTranscodes is not a function`.

- [ ] **Step 3: Implement**

Add to `VideoRepository`:

```ts
/** Pending transcode backlog = videos uploaded or mid-transcode (US-08-04). */
async countPendingTranscodes(): Promise<number> {
  const snap = await this.db
    .collection('videos')
    .where('state', 'in', ['UPLOADED', 'TRANSCODING'])
    .count()
    .get();
  return snap.data().count;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm nx test api-courses`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/api-courses/src/lib/video/video.repository.ts libs/api-courses/src/lib/video/video.repository.spec.ts
git commit -m "feat: pending-transcode count on VideoRepository (US-08-04)"
```

---

### Task 4: `AdminHealthService`

**Files:**
- Create: `libs/api-courses/src/lib/health/admin-health.service.ts`
- Test: `libs/api-courses/src/lib/health/admin-health.service.spec.ts`

**Interfaces:**
- Consumes: `HEALTH_CONFIG` / `HealthConfig` (Task 2), `VideoRepository.countPendingTranscodes()` (Task 3), `FIRESTORE`/`FirestoreHandle` + `FIREBASE_STORAGE`/`FirebaseStorageHandle` from `@learnwren/api-firebase`, `AdminHealthReport` types (Task 1), `nowIso()` from `@learnwren/shared-data-models`.
- Produces: `AdminHealthService.getReport(): Promise<AdminHealthReport>`, exported constants `TRANSCODE_BACKLOG_ALERT_THRESHOLD` and `STORAGE_QUOTA_ALERT_RATIO`. Used by Task 5.

- [ ] **Step 1: Write the failing test**

```ts
// libs/api-courses/src/lib/health/admin-health.service.spec.ts
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
```

Note on the 80% message: compute the displayed percentage with `Math.round((used / quota) * 100)` — for 801/1000 that renders 80, which is intentional (the alert fires on the ratio `> 0.8`, the message shows the rounded percentage).

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm nx test api-courses`
Expected: FAIL — cannot resolve `./admin-health.service`.

- [ ] **Step 3: Implement**

```ts
// libs/api-courses/src/lib/health/admin-health.service.ts
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm nx test api-courses`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/api-courses/src/lib/health/admin-health.service.ts libs/api-courses/src/lib/health/admin-health.service.spec.ts
git commit -m "feat: AdminHealthService with parallel probes and alerts (US-08-04)"
```

---

### Task 5: `AdminHealthController` + module wiring

**Files:**
- Create: `libs/api-courses/src/lib/health/admin-health.controller.ts`
- Test: `libs/api-courses/src/lib/health/admin-health.controller.spec.ts`
- Modify: `libs/api-courses/src/lib/courses.module.ts` (register controller + providers)

**Interfaces:**
- Consumes: `AdminHealthService` (Task 4), `HEALTH_CONFIG`/`readHealthConfigFromEnv` (Task 2), `FirebaseSessionGuard`/`AdminRoleGuard` from `@learnwren/api-auth`, `CoursesExceptionFilter` from `../courses.exception-filter`.
- Produces: `GET /api/admin/health` returning `AdminHealthReport`.

- [ ] **Step 1: Write the failing controller test**

Follow the style of `libs/api-courses/src/lib/analytics/analytics.controller.spec.ts` (read it first and mirror its guard-metadata assertions):

```ts
// libs/api-courses/src/lib/health/admin-health.controller.spec.ts
import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';

import { AdminRoleGuard, FirebaseSessionGuard } from '@learnwren/api-auth';

import { AdminHealthController } from './admin-health.controller';

describe('AdminHealthController', () => {
  it('delegates to AdminHealthService.getReport', async () => {
    const report = { services: [], stats: {}, alerts: [], generatedAt: 'now' };
    const service = { getReport: vi.fn().mockResolvedValue(report) };
    const controller = new AdminHealthController(service as never);
    await expect(controller.getReport()).resolves.toBe(report);
  });

  it('is guarded by FirebaseSessionGuard and AdminRoleGuard', () => {
    const guards = Reflect.getMetadata('__guards__', AdminHealthController) as unknown[];
    expect(guards).toEqual([FirebaseSessionGuard, AdminRoleGuard]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm nx test api-courses`
Expected: FAIL — cannot resolve `./admin-health.controller`.

- [ ] **Step 3: Implement the controller**

```ts
// libs/api-courses/src/lib/health/admin-health.controller.ts
import { Controller, Get, UseFilters, UseGuards } from '@nestjs/common';

import { AdminRoleGuard, FirebaseSessionGuard } from '@learnwren/api-auth';
import type { AdminHealthReport } from '@learnwren/shared-data-models';

import { CoursesExceptionFilter } from '../courses.exception-filter';
import { AdminHealthService } from './admin-health.service';

/** Admin platform-health dashboard endpoint (US-08-04). */
@Controller('admin/health')
@UseFilters(CoursesExceptionFilter)
@UseGuards(FirebaseSessionGuard, AdminRoleGuard)
export class AdminHealthController {
  constructor(private readonly service: AdminHealthService) {}

  @Get()
  getReport(): Promise<AdminHealthReport> {
    return this.service.getReport();
  }
}
```

- [ ] **Step 4: Wire into `courses.module.ts`**

In `libs/api-courses/src/lib/courses.module.ts`:

```ts
import { AdminHealthController } from './health/admin-health.controller';
import { AdminHealthService } from './health/admin-health.service';
import { HEALTH_CONFIG, readHealthConfigFromEnv } from './health/health.config';
```

Append `AdminHealthController` to the `controllers: [...]` array, and add to `providers`:

```ts
AdminHealthService,
{ provide: HEALTH_CONFIG, useFactory: () => readHealthConfigFromEnv(process.env) },
```

(`VideoRepository`, `FIRESTORE`, and `FIREBASE_STORAGE` are already available: `CoursesModule` imports `VideoModule` — which exports `VideoRepository` — and the firebase module is global/already imported; match how existing providers in this module get them.)

- [ ] **Step 5: Run api-courses tests + api guard-coverage spec**

Run: `pnpm nx test api-courses && pnpm nx test api`
Expected: PASS. The guard-coverage spec in `apps/api/src/controller-guard-coverage.spec.ts` passes without an allowlist change because the controller carries `@UseGuards(FirebaseSessionGuard, ...)`; if it flags the new route, that is a bug in this task, not a reason to allowlist.

- [ ] **Step 6: Boot check against the emulators**

Run (two terminals or background): `pnpm emulators` and `pnpm start` — then `curl -i http://localhost:3333/api/admin/health`
Expected: 401 (unauthenticated) — proves the route exists and is guarded. Kill the servers after. (Beware orphaned emulators from other worktrees — probe ports before starting.)

- [ ] **Step 7: Commit**

```bash
git add libs/api-courses/src/lib/health/admin-health.controller.ts libs/api-courses/src/lib/health/admin-health.controller.spec.ts libs/api-courses/src/lib/courses.module.ts
git commit -m "feat: GET /api/admin/health endpoint (US-08-04)"
```

---

### Task 6: Web `AdminHealthService` (HTTP wrapper)

**Files:**
- Create: `libs/web-admin/src/lib/admin-health.service.ts`
- Test: `libs/web-admin/src/lib/admin-health.service.spec.ts`

**Interfaces:**
- Consumes: `AdminHealthReport` from `@learnwren/shared-data-models`.
- Produces: `AdminHealthService.getReport(): Promise<AdminHealthReport>` — used by Task 7. (Repo convention: services are thin Promise-returning HTTP wrappers; components own state.)

- [ ] **Step 1: Write the failing test**

Mirror `libs/web-admin/src/lib/admin-categories.service.spec.ts` (read it first for the exact TestBed/HttpTestingController setup used in this lib):

```ts
// libs/web-admin/src/lib/admin-health.service.spec.ts
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';

import type { AdminHealthReport } from '@learnwren/shared-data-models';

import { AdminHealthService } from './admin-health.service';

describe('AdminHealthService', () => {
  it('GETs /api/admin/health and resolves the report', async () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const svc = TestBed.inject(AdminHealthService);
    const httpMock = TestBed.inject(HttpTestingController);

    const report: AdminHealthReport = {
      services: [{ key: 'webServer', status: 'UP' }],
      stats: {
        storageUsedBytes: 0,
        registeredUsers: 1,
        publishedCourses: 0,
        pendingTranscodeJobs: 0,
      },
      alerts: [],
      generatedAt: '2026-07-17T00:00:00.000Z' as AdminHealthReport['generatedAt'],
    };

    const promise = svc.getReport();
    httpMock.expectOne('/api/admin/health').flush(report);
    await expect(promise).resolves.toEqual(report);
    httpMock.verify();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm nx test web-admin`
Expected: FAIL — cannot resolve `./admin-health.service`.

- [ ] **Step 3: Implement**

```ts
// libs/web-admin/src/lib/admin-health.service.ts
import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { AdminHealthReport } from '@learnwren/shared-data-models';

/** Admin platform-health report (US-08-04). */
@Injectable({ providedIn: 'root' })
export class AdminHealthService {
  private readonly http = inject(HttpClient);

  getReport(): Promise<AdminHealthReport> {
    return firstValueFrom(this.http.get<AdminHealthReport>('/api/admin/health'));
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm nx test web-admin`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/web-admin/src/lib/admin-health.service.ts libs/web-admin/src/lib/admin-health.service.spec.ts
git commit -m "feat: web AdminHealthService HTTP wrapper (US-08-04)"
```

---

### Task 7: `AdminHealthPage` component + route + nav link

**Files:**
- Create: `libs/web-admin/src/lib/admin-health-page/admin-health-page.component.ts`
- Create: `libs/web-admin/src/lib/admin-health-page/admin-health-page.component.html`
- Test: `libs/web-admin/src/lib/admin-health-page/admin-health-page.component.spec.ts`
- Modify: `libs/web-admin/src/lib/admin.routes.ts` (add `health` child route)
- Modify: `apps/web/src/app/app.html` (add **Health** nav link after the Categories link, line ~20)

**Interfaces:**
- Consumes: `AdminHealthService.getReport()` (Task 6), `AdminHealthReport` types (Task 1).
- Produces: lazy-loaded page at `/admin/health`.

- [ ] **Step 1: Write the failing component test**

Mirror the test style of `admin-categories-page.component.spec.ts` (read it first — reuse its TestBed setup and service-stub idiom):

```ts
// libs/web-admin/src/lib/admin-health-page/admin-health-page.component.spec.ts
import { ComponentFixture, TestBed } from '@angular/core/testing';

import type { AdminHealthReport } from '@learnwren/shared-data-models';

import { AdminHealthService } from '../admin-health.service';
import { AdminHealthPageComponent } from './admin-health-page.component';

const BASE_REPORT: AdminHealthReport = {
  services: [
    { key: 'webServer', status: 'UP' },
    { key: 'database', status: 'UP' },
    { key: 'transcodingQueue', status: 'UP', detail: 'fake' },
    { key: 'objectStorage', status: 'DOWN', detail: 'bucket 403' },
  ],
  stats: {
    storageUsedBytes: 5 * 1024 ** 3,
    registeredUsers: 42,
    publishedCourses: 7,
    pendingTranscodeJobs: 3,
  },
  alerts: [],
  generatedAt: '2026-07-17T12:00:00.000Z' as AdminHealthReport['generatedAt'],
};

describe('AdminHealthPageComponent', () => {
  let getReport: jest.Mock | ReturnType<typeof vi.fn>;

  async function setup(report: AdminHealthReport | Error = BASE_REPORT) {
    getReport =
      report instanceof Error
        ? vi.fn().mockRejectedValue(report)
        : vi.fn().mockResolvedValue(report);
    await TestBed.configureTestingModule({
      imports: [AdminHealthPageComponent],
      providers: [{ provide: AdminHealthService, useValue: { getReport } }],
    }).compileComponents();
    const fixture = TestBed.createComponent(AdminHealthPageComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  it('renders the four service rows with status pills and detail', async () => {
    const fixture = await setup();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Web server');
    expect(text).toContain('Database');
    expect(text).toContain('Transcoding queue');
    expect(text).toContain('Object storage');
    expect(text).toContain('DOWN');
    expect(text).toContain('bucket 403');
  });

  it('renders the stat tiles', async () => {
    const fixture = await setup();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('42');
    expect(text).toContain('7');
    expect(text).toContain('5.0 GB');
  });

  it('hides the alerts banner when there are no alerts', async () => {
    const fixture = await setup();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[data-testid="health-alerts"]'),
    ).toBeNull();
  });

  it('shows the alerts banner when alerts are present', async () => {
    const fixture = await setup({
      ...BASE_REPORT,
      alerts: [{ code: 'TRANSCODE_BACKLOG', message: 'Transcoding queue has 11 pending jobs (threshold: 10).' }],
    });
    const banner = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="health-alerts"]',
    );
    expect(banner?.textContent).toContain('11 pending jobs');
  });

  it('shows the quota bar only when a quota is configured', async () => {
    const withQuota = await setup({
      ...BASE_REPORT,
      stats: { ...BASE_REPORT.stats, storageQuotaBytes: 10 * 1024 ** 3 },
    });
    expect(
      (withQuota.nativeElement as HTMLElement).querySelector('[data-testid="quota-bar"]'),
    ).not.toBeNull();

    const withoutQuota = await setup();
    expect(
      (withoutQuota.nativeElement as HTMLElement).querySelector('[data-testid="quota-bar"]'),
    ).toBeNull();
  });

  it('shows the load-error state and Retry re-fetches', async () => {
    const fixture = await setup(new Error('boom'));
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Could not load');
    expect(getReport).toHaveBeenCalledTimes(1);

    getReport.mockResolvedValue(BASE_REPORT);
    (el.querySelector('[data-testid="health-retry"]') as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(getReport).toHaveBeenCalledTimes(2);
    expect(el.textContent).toContain('Database');
  });

  it('Refresh re-fetches the report', async () => {
    const fixture = await setup();
    const el = fixture.nativeElement as HTMLElement;
    (el.querySelector('[data-testid="health-refresh"]') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(getReport).toHaveBeenCalledTimes(2);
  });
});
```

(Use `vi` if this lib's specs run on Vitest, `jest` if Jest — match the existing page specs; delete the unused alternative from the `getReport` type.)

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm nx test web-admin`
Expected: FAIL — cannot resolve the component.

- [ ] **Step 3: Implement the component**

```ts
// libs/web-admin/src/lib/admin-health-page/admin-health-page.component.ts
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';

import type { AdminHealthReport, HealthServiceKey } from '@learnwren/shared-data-models';

import { AdminHealthService } from '../admin-health.service';

const SERVICE_LABELS: Record<HealthServiceKey, string> = {
  webServer: 'Web server',
  database: 'Database',
  transcodingQueue: 'Transcoding queue',
  objectStorage: 'Object storage',
};

const BYTES_PER_GB = 1024 ** 3;

/** Admin platform-health dashboard (US-08-04): live status, stats, alerts. */
@Component({
  selector: 'lib-admin-health-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './admin-health-page.component.html',
})
export class AdminHealthPageComponent implements OnInit {
  private readonly svc = inject(AdminHealthService);

  readonly report = signal<AdminHealthReport | null>(null);
  readonly loading = signal(true);
  readonly loadError = signal(false);

  // Ignore out-of-order responses when Refresh is clicked repeatedly.
  private loadToken = 0;

  readonly serviceRows = computed(() =>
    (this.report()?.services ?? []).map((s) => ({ ...s, label: SERVICE_LABELS[s.key] })),
  );

  readonly quotaPercent = computed(() => {
    const stats = this.report()?.stats;
    if (!stats?.storageQuotaBytes) return null;
    return Math.round((stats.storageUsedBytes / stats.storageQuotaBytes) * 100);
  });

  ngOnInit(): void {
    void this.reload();
  }

  refresh(): void {
    void this.reload();
  }

  formatGb(bytes: number): string {
    return `${(bytes / BYTES_PER_GB).toFixed(1)} GB`;
  }

  private async reload(): Promise<void> {
    const token = ++this.loadToken;
    this.loading.set(true);
    this.loadError.set(false);
    try {
      const report = await this.svc.getReport();
      if (token !== this.loadToken) return;
      this.report.set(report);
    } catch {
      if (token !== this.loadToken) return;
      this.loadError.set(true);
    } finally {
      if (token === this.loadToken) this.loading.set(false);
    }
  }
}
```

- [ ] **Step 4: Implement the template**

Match the visual conventions of `admin-categories-page.component.html` (read it first: page wrapper classes, `lw-btn` button classes, error/loading blocks — reuse the same Tailwind utility classes it uses rather than the placeholders sketched here):

```html
<!-- libs/web-admin/src/lib/admin-health-page/admin-health-page.component.html -->
<section class="mx-auto max-w-3xl p-6">
  <div class="flex items-center justify-between">
    <h1 class="text-2xl font-semibold">Platform health</h1>
    <button
      type="button"
      class="lw-btn lw-btn-ghost"
      data-testid="health-refresh"
      [disabled]="loading()"
      (click)="refresh()"
    >
      Refresh
    </button>
  </div>

  @if (loading() && !report()) {
    <p class="mt-6">Loading…</p>
  } @else if (loadError()) {
    <div class="mt-6">
      <p>Could not load the health report.</p>
      <button type="button" class="lw-btn" data-testid="health-retry" (click)="refresh()">
        Retry
      </button>
    </div>
  } @else if (report(); as r) {
    @if (r.alerts.length > 0) {
      <div data-testid="health-alerts" class="mt-6 rounded border border-amber-400 bg-amber-50 p-4">
        <h2 class="font-semibold">Alerts</h2>
        <ul>
          @for (alert of r.alerts; track alert.code) {
            <li>{{ alert.message }}</li>
          }
        </ul>
      </div>
    }

    <h2 class="mt-6 font-semibold">Services</h2>
    <ul class="mt-2 divide-y rounded border">
      @for (row of serviceRows(); track row.key) {
        <li class="flex items-center justify-between p-3">
          <span>{{ row.label }}</span>
          <span class="flex items-center gap-2">
            @if (row.detail) {
              <span class="text-sm text-gray-500">{{ row.detail }}</span>
            }
            <span
              class="rounded px-2 py-0.5 text-sm font-medium"
              [class.bg-green-100]="row.status === 'UP'"
              [class.text-green-800]="row.status === 'UP'"
              [class.bg-red-100]="row.status === 'DOWN'"
              [class.text-red-800]="row.status === 'DOWN'"
            >
              {{ row.status }}
            </span>
          </span>
        </li>
      }
    </ul>

    <h2 class="mt-6 font-semibold">Stats</h2>
    <div class="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-3">
      <div class="rounded border p-4">
        <p class="text-sm text-gray-500">Storage used</p>
        <p class="text-xl font-semibold">{{ formatGb(r.stats.storageUsedBytes) }}</p>
        @if (r.stats.storageQuotaBytes) {
          <div data-testid="quota-bar" class="mt-2">
            <p class="text-sm">{{ quotaPercent() }}% of {{ formatGb(r.stats.storageQuotaBytes) }}</p>
            <div class="mt-1 h-2 rounded bg-gray-200">
              <div
                class="h-2 rounded"
                [class.bg-green-500]="(quotaPercent() ?? 0) <= 80"
                [class.bg-red-500]="(quotaPercent() ?? 0) > 80"
                [style.width.%]="quotaPercent() ?? 0 > 100 ? 100 : quotaPercent()"
              ></div>
            </div>
          </div>
        }
      </div>
      <div class="rounded border p-4">
        <p class="text-sm text-gray-500">Registered users</p>
        <p class="text-xl font-semibold">{{ r.stats.registeredUsers }}</p>
      </div>
      <div class="rounded border p-4">
        <p class="text-sm text-gray-500">Published courses</p>
        <p class="text-xl font-semibold">{{ r.stats.publishedCourses }}</p>
      </div>
    </div>

    <p class="mt-4 text-sm text-gray-500">
      Pending transcode jobs: {{ r.stats.pendingTranscodeJobs }} · as of {{ r.generatedAt }}
    </p>
  }
</section>
```

Note the width-binding precedence bug trap: `quotaPercent() ?? 0 > 100 ? 100 : quotaPercent()` is WRONG (`??` binds looser than `>`); write it as a component method instead:

```ts
quotaBarWidth(): number {
  const p = this.quotaPercent() ?? 0;
  return p > 100 ? 100 : p;
}
```

and bind `[style.width.%]="quotaBarWidth()"`.

- [ ] **Step 5: Add the route**

In `libs/web-admin/src/lib/admin.routes.ts`, add to `children` (after `categories`):

```ts
{
  path: 'health',
  loadComponent: () =>
    import('./admin-health-page/admin-health-page.component').then(
      (m) => m.AdminHealthPageComponent,
    ),
},
```

- [ ] **Step 6: Add the nav link**

In `apps/web/src/app/app.html` (line ~20, immediately after the Categories link, same classes):

```html
<a routerLink="/admin/health" class="lw-btn lw-btn-ghost">Health</a>
```

- [ ] **Step 7: Run web tests and builds**

Run: `pnpm nx run-many -t test typecheck -p web-admin web && pnpm nx build web`
Expected: PASS. (No `apps/web/tsconfig.spec.json` reference edit is needed — `@learnwren/web-admin` is already referenced by the app routes.)

- [ ] **Step 8: Commit**

```bash
git add libs/web-admin/src/lib/admin-health-page libs/web-admin/src/lib/admin.routes.ts apps/web/src/app/app.html
git commit -m "feat: /admin/health dashboard page + nav link (US-08-04)"
```

---

### Task 8: api-e2e coverage

**Files:**
- Create: `apps/api-e2e/src/admin-health.e2e-spec.ts`

**Interfaces:**
- Consumes: `API_BASE`, `initAdmin`, `registerStudent`, `registerAndPromoteAdmin` from `./_helpers/auth` (existing helpers — see `instructor-application-admin.e2e-spec.ts` for the exact usage pattern).

- [ ] **Step 1: Write the e2e spec**

```ts
// apps/api-e2e/src/admin-health.e2e-spec.ts
// NOTE: Run `pnpm emulators` and `pnpm start:api` before executing this suite.
import { test, expect, request as apiRequest } from '@playwright/test';

import type { AdminHealthReport } from '@learnwren/shared-data-models';

import { API_BASE, initAdmin, registerAndPromoteAdmin, registerStudent } from './_helpers/auth';

test.beforeAll(() => initAdmin());

test('admin receives a full health report', async () => {
  const ctx = await apiRequest.newContext();
  try {
    const adminSession = await registerAndPromoteAdmin(ctx);
    const res = await ctx.get(`${API_BASE}/admin/health`, {
      headers: { Cookie: adminSession.cookieHeader },
    });
    expect(res.status()).toBe(200);
    const report = (await res.json()) as AdminHealthReport;

    expect(report.services.map((s) => s.key).sort()).toEqual([
      'database',
      'objectStorage',
      'transcodingQueue',
      'webServer',
    ]);
    // Local dev runs fake storage/transcoder — everything reachable is UP.
    for (const s of report.services) expect(s.status).toBe('UP');
    expect(report.stats.registeredUsers).toBeGreaterThanOrEqual(1);
    expect(report.stats.publishedCourses).toBeGreaterThanOrEqual(0);
    expect(report.stats.pendingTranscodeJobs).toBeGreaterThanOrEqual(0);
    expect(typeof report.stats.storageUsedBytes).toBe('number');
    expect(Array.isArray(report.alerts)).toBe(true);
    expect(report.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  } finally {
    await ctx.dispose();
  }
});

test('a student is rejected with 403', async () => {
  const ctx = await apiRequest.newContext();
  try {
    const student = await registerStudent(ctx);
    const res = await ctx.get(`${API_BASE}/admin/health`, {
      headers: { Cookie: student.cookieHeader },
    });
    expect(res.status()).toBe(403);
  } finally {
    await ctx.dispose();
  }
});

test('an anonymous request is rejected with 401', async () => {
  const ctx = await apiRequest.newContext();
  try {
    const res = await ctx.get(`${API_BASE}/admin/health`);
    expect(res.status()).toBe(401);
  } finally {
    await ctx.dispose();
  }
});
```

- [ ] **Step 2: Run the suite against emulators**

Start `pnpm emulators` and `pnpm start:api` (background), verify the api port answers (probe for orphaned serves from other worktrees first), then:

Run: `pnpm nx e2e api-e2e -- admin-health`
Expected: 3 passing tests. Kill background processes after.

- [ ] **Step 3: Commit**

```bash
git add apps/api-e2e/src/admin-health.e2e-spec.ts
git commit -m "test: api-e2e coverage for /api/admin/health (US-08-04)"
```

---

### Task 9: Docs + spec sync

**Files:**
- Modify: `README.md` (status note: US-08-04 shipped; EP-08 complete; remove "Not built yet" line)
- Modify: `docs/USER_GUIDE.md` (add the health dashboard to the admin section, including the `LEARNWREN_STORAGE_QUOTA_GB` knob)
- Modify: `docs/superpowers/specs/2026-07-17-us-08-04-platform-health-design.md` (§3 table: replace the transcoder "adapter reachability-checked" wording with the implemented behavior — status derives from the pending-count query; impl surfaces as the `fake` detail)
- Modify: `docs/quality/spec-drift-report.md` (line ~418: US-08-04 no longer "not built")
- Modify: `.env.tpl` and `.env.deploy.tpl` (document optional `LEARNWREN_STORAGE_QUOTA_GB` — comment-only, no default value)

- [ ] **Step 1: Update README status block**

Replace the "Not built yet: US-08-04 …" sentence with a shipped entry describing: `/admin/health` (**Health** nav link), the four service rows, the three stats, the two alerts, and the optional `LEARNWREN_STORAGE_QUOTA_GB` quota. State that **EP-08 and the full written spec are now implemented end to end.**

- [ ] **Step 2: Update USER_GUIDE, spec §3, spec-drift report, env templates**

As listed above. Keep the spec's DRAFT banner (repo convention).

- [ ] **Step 3: Full verification gate**

Run: `pnpm nx run-many -t lint typecheck test build -p shared-data-models api-courses web-admin api web`
Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add README.md docs/USER_GUIDE.md docs/superpowers/specs/2026-07-17-us-08-04-platform-health-design.md docs/quality/spec-drift-report.md .env.tpl .env.deploy.tpl
git commit -m "docs: US-08-04 shipped — EP-08 complete"
```

---

## Post-plan integration (executor follows repo conventions, not new work)

- Merge from the main checkout with `git merge --no-ff <branch>`; status-check the worktree before `git worktree remove` (never `--force` blindly; never chain commit+merge+remove).
- After merge, from main: `pnpm nx reset` if anything is to be deployed (stale-daemon hazard).
