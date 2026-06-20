import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { AuthService } from '@learnwren/web-auth';
import { LwButtonDirective, LwInputDirective } from '@learnwren/web-ui';
import type {
  InstructorApplicationErrorBody,
  InstructorApplicationView,
} from '@learnwren/shared-data-models';

import { InstructorApplicationService } from './instructor-application.service';

type Status = 'idle' | 'submitting';

@Component({
  selector: 'lib-instructor-application',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, LwInputDirective, LwButtonDirective],
  templateUrl: './instructor-application.component.html',
})
export class InstructorApplicationComponent {
  private readonly fb = inject(FormBuilder);
  private readonly svc = inject(InstructorApplicationService);
  private readonly auth = inject(AuthService);

  /** Visible only to Students (ext 2a: instructors/admins never see the option). */
  readonly visible = computed(() => this.auth.currentUser()?.role === 'STUDENT');

  readonly application = signal<InstructorApplicationView | null>(null);
  readonly status = signal<Status>('idle');
  readonly formOpen = signal(false);
  readonly bannerError = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    statement: ['', [Validators.required]],
    expertise: ['', [Validators.required]],
  });

  readonly pending = computed(() => this.application()?.status === 'PENDING');

  constructor() {
    if (this.visible()) {
      void this.load();
    }
  }

  private async load(): Promise<void> {
    this.application.set(await this.svc.getApplication());
  }

  open(): void {
    this.formOpen.set(true);
  }

  async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.status.set('submitting');
    this.bannerError.set(null);
    try {
      const view = await this.svc.submit(this.form.getRawValue());
      this.application.set(view);
      this.formOpen.set(false);
      this.form.reset();
    } catch (err) {
      await this.applyServerError(err);
    } finally {
      this.status.set('idle');
    }
  }

  private async applyServerError(err: unknown): Promise<void> {
    if (!(err instanceof HttpErrorResponse)) {
      this.bannerError.set('Something went wrong. Please try again.');
      return;
    }
    const body = err.error as InstructorApplicationErrorBody | undefined;
    const code = body?.error?.code;
    const message = body?.error?.message ?? 'Could not submit your application.';
    if (code === 'INSTRUCTOR_APPLICATION_INVALID') {
      // Stryker disable next-line OptionalChaining: reached only when body?.error?.code === INVALID above, so body and body.error are provably non-null here — `body.error` ≡ `body?.error` and `body?.error.details` ≡ `body?.error?.details`.
      const field = body?.error?.details?.field;
      if (field === 'statement' || field === 'expertise') {
        this.form.controls[field].setErrors({ server: message });
        return;
      }
    }
    // EXISTS or ALREADY_INSTRUCTOR (e.g. a concurrent submission): banner + refresh state.
    this.bannerError.set(message);
    await this.load();
  }
}
