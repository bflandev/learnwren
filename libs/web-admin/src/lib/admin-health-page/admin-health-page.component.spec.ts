import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

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
  let getReport: ReturnType<typeof vi.fn>;

  async function setup(report: AdminHealthReport | Error = BASE_REPORT): Promise<ComponentFixture<AdminHealthPageComponent>> {
    getReport =
      report instanceof Error
        ? vi.fn().mockRejectedValue(report)
        : vi.fn().mockResolvedValue(report);
    TestBed.resetTestingModule();
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

  it('colors the quota bar red at 80.1% (unrounded), matching the server alert threshold', async () => {
    const fixture = await setup({
      ...BASE_REPORT,
      stats: { ...BASE_REPORT.stats, storageUsedBytes: 801, storageQuotaBytes: 1000 },
    });
    const bar = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="quota-bar"] > div:last-child > div',
    );
    expect(bar?.classList.contains('bg-bad')).toBe(true);
    expect(bar?.classList.contains('bg-good')).toBe(false);
  });

  it('keeps the quota bar green at exactly 80% (unrounded)', async () => {
    const fixture = await setup({
      ...BASE_REPORT,
      stats: { ...BASE_REPORT.stats, storageUsedBytes: 800, storageQuotaBytes: 1000 },
    });
    const bar = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="quota-bar"] > div:last-child > div',
    );
    expect(bar?.classList.contains('bg-good')).toBe(true);
    expect(bar?.classList.contains('bg-bad')).toBe(false);
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

  function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  }

  const flushMicrotasks = () => new Promise((r) => setTimeout(r, 0));

  it('exposes safe initial state before the first load resolves', async () => {
    getReport = vi.fn().mockReturnValue(new Promise(() => undefined));
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [AdminHealthPageComponent],
      providers: [{ provide: AdminHealthService, useValue: { getReport } }],
    }).compileComponents();
    const comp = TestBed.createComponent(AdminHealthPageComponent).componentInstance;
    expect(comp.loading()).toBe(true);
    expect(comp.loadError()).toBe(false);
    expect(comp.report()).toBeNull();
    expect(comp.serviceRows()).toEqual([]);
    expect(comp.quotaPercent()).toBeNull();
    expect(comp.isOverQuotaThreshold()).toBe(false);
    expect(comp.quotaBarWidth()).toBe(0);
  });

  it('computes the quota percent, threshold state, and bar width from the report', async () => {
    const fixture = await setup({
      ...BASE_REPORT,
      stats: {
        ...BASE_REPORT.stats,
        storageUsedBytes: 5 * 1024 ** 3,
        storageQuotaBytes: 10 * 1024 ** 3,
      },
    });
    const comp = fixture.componentInstance;
    expect(comp.quotaPercent()).toBe(50);
    expect(comp.isOverQuotaThreshold()).toBe(false);
    expect(comp.quotaBarWidth()).toBe(50);
  });

  it('reports null percent and a false threshold when no quota is configured', async () => {
    const fixture = await setup();
    const comp = fixture.componentInstance;
    expect(comp.quotaPercent()).toBeNull();
    expect(comp.isOverQuotaThreshold()).toBe(false);
  });

  it('clamps the quota bar at 100% when usage exceeds the quota', async () => {
    const fixture = await setup({
      ...BASE_REPORT,
      stats: {
        ...BASE_REPORT.stats,
        storageUsedBytes: 12 * 1024 ** 3,
        storageQuotaBytes: 10 * 1024 ** 3,
      },
    });
    const comp = fixture.componentInstance;
    expect(comp.quotaPercent()).toBe(120);
    expect(comp.quotaBarWidth()).toBe(100);
    expect(comp.isOverQuotaThreshold()).toBe(true);
  });

  it('shows the loading state while a refresh is in flight', async () => {
    const fixture = await setup();
    const comp = fixture.componentInstance;
    const pending = deferred<AdminHealthReport>();
    getReport.mockReturnValueOnce(pending.promise);
    comp.refresh();
    expect(comp.loading()).toBe(true);
    pending.resolve(BASE_REPORT);
    await fixture.whenStable();
    expect(comp.loading()).toBe(false);
  });

  it('discards a stale success: an older in-flight response neither overwrites the report nor clears loading', async () => {
    const fixture = await setup();
    const comp = fixture.componentInstance;
    const stale = deferred<AdminHealthReport>();
    const fresh = deferred<AdminHealthReport>();
    getReport.mockReturnValueOnce(stale.promise).mockReturnValueOnce(fresh.promise);
    comp.refresh(); // stale request
    comp.refresh(); // fresh request supersedes it
    stale.resolve({ ...BASE_REPORT, stats: { ...BASE_REPORT.stats, registeredUsers: 111 } });
    await flushMicrotasks();
    expect(comp.report()?.stats.registeredUsers).toBe(42); // stale result discarded
    expect(comp.loading()).toBe(true); // stale finally must not clear loading
    fresh.resolve({ ...BASE_REPORT, stats: { ...BASE_REPORT.stats, registeredUsers: 222 } });
    await fixture.whenStable();
    expect(comp.report()?.stats.registeredUsers).toBe(222);
    expect(comp.loading()).toBe(false);
  });

  it('discards a stale failure: an older in-flight rejection does not surface the error state', async () => {
    const fixture = await setup();
    const comp = fixture.componentInstance;
    const stale = deferred<AdminHealthReport>();
    const fresh = deferred<AdminHealthReport>();
    getReport.mockReturnValueOnce(stale.promise).mockReturnValueOnce(fresh.promise);
    comp.refresh();
    comp.refresh();
    stale.reject(new Error('stale failure'));
    await flushMicrotasks();
    expect(comp.loadError()).toBe(false);
    fresh.resolve(BASE_REPORT);
    await fixture.whenStable();
    expect(comp.loadError()).toBe(false);
    expect(comp.report()).not.toBeNull();
  });
});
