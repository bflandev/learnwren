import { Component, computed, inject, signal } from '@angular/core';
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';

import {
  HlmAlert,
  HlmButton,
  HlmFormField,
  HlmFormFieldControl,
  HlmInput,
  HlmLabel,
  HlmSpinner,
} from '@learnwren/web-ui';

import { AuthService } from '../auth.service';

type LoginErrorState =
  | { kind: 'none' }
  | { kind: 'invalid' }
  | { kind: 'unverified'; resendSent: boolean }
  | { kind: 'locked'; unlockAvailableAt: string }
  | { kind: 'generic'; message: string };

/**
 * Accept only same-origin path redirects. Rejects:
 *   - Empty strings
 *   - Anything not starting with `/`
 *   - Protocol-relative URLs (`//evil.com/...`)
 *   - Backslash-after-slash variants browsers may also treat as protocol-relative (`/\evil.com`)
 * A bare `/` is accepted (root) because the second char is `undefined`.
 *
 * Note: Unicode lookalike slashes (U+2215 DIVISION SLASH, U+FF0F FULLWIDTH SOLIDUS)
 * are intentionally not handled — the router treats them as literal path characters,
 * so they are not a browser-redirect threat.
 */
function isSafeRedirect(r: string): boolean {
  // Stryker disable next-line ConditionalExpression,EqualityOperator: `r.length > 0` is fully implied by the next clause — String.prototype.startsWith('/') can only return true when r has length >= 1, so an empty string is already rejected by `r.startsWith('/')`. Forcing this clause to `true` (or `>= 0`) leaves the overall conjunction's value unchanged for every input; equivalent.
  return r.length > 0 && r.startsWith('/') && r[1] !== '/' && r[1] !== '\\';
}

@Component({
  selector: 'app-login-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    HlmAlert,
    HlmButton,
    HlmFormField,
    HlmFormFieldControl,
    HlmInput,
    HlmLabel,
    HlmSpinner,
  ],
  templateUrl: './login-page.component.html',
})
export class LoginPageComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });

  readonly busy = signal(false);
  readonly errorState = signal<LoginErrorState>({ kind: 'none' });

  private readonly queryParams = toSignal(this.route.queryParamMap);

  readonly justResetPassword = computed(() => this.queryParams()?.get('reset') === 'ok');
  readonly justChangedEmail = computed(() => this.queryParams()?.get('emailChanged') === '1');
  readonly justChangedPassword = computed(() => this.queryParams()?.get('passwordChanged') === '1');

  readonly unverifiedState = computed(() => {
    const s = this.errorState();
    return s.kind === 'unverified' ? s : null;
  });

  readonly lockedState = computed(() => {
    const s = this.errorState();
    return s.kind === 'locked' ? s : null;
  });

  readonly genericState = computed(() => {
    const s = this.errorState();
    return s.kind === 'generic' ? s : null;
  });

  async submit(): Promise<void> {
    if (this.form.invalid) return;
    this.busy.set(true);
    this.errorState.set({ kind: 'none' });
    try {
      const result = await this.auth.login(
        this.form.controls.email.value,
        this.form.controls.password.value,
      );
      if (result.ok) {
        const redirect = this.queryParams()?.get('redirect');
        const target = redirect && isSafeRedirect(redirect) ? redirect : '/dashboard';
        await this.router.navigateByUrl(target);
        return;
      }
      this.errorState.set(this.toErrorState(result));
    } finally {
      this.busy.set(false);
    }
  }

  async resendVerification(): Promise<void> {
    const email = this.form.controls.email.value;
    if (!email || this.busy()) return;
    this.busy.set(true);
    try {
      await this.auth.resendVerification(email);
      this.errorState.set({ kind: 'unverified', resendSent: true });
    } catch {
      this.errorState.set({ kind: 'generic', message: 'Could not send. Please try again.' });
    } finally {
      this.busy.set(false);
    }
  }

  unlockAvailableAtLocal(iso: string): string {
    return new Date(iso).toLocaleTimeString();
  }

  private toErrorState(result: Extract<Awaited<ReturnType<AuthService['login']>>, { ok: false }>): LoginErrorState {
    if (result.code === 'INVALID_CREDENTIALS') return { kind: 'invalid' };
    if (result.code === 'EMAIL_NOT_VERIFIED') return { kind: 'unverified', resendSent: false };
    if (result.code === 'ACCOUNT_LOCKED') {
      const unlockAvailableAt = String(
        (result.details as { unlockAvailableAt?: string } | undefined)?.unlockAvailableAt ?? '',
      );
      return { kind: 'locked', unlockAvailableAt };
    }
    return { kind: 'generic', message: 'Something went wrong. Please try again.' };
  }
}
