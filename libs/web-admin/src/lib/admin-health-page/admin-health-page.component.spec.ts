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
    expect(bar?.classList.contains('bg-red-500')).toBe(true);
    expect(bar?.classList.contains('bg-green-500')).toBe(false);
  });

  it('keeps the quota bar green at exactly 80% (unrounded)', async () => {
    const fixture = await setup({
      ...BASE_REPORT,
      stats: { ...BASE_REPORT.stats, storageUsedBytes: 800, storageQuotaBytes: 1000 },
    });
    const bar = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="quota-bar"] > div:last-child > div',
    );
    expect(bar?.classList.contains('bg-green-500')).toBe(true);
    expect(bar?.classList.contains('bg-red-500')).toBe(false);
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
