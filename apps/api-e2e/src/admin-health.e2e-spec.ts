// NOTE: Run `pnpm emulators` and `pnpm start:api` before executing this suite.
import { test, expect, request as apiRequest } from '@playwright/test';

import { API_BASE, initAdmin, registerAndPromoteAdmin, registerStudent } from './_helpers/auth';

// Mirrors AdminHealthReport from @learnwren/shared-data-models — the e2e app
// doesn't have a project reference to that lib (see sibling specs, which
// type responses inline rather than importing shared-data-models).
interface AdminHealthReport {
  services: Array<{ key: string; status: string; detail?: string }>;
  stats: {
    storageUsedBytes: number;
    storageQuotaBytes?: number;
    registeredUsers: number;
    publishedCourses: number;
    pendingTranscodeJobs: number;
  };
  alerts: Array<{ code: string; message: string }>;
  generatedAt: string;
}

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
