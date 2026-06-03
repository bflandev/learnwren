import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';

import { LwAvatarComponent } from '@learnwren/web-ui';
import type { AdminUserDetail } from '@learnwren/shared-data-models';

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

  private async load(uid: string): Promise<void> {
    this.loading.set(true);
    this.notFound.set(false);
    try {
      this.user.set(await this.svc.getDetail(uid));
    } catch (err) {
      const code = (err as { error?: { error?: { code?: string } } })?.error?.error?.code;
      if (code === 'USER_NOT_FOUND') {
        this.notFound.set(true);
      }
      this.user.set(undefined);
    } finally {
      this.loading.set(false);
    }
  }
}
