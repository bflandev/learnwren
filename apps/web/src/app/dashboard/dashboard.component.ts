import { Component, inject } from '@angular/core';

import { AuthService } from '@learnwren/web-auth';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [],
  template: `
    <section class="mx-auto mt-12 max-w-2xl rounded border border-slate-200 bg-white p-6">
      <h1 class="text-2xl font-semibold mb-4">Welcome, {{ displayName() }}</h1>
      <p class="text-slate-700 mb-4">
        Your role is <strong>{{ role() }}</strong>.
      </p>
      <button
        type="button"
        class="rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white"
        (click)="logout()"
      >
        Sign out
      </button>
    </section>
  `,
})
export class DashboardComponent {
  private readonly auth = inject(AuthService);
  protected readonly displayName = () => this.auth.currentUser()?.displayName ?? '';
  protected readonly role = () => this.auth.currentUser()?.role ?? '';

  async logout(): Promise<void> {
    await this.auth.logout();
    window.location.assign('/login');
  }
}
