import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, type ParamMap, provideRouter, convertToParamMap } from '@angular/router';
import { BehaviorSubject, of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AdminUsersService } from '../admin-users.service';
import { AdminUserDetailPageComponent } from './admin-user-detail-page.component';

function detail(over: Record<string, unknown> = {}) {
  return {
    id: 'u1',
    displayName: 'Ada Lovelace',
    email: 'ada@example.com',
    biography: 'Mathematician',
    role: 'INSTRUCTOR',
    status: 'ACTIVE',
    createdAt: '2026-06-01T00:00:00.000Z',
    enrollments: [],
    authoredCourses: [],
    ...over,
  };
}

describe('AdminUserDetailPageComponent', () => {
  let svc: {
    getDetail: ReturnType<typeof vi.fn>;
    promote: ReturnType<typeof vi.fn>;
    demote: ReturnType<typeof vi.fn>;
    suspend: ReturnType<typeof vi.fn>;
    unsuspend: ReturnType<typeof vi.fn>;
    deleteUser: ReturnType<typeof vi.fn>;
  };

  async function setup(uid = 'u1') {
    TestBed.configureTestingModule({
      imports: [AdminUserDetailPageComponent],
      providers: [
        provideRouter([]),
        { provide: AdminUsersService, useValue: svc },
        { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ uid })) } },
      ],
    });
    const fixture = TestBed.createComponent(AdminUserDetailPageComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  // Variant that drives the route paramMap from a subject so a test can push a
  // second uid while the first getDetail is still in flight.
  function createWithParamSubject(subject: BehaviorSubject<ParamMap>) {
    TestBed.configureTestingModule({
      imports: [AdminUserDetailPageComponent],
      providers: [
        provideRouter([]),
        { provide: AdminUsersService, useValue: svc },
        { provide: ActivatedRoute, useValue: { paramMap: subject.asObservable() } },
      ],
    });
    const fixture = TestBed.createComponent(AdminUserDetailPageComponent);
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    svc = {
      getDetail: vi.fn(async () => detail()),
      promote: vi.fn(async () => ({ id: 'u1', role: 'INSTRUCTOR' })),
      demote: vi.fn(async () => ({ id: 'u1', role: 'STUDENT' })),
      suspend: vi.fn(async () => ({ id: 'u1', status: 'SUSPENDED' })),
      unsuspend: vi.fn(async () => ({ id: 'u1', status: 'ACTIVE' })),
      deleteUser: vi.fn(async () => undefined),
    };
  });

  it('loads the user by route param and renders profile + role', async () => {
    const fixture = await setup('u1');
    expect(svc.getDetail).toHaveBeenCalledWith('u1');
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Ada Lovelace');
    expect(text).toContain('ada@example.com');
    expect(text).toContain('INSTRUCTOR');
  });

  it('renders the enrollments section with a deleted-course fallback row', async () => {
    svc.getDetail = vi.fn(async () =>
      detail({
        enrollments: [
          { courseId: 'gone', courseTitle: '(course deleted)', status: 'WITHDRAWN', enrolledAt: '2026-06-05T00:00:00.000Z' },
        ],
      }),
    );
    const fixture = await setup();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(fixture.nativeElement.querySelector('[data-testid="enrollments"]')).toBeTruthy();
    expect(text).toContain('(course deleted)');
  });

  it('hides the authored-courses section when empty', async () => {
    const fixture = await setup();
    expect(fixture.nativeElement.querySelector('[data-testid="authored-courses"]')).toBeNull();
  });

  it('shows a not-found state when the API returns USER_NOT_FOUND', async () => {
    svc.getDetail = vi.fn(async () => {
      throw { error: { error: { code: 'USER_NOT_FOUND' } } };
    });
    const fixture = await setup('nope');
    expect(fixture.nativeElement.querySelector('[data-testid="not-found"]')).toBeTruthy();
  });

  it('shows Promote for a STUDENT and no Demote', async () => {
    svc.getDetail = vi.fn(async () => detail({ role: 'STUDENT' }));
    const fixture = await setup();
    expect(fixture.nativeElement.querySelector('[data-testid="promote-btn"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-testid="demote-btn"]')).toBeNull();
  });

  it('shows Demote for an INSTRUCTOR and no Promote', async () => {
    svc.getDetail = vi.fn(async () => detail({ role: 'INSTRUCTOR' }));
    const fixture = await setup();
    expect(fixture.nativeElement.querySelector('[data-testid="demote-btn"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-testid="promote-btn"]')).toBeNull();
  });

  it('shows no role actions for an ADMIN', async () => {
    svc.getDetail = vi.fn(async () => detail({ role: 'ADMIN' }));
    const fixture = await setup();
    expect(fixture.nativeElement.querySelector('[data-testid="promote-btn"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="demote-btn"]')).toBeNull();
  });

  it('promotes a student and swaps the action to Demote + shows success', async () => {
    svc.getDetail = vi.fn(async () => detail({ role: 'STUDENT' }));
    const fixture = await setup();
    fixture.nativeElement.querySelector('[data-testid="promote-btn"]').click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(svc.promote).toHaveBeenCalledWith('u1');
    expect(fixture.nativeElement.querySelector('[data-testid="demote-btn"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-testid="action-success"]')?.textContent).toContain('Promoted');
  });

  it('demote requires the inline confirm before calling the service', async () => {
    svc.getDetail = vi.fn(async () => detail({ role: 'INSTRUCTOR' }));
    const fixture = await setup();
    fixture.nativeElement.querySelector('[data-testid="demote-btn"]').click();
    fixture.detectChanges();
    expect(svc.demote).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('[data-testid="demote-confirm"]')).toBeTruthy();

    fixture.nativeElement.querySelector('[data-testid="demote-confirm-btn"]').click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(svc.demote).toHaveBeenCalledWith('u1');
    expect(fixture.nativeElement.querySelector('[data-testid="promote-btn"]')).toBeTruthy();
  });

  it('renders a "changed elsewhere" error on INVALID_ROLE_TRANSITION', async () => {
    svc.getDetail = vi.fn(async () => detail({ role: 'STUDENT' }));
    svc.promote = vi.fn(async () => {
      throw { error: { error: { code: 'INVALID_ROLE_TRANSITION' } } };
    });
    const fixture = await setup();
    fixture.nativeElement.querySelector('[data-testid="promote-btn"]').click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="action-error"]')?.textContent).toContain('changed elsewhere');
  });

  it('ignores a stale getDetail response that resolves after a newer navigation', async () => {
    // Race guard: getDetail is a non-cancellable Promise; an older user's
    // response resolving last must not overwrite the current user.
    let resolveA!: (v: unknown) => void;
    let resolveB!: (v: unknown) => void;
    svc.getDetail = vi.fn((uid: string) =>
      uid === 'u1'
        ? new Promise((r) => { resolveA = r; })
        : new Promise((r) => { resolveB = r; }),
    );
    const subject = new BehaviorSubject<ParamMap>(convertToParamMap({ uid: 'u1' }));
    const fixture = createWithParamSubject(subject);

    // load(u1) in flight; navigate to u2 -> load(u2) in flight.
    subject.next(convertToParamMap({ uid: 'u2' }));

    // Newer (u2) resolves first, then the stale (u1) resolves last.
    resolveB(detail({ id: 'u2', displayName: 'Bob' }));
    await fixture.whenStable();
    resolveA(detail({ id: 'u1', displayName: 'Ada' }));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.componentInstance.user()?.displayName).toBe('Bob');
  });

  it('keeps loading true when a stale (older) request resolves before the current one', async () => {
    // A superseded load must not flip the spinner off while the current request
    // is still in flight — the finally is guarded by the load token.
    let resolveA!: (v: unknown) => void;
    let resolveB!: (v: unknown) => void;
    svc.getDetail = vi.fn((uid: string) =>
      uid === 'u1'
        ? new Promise((r) => { resolveA = r; })
        : new Promise((r) => { resolveB = r; }),
    );
    const subject = new BehaviorSubject<ParamMap>(convertToParamMap({ uid: 'u1' }));
    const fixture = createWithParamSubject(subject);

    subject.next(convertToParamMap({ uid: 'u2' })); // load(u2) now the current load

    // The STALE load (u1) resolves FIRST, while u2 is still in flight.
    resolveA(detail({ id: 'u1', displayName: 'Ada' }));
    await fixture.whenStable();
    expect(fixture.componentInstance.loading()).toBe(true);

    // The current load (u2) resolves and clears the spinner.
    resolveB(detail({ id: 'u2', displayName: 'Bob' }));
    await fixture.whenStable();
    expect(fixture.componentInstance.loading()).toBe(false);
    expect(fixture.componentInstance.user()?.displayName).toBe('Bob');
  });

  it('clears the previous user action banner when navigating to a different user', async () => {
    svc.getDetail = vi.fn(async (uid: string) =>
      detail({ id: uid, role: uid === 'u1' ? 'STUDENT' : 'INSTRUCTOR' }),
    );
    const subject = new BehaviorSubject<ParamMap>(convertToParamMap({ uid: 'u1' }));
    const fixture = createWithParamSubject(subject);
    await fixture.whenStable();
    fixture.detectChanges();

    // Promote u1 → an action-success banner appears.
    fixture.nativeElement.querySelector('[data-testid="promote-btn"]').click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.componentInstance.actionSuccess()).toBeTruthy();

    // Navigating to u2 clears the banner synchronously at the start of load().
    subject.next(convertToParamMap({ uid: 'u2' }));
    expect(fixture.componentInstance.actionSuccess()).toBeUndefined();
    await fixture.whenStable();
  });

  // ─── Suspend / Unsuspend ────────────────────────────────────────────────────

  it('shows Suspend button for an ACTIVE user', async () => {
    svc.getDetail = vi.fn(async () => detail({ status: 'ACTIVE' }));
    const fixture = await setup();
    expect(fixture.nativeElement.querySelector('[data-testid="suspend-btn"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-testid="unsuspend-btn"]')).toBeNull();
  });

  it('shows Unsuspend button for a SUSPENDED user', async () => {
    svc.getDetail = vi.fn(async () => detail({ status: 'SUSPENDED' }));
    const fixture = await setup();
    expect(fixture.nativeElement.querySelector('[data-testid="unsuspend-btn"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-testid="suspend-btn"]')).toBeNull();
  });

  it('suspend calls service and updates status badge', async () => {
    svc.getDetail = vi.fn(async () => detail({ status: 'ACTIVE' }));
    const fixture = await setup();
    fixture.nativeElement.querySelector('[data-testid="suspend-btn"]').click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(svc.suspend).toHaveBeenCalledWith('u1');
    expect(fixture.nativeElement.querySelector('[data-testid="action-success"]')?.textContent).toContain('suspended');
    // After suspend the user's status badge reflects SUSPENDED.
    expect(fixture.nativeElement.querySelector('[data-testid="status-badge"]')?.textContent?.trim()).toBe('SUSPENDED');
  });

  it('unsuspend calls service and updates status badge back to ACTIVE', async () => {
    svc.getDetail = vi.fn(async () => detail({ status: 'SUSPENDED' }));
    const fixture = await setup();
    fixture.nativeElement.querySelector('[data-testid="unsuspend-btn"]').click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(svc.unsuspend).toHaveBeenCalledWith('u1');
    expect(fixture.nativeElement.querySelector('[data-testid="action-success"]')?.textContent).toContain('unsuspended');
    expect(fixture.nativeElement.querySelector('[data-testid="status-badge"]')?.textContent?.trim()).toBe('ACTIVE');
  });

  it('maps CANNOT_ACT_ON_SELF error code to descriptive copy', async () => {
    svc.getDetail = vi.fn(async () => detail({ status: 'ACTIVE' }));
    svc.suspend = vi.fn(async () => {
      throw { error: { error: { code: 'CANNOT_ACT_ON_SELF' } } };
    });
    const fixture = await setup();
    fixture.nativeElement.querySelector('[data-testid="suspend-btn"]').click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="action-error"]')?.textContent).toContain('yourself');
  });

  it('maps LAST_ADMIN error code to descriptive copy', async () => {
    svc.getDetail = vi.fn(async () => detail({ status: 'ACTIVE', role: 'ADMIN' }));
    svc.suspend = vi.fn(async () => {
      throw { error: { error: { code: 'LAST_ADMIN' } } };
    });
    const fixture = await setup();
    // ADMIN users should have a suspend button
    fixture.nativeElement.querySelector('[data-testid="suspend-btn"]').click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="action-error"]')?.textContent).toContain('last admin');
  });

  it('maps INVALID_STATUS_TRANSITION error code to descriptive copy', async () => {
    svc.getDetail = vi.fn(async () => detail({ status: 'ACTIVE' }));
    svc.suspend = vi.fn(async () => {
      throw { error: { error: { code: 'INVALID_STATUS_TRANSITION' } } };
    });
    const fixture = await setup();
    fixture.nativeElement.querySelector('[data-testid="suspend-btn"]').click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="action-error"]')?.textContent).toContain('changed elsewhere');
  });

  // ─── Delete ─────────────────────────────────────────────────────────────────

  it('shows a Delete button and an inline confirm panel when clicked', async () => {
    const fixture = await setup();
    // Delete button should be present.
    expect(fixture.nativeElement.querySelector('[data-testid="delete-btn"]')).toBeTruthy();
    // Confirm panel not yet visible.
    expect(fixture.nativeElement.querySelector('[data-testid="delete-confirm"]')).toBeNull();

    // Clicking opens the inline confirm.
    fixture.nativeElement.querySelector('[data-testid="delete-btn"]').click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="delete-confirm"]')).toBeTruthy();
    // Service not yet called.
    expect(svc.deleteUser).not.toHaveBeenCalled();
  });

  it('cancel on the delete confirm closes the panel without calling the service', async () => {
    const fixture = await setup();
    fixture.nativeElement.querySelector('[data-testid="delete-btn"]').click();
    fixture.detectChanges();
    fixture.nativeElement.querySelector('[data-testid="delete-cancel-btn"]').click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="delete-confirm"]')).toBeNull();
    expect(svc.deleteUser).not.toHaveBeenCalled();
  });

  it('confirm delete calls service and navigates back to the user list', async () => {
    const fixture = await setup();
    fixture.nativeElement.querySelector('[data-testid="delete-btn"]').click();
    fixture.detectChanges();
    fixture.nativeElement.querySelector('[data-testid="delete-confirm-btn"]').click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(svc.deleteUser).toHaveBeenCalledWith('u1');
  });

  it('maps USER_HAS_COURSES error code with course count to descriptive copy', async () => {
    svc.deleteUser = vi.fn(async () => {
      throw { error: { error: { code: 'USER_HAS_COURSES', details: { courseCount: 3 } } } };
    });
    const fixture = await setup();
    fixture.nativeElement.querySelector('[data-testid="delete-btn"]').click();
    fixture.detectChanges();
    fixture.nativeElement.querySelector('[data-testid="delete-confirm-btn"]').click();
    await fixture.whenStable();
    fixture.detectChanges();
    const errorText = fixture.nativeElement.querySelector('[data-testid="action-error"]')?.textContent ?? '';
    expect(errorText).toContain('3');
    expect(errorText).toContain('course');
  });

  // ─── Signal initial values (kill BooleanLiteral on signal(true/false)) ────────

  it('loading is true and user/notFound/busy/actionError/actionSuccess are at their initial values before load resolves', () => {
    // BooleanLiteral mutants: loading=signal(true), notFound=signal(false),
    // busy=signal(false), confirmingDemote=signal(false), confirmingDelete=signal(false)
    let resolveDetail!: (v: unknown) => void;
    svc.getDetail = vi.fn(() => new Promise((r) => { resolveDetail = r; }));
    TestBed.configureTestingModule({
      imports: [AdminUserDetailPageComponent],
      providers: [
        provideRouter([]),
        { provide: AdminUsersService, useValue: svc },
        { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ uid: 'u1' })) } },
      ],
    });
    const fixture = TestBed.createComponent(AdminUserDetailPageComponent);
    fixture.detectChanges();
    // loading must start true — spinner shows while getDetail is in flight.
    expect(fixture.componentInstance.loading()).toBe(true);
    // No error banners before any action.
    expect(fixture.componentInstance.notFound()).toBe(false);
    expect(fixture.componentInstance.busy()).toBe(false);
    expect(fixture.componentInstance.confirmingDemote()).toBe(false);
    expect(fixture.componentInstance.confirmingDelete()).toBe(false);
    expect(fixture.componentInstance.actionError()).toBeUndefined();
    expect(fixture.componentInstance.actionSuccess()).toBeUndefined();
    resolveDetail(detail());
  });

  // ─── ngOnInit uid-missing guard (kill ConditionalExpression L44) ─────────────

  it('does not call getDetail when the route has no uid param', async () => {
    // ConditionalExpression mutant on `if (uid)` at L44: removes the guard and
    // would call getDetail(null), causing a crash or a bad API call.
    TestBed.configureTestingModule({
      imports: [AdminUserDetailPageComponent],
      providers: [
        provideRouter([]),
        { provide: AdminUsersService, useValue: svc },
        { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({})) } },
      ],
    });
    const fixture = TestBed.createComponent(AdminUserDetailPageComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(svc.getDetail).not.toHaveBeenCalled();
  });

  // ─── ngOnDestroy sub?.unsubscribe() (kill BlockStatement / OptionalChaining) ──

  it('ngOnDestroy unsubscribes from the route paramMap, preventing after-destroy getDetail calls', async () => {
    // BlockStatement mutant at L48 empties ngOnDestroy body.
    // OptionalChaining mutant at L49 removes the safe-nav, causing a crash when sub is undefined.
    const subject = new BehaviorSubject<ParamMap>(convertToParamMap({ uid: 'u1' }));
    TestBed.configureTestingModule({
      imports: [AdminUserDetailPageComponent],
      providers: [
        provideRouter([]),
        { provide: AdminUsersService, useValue: svc },
        { provide: ActivatedRoute, useValue: { paramMap: subject.asObservable() } },
      ],
    });
    const fixture = TestBed.createComponent(AdminUserDetailPageComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const callsBefore = svc.getDetail.mock.calls.length;
    // Destroy unsubscribes the paramMap subscription.
    fixture.destroy();
    // Pushing a new uid after destroy must NOT trigger another getDetail call.
    subject.next(convertToParamMap({ uid: 'u2' }));
    await fixture.whenStable();
    expect(svc.getDetail.mock.calls.length).toBe(callsBefore);
  });

  // ─── busy flag during confirmDelete (kill BooleanLiteral L89/92/99) ──────────

  it('busy is true while confirmDelete is in flight and false after success', async () => {
    let resolveDelete!: () => void;
    svc.deleteUser = vi.fn(() => new Promise<void>((r) => { resolveDelete = r; }));
    const fixture = await setup();
    fixture.nativeElement.querySelector('[data-testid="delete-btn"]').click();
    fixture.detectChanges();
    const deletePromise = fixture.componentInstance.confirmDelete();
    // While the service call is in flight, busy must be true.
    expect(fixture.componentInstance.busy()).toBe(true);
    // confirmingDelete must have been cleared synchronously (L92 BooleanLiteral).
    expect(fixture.componentInstance.confirmingDelete()).toBe(false);
    resolveDelete();
    await deletePromise;
    // After completion, busy must return to false (L99 BooleanLiteral in finally).
    expect(fixture.componentInstance.busy()).toBe(false);
  });

  it('confirmDelete sets busy false even when deleteUser throws (finally guard)', async () => {
    // BlockStatement mutant at L98 empties the finally block: busy would stay true forever.
    svc.deleteUser = vi.fn(async () => { throw { error: { error: { code: 'USER_HAS_COURSES', details: { courseCount: 1 } } } }; });
    const fixture = await setup();
    fixture.nativeElement.querySelector('[data-testid="delete-btn"]').click();
    fixture.detectChanges();
    await fixture.componentInstance.confirmDelete();
    expect(fixture.componentInstance.busy()).toBe(false);
  });

  // ─── navigate path after delete (kill StringLiteral / ArrayDeclaration / ObjectLiteral / BooleanLiteral L95) ──

  it('confirmDelete navigates to /admin/users with deleted:true state on success', async () => {
    // StringLiteral L95 '/admin/users', ArrayDeclaration, ObjectLiteral×2, BooleanLiteral 'true'
    const fixture = await setup();
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    fixture.nativeElement.querySelector('[data-testid="delete-btn"]').click();
    fixture.detectChanges();
    fixture.nativeElement.querySelector('[data-testid="delete-confirm-btn"]').click();
    await fixture.whenStable();

    expect(navigateSpy).toHaveBeenCalledWith(
      ['/admin/users'],
      expect.objectContaining({ state: expect.objectContaining({ deleted: true }) }),
    );
  });

  // ─── busy flag in changeRole (kill BooleanLiteral L107/118, BlockStatement L117) ─

  it('busy is true while promote is in flight and false afterward', async () => {
    svc.getDetail = vi.fn(async () => detail({ role: 'STUDENT' }));
    let resolvePromote!: (v: unknown) => void;
    svc.promote = vi.fn(() => new Promise((r) => { resolvePromote = r; }));
    const fixture = await setup();

    const promotePromise = fixture.componentInstance.promote();
    expect(fixture.componentInstance.busy()).toBe(true);
    resolvePromote({ id: 'u1', role: 'INSTRUCTOR' });
    await promotePromise;
    expect(fixture.componentInstance.busy()).toBe(false);
  });

  it('busy is false even when promote throws (changeRole finally guard)', async () => {
    // BlockStatement mutant at L117 empties the finally: busy stays true on error.
    svc.getDetail = vi.fn(async () => detail({ role: 'STUDENT' }));
    svc.promote = vi.fn(async () => { throw { error: { error: { code: 'CANNOT_ACT_ON_SELF' } } }; });
    const fixture = await setup();
    await fixture.componentInstance.promote();
    expect(fixture.componentInstance.busy()).toBe(false);
  });

  // ─── Demoted to Student string literal (kill StringLiteral L77) ──────────────

  it('confirmDemote shows the exact "Demoted to Student." success text', async () => {
    svc.getDetail = vi.fn(async () => detail({ role: 'INSTRUCTOR' }));
    const fixture = await setup();
    fixture.nativeElement.querySelector('[data-testid="demote-btn"]').click();
    fixture.detectChanges();
    fixture.nativeElement.querySelector('[data-testid="demote-confirm-btn"]').click();
    await fixture.whenStable();
    fixture.detectChanges();
    const successText = fixture.nativeElement.querySelector('[data-testid="action-success"]')?.textContent ?? '';
    expect(successText).toContain('Demoted to Student.');
  });

  // ─── busy flag in changeStatus (kill BooleanLiteral L126/136, BlockStatement L135) ─

  it('busy is true while suspend is in flight and false afterward', async () => {
    svc.getDetail = vi.fn(async () => detail({ status: 'ACTIVE' }));
    let resolveSuspend!: (v: unknown) => void;
    svc.suspend = vi.fn(() => new Promise((r) => { resolveSuspend = r; }));
    const fixture = await setup();

    const suspendPromise = fixture.componentInstance.suspend();
    expect(fixture.componentInstance.busy()).toBe(true);
    resolveSuspend({ id: 'u1', status: 'SUSPENDED' });
    await suspendPromise;
    expect(fixture.componentInstance.busy()).toBe(false);
  });

  it('busy is false even when suspend throws (changeStatus finally guard)', async () => {
    // BlockStatement mutant at L135 empties finally: busy stays true on error.
    svc.getDetail = vi.fn(async () => detail({ status: 'ACTIVE' }));
    svc.suspend = vi.fn(async () => { throw { error: { error: { code: 'LAST_ADMIN' } } }; });
    const fixture = await setup();
    await fixture.componentInstance.suspend();
    expect(fixture.componentInstance.busy()).toBe(false);
  });

  // ─── messageFor: OptionalChaining null paths (kill OptionalChaining L141) ──────

  it('messageFor falls back to generic copy when error has no error.error.code shape', async () => {
    // OptionalChaining L141: body?.error?.error — if optional-chain removed,
    // accessing .code on undefined would throw rather than returning the fallback.
    svc.getDetail = vi.fn(async () => detail({ status: 'ACTIVE' }));
    svc.suspend = vi.fn(async () => { throw new Error('bare error'); });
    const fixture = await setup();
    fixture.nativeElement.querySelector('[data-testid="suspend-btn"]').click();
    await fixture.whenStable();
    fixture.detectChanges();
    const errorText = fixture.nativeElement.querySelector('[data-testid="action-error"]')?.textContent ?? '';
    expect(errorText).toContain('Something went wrong');
  });

  it('messageFor falls back to generic copy when error is null', async () => {
    svc.getDetail = vi.fn(async () => detail({ status: 'ACTIVE' }));
    svc.suspend = vi.fn(async () => { throw null; });
    const fixture = await setup();
    fixture.nativeElement.querySelector('[data-testid="suspend-btn"]').click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="action-error"]')?.textContent).toContain('Something went wrong');
  });

  // ─── messageFor: USER_NOT_FOUND string (kill StringLiteral L146 / ConditionalExpression) ─

  it('messageFor maps USER_NOT_FOUND to the exact "no longer exists" copy', async () => {
    // ConditionalExpression L146 and StringLiteral L147: removing either prevents
    // the USER_NOT_FOUND branch from returning its specific message.
    svc.getDetail = vi.fn(async () => detail({ status: 'ACTIVE' }));
    svc.suspend = vi.fn(async () => { throw { error: { error: { code: 'USER_NOT_FOUND' } } }; });
    const fixture = await setup();
    fixture.nativeElement.querySelector('[data-testid="suspend-btn"]').click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="action-error"]')?.textContent).toContain('no longer exists');
  });

  // ─── messageFor: USER_HAS_COURSES without count (kill OptionalChaining/ConditionalExpression L155-159) ─

  it('messageFor shows "one or more" fallback when USER_HAS_COURSES details.courseCount is absent', async () => {
    // ConditionalExpression L155 (USER_HAS_COURSES branch), OptionalChaining L156 on body?.details,
    // and ConditionalExpression L155/179 on `count ?? 'one or more'`.
    svc.deleteUser = vi.fn(async () => {
      throw { error: { error: { code: 'USER_HAS_COURSES' } } }; // no details
    });
    const fixture = await setup();
    fixture.nativeElement.querySelector('[data-testid="delete-btn"]').click();
    fixture.detectChanges();
    fixture.nativeElement.querySelector('[data-testid="delete-confirm-btn"]').click();
    await fixture.whenStable();
    fixture.detectChanges();
    const errorText = fixture.nativeElement.querySelector('[data-testid="action-error"]')?.textContent ?? '';
    expect(errorText).toContain('one or more');
    expect(errorText).toContain('course');
  });

  it('messageFor: generic fallback string is exactly "Something went wrong. Please try again."', async () => {
    // StringLiteral L159: the generic fallback copy must be exact.
    svc.getDetail = vi.fn(async () => detail({ status: 'ACTIVE' }));
    svc.suspend = vi.fn(async () => { throw { error: { error: { code: 'UNKNOWN_CODE' } } }; });
    const fixture = await setup();
    fixture.nativeElement.querySelector('[data-testid="suspend-btn"]').click();
    await fixture.whenStable();
    fixture.detectChanges();
    const errorText = fixture.nativeElement.querySelector('[data-testid="action-error"]')?.textContent ?? '';
    expect(errorText).toBe('Something went wrong. Please try again.');
  });

  // ─── load() ++loadToken (UpdateOperator L169) and stale-catch guard (L177-179) ─

  it('load increments loadToken before the async call so stale errors are discarded', async () => {
    // UpdateOperator L169: `++this.loadToken` vs `this.loadToken++`
    // With post-increment both calls get the same token, so neither is "stale".
    // Also exercises the `if (token !== this.loadToken)` catch guard at L177.
    let rejectFirst!: (e: unknown) => void;
    let resolveSecond!: (v: unknown) => void;
    let callCount = 0;
    svc.getDetail = vi.fn((_uid: string) => {
      callCount += 1;
      return callCount === 1
        ? new Promise<unknown>((_, r) => { rejectFirst = r; })
        : new Promise<unknown>((r) => { resolveSecond = r; });
    });

    const subject = new BehaviorSubject<ParamMap>(convertToParamMap({ uid: 'u1' }));
    TestBed.configureTestingModule({
      imports: [AdminUserDetailPageComponent],
      providers: [
        provideRouter([]),
        { provide: AdminUsersService, useValue: svc },
        { provide: ActivatedRoute, useValue: { paramMap: subject.asObservable() } },
      ],
    });
    const fixture = TestBed.createComponent(AdminUserDetailPageComponent);
    fixture.detectChanges();

    // Navigate to u2; now the current load is for u2 (token 2).
    subject.next(convertToParamMap({ uid: 'u2' }));

    // u2 load resolves successfully first.
    resolveSecond(detail({ id: 'u2', displayName: 'Bob' }));
    await fixture.whenStable();
    fixture.detectChanges();

    // u1 load rejects last — the stale catch guard must discard it; notFound must NOT flip.
    rejectFirst({ error: { error: { code: 'USER_NOT_FOUND' } } });
    await fixture.whenStable();
    fixture.detectChanges();

    // State must reflect u2's successful load.
    expect(fixture.componentInstance.user()?.displayName).toBe('Bob');
    expect(fixture.componentInstance.notFound()).toBe(false);
  });

  it('load catch: optionalChaining on err.error.error.code handles a bare error without crashing', async () => {
    // OptionalChaining mutants at L178 on
    // `(err as ...).error?.error?.code` — if removed, accessing .code on null throws.
    svc.getDetail = vi.fn(async () => { throw null; });
    const fixture = await setup();
    // Should not throw; notFound stays false because code is undefined.
    expect(fixture.componentInstance.notFound()).toBe(false);
    expect(fixture.componentInstance.user()).toBeUndefined();
  });

  it('load catch with ConditionalExpression: sets notFound only on USER_NOT_FOUND, not on other codes', async () => {
    // ConditionalExpression L179: if the condition is inverted or removed, notFound
    // would be set for ALL errors, not just USER_NOT_FOUND.
    svc.getDetail = vi.fn(async () => { throw { error: { error: { code: 'SOME_OTHER_ERROR' } } }; });
    const fixture = await setup();
    expect(fixture.componentInstance.notFound()).toBe(false);
    expect(fixture.componentInstance.user()).toBeUndefined();
  });
});
