import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';

import { LwButtonDirective } from '@learnwren/web-ui';
import { AuthService } from '../auth.service';

@Component({
  selector: 'app-register-confirm-page',
  standalone: true,
  imports: [RouterLink, LwButtonDirective],
  templateUrl: './register-confirm-page.component.html',
})
export class RegisterConfirmPageComponent {
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);

  readonly busy = signal(false);
  readonly resentAt = signal<Date | null>(null);

  private readonly queryParams = toSignal(this.route.queryParamMap);
  readonly email = computed(() => this.queryParams()?.get('email') ?? '');

  readonly cooldownActive = computed(() => {
    const last = this.resentAt();
    if (!last) return false;
    return Date.now() - last.getTime() < 60_000;
  });

  async resend(): Promise<void> {
    const email = this.email();
    if (!email || this.cooldownActive()) return;
    this.busy.set(true);
    try {
      await this.auth.resendVerification(email);
      this.resentAt.set(new Date());
    } finally {
      this.busy.set(false);
    }
  }
}
