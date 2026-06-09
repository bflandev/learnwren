import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';

import {
  APPLICANT_NOT_VERIFIED,
  APPLICATION_NOT_FOUND,
  APPLICATION_NOT_PENDING,
} from '@learnwren/shared-data-models';
import type { PendingInstructorApplicationView } from '@learnwren/shared-data-models';

import { AdminInstructorApplicationsService } from '../admin-instructor-applications.service';

@Component({
  selector: 'lib-admin-instructor-applications-page',
  standalone: true,
  imports: [DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './admin-instructor-applications-page.component.html',
})
export class AdminInstructorApplicationsPageComponent implements OnInit {
  private readonly svc = inject(AdminInstructorApplicationsService);

  readonly applications = signal<PendingInstructorApplicationView[]>([]);
  readonly loading = signal(true);
  readonly loadError = signal(false);
  readonly busy = signal<Set<string>>(new Set());
  private readonly errors = signal<Record<string, string>>({});

  async ngOnInit(): Promise<void> {
    await this.reload();
  }

  /** Re-run the queue load after a failure. */
  retry(): Promise<void> {
    return this.reload();
  }

  private async reload(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(false);
    try {
      const res = await this.svc.list();
      this.applications.set(res.applications);
    } catch {
      // Without this catch a rejected load left the queue empty and rendered
      // "No pending applications." — a failed fetch reads as an empty queue.
      this.loadError.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  isBusy(uid: string): boolean {
    return this.busy().has(uid);
  }

  rowError(uid: string): string | undefined {
    return this.errors()[uid];
  }

  async approve(uid: string): Promise<void> {
    await this.resolve(uid, () => this.svc.approve(uid));
  }

  async decline(uid: string): Promise<void> {
    await this.resolve(uid, () => this.svc.decline(uid));
  }

  private async resolve(uid: string, action: () => Promise<unknown>): Promise<void> {
    this.setBusy(uid, true);
    this.clearError(uid);
    try {
      await action();
      this.applications.update((rows) => rows.filter((r) => r.uid !== uid));
    } catch (err) {
      this.errors.update((e) => ({ ...e, [uid]: this.messageFor(err) }));
    } finally {
      this.setBusy(uid, false);
    }
  }

  private messageFor(err: unknown): string {
    const code = (err as { error?: { error?: { code?: string } } })?.error?.error?.code;
    if (code === APPLICANT_NOT_VERIFIED) {
      return 'Applicant must verify their email before approval.';
    }
    if (code === APPLICATION_NOT_PENDING || code === APPLICATION_NOT_FOUND) {
      return 'This application is no longer pending. Refresh to update the queue.';
    }
    return 'Something went wrong. Please try again.';
  }

  private setBusy(uid: string, on: boolean): void {
    this.busy.update((s) => {
      const next = new Set(s);
      if (on) next.add(uid);
      else next.delete(uid);
      return next;
    });
  }

  private clearError(uid: string): void {
    this.errors.update((e) => {
      const next = { ...e };
      delete next[uid];
      return next;
    });
  }
}
