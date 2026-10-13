import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';

import { AuthService } from '@learnwren/web-auth';

import { EmailChangeService } from '../email-change.service';

@Component({
  selector: 'lib-email-changed',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="mx-auto max-w-md px-6 py-16 text-center">
      <p class="text-ink-2">Finishing your email change…</p>
    </section>
  `,
})
export class EmailChangedComponent implements OnInit {
  private readonly emailSvc = inject(EmailChangeService);
  private readonly authSvc = inject(AuthService);
  private readonly router = inject(Router);

  async ngOnInit(): Promise<void> {
    try {
      const result = await this.emailSvc.confirm();
      if (result.changed) {
        await this.finishWithRelogin();
      } else {
        await this.router.navigate(['/settings/profile']);
      }
    } catch {
      // The email-action link already applied the change before landing here.
      // A 401 means the swap revoked this session; any other failure still
      // leaves the NEW address live, so the profile page (showing the old one
      // from the cookie) would mislead. Re-login either way — sign-in also
      // repairs the stored profile email.
      await this.finishWithRelogin();
    }
  }

  private async finishWithRelogin(): Promise<void> {
    await this.authSvc.logout();
    await this.router.navigate(['/login'], { queryParams: { emailChanged: 1 } });
  }
}
