import { Component, computed, inject, signal } from '@angular/core';
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { toSignal } from '@angular/core/rxjs-interop';

import { AuthService } from '../auth.service';
import {
  passwordPolicyValidator,
  type PolicyRequirement,
} from '../password-policy.validator';
import type { ApiAuthErrorBody } from '../types/api-error';

const REQUIREMENT_PROSE: Record<PolicyRequirement, string> = {
  MIN_LENGTH: 'at least 12 characters',
  UPPERCASE: 'at least one uppercase letter',
  LOWERCASE: 'at least one lowercase letter',
  DIGIT: 'at least one digit',
  SPECIAL: 'at least one special character',
};

@Component({
  selector: 'app-register-page',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
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

  private readonly passwordStatus = toSignal(this.form.controls.password.valueChanges, {
    initialValue: this.form.controls.password.value,
  });

  readonly passwordHints = computed<string[]>(() => {
    void this.passwordStatus();
    const errors = this.form.controls.password.errors;
    const policy = errors?.['passwordPolicy'] as { unmet?: PolicyRequirement[] } | undefined;
    if (!policy?.unmet?.length) return [];
    return policy.unmet.map((r) => REQUIREMENT_PROSE[r]);
  });

  async submit(): Promise<void> {
    if (this.form.invalid) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.auth.register(this.form.getRawValue());
      await this.router.navigateByUrl('/dashboard');
    } catch (err) {
      this.error.set(this.toMessage(err));
    } finally {
      this.busy.set(false);
    }
  }

  private toMessage(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      const body = err.error as ApiAuthErrorBody | undefined;
      const code = body?.error?.code;
      if (code === 'EMAIL_ALREADY_EXISTS') {
        return 'Unable to complete registration. Please check your details.';
      }
      if (code === 'WEAK_PASSWORD') {
        const unmet = body?.error?.details?.unmetRequirements as PolicyRequirement[] | undefined;
        if (unmet?.length) {
          const list = unmet.map((r) => REQUIREMENT_PROSE[r]).join('; ');
          return `Password must include: ${list}.`;
        }
      }
      if (code === 'INVALID_EMAIL') return 'Please enter a valid email address.';
      if (code === 'INVALID_DISPLAY_NAME') {
        return 'Display name is required and must be 80 characters or fewer.';
      }
    }
    return 'Something went wrong. Please try again.';
  }
}
