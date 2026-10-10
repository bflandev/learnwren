import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';

import { AuthService } from '@learnwren/web-auth';
import {
  HlmAlert,
  HlmButton,
  HlmFormField,
  HlmFormFieldControl,
  HlmFormFieldError,
  HlmInput,
  HlmLabel,
} from '@learnwren/web-ui';

import { DeleteAccountService } from './delete-account.service';

/** The word the user must type to confirm. */
export const DELETE_CONFIRMATION_WORD = 'DELETE';

const GENERIC_ERROR = 'Could not delete your account. Please try again.';

// The shared delete's messages are written for an admin acting on someone
// else; these two say the same thing to the account owner.
const FIRST_PERSON_ERRORS = new Map<string | undefined, string>([
  [
    'USER_HAS_COURSES',
    'You still own courses. Delete them before deleting your account.',
  ],
  [
    'LAST_ADMIN',
    'You are the only active administrator. Promote another administrator before deleting your account.',
  ],
]);

@Component({
  selector: 'lib-delete-account',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    HlmAlert,
    HlmButton,
    HlmFormField,
    HlmFormFieldControl,
    HlmFormFieldError,
    HlmInput,
    HlmLabel,
  ],
  templateUrl: './delete-account.component.html',
})
export class DeleteAccountComponent {
  private readonly fb = inject(FormBuilder);
  private readonly svc = inject(DeleteAccountService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly confirmationWord = DELETE_CONFIRMATION_WORD;
  readonly formOpen = signal(false);
  readonly status = signal<'idle' | 'deleting'>('idle');
  readonly bannerError = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    currentPassword: ['', [Validators.required]],
    confirmation: ['', [Validators.required, Validators.pattern(`^${DELETE_CONFIRMATION_WORD}$`)]],
  });

  toggleForm(): void {
    this.formOpen.update((v) => !v);
  }

  async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.status.set('deleting');
    this.bannerError.set(null);
    try {
      await this.svc.deleteAccount({ currentPassword: this.form.getRawValue().currentPassword });
    } catch (err) {
      this.applyServerError(err);
      this.status.set('idle');
      return;
    }
    // The server already revoked sessions and cleared the cookie; logout()
    // just clears client state, as after a password change.
    await this.auth.logout();
    await this.router.navigate(['/login'], { queryParams: { accountDeleted: 1 } });
  }

  private applyServerError(err: unknown): void {
    const body = err instanceof HttpErrorResponse
      ? (err.error as { error?: { code?: string; message?: string } } | null)
      : null;
    const code = body?.error?.code;
    const message = body?.error?.message ?? GENERIC_ERROR;
    if (code === 'CURRENT_PASSWORD_INVALID') {
      this.form.controls.currentPassword.setErrors({ server: message });
      this.form.controls.currentPassword.markAsTouched();
      return;
    }
    this.bannerError.set(FIRST_PERSON_ERRORS.get(code) ?? message);
  }
}
