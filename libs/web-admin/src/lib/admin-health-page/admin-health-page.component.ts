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
const QUOTA_BAR_MAX_PERCENT = 100;

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

  /** Unrounded ratio > 0.8, matching the server's STORAGE_QUOTA alert threshold exactly. */
  readonly isOverQuotaThreshold = computed(() => {
    const stats = this.report()?.stats;
    if (!stats?.storageQuotaBytes) return false;
    return stats.storageUsedBytes / stats.storageQuotaBytes > 0.8;
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

  /** Clamped width for the quota bar — computed here, not inline, to avoid a `??`/`>` precedence bug in the template. */
  quotaBarWidth(): number {
    return Math.min(this.quotaPercent() ?? 0, QUOTA_BAR_MAX_PERCENT);
  }

  private async reload(): Promise<void> {
    // Stryker disable next-line UpdateOperator: equivalent — the token only needs to be unique per reload; `--` produces a different but equally unique sequence, so every staleness comparison behaves identically
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
