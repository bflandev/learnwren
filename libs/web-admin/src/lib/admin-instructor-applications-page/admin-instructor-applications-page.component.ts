import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';

import {
  APPLICANT_NOT_VERIFIED,
  APPLICATION_NOT_FOUND,
  APPLICATION_NOT_PENDING,
  DECLINE_REASON_INVALID,
  DECLINE_REASON_MAX_LENGTH,
} from '@learnwren/shared-data-models';
import type {
  AdminInstructorApplicationView,
  InstructorApplicationStatus,
} from '@learnwren/shared-data-models';
import { HlmAlert, HlmButton, HlmInput, HlmSkeleton } from '@learnwren/web-ui';

import { AdminInstructorApplicationsService } from '../admin-instructor-applications.service';

@Component({
  selector: 'lib-admin-instructor-applications-page',
  standalone: true,
  imports: [DatePipe, HlmAlert, HlmButton, HlmInput, HlmSkeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './admin-instructor-applications-page.component.html',
})
export class AdminInstructorApplicationsPageComponent implements OnInit {
  private readonly svc = inject(AdminInstructorApplicationsService);

  readonly filters: readonly InstructorApplicationStatus[] = ['PENDING', 'APPROVED', 'DECLINED'];
  readonly reasonMaxLength = DECLINE_REASON_MAX_LENGTH;
  readonly filter = signal<InstructorApplicationStatus>('PENDING');
  readonly applications = signal<AdminInstructorApplicationView[]>([]);
  /** Row whose optional decline-reason form is open, if any. */
  readonly decliningUid = signal<string | null>(null);
  readonly declineReason = signal('');
  readonly loading = signal(true);
  readonly loadError = signal(false);
  readonly busy = signal<Set<string>>(new Set());
  private readonly errors = signal<Record<string, string>>({});
  private loadToken = 0;

  async ngOnInit(): Promise<void> {
    await this.reload();
  }

  /** Re-run the queue load after a failure. */
  retry(): Promise<void> {
    return this.reload();
  }

  /** Switch the list to another status. */
  show(status: InstructorApplicationStatus): Promise<void> {
    this.filter.set(status);
    this.cancelDecline();
    return this.reload();
  }

  private async reload(): Promise<void> {
    // Stryker disable next-line UpdateOperator: equivalent — any strictly monotonic counter (++ or --) yields a unique token per load.
    const token = ++this.loadToken;
    this.loading.set(true);
    this.loadError.set(false);
    try {
      const res = await this.svc.list(this.filter());
      if (token !== this.loadToken) return;
      this.applications.set(res.applications);
    } catch {
      if (token !== this.loadToken) return;
      // Without this catch a rejected load left the queue empty and rendered
      // "No pending applications." — a failed fetch reads as an empty queue.
      this.loadError.set(true);
    }
    this.loading.set(false);
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

  startDecline(uid: string): void {
    this.decliningUid.set(uid);
    this.declineReason.set('');
  }

  cancelDecline(): void {
    this.decliningUid.set(null);
    this.declineReason.set('');
  }

  onReasonInput(event: Event): void {
    this.declineReason.set((event.target as HTMLTextAreaElement).value);
  }

  async decline(uid: string): Promise<void> {
    const reason = this.declineReason().trim() || undefined;
    const ok = await this.resolve(uid, () => this.svc.decline(uid, reason));
    if (ok) this.cancelDecline();
  }

  private async resolve(uid: string, action: () => Promise<unknown>): Promise<boolean> {
    this.setBusy(uid, true);
    this.clearError(uid);
    try {
      await action();
      this.applications.update((rows) => rows.filter((r) => r.uid !== uid));
      return true;
    } catch (err) {
      this.errors.update((e) => ({ ...e, [uid]: this.messageFor(err) }));
      return false;
    } finally {
      this.setBusy(uid, false);
    }
  }

  private messageFor(err: unknown): string {
    const code = (err as { error?: { error?: { code?: string } } })?.error?.error?.code;
    if (code === APPLICANT_NOT_VERIFIED) {
      return 'Applicant must verify their email before approval.';
    }
    if (code === DECLINE_REASON_INVALID) {
      return `The reason must be ${DECLINE_REASON_MAX_LENGTH} characters or fewer.`;
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
