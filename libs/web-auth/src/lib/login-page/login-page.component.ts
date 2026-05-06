import { Component, computed, inject, signal } from '@angular/core';
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';

import { AuthService } from '../auth.service';

type LoginErrorState =
  | { kind: 'none' }
  | { kind: 'invalid' }
  | { kind: 'unverified'; resendSent: boolean }
  | { kind: 'locked'; unlockAvailableAt: string }
  | { kind: 'generic'; message: string };

@Component({
  selector: 'app-login-page',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
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
        await this.router.navigateByUrl('/dashboard');
        return;
      }
      this.errorState.set(this.toErrorState(result));
    } finally {
      this.busy.set(false);
    }
  }

  async resendVerification(): Promise<void> {
    const email = this.form.controls.email.value;
    if (!email) return;
    try {
      await this.auth.resendVerification(email);
      this.errorState.set({ kind: 'unverified', resendSent: true });
    } catch {
      this.errorState.set({ kind: 'generic', message: 'Could not send. Please try again.' });
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
