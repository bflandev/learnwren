import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';

import { HlmAlert, HlmButton, HlmSpinner } from '@learnwren/web-ui';
import { AuthService } from '../auth.service';
import { safeRedirectParam } from '../safe-redirect';

const RESEND_COOLDOWN_MS = 60_000;

@Component({
  selector: 'app-register-confirm-page',
  standalone: true,
  imports: [RouterLink, HlmAlert, HlmButton, HlmSpinner],
  templateUrl: './register-confirm-page.component.html',
})
export class RegisterConfirmPageComponent {
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly busy = signal(false);
  readonly resentAt = signal<Date | null>(null);
  readonly resendError = signal(false);
  readonly cooldownActive = signal(false);

  private cooldownTimer: ReturnType<typeof setTimeout> | undefined;

  private readonly queryParams = toSignal(this.route.queryParamMap);
  readonly email = computed(() => this.queryParams()?.get('email') ?? '');
  /** Where the guest was headed (e.g. a course they clicked Enroll on), else the dashboard. */
  private readonly redirect = computed(() => safeRedirectParam(this.queryParams()));
  readonly continueTo = computed(() => this.router.parseUrl(this.redirect() ?? '/dashboard'));
  readonly continueLabel = computed(() => (this.redirect() ? 'Continue' : 'Continue to dashboard'));

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.cooldownTimer));
  }

  async resend(): Promise<void> {
    const email = this.email();
    if (!email || this.busy() || this.cooldownActive()) return;
    this.busy.set(true);
    this.resendError.set(false);
    try {
      await this.auth.resendVerification(email);
      this.resentAt.set(new Date());
      this.startCooldown();
    } catch {
      this.resendError.set(true);
    } finally {
      this.busy.set(false);
    }
  }

  private startCooldown(): void {
    this.cooldownActive.set(true);
    this.cooldownTimer = setTimeout(
      () => this.cooldownActive.set(false),
      RESEND_COOLDOWN_MS,
    );
  }
}
