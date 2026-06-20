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

  it('shows a SUSPENDED badge on a suspended user row', async () => {
    svc.list = vi.fn(async () => ({
      users: [user('u1', { status: 'SUSPENDED' }), user('u2', { status: 'ACTIVE' })],
      total: 2,
      page: 1,
      pageSize: 20,
      capped: false,
    }));
    const fixture = await setup();
    const el = fixture.nativeElement as HTMLElement;
    const badges = el.querySelectorAll('[data-testid="status-badge"]');
    const suspendedBadge = Array.from(badges).find((b) => b.textContent?.trim() === 'SUSPENDED');
    expect(suspendedBadge).toBeTruthy();
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

  // ─── Signal initial values (kill BooleanLiteral on signal(true/false)) ───────

  it('loading is true and error is false at construction, BEFORE ngOnInit reloads', () => {
    // Kills BooleanLiteral on loading = signal(true) and error = signal(false).
    // The reload() that ngOnInit triggers re-sets loading(true)/error(false), which
    // masks the initial-value mutants — so we must observe the signals at
    // construction time, BEFORE the first detectChanges() runs ngOnInit.
    TestBed.configureTestingModule({
      imports: [AdminUsersPageComponent],
      providers: [provideRouter([]), { provide: AdminUsersService, useValue: svc }],
    });
    const fixture = TestBed.createComponent(AdminUsersPageComponent);
    // No detectChanges() yet: ngOnInit/reload have NOT run.
    expect(svc.list).not.toHaveBeenCalled();
    expect(fixture.componentInstance.loading()).toBe(true);
    expect(fixture.componentInstance.error()).toBe(false);
    expect(fixture.componentInstance.users()).toEqual([]);
  });

  it('error is false and users is empty before any load runs', () => {
    // BooleanLiteral on error = signal(false): if it starts true the error state
    // renders before any real failure. ArrayDeclaration on users = signal([]).
    let resolveList!: (v: unknown) => void;
    svc.list = vi.fn(() => new Promise((r) => { resolveList = r; }));
    TestBed.configureTestingModule({
      imports: [AdminUsersPageComponent],
      providers: [provideRouter([]), { provide: AdminUsersService, useValue: svc }],
    });
    const fixture = TestBed.createComponent(AdminUsersPageComponent);
    fixture.detectChanges();
    expect(fixture.componentInstance.error()).toBe(false);
    expect(fixture.componentInstance.users()).toEqual([]);
    resolveList({ users: [], total: 0, page: 1, pageSize: 20, capped: false });
  });

  it('search starts empty and capped starts false', () => {
    // BooleanLiteral on capped = signal(false) and the search initial string.
    let resolveList!: (v: unknown) => void;
    svc.list = vi.fn(() => new Promise((r) => { resolveList = r; }));
    TestBed.configureTestingModule({
      imports: [AdminUsersPageComponent],
      providers: [provideRouter([]), { provide: AdminUsersService, useValue: svc }],
    });
    const fixture = TestBed.createComponent(AdminUsersPageComponent);
    fixture.detectChanges();
    expect(fixture.componentInstance.search()).toBe('');
    expect(fixture.componentInstance.capped()).toBe(false);
    resolveList({ users: [], total: 0, page: 1, pageSize: 20, capped: false });
  });

  // ─── ngOnDestroy / searchTimer cleanup (kill BlockStatement) ─────────────────

  it('ngOnDestroy clears a pending search timer so a debounced reload never fires after destroy', async () => {
    vi.useFakeTimers();
    const fixture = await setup();
    const comp = fixture.componentInstance;
    svc.list.mockClear();

    // Start a debounced search — the timer is now pending.
    comp.onSearchInput('query');

    // Destroy the component before the 300 ms elapses.
    fixture.destroy();

    // Advance past the debounce — if ngOnDestroy didn't clear, svc.list would fire.
    await vi.advanceTimersByTimeAsync(400);
    expect(svc.list).not.toHaveBeenCalled();
  });

  // ─── canPrev / canNext (kill ConditionalExpression / EqualityOperator) ────────

  it('canPrev returns false on page 1 and true on page 2', async () => {
    svc.list = vi.fn(async () => ({ users: [user('u1')], total: 45, page: 1, pageSize: 20, capped: false }));
    const fixture = await setup();
    const comp = fixture.componentInstance;
    // page starts at 1 after load; canPrev must be false.
    expect(comp.canPrev()).toBe(false);
    // Move to page 2; canPrev must be true.
    await comp.goToPage(2);
    expect(comp.canPrev()).toBe(true);
  });

  it('canNext returns false on the last page and true on earlier pages', async () => {
    svc.list = vi.fn(async () => ({ users: [user('u1')], total: 45, page: 1, pageSize: 20, capped: false }));
    const fixture = await setup();
    const comp = fixture.componentInstance;
    // totalPages = 3; page = 1 → canNext true
    expect(comp.canNext()).toBe(true);
    // Move to last page (3); canNext must be false.
    await comp.goToPage(3);
    expect(comp.canNext()).toBe(false);
  });

  // ─── goToPage boundary guards (kill ConditionalExpression/EqualityOperator) ───

  it('goToPage with page = 0 (below minimum) does not reload', async () => {
    // Kills: ConditionalExpression/EqualityOperator on `page < 1` guard (L67).
    const fixture = await setup();
    svc.list.mockClear();
    await fixture.componentInstance.goToPage(0);
    expect(svc.list).not.toHaveBeenCalled();
  });

  it('goToPage with page = 1 (the lower bound) is accepted and reloads', async () => {
    // Kills EqualityOperator on `page < 1` → `page <= 1` (L67): with `<=`, page 1
    // would be wrongly rejected and never reload. page 1 must be a valid page.
    svc.list = vi.fn(async () => ({ users: [user('u1')], total: 45, page: 1, pageSize: 20, capped: false }));
    const fixture = await setup();
    // Move off page 1 first so goToPage(1) is a real navigation back.
    await fixture.componentInstance.goToPage(2);
    svc.list.mockClear();
    await fixture.componentInstance.goToPage(1);
    expect(svc.list).toHaveBeenCalledWith('', 1, 20);
  });

  it('goToPage with page exactly equal to totalPages does reload', async () => {
    // Kills: EqualityOperator changing `>` to `>=` would block the last page.
    svc.list = vi.fn(async () => ({ users: [user('u1')], total: 45, page: 1, pageSize: 20, capped: false }));
    const fixture = await setup();
    svc.list.mockClear();
    // totalPages = 3; going to page 3 is valid.
    await fixture.componentInstance.goToPage(3);
    expect(svc.list).toHaveBeenCalledWith('', 3, 20);
  });

  it('goToPage with page exactly at totalPages + 1 does not reload', async () => {
    // Kills: the upper-bound guard `page > totalPages()` (L67 EqualityOperator).
    svc.list = vi.fn(async () => ({ users: [user('u1')], total: 45, page: 1, pageSize: 20, capped: false }));
    const fixture = await setup();
    svc.list.mockClear();
    // totalPages = 3; page 4 is out of range.
    await fixture.componentInstance.goToPage(4);
    expect(svc.list).not.toHaveBeenCalled();
  });

  // ─── onSearchInput — existing timer cleared before a new one is set ───────────

  it('typing a second character cancels the first timer and issues only one reload', async () => {
    // Kills ConditionalExpression on `if (this.searchTimer)` (L59).
    vi.useFakeTimers();
    const fixture = await setup();
    const comp = fixture.componentInstance;
    svc.list.mockClear();

    comp.onSearchInput('a');
    // Before the debounce fires, type another character.
    await vi.advanceTimersByTimeAsync(100);
    comp.onSearchInput('ab');
    // Now advance past the full debounce from the SECOND character.
    await vi.advanceTimersByTimeAsync(300);
    // Only one reload should have been issued (for 'ab').
    expect(svc.list).toHaveBeenCalledTimes(1);
    expect(svc.list).toHaveBeenCalledWith('ab', 1, 20);
  });

  // ─── UpdateOperator: ++this.loadToken (kill post- vs pre-increment) ───────────

  it('reload increments loadToken before the async call so each call gets a unique token', async () => {
    // Pre-increment (++this.loadToken) assigns 1 to the first call's token.
    // Post-increment (this.loadToken++) would assign 0 (the pre-call value).
    // A second concurrent call must supersede the first — they need distinct tokens.
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
    fixture.detectChanges(); // first reload in flight (token 1)

    void fixture.componentInstance.retry(); // second reload in flight (token 2)

    // Resolve the SECOND (newest) first.
    resolveSecond({ users: [user('current')], total: 1, page: 1, pageSize: 20, capped: false });
    await fixture.whenStable();

    // Resolve the FIRST (stale) last — must be discarded.
    resolveFirst({ users: [user('stale')], total: 99, page: 1, pageSize: 20, capped: false });
    await fixture.whenStable();

    // If post-increment were used (both calls see token 0 and 0) neither would
    // detect the other as stale, so the stale result could overwrite the current.
    expect(fixture.componentInstance.users()[0]?.id).toBe('current');
    expect(fixture.componentInstance.total()).toBe(1);
  });

  // ─── Stale error response must be discarded (kill ConditionalExpression L88) ──

  it('an error from a stale (superseded) reload does not set the error flag', async () => {
    // The catch branch has its own `if (token !== this.loadToken) return` guard.
    // A mutant that removes it would let the stale error overwrite a successful newer result.
    let rejectFirst!: (e: unknown) => void;
    let resolveSecond!: (v: unknown) => void;
    let callCount = 0;

    svc.list = vi.fn(() => {
      callCount += 1;
      return callCount === 1
        ? new Promise<unknown>((_, reject) => { rejectFirst = reject; })
        : new Promise<unknown>((resolve) => { resolveSecond = resolve; });
    });

    TestBed.configureTestingModule({
      imports: [AdminUsersPageComponent],
      providers: [provideRouter([]), { provide: AdminUsersService, useValue: svc }],
    });
    const fixture = TestBed.createComponent(AdminUsersPageComponent);
    fixture.detectChanges(); // 1st reload (stale) in flight

    void fixture.componentInstance.retry(); // 2nd reload (current) in flight

    // Current (second) resolves successfully first.
    resolveSecond({ users: [user('ok')], total: 1, page: 1, pageSize: 20, capped: false });
    await fixture.whenStable();
    fixture.detectChanges();

    // Stale (first) rejects last — error flag must NOT flip.
    rejectFirst(new Error('stale network error'));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.componentInstance.error()).toBe(false);
    expect(fixture.componentInstance.users()[0]?.id).toBe('ok');
  });
});
