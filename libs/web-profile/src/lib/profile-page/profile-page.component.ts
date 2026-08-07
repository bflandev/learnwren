import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Router } from '@angular/router';

import { AuthService, passwordPolicyValidator, PASSWORD_REQUIREMENT_PROSE } from '@learnwren/web-auth';
import type { PolicyRequirement } from '@learnwren/web-auth';
import {
  HlmAlert,
  HlmButton,
  HlmFormField,
  HlmFormFieldControl,
  HlmFormFieldError,
  HlmFormFieldHint,
  HlmInput,
  HlmLabel,
} from '@learnwren/web-ui';
import type { ProfileView, ProfileInvalidErrorBody, EmailChangeErrorBody, PasswordChangeErrorBody } from '@learnwren/shared-data-models';

import { ProfileService } from '../profile.service';
import { ProfilePictureUploaderComponent } from '../picture/profile-picture-uploader.component';
import { EmailChangeService } from '../email/email-change.service';
import { PasswordChangeService } from '../password/password-change.service';
import { InstructorApplicationComponent } from '../instructor-application/instructor-application.component';
import { CompletedCoursesComponent } from '../completed-courses/completed-courses.component';

type Status = 'idle' | 'saving' | 'saved' | 'error';
type EmailStatus = 'idle' | 'sending' | 'sent' | 'error';
type PasswordStatus = 'idle' | 'saving' | 'error';

function confirmMatchesValidator(control: AbstractControl): ValidationErrors | null {
  // Stryker disable next-line OptionalChaining: validator runs on the passwordForm group where 'newPassword' is a declared control, so get() never returns null — `?.value` ≡ `.value`.
  const np = control.get('newPassword')?.value;
  // Stryker disable next-line OptionalChaining: same group always declares 'confirmNewPassword', so get() never returns null — `?.value` ≡ `.value`.
  const cp = control.get('confirmNewPassword')?.value;
  return np && cp && np !== cp ? { confirmMismatch: true } : null;
}

@Component({
  selector: 'lib-profile-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    HlmAlert,
    HlmButton,
    HlmFormField,
    HlmFormFieldControl,
    HlmFormFieldError,
    HlmFormFieldHint,
    HlmInput,
    HlmLabel,
    ProfilePictureUploaderComponent,
    CompletedCoursesComponent,
    InstructorApplicationComponent,
  ],
  templateUrl: './profile-page.component.html',
})
export class ProfilePageComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly profileSvc = inject(ProfileService);
  private readonly authSvc = inject(AuthService);
  private readonly emailSvc = inject(EmailChangeService);
  private readonly router = inject(Router);
  private readonly passwordSvc = inject(PasswordChangeService);

  readonly form = this.fb.nonNullable.group({
    // `required` is intentionally omitted — empty-string validation is server-authoritative (see PROFILE_INVALID test).
    displayName: ['', [Validators.maxLength(80)]],
    biography: ['', [Validators.maxLength(1000)]],
  });

  readonly status = signal<Status>('idle');
  readonly readonly = signal<{ email: string; role: ProfileView['role'] } | null>(null);
  // Rendered as page-level text (not just the form's input value) so the
  // page has a visible confirmation of whose profile is loaded, independent
  // of the header's name chip (which is hidden below the `xl` breakpoint).
  readonly displayName = signal<string | null>(null);

  readonly loadingProfile = signal(true);
  readonly profileLoadError = signal(false);

  /**
   * Monotonic token: a slow first load resolving after a retry must not
   * overwrite the newer result (matches the admin-user-detail-page pattern).
   */
  private loadToken = 0;

  readonly emailForm = this.fb.nonNullable.group({
    // server is authoritative; email Validators give fast client feedback only
    newEmail: ['', [Validators.required, Validators.email]],
    currentPassword: ['', [Validators.required]],
  });

  readonly emailStatus = signal<EmailStatus>('idle');
  readonly emailFormOpen = signal(false);
  readonly pendingEmail = signal<string | null>(null);

  readonly passwordForm = this.fb.nonNullable.group(
    {
      currentPassword: ['', [Validators.required]],
      newPassword: ['', [Validators.required, passwordPolicyValidator()]],
      confirmNewPassword: ['', [Validators.required]],
    },
    { validators: [confirmMatchesValidator] },
  );

  readonly passwordStatus = signal<PasswordStatus>('idle');
  readonly passwordFormOpen = signal(false);
  readonly passwordBannerError = signal<string | null>(null);

  private readonly newPasswordValue = toSignal(
    this.passwordForm.controls.newPassword.valueChanges,
    // Stryker disable next-line ObjectLiteral: passwordHints only reads this signal for reactivity (`void this.newPasswordValue()`), never its value, so dropping initialValue (→ undefined) is unobservable.
    { initialValue: this.passwordForm.controls.newPassword.value },
  );

  readonly passwordHints = computed<string[]>(() => {
    void this.newPasswordValue();
    const policy = this.passwordForm.controls.newPassword.errors?.['passwordPolicy'] as
      | { unmet?: PolicyRequirement[] }
      | undefined;
    return policy?.unmet?.map((r) => PASSWORD_REQUIREMENT_PROSE[r]) ?? [];
  });

  toggleEmailForm(): void {
    this.emailFormOpen.update((v) => !v);
  }

  async submitEmailChange(): Promise<void> {
    if (this.emailForm.invalid) {
      this.emailForm.markAllAsTouched();
      return;
    }
    this.emailStatus.set('sending');
    const newEmail = this.emailForm.controls.newEmail.value;
    try {
      await this.emailSvc.requestChange(this.emailForm.getRawValue());
      this.pendingEmail.set(newEmail);
      this.emailStatus.set('sent');
      this.emailFormOpen.set(false);
      this.emailForm.reset();
    } catch (err) {
      this.applyEmailServerError(err);
      this.emailStatus.set('error');
    }
  }

  private applyEmailServerError(err: unknown): void {
    if (!(err instanceof HttpErrorResponse)) return;
    const body = err.error as EmailChangeErrorBody | undefined;
    const field = body?.error?.details?.field;
    const message = body?.error?.message ?? 'Could not change email.';
    if (field === 'newEmail' || field === 'currentPassword') {
      this.emailForm.controls[field].setErrors({ server: message });
    }
  }

  togglePasswordForm(): void {
    this.passwordFormOpen.update((v) => !v);
  }

  async submitPasswordChange(): Promise<void> {
    if (this.passwordForm.invalid) {
      this.passwordForm.markAllAsTouched();
      return;
    }
    this.passwordStatus.set('saving');
    this.passwordBannerError.set(null);
    const { currentPassword, newPassword } = this.passwordForm.getRawValue();
    try {
      await this.passwordSvc.change({ currentPassword, newPassword });
      // The server already revoked tokens + cleared the cookie; logout() is a
      // best-effort client-state clear (nulls currentUser), matching Slice C.
      await this.authSvc.logout();
      await this.router.navigate(['/login'], { queryParams: { passwordChanged: 1 } });
    } catch (err) {
      this.applyPasswordServerError(err);
      this.passwordStatus.set('error');
    }
  }

  private applyPasswordServerError(err: unknown): void {
    if (!(err instanceof HttpErrorResponse)) return;
    const body = err.error as PasswordChangeErrorBody | undefined;
    const code = body?.error?.code;
    const message = body?.error?.message ?? 'Could not change password.';
    if (code === 'CURRENT_PASSWORD_INVALID') {
      this.passwordForm.controls.currentPassword.setErrors({ server: message });
    } else if (code === 'NEW_PASSWORD_WEAK' || code === 'PASSWORD_UNCHANGED') {
      this.passwordForm.controls.newPassword.setErrors({ server: message });
    } else {
      this.passwordBannerError.set(message);
    }
  }

  ngOnInit(): void {
    void this.load();
  }

  /** Called by the template's retry button; also guards against re-entrancy. */
  retryLoad(): Promise<void> {
    return this.load();
  }

  private async load(): Promise<void> {
    // Stryker disable next-line UpdateOperator: loadToken's only consumers are `===`/`!==` staleness checks, which need distinct values, not a direction — `--` yields equally-distinct tokens.
    const token = ++this.loadToken;
    this.loadingProfile.set(true);
    this.profileLoadError.set(false);
    try {
      const me = await this.profileSvc.getProfile();
      if (token !== this.loadToken) return;
      this.form.setValue({ displayName: me.displayName, biography: me.biography });
      this.readonly.set({ email: me.email, role: me.role });
      this.displayName.set(me.displayName);
    } catch {
      if (token !== this.loadToken) return;
      this.profileLoadError.set(true);
    } finally {
      // Only the most recent load clears the spinner.
      if (token === this.loadToken) this.loadingProfile.set(false);
    }
  }

  async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.status.set('saving');
    try {
      const updated = await this.profileSvc.updateProfile(this.form.getRawValue());
      this.authSvc.setCurrentUser(updated);
      this.status.set('saved');
    } catch (err) {
      this.applyServerError(err);
      this.status.set('error');
    }
  }

  private applyServerError(err: unknown): void {
    if (!(err instanceof HttpErrorResponse) || err.status !== 400) return;
    const body = err.error as ProfileInvalidErrorBody | undefined;
    if (body?.error?.code !== 'PROFILE_INVALID' || !body.error.details) return;
    const { field, reason } = body.error.details;
    if (field === 'displayName' || field === 'biography') {
      this.form.controls[field].setErrors({ server: reason });
    }
  }
}
