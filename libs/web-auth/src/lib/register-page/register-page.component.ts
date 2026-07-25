import { Component, computed, inject, signal } from '@angular/core';
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';

import {
  HlmAlert,
  HlmButton,
  HlmFormField,
  HlmFormFieldControl,
  HlmFormFieldHint,
  HlmInput,
  HlmLabel,
  HlmSpinner,
} from '@learnwren/web-ui';

import { AuthService } from '../auth.service';
import {
  passwordPolicyValidator,
  PASSWORD_REQUIREMENT_PROSE,
  type PolicyRequirement,
} from '../password-policy.validator';

@Component({
  selector: 'app-register-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    HlmAlert,
    HlmButton,
    HlmFormField,
    HlmFormFieldControl,
    HlmFormFieldHint,
    HlmInput,
    HlmLabel,
    HlmSpinner,
  ],
  templateUrl: './register-page.component.html',
})
export class RegisterPageComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  readonly form = this.fb.nonNullable.group({
    displayName: ['', [Validators.required, Validators.maxLength(80)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, passwordPolicyValidator()]],
  });

  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  // Stryker disable next-line ObjectLiteral: the options object only supplies toSignal's initialValue; this signal's value is consumed solely via `void this.passwordStatus()` (a reactivity trigger), never read. Dropping initialValue (→ {}) merely changes the pre-first-emission value from '' to undefined, which is voided and never observable; equivalent.
  private readonly passwordStatus = toSignal(this.form.controls.password.valueChanges, {
    initialValue: this.form.controls.password.value,
  });

  readonly passwordHints = computed<string[]>(() => {
    void this.passwordStatus();
    const errors = this.form.controls.password.errors;
    const policy = errors?.['passwordPolicy'] as { unmet?: PolicyRequirement[] } | undefined;
    if (!policy?.unmet?.length) return [];
    return policy.unmet.map((r) => PASSWORD_REQUIREMENT_PROSE[r]);
  });

  async submit(): Promise<void> {
    if (this.form.invalid) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const result = await this.auth.register(this.form.getRawValue());
      if (result.ok) {
        await this.router.navigateByUrl(
          `/register/confirm?email=${encodeURIComponent(this.form.controls.email.value)}`,
        );
        return;
      }
      this.error.set(this.toMessage(result));
    } finally {
      this.busy.set(false);
    }
  }

  private toMessage(
    result: Extract<Awaited<ReturnType<AuthService['register']>>, { ok: false }>,
  ): string {
    if (result.code === 'EMAIL_ALREADY_EXISTS') {
      return 'Unable to complete registration. Please check your details.';
    }
    if (result.code === 'WEAK_PASSWORD') {
      const unmet = (result.details as { unmetRequirements?: PolicyRequirement[] } | undefined)
        ?.unmetRequirements;
      if (unmet?.length) {
        const list = unmet.map((r) => PASSWORD_REQUIREMENT_PROSE[r]).join('; ');
        return `Password must include: ${list}.`;
      }
    }
    if (result.code === 'INVALID_EMAIL') {
      return 'Please enter a valid email address.';
    }
    if (result.code === 'EMAIL_TOO_LONG') {
      return 'Email address must be 254 characters or fewer.';
    }
    if (result.code === 'INVALID_DISPLAY_NAME') {
      return 'Display name is required and must be 80 characters or fewer.';
    }
    if (result.code === 'PASSWORD_TOO_LONG') {
      return 'Password must be 256 characters or fewer.';
    }
    return 'Something went wrong. Please try again.';
  }
}
