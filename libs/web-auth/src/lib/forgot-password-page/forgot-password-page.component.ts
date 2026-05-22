import { Component, inject, signal } from '@angular/core';
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { RouterLink } from '@angular/router';

import { LwButtonDirective, LwInputDirective } from '@learnwren/web-ui';

import { AuthService } from '../auth.service';

@Component({
  selector: 'app-forgot-password-page',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, LwButtonDirective, LwInputDirective],
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

  async submit(): Promise<void> {
    if (this.form.invalid) return;
    this.busy.set(true);
    try {
      await this.auth.requestPasswordReset(this.form.controls.email.value).catch(() => undefined);
    } finally {
      this.busy.set(false);
      this.submitted.set(true);
    }
  }
}
