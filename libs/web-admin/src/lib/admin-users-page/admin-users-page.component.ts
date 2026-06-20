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
  readonly error = signal(false);
  readonly search = signal('');

  readonly pageSize = PAGE_SIZE;
  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.total() / PAGE_SIZE)));

  /**
   * Monotonic token identifying the most recent reload(). A slow page-1 request
   * can resolve after a page-2 request that was issued later; discarding any
   * result whose token is stale stops old data overwriting the current view.
   */
  private loadToken = 0;
  private searchTimer: ReturnType<typeof setTimeout> | undefined;

  async ngOnInit(): Promise<void> {
    await this.reload();
  }

  ngOnDestroy(): void {
    // Stryker disable next-line ConditionalExpression: equivalent — when searchTimer is undefined, clearTimeout(undefined) is a no-op, so the guard vs. always-clearing is unobservable.
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
    // Stryker disable next-line ConditionalExpression: equivalent — when searchTimer is undefined, clearTimeout(undefined) is a no-op, so the guard vs. always-clearing is unobservable.
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

  /** Re-run the current query after a load failure. */
  retry(): Promise<void> {
    return this.reload();
  }

  private async reload(): Promise<void> {
    // Stryker disable next-line UpdateOperator: equivalent — ++ and -- both yield a unique monotonic token; the only consumer is the `token !== this.loadToken` staleness check, which is unaffected by direction.
    const token = ++this.loadToken;
    this.loading.set(true);
    this.error.set(false);
    try {
      const res = await this.svc.list(this.search(), this.page(), PAGE_SIZE);
      if (token !== this.loadToken) return; // superseded by a newer reload
      this.users.set(res.users);
      this.total.set(res.total);
      this.capped.set(res.capped);
    } catch {
      if (token !== this.loadToken) return; // superseded by a newer reload
      // Without this, a rejected load leaves users() empty and the template
      // renders the empty state — a failed fetch reads as "no users exist".
      this.error.set(true);
    } finally {
      // Only the most recent reload clears the spinner; a superseded stale call
      // must not flip loading off while the current request is still in flight.
      if (token === this.loadToken) this.loading.set(false);
    }
  }
}
