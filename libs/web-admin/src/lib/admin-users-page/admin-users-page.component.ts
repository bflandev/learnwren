import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';

import type { AdminUserListRow } from '@learnwren/shared-data-models';

import { AdminUsersService } from '../admin-users.service';

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 300;

@Component({
  selector: 'lib-admin-users-page',
  standalone: true,
  imports: [DatePipe, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './admin-users-page.component.html',
})
export class AdminUsersPageComponent implements OnInit, OnDestroy {
  private readonly svc = inject(AdminUsersService);

  readonly users = signal<AdminUserListRow[]>([]);
  readonly total = signal(0);
  readonly page = signal(1);
  readonly capped = signal(false);
  readonly loading = signal(true);
  readonly search = signal('');

  readonly pageSize = PAGE_SIZE;
  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.total() / PAGE_SIZE)));

  private searchTimer: ReturnType<typeof setTimeout> | undefined;

  async ngOnInit(): Promise<void> {
    await this.reload();
  }

  ngOnDestroy(): void {
    if (this.searchTimer) clearTimeout(this.searchTimer);
  }

  canPrev(): boolean {
    return this.page() > 1;
  }

  canNext(): boolean {
    return this.page() < this.totalPages();
  }

  onSearchInput(value: string): void {
    this.search.set(value);
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => {
      this.page.set(1);
      void this.reload();
    }, SEARCH_DEBOUNCE_MS);
  }

  async goToPage(page: number): Promise<void> {
    if (page < 1 || page > this.totalPages()) return;
    this.page.set(page);
    await this.reload();
  }

  private async reload(): Promise<void> {
    this.loading.set(true);
    try {
      const res = await this.svc.list(this.search(), this.page(), PAGE_SIZE);
      this.users.set(res.users);
      this.total.set(res.total);
      this.capped.set(res.capped);
    } finally {
      this.loading.set(false);
    }
  }
}
