import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  OnInit,
  output,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { AuthService } from '@learnwren/web-auth';
import { ConfirmDialogService, HlmButton } from '@learnwren/web-ui';

import { EnrollmentService } from '../enrollment.service';

type PanelState = 'LOADING' | 'GUEST' | 'OWNER' | 'ENROLLABLE' | 'ENROLLED' | 'LOAD_ERROR';

@Component({
  selector: 'lib-course-enrollment-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HlmButton],
  templateUrl: './course-enrollment-panel.component.html',
})
export class CourseEnrollmentPanelComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly enrollments = inject(EnrollmentService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly confirmDialog = inject(ConfirmDialogService);

  readonly courseId = input.required<string>();

  // Fired after a successful enroll or unenroll, so a parent that derives
  // its own state from the enrollment status (course-detail-page renders
  // the "Start Learning" CTA off enrollmentStatus.enrollment.status) can
  // refresh in lockstep — otherwise it stays on whatever was returned at
  // page-load time and the CTA never appears post-enrol.
  readonly statusChanged = output<void>();

  readonly state = signal<PanelState>('LOADING');
  readonly completed = signal(false);
  readonly busy = signal(false);
  readonly actionError = signal<string | null>(null);

  // Guards against firing the auto-enroll POST twice when resolveStatus() runs
  // a second time before the `?enroll=1` param has been stripped (e.g. user
  // clicks Retry after a transient load error, or two resolveStatus calls
  // overlap). Plain field — not template-bound.
  private autoEnrollFired = false;

  async ngOnInit(): Promise<void> {
    // undefined (auth not yet resolved, e.g. in a unit test) or null (guest)
    // are both treated as guest — the app resolves auth before routes render.
    if (!this.auth.currentUser()) {
      this.state.set('GUEST');
      return;
    }
    await this.resolveStatus();
  }

  private async resolveStatus(): Promise<void> {
    try {
      const view = await this.enrollments.getEnrollmentStatus(this.courseId());
      this.completed.set(view.enrollment?.status === 'ACTIVE' && view.enrollment.completedAt != null);
      if (view.isOwner) {
        this.state.set('OWNER');
      } else if (view.enrollment?.status === 'ACTIVE') {
        this.state.set('ENROLLED');
      } else {
        this.state.set('ENROLLABLE');
        // Auto-enroll: fire the POST synchronously (before the current microtask
        // yields) so the HTTP request is in-flight before Angular's whenStable()
        // continuation runs in tests.  The .then() handles stripping the param.
        // Flip autoEnrollFired synchronously to prevent a second resolveStatus()
        // pass (e.g. via retry()) from firing a duplicate POST while the param
        // is still in the URL.
        if (
          !this.autoEnrollFired &&
          this.route.snapshot.queryParamMap.get('enroll') === '1'
        ) {
          this.autoEnrollFired = true;
          void this.enroll().then(() => {
            if (this.state() === 'ENROLLED') this.clearEnrollParam();
          });
        }
      }
    } catch {
      this.state.set('LOAD_ERROR');
    }
  }

  /** Guest Enroll click — go to login, return to this course with enroll=1. */
  goToLogin(): void {
    void this.router.navigate(['/login'], {
      queryParams: { redirect: `/catalog/${this.courseId()}?enroll=1` },
    });
  }

  async enroll(): Promise<void> {
    this.busy.set(true);
    this.actionError.set(null);
    try {
      await this.enrollments.enroll(this.courseId());
      this.state.set('ENROLLED');
      this.statusChanged.emit();
    } catch (err) {
      if (
        err instanceof HttpErrorResponse &&
        this.errorCode(err) === 'COURSE_NOT_AVAILABLE'
      ) {
        void this.router.navigate(['/catalog']);
        return;
      }
      this.actionError.set('Something went wrong. Please try again.');
    } finally {
      this.busy.set(false);
    }
  }

  /** "Leave course" click — route through the shared confirm dialog (E1 pattern). */
  async openConfirm(): Promise<void> {
    this.actionError.set(null);
    const confirmed = await this.confirmDialog.confirm({
      header: 'Leave this course?',
      message:
        'You will lose access to videos and materials immediately. Your progress will be ' +
        'saved for 90 days in case you re-enroll.',
      acceptLabel: 'Leave course',
      variant: 'destructive',
    });
    if (confirmed) await this.confirmLeave();
  }

  async confirmLeave(): Promise<void> {
    this.busy.set(true);
    this.actionError.set(null);
    try {
      await this.enrollments.unenroll(this.courseId());
      this.state.set('ENROLLABLE');
      this.completed.set(false);
      this.statusChanged.emit();
    } catch {
      this.actionError.set('Could not leave the course. Please try again.');
    } finally {
      this.busy.set(false);
    }
  }

  retry(): void {
    this.state.set('LOADING');
    void this.resolveStatus();
  }

  private clearEnrollParam(): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { enroll: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  private errorCode(err: HttpErrorResponse): string | undefined {
    return (err.error as { error?: { code?: string } } | null)?.error?.code;
  }
}
