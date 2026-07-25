import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';

import {
  HlmAvatar,
  HlmBadge,
  HlmButton,
  HlmSkeleton,
  avatarToneFor,
  deriveInitials,
} from '@learnwren/web-ui';
import type { AdminUserDetail, AdminUserRoleResponse, AdminUserStatusResponse } from '@learnwren/shared-data-models';

import { AdminUsersService } from '../admin-users.service';

@Component({
  selector: 'lib-admin-user-detail-page',
  standalone: true,
  imports: [DatePipe, RouterLink, HlmAvatar, HlmBadge, HlmButton, HlmSkeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './admin-user-detail-page.component.html',
})
export class AdminUserDetailPageComponent implements OnInit, OnDestroy {
  private readonly svc = inject(AdminUsersService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly user = signal<AdminUserDetail | undefined>(undefined);
  readonly loading = signal(true);
  readonly notFound = signal(false);
  readonly busy = signal(false);
  readonly actionError = signal<string | undefined>(undefined);
  readonly actionSuccess = signal<string | undefined>(undefined);
  readonly confirmingDemote = signal(false);
  readonly confirmingDelete = signal(false);

  /**
   * Monotonic token identifying the most recent load(). getDetail is a
   * non-cancellable Promise, so a slow earlier request can resolve AFTER a newer
   * one (rapid navigation between users). Discarding any result whose token is
   * stale stops an old user's response overwriting the current one.
   */
  private loadToken = 0;
  private sub?: Subscription;

  protected avatarTone(u: AdminUserDetail): string {
    return avatarToneFor(u.id);
  }

  protected avatarInitials(u: AdminUserDetail): string {
    return deriveInitials(u.displayName);
  }

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

  startDelete(): void {
    this.actionError.set(undefined);
    this.actionSuccess.set(undefined);
    this.confirmingDelete.set(true);
  }

  cancelDelete(): void {
    this.confirmingDelete.set(false);
  }

  async promote(): Promise<void> {
    await this.changeRole(() => this.svc.promote(this.user()!.id), 'Promoted to Instructor.');
  }

  async confirmDemote(): Promise<void> {
    await this.changeRole(() => this.svc.demote(this.user()!.id), 'Demoted to Student.');
  }

  async suspend(): Promise<void> {
    await this.changeStatus(() => this.svc.suspend(this.user()!.id), 'User suspended.');
  }

  async unsuspend(): Promise<void> {
    await this.changeStatus(() => this.svc.unsuspend(this.user()!.id), 'User unsuspended.');
  }

  async confirmDelete(): Promise<void> {
    this.busy.set(true);
    this.actionError.set(undefined);
    this.actionSuccess.set(undefined);
    this.confirmingDelete.set(false);
    try {
      await this.svc.deleteUser(this.user()!.id);
      await this.router.navigate(['/admin/users'], { state: { deleted: true } });
    } catch (err) {
      this.actionError.set(this.messageFor(err));
    } finally {
      this.busy.set(false);
    }
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

  private async changeStatus(
    action: () => Promise<AdminUserStatusResponse>,
    successMsg: string,
  ): Promise<void> {
    this.busy.set(true);
    this.actionError.set(undefined);
    this.actionSuccess.set(undefined);
    try {
      const res = await action();
      this.user.update((u) => (u ? { ...u, status: res.status } : u));
      this.actionSuccess.set(successMsg);
    } catch (err) {
      this.actionError.set(this.messageFor(err));
    } finally {
      this.busy.set(false);
    }
  }

  private messageFor(err: unknown): string {
    const body = (err as { error?: { error?: { code?: string; details?: Record<string, unknown> } } })?.error?.error;
    const code = body?.code;
    if (code === 'INVALID_ROLE_TRANSITION' || code === 'INVALID_STATUS_TRANSITION') {
      return "This user's status changed elsewhere. Refresh to see the current state.";
    }
    if (code === 'USER_NOT_FOUND') {
      return 'This user no longer exists.';
    }
    if (code === 'CANNOT_ACT_ON_SELF') {
      return 'You cannot perform this action on yourself.';
    }
    if (code === 'LAST_ADMIN') {
      return 'Cannot perform this action: this user is the last admin.';
    }
    if (code === 'USER_HAS_COURSES') {
      // Stryker disable next-line OptionalChaining: equivalent — this branch is only reached when code === 'USER_HAS_COURSES', which requires body?.code to be set, so body is provably non-null here; the `body?.details` guard can never short-circuit and removing it is unobservable.
      const count = body?.details?.['courseCount'];
      // Action-neutral: USER_HAS_COURSES blocks both delete AND demote.
      return `This user owns ${count ?? 'one or more'} course(s). Transfer or delete their courses first.`;
    }
    return 'Something went wrong. Please try again.';
  }

  private async load(uid: string): Promise<void> {
    // Clear the previous user's action banners / open confirm before the await
    // so they never linger on the incoming user's detail view.
    this.actionSuccess.set(undefined);
    this.actionError.set(undefined);
    this.confirmingDemote.set(false);
    this.confirmingDelete.set(false);
    // Stryker disable next-line UpdateOperator: equivalent — ++ and -- both yield a unique monotonic token; the only consumer is the `token !== this.loadToken` staleness check, which is unaffected by direction.
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
