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
import { LwButtonDirective } from '@learnwren/web-ui';

import { EnrollmentService } from '../enrollment.service';

type PanelState = 'LOADING' | 'GUEST' | 'OWNER' | 'ENROLLABLE' | 'ENROLLED' | 'LOAD_ERROR';

@Component({
  selector: 'lib-course-enrollment-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LwButtonDirective],
  templateUrl: './course-enrollment-panel.component.html',
})
export class CourseEnrollmentPanelComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly enrollments = inject(EnrollmentService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly courseId = input.required<string>();

  // Fired after a successful enroll or unenroll, so a parent that derives
  // its own state from the enrollment status (course-detail-page renders
  // the "Start Learning" CTA off enrollmentStatus.enrollment.status) can
  // refresh in lockstep — otherwise it stays on whatever was returned at
  // page-load time and the CTA never appears post-enrol.
  readonly statusChanged = output<void>();

  readonly state = signal<PanelState>('LOADING');
  readonly busy = signal(false);
  readonly actionError = signal<string | null>(null);
  readonly showConfirm = signal(false);

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
      if (view.isOwner) {
        this.state.set('OWNER');
      } else if (view.enrollment?.status === 'ACTIVE') {
        this.state.set('ENROLLED');
      } else {
        this.state.set('ENROLLABLE');
        // Auto-enroll: fire the POST synchronously (before the current microtask
        // yields) so the HTTP request is in-flight before Angular's whenStable()
        // continuation runs in tests.  The .then() handles stripping the param.
        if (this.route.snapshot.queryParamMap.get('enroll') === '1') {
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

  openConfirm(): void {
    this.actionError.set(null);
    this.showConfirm.set(true);
  }

  cancelConfirm(): void {
    this.showConfirm.set(false);
  }

  async confirmLeave(): Promise<void> {
    this.busy.set(true);
    this.actionError.set(null);
    try {
      await this.enrollments.unenroll(this.courseId());
      this.showConfirm.set(false);
      this.state.set('ENROLLABLE');
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
