# US-08-04 — Monitor Platform Health: Design

> [!NOTE]
> DOCUMENT STATUS: DRAFT

**Date:** 2026-07-17
**Story:** `docs/epics/08-platform-administration.md` § US-08-04 (Monitor Platform Health) — the last unbuilt story in the spec.
**Approach:** single live-computed admin endpoint + one admin page (approved over a scheduled collector with history, and over external monitoring links).

## 1. Goal

An ADMIN opens `/admin/health` and sees, computed live on each load:

1. Status of the four key services: web server/API, database (Firestore), video transcoding queue, object storage.
2. Platform stats: total storage used, registered users, published courses.
3. Alerts when the transcoding backlog exceeds 10 pending jobs or storage usage exceeds 80% of a configured quota.

## 2. AC deviations (deliberate)

The story was written for a self-hosted box; the real deployment is Firebase/GCP serverless.

- **"Disk usage exceeds 80%"** → reinterpreted as a **configurable storage quota**: `LEARNWREN_STORAGE_QUOTA_GB` (optional, all environments). Used ÷ quota > 80% fires the alert. When unset, the dashboard shows raw usage with no quota bar and the alert is not evaluated. This keeps the AC's spirit for both self-hosted and cloud deploys.
- **"Web server status"** — the API cannot observe itself from outside; the row reports `UP` by construction (the response arriving proves web + API are serving). The row exists so all four AC services render.

## 3. API

New feature folder `libs/api-courses/src/lib/health/` (mirrors `analytics/`):

- **`GET /api/admin/health`** — `AdminHealthController`, guarded by `AuthSessionGuard` + `AdminRoleGuard`; joins the guard-coverage allowlist conventions. No new collections, no scheduler, no persistence.
- **`AdminHealthService.getReport()`** runs the probes in parallel with `Promise.allSettled` — one failing probe degrades its row to `DOWN` (with a detail string); it never 500s the page. Probe failures are data, not exceptions.

| Concern | Implementation |
|---|---|
| Database status | Firestore aggregate `count()` on `users` — the probe and the registered-users stat are the same call |
| Object storage status + storage used | List objects in the video **source** and **output** buckets via the existing `FIREBASE_STORAGE` handle, summing object sizes. One walk yields both the reachability probe and total bytes. In fake playback-storage mode the row reports `UP` with detail `fake` and the fake's usage (or 0) |
| Transcoding queue | Firestore `count()` of `videos` where `state IN ('UPLOADED','TRANSCODING')` = pending jobs. `gcp` mode: adapter reachability-checked; `fake` mode: `UP` with detail `fake` |
| Web server / API | `UP` by construction (see §2) |
| Published courses | Firestore `count()` on `courses` where `status == 'PUBLISHED'` |
| Alerts | Derived server-side from the same numbers: `TRANSCODE_BACKLOG` when pending > `TRANSCODE_BACKLOG_ALERT_THRESHOLD` (10); `STORAGE_QUOTA` when used ÷ quota > `STORAGE_QUOTA_ALERT_RATIO` (0.8), only when a quota is configured |

Errors: per-feature exception filter per the api-courses convention (`{code, status, details?}`-shaped exceptions rendered by `handleException()`). Only auth/authz failures produce error responses.

## 4. Shared types (`shared-data-models`)

```ts
export type HealthServiceKey = 'webServer' | 'database' | 'transcodingQueue' | 'objectStorage';
export type HealthServiceStatus = 'UP' | 'DOWN';

export interface HealthServiceReport {
  key: HealthServiceKey;
  status: HealthServiceStatus;
  detail?: string; // e.g. 'fake', an error summary, or 'pending jobs: 3'
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
    storageQuotaBytes?: number; // absent when no quota configured
    registeredUsers: number;
    publishedCourses: number;
    pendingTranscodeJobs: number;
  };
  alerts: HealthAlert[];
  generatedAt: ISODateString;
}
```

(`DEGRADED` is omitted — no probe today produces a third state; add it when one does.)

## 5. Config

- `LEARNWREN_STORAGE_QUOTA_GB` — optional positive number in every environment, read alongside the health module's config. Invalid values (non-numeric, ≤ 0) fail startup with a clear message, matching `video.config.ts` conventions.

## 6. Web (`libs/web-admin`)

- New route `/admin/health` (+ **Health** admin nav link next to Users/Categories, ADMIN-only visibility as with the other admin links).
- `AdminHealthPage` — standalone component owning signal state with the established `loadToken` idiom; `AdminHealthService` is a thin Promise-returning HTTP wrapper (repo convention).
- Renders top-to-bottom:
  1. **Alerts banner** (amber) — one row per active alert; hidden when none.
  2. **Service status** — four rows with UP/DOWN pills and the detail string.
  3. **Stat tiles** — storage used (with `used / quota` and a % bar when a quota is configured), registered users, published courses.
  4. **Refresh** button re-fetches; `generatedAt` shown as "as of …". No polling.
- Loading and error states per the existing admin pages' pattern.

## 7. Testing (TDD)

- **Unit (api):** each probe up/down path; alert boundaries (10 vs 11 pending; 79% vs 81%; quota unset ⇒ no storage alert); storage summation across both buckets; `Promise.allSettled` degradation (one probe throwing yields `DOWN` row + 200 response).
- **Guard coverage:** the new controller joins the existing admin guard-coverage spec.
- **Unit (web):** page renders report, alert visibility, quota bar present/absent, refresh re-fetch, loading/error states.
- **api-e2e:** admin receives a 200 `AdminHealthReport`; non-admin receives 403.

## 8. Scope cuts

- No history, trends, or uptime tracking (would need a scheduled collector — rejected as over-scope).
- No polling/auto-refresh; manual Refresh only.
- No email/push alerting — the AC says "alerts are displayed", and they are, on the dashboard.
- Bucket walk is un-cached; at small-community scale this is fine. If it ever gets slow, cache the byte total with a short TTL.
