import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';

import { LwAvatarComponent } from '@learnwren/web-ui';
import type { AdminUserDetail, AdminUserRoleResponse } from '@learnwren/shared-data-models';

import { AdminUsersService } from '../admin-users.service';

@Component({
  selector: 'lib-admin-user-detail-page',
  standalone: true,
  imports: [DatePipe, RouterLink, LwAvatarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './admin-user-detail-page.component.html',
})
export class AdminUserDetailPageComponent implements OnInit, OnDestroy {
  private readonly svc = inject(AdminUsersService);
  private readonly route = inject(ActivatedRoute);

  readonly user = signal<AdminUserDetail | undefined>(undefined);
  readonly loading = signal(true);
  readonly notFound = signal(false);
  readonly busy = signal(false);
  readonly actionError = signal<string | undefined>(undefined);
  readonly actionSuccess = signal<string | undefined>(undefined);
  readonly confirmingDemote = signal(false);

  /**
   * Monotonic token identifying the most recent load(). getDetail is a
   * non-cancellable Promise, so a slow earlier request can resolve AFTER a newer
   * one (rapid navigation between users). Discarding any result whose token is
   * stale stops an old user's response overwriting the current one.
   */
  private loadToken = 0;
  private sub?: Subscription;

  ngOnInit(): void {
    this.sub = this.route.paramMap.subscribe((params) => {
      const uid = params.get('uid');
      if (uid) void this.load(uid);
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  startDemote(): void {
    this.actionError.set(undefined);
    this.actionSuccess.set(undefined);
    this.confirmingDemote.set(true);
  }

  cancelDemote(): void {
    this.confirmingDemote.set(false);
  }

  async promote(): Promise<void> {
    await this.changeRole(() => this.svc.promote(this.user()!.id), 'Promoted to Instructor.');
  }

  async confirmDemote(): Promise<void> {
    await this.changeRole(() => this.svc.demote(this.user()!.id), 'Demoted to Student.');
  }

  private async changeRole(
    action: () => Promise<AdminUserRoleResponse>,
    successMsg: string,
  ): Promise<void> {
    this.busy.set(true);
    this.actionError.set(undefined);
    this.actionSuccess.set(undefined);
    try {
      const res = await action();
      this.user.update((u) => (u ? { ...u, role: res.role } : u));
      this.confirmingDemote.set(false);
      this.actionSuccess.set(successMsg);
    } catch (err) {
      this.actionError.set(this.messageFor(err));
    } finally {
      this.busy.set(false);
    }
  }

  private messageFor(err: unknown): string {
    const code = (err as { error?: { error?: { code?: string } } })?.error?.error?.code;
    if (code === 'INVALID_ROLE_TRANSITION') {
      return "This user's role changed elsewhere. Refresh to see the current role.";
    }
    if (code === 'USER_NOT_FOUND') {
      return 'This user no longer exists.';
    }
    return 'Something went wrong. Please try again.';
  }

  private async load(uid: string): Promise<void> {
    // Clear the previous user's action banners / open confirm before the await
    // so they never linger on the incoming user's detail view.
    this.actionSuccess.set(undefined);
    this.actionError.set(undefined);
    this.confirmingDemote.set(false);
    const token = ++this.loadToken;
    this.loading.set(true);
    this.notFound.set(false);
    try {
      const detail = await this.svc.getDetail(uid);
      if (token !== this.loadToken) return; // superseded by a newer load
      this.user.set(detail);
    } catch (err) {
      if (token !== this.loadToken) return; // superseded by a newer load
      const code = (err as { error?: { error?: { code?: string } } })?.error?.error?.code;
      if (code === 'USER_NOT_FOUND') {
        this.notFound.set(true);
      }
      this.user.set(undefined);
    } finally {
      // Only the most recent load clears the spinner; a superseded stale call
      // must not flip loading off while the current request is still in flight.
      if (token === this.loadToken) this.loading.set(false);
    }
  }
}
