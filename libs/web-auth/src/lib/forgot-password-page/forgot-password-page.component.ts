import { Component, inject, signal } from '@angular/core';
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { RouterLink } from '@angular/router';

import {
  HlmButton,
  HlmFormField,
  HlmFormFieldControl,
  HlmInput,
  HlmLabel,
  HlmSpinner,
} from '@learnwren/web-ui';

import { AuthService } from '../auth.service';

@Component({
  selector: 'app-forgot-password-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    HlmButton,
    HlmFormField,
    HlmFormFieldControl,
    HlmInput,
    HlmLabel,
    HlmSpinner,
  ],
  templateUrl: './forgot-password-page.component.html',
})
export class ForgotPasswordPageComponent {
  private readonly auth = inject(AuthService);
  private readonly fb = inject(FormBuilder);

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
  });

  readonly busy = signal(false);
  readonly submitted = signal(false);
  readonly sendFailed = signal(false);

  async submit(): Promise<void> {
    if (this.form.invalid) return;
    this.busy.set(true);
    this.sendFailed.set(false);
    try {
      await this.auth.requestPasswordReset(this.form.controls.email.value);
      this.submitted.set(true);
    } catch {
      // Throttled (429, keyed per email before any account lookup) or a
      // server/network failure: claiming "we've sent instructions" would have
      // the user wait for an email that is not coming.
      this.sendFailed.set(true);
    } finally {
      this.busy.set(false);
    }
  }
}
