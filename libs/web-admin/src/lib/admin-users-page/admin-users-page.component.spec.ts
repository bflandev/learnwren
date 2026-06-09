import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AdminUsersService } from '../admin-users.service';
import { AdminUsersPageComponent } from './admin-users-page.component';

function user(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    displayName: `User ${id}`,
    email: `${id}@example.com`,
    role: 'STUDENT',
    createdAt: '2026-06-01T00:00:00.000Z',
    ...over,
  };
}

describe('AdminUsersPageComponent', () => {
  let svc: { list: ReturnType<typeof vi.fn> };

  async function setup() {
    TestBed.configureTestingModule({
      imports: [AdminUsersPageComponent],
      providers: [provideRouter([]), { provide: AdminUsersService, useValue: svc }],
    });
    const fixture = TestBed.createComponent(AdminUsersPageComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    svc = {
      list: vi.fn(async () => ({
        users: [user('u1'), user('u2')],
        total: 2,
        page: 1,
        pageSize: 20,
        capped: false,
      })),
    };
    vi.useRealTimers();
  });

  afterEach(() => vi.useRealTimers());

  it('loads and renders the user rows', async () => {
    const fixture = await setup();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(svc.list).toHaveBeenCalledWith('', 1, 20);
    expect(text).toContain('u1@example.com');
    expect(text).toContain('u2@example.com');
  });

  it('shows an error state with a retry when the load fails (not a silent empty state)', async () => {
    svc.list = vi.fn(async () => {
      throw new Error('network down');
    });
    const fixture = await setup();
    const el = fixture.nativeElement as HTMLElement;
    // The bug this guards: a rejected load left users() empty and the template
    // rendered "No users found." — indistinguishable from a real empty result.
    expect(el.querySelector('[data-testid="error-state"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="empty-state"]')).toBeFalsy();

    // Retry recovers: the service is called again and rows render.
    svc.list = vi.fn(async () => ({
      users: [user('u9')],
      total: 1,
      page: 1,
      pageSize: 20,
      capped: false,
    }));
    await fixture.componentInstance.retry();
    fixture.detectChanges();
    expect(el.textContent).toContain('u9@example.com');
    expect(el.querySelector('[data-testid="error-state"]')).toBeFalsy();
  });

  it('shows the empty state when there are no users', async () => {
    svc.list = vi.fn(async () => ({ users: [], total: 0, page: 1, pageSize: 20, capped: false }));
    const fixture = await setup();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('No users');
  });

  it('shows the capped banner when the result is capped', async () => {
    svc.list = vi.fn(async () => ({ users: [user('u1')], total: 1, page: 1, pageSize: 20, capped: true }));
    const fixture = await setup();
    expect(fixture.nativeElement.querySelector('[data-testid="capped-banner"]')).toBeTruthy();
  });

  it('renders the capped banner even when the filtered result is empty', async () => {
    svc.list = vi.fn(async () => ({ users: [], total: 0, page: 1, pageSize: 20, capped: true }));
    const fixture = await setup();
    expect(fixture.nativeElement.querySelector('[data-testid="capped-banner"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-testid="empty-state"]')).toBeTruthy();
  });

  it('goToPage reloads with the new page', async () => {
    svc.list = vi.fn(async () => ({ users: [user('u1')], total: 45, page: 1, pageSize: 20, capped: false }));
    const fixture = await setup();
    const comp = fixture.componentInstance;
    svc.list.mockClear();
    await comp.goToPage(2);
    expect(svc.list).toHaveBeenCalledWith('', 2, 20);
  });

  it('goToPage ignores a page beyond the last page (guard)', async () => {
    const fixture = await setup(); // default svc: total 2 -> totalPages 1
    const comp = fixture.componentInstance;
    svc.list.mockClear();
    await comp.goToPage(2);
    expect(svc.list).not.toHaveBeenCalled();
  });

  it('debounced search resets to page 1 and reloads', async () => {
    vi.useFakeTimers();
    const fixture = await setup();
    const comp = fixture.componentInstance;
    svc.list.mockClear();
    comp.onSearchInput('ada');
    expect(svc.list).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(300);
    expect(svc.list).toHaveBeenCalledWith('ada', 1, 20);
  });

  it('computes totalPages and disables prev on the first page', async () => {
    svc.list = vi.fn(async () => ({ users: [user('u1')], total: 45, page: 1, pageSize: 20, capped: false }));
    const fixture = await setup();
    expect(fixture.componentInstance.totalPages()).toBe(3);
    expect(fixture.componentInstance.canPrev()).toBe(false);
    expect(fixture.componentInstance.canNext()).toBe(true);
  });

  it('ignores a stale list response that resolves after a newer reload', async () => {
    // Race guard: a 300ms-debounced search and an immediate goToPage() can
    // both be in flight; the FIRST-issued (stale) response resolving LAST must
    // not overwrite the state set by the newer response.
    // Use two deferred promises; call retry() as the second (newer) reload so
    // no goToPage guard can block the setup.
    let resolveFirst!: (v: unknown) => void;
    let resolveSecond!: (v: unknown) => void;
    let callCount = 0;

    svc.list = vi.fn(() => {
      callCount += 1;
      return callCount === 1
        ? new Promise((r) => { resolveFirst = r; })
        : new Promise((r) => { resolveSecond = r; });
    });

    TestBed.configureTestingModule({
      imports: [AdminUsersPageComponent],
      providers: [provideRouter([]), { provide: AdminUsersService, useValue: svc }],
    });
    const fixture = TestBed.createComponent(AdminUsersPageComponent);
    fixture.detectChanges(); // ngOnInit -> 1st reload in flight

    // Trigger a second (newer) reload while the first is still in flight.
    void fixture.componentInstance.retry();

    // Newer (second) reload resolves first.
    resolveSecond({ users: [user('new-u1')], total: 10, page: 1, pageSize: 20, capped: false });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.componentInstance.users()[0]?.id).toBe('new-u1');
    expect(fixture.componentInstance.total()).toBe(10);

    // Stale (first) reload resolves last — must be discarded.
    resolveFirst({ users: [user('stale-u1'), user('stale-u2')], total: 99, page: 1, pageSize: 20, capped: true });
    await fixture.whenStable();
    fixture.detectChanges();

    // State must still reflect the second (newer) result.
    expect(fixture.componentInstance.users()[0]?.id).toBe('new-u1');
    expect(fixture.componentInstance.total()).toBe(10);
    expect(fixture.componentInstance.capped()).toBe(false);
    expect(fixture.componentInstance.loading()).toBe(false);
  });

  it('keeps loading true when a stale reload resolves before the current one', async () => {
    // A superseded reload must not flip the spinner off while the current
    // request is still in flight — the finally must be guarded by the token.
    let resolveFirst!: (v: unknown) => void;
    let resolveSecond!: (v: unknown) => void;
    let callCount = 0;

    svc.list = vi.fn(() => {
      callCount += 1;
      return callCount === 1
        ? new Promise((r) => { resolveFirst = r; })
        : new Promise((r) => { resolveSecond = r; });
    });

    TestBed.configureTestingModule({
      imports: [AdminUsersPageComponent],
      providers: [provideRouter([]), { provide: AdminUsersService, useValue: svc }],
    });
    const fixture = TestBed.createComponent(AdminUsersPageComponent);
    fixture.detectChanges(); // ngOnInit -> 1st reload in flight

    // Trigger second (newer) reload while first is still in flight.
    void fixture.componentInstance.retry();

    // Stale (first) resolves FIRST while second is still in flight.
    resolveFirst({ users: [user('stale-u1')], total: 5, page: 1, pageSize: 20, capped: false });
    await fixture.whenStable();

    // Spinner must still be on — the current (second) request hasn't settled.
    expect(fixture.componentInstance.loading()).toBe(true);

    // Current (second) resolves — now spinner turns off.
    resolveSecond({ users: [user('new-u1')], total: 10, page: 1, pageSize: 20, capped: false });
    await fixture.whenStable();
    expect(fixture.componentInstance.loading()).toBe(false);
    expect(fixture.componentInstance.users()[0]?.id).toBe('new-u1');
  });
});
