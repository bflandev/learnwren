import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';

import type { EmailActionMode } from '@learnwren/shared-data-models';
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

import { AuthService, type EmailActionResult } from '../auth.service';
import {
  passwordPolicyValidator,
  PASSWORD_REQUIREMENT_PROSE,
  type PolicyRequirement,
} from '../password-policy.validator';

type ActionState =
  | { kind: 'invalid' }
  | { kind: 'pending' }
  | { kind: 'verified' }
  | { kind: 'taken' }
  | { kind: 'error' }
  | { kind: 'resetForm' };

const EMAIL_ACTION_MODES: readonly EmailActionMode[] = [
  'verify-email',
  'reset-password',
  'change-email',
];

function isEmailActionMode(value: string | null): value is EmailActionMode {
  return (EMAIL_ACTION_MODES as readonly string[]).includes(value ?? '');
}

@Component({
  selector: 'app-email-action-page',
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
  templateUrl: './email-action-page.component.html',
})
export class EmailActionPageComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  private mode: EmailActionMode | null = null;
  private token = '';

  readonly state = signal<ActionState>({ kind: 'pending' });

  readonly form = this.fb.nonNullable.group({
    password: ['', [Validators.required, passwordPolicyValidator()]],
  });

  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  // Stryker disable next-line ObjectLiteral: see register-page.component.ts — initialValue
  // only seeds the pre-first-emission value, which is voided below, never observed.
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

  async ngOnInit(): Promise<void> {
    const mode = this.route.snapshot.queryParamMap.get('mode');
    const token = this.route.snapshot.queryParamMap.get('token');
    if (!token || !isEmailActionMode(mode)) {
      this.state.set({ kind: 'invalid' });
      return;
    }
    this.mode = mode;
    this.token = token;

    if (mode === 'reset-password') {
      this.state.set({ kind: 'resetForm' });
      return;
    }

    // Already 'pending' from the signal's initial value — don't re-set it
    // here, or a second Angular-driven ngOnInit call (its own first change
    // detection cycle) would clobber a state this same call already
    // resolved to by the time it runs again.
    const result = await this.auth.applyEmailAction(mode, token);
    if (result.ok) {
      if (mode === 'verify-email') {
        this.state.set({ kind: 'verified' });
      } else {
        await this.router.navigateByUrl('/settings/profile/email-changed');
      }
      return;
    }
    this.state.set(this.toErrorState(mode, result));
  }

  async submit(): Promise<void> {
    if (this.form.invalid || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const result = await this.auth.applyEmailAction(
        'reset-password',
        this.token,
        this.form.getRawValue().password,
      );
      if (result.ok) {
        await this.router.navigateByUrl('/login?reset=ok');
        return;
      }
      if (result.code === 'TOKEN_INVALID_OR_EXPIRED') {
        this.state.set({ kind: 'invalid' });
        return;
      }
      this.error.set(this.toMessage(result));
    } finally {
      this.busy.set(false);
    }
  }

  private toErrorState(mode: EmailActionMode, result: Extract<EmailActionResult, { ok: false }>): ActionState {
    if (result.code === 'TOKEN_INVALID_OR_EXPIRED') return { kind: 'invalid' };
    if (mode === 'change-email' && result.code === 'EMAIL_ALREADY_EXISTS') return { kind: 'taken' };
    return { kind: 'error' };
  }

  private toMessage(result: Extract<EmailActionResult, { ok: false }>): string {
    if (result.code === 'WEAK_PASSWORD' && result.unmet?.length) {
      const list = result.unmet
        .map((r) => PASSWORD_REQUIREMENT_PROSE[r as PolicyRequirement] ?? r)
        .join('; ');
      return `Password must include: ${list}.`;
    }
    if (result.code === 'PASSWORD_TOO_LONG') {
      return 'Password must be 256 characters or fewer.';
    }
    return 'Something went wrong. Please try again.';
  }
}
