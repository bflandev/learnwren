import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  APPLICANT_NOT_VERIFIED,
  APPLICATION_NOT_FOUND,
  APPLICATION_NOT_PENDING,
} from '@learnwren/shared-data-models';

import { AdminInstructorApplicationsService } from '../admin-instructor-applications.service';
import { AdminInstructorApplicationsPageComponent } from './admin-instructor-applications-page.component';

function row(uid: string) {
  return {
    uid,
    displayName: 'Ada',
    email: 'ada@example.com',
    statement: 's',
    expertise: 'e',
    createdAt: '2026-05-29T00:00:00.000Z',
  };
}

describe('AdminInstructorApplicationsPageComponent', () => {
  let svc: {
    list: ReturnType<typeof vi.fn>;
    approve: ReturnType<typeof vi.fn>;
    decline: ReturnType<typeof vi.fn>;
  };

  async function setup() {
    TestBed.configureTestingModule({
      imports: [AdminInstructorApplicationsPageComponent],
      providers: [{ provide: AdminInstructorApplicationsService, useValue: svc }],
    });
    const fixture = TestBed.createComponent(AdminInstructorApplicationsPageComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    svc = {
      list: vi.fn(async () => ({ applications: [row('u1'), row('u2')] })),
      approve: vi.fn(async () => ({ status: 'APPROVED' })),
      decline: vi.fn(async () => ({ status: 'DECLINED' })),
    };
  });

  it('loads and renders the pending queue', async () => {
    const fixture = await setup();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('ada@example.com');
    expect(svc.list).toHaveBeenCalled();
  });

  it('shows the empty state when there are no applications', async () => {
    svc.list = vi.fn(async () => ({ applications: [] }));
    const fixture = await setup();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('No pending applications');
  });

  it('shows a load-error state with a retry when the initial list fails', async () => {
    svc.list = vi.fn(async () => {
      throw new Error('network down');
    });
    const fixture = await setup();
    const el = fixture.nativeElement as HTMLElement;
    // Guards the silent failure: a rejected ngOnInit load left applications()
    // empty and rendered "No pending applications." as if the queue were clear.
    expect(el.querySelector('[data-testid="load-error"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="empty-state"]')).toBeFalsy();

    svc.list = vi.fn(async () => ({ applications: [row('u1')] }));
    await fixture.componentInstance.retry();
    fixture.detectChanges();
    expect(el.textContent).toContain('ada@example.com');
    expect(el.querySelector('[data-testid="load-error"]')).toBeFalsy();
  });

  it('approve removes the row on success', async () => {
    const fixture = await setup();
    const comp = fixture.componentInstance;
    await comp.approve('u1');
    fixture.detectChanges();
    expect(svc.approve).toHaveBeenCalledWith('u1');
    expect(comp.applications().some((a) => a.uid === 'u1')).toBe(false);
    expect(comp.applications().some((a) => a.uid === 'u2')).toBe(true);
  });

  it('decline removes the row on success', async () => {
    const fixture = await setup();
    const comp = fixture.componentInstance;
    await comp.decline('u2');
    expect(svc.decline).toHaveBeenCalledWith('u2');
    expect(comp.applications().some((a) => a.uid === 'u2')).toBe(false);
  });

  it('surfaces a per-row error and keeps the row when the action fails', async () => {
    svc.approve = vi.fn(async () => {
      throw { error: { error: { code: 'APPLICATION_NOT_PENDING' } } };
    });
    const fixture = await setup();
    const comp = fixture.componentInstance;
    await comp.approve('u1');
    expect(comp.applications().some((a) => a.uid === 'u1')).toBe(true);
    expect(comp.rowError('u1')).toBeTruthy();
  });

  it('shows loading state before the list resolves', async () => {
    let resolveList!: (value: { applications: ReturnType<typeof row>[] }) => void;
    svc.list = vi.fn(
      () =>
        new Promise<{ applications: ReturnType<typeof row>[] }>((r) => {
          resolveList = r;
        }),
    );
    TestBed.configureTestingModule({
      imports: [AdminInstructorApplicationsPageComponent],
      providers: [{ provide: AdminInstructorApplicationsService, useValue: svc }],
    });
    const fixture = TestBed.createComponent(AdminInstructorApplicationsPageComponent);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Loading');
    resolveList({ applications: [row('u1')] });
    await fixture.whenStable();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('Loading');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('ada@example.com');
  });

  it('sets isBusy during an in-flight approve and clears it after', async () => {
    let resolveApprove!: (value: { status: string }) => void;
    svc.approve = vi.fn(
      () =>
        new Promise<{ status: string }>((r) => {
          resolveApprove = r;
        }),
    );
    const fixture = await setup();
    const comp = fixture.componentInstance;
    const approvePromise = comp.approve('u1');
    expect(comp.isBusy('u1')).toBe(true);
    resolveApprove({ status: 'APPROVED' });
    await approvePromise;
    expect(comp.isBusy('u1')).toBe(false);
    expect(comp.applications().some((a) => a.uid === 'u1')).toBe(false);
  });

  it('maps error codes to the correct copy', async () => {
    const fixture = await setup();
    const comp = fixture.componentInstance;

    // APPLICANT_NOT_VERIFIED → email verify copy
    svc.approve = vi.fn(async () => {
      throw { error: { error: { code: APPLICANT_NOT_VERIFIED } } };
    });
    await comp.approve('u1');
    expect(comp.rowError('u1')).toContain('verify');

    // APPLICATION_NOT_PENDING → "no longer pending / Refresh" copy
    svc.approve = vi.fn(async () => {
      throw { error: { error: { code: APPLICATION_NOT_PENDING } } };
    });
    await comp.approve('u1');
    expect(comp.rowError('u1')).toContain('Refresh');

    // APPLICATION_NOT_FOUND → same "no longer pending / Refresh" copy
    svc.approve = vi.fn(async () => {
      throw { error: { error: { code: APPLICATION_NOT_FOUND } } };
    });
    await comp.approve('u1');
    expect(comp.rowError('u1')).toContain('Refresh');

    // unknown code → generic fallback
    svc.approve = vi.fn(async () => {
      throw { error: { error: { code: 'SOME_OTHER_ERROR' } } };
    });
    await comp.approve('u1');
    expect(comp.rowError('u1')).toContain('Something went wrong');
  });

  // ─── Signal initial values (kill BooleanLiteral L24/25, ArrayDeclaration L23) ─

  it('applications is empty and loading is true before the list resolves, loadError is false', () => {
    // BooleanLiteral L24 loading=signal(true): if mutant sets false, spinner never shows.
    // BooleanLiteral L25 loadError=signal(false): if mutant sets true, error renders before failure.
    // ArrayDeclaration L23 applications=signal([]): initial value must be empty.
    let resolveList!: (v: unknown) => void;
    svc.list = vi.fn(() => new Promise((r) => { resolveList = r; }));
    TestBed.configureTestingModule({
      imports: [AdminInstructorApplicationsPageComponent],
      providers: [{ provide: AdminInstructorApplicationsService, useValue: svc }],
    });
    const fixture = TestBed.createComponent(AdminInstructorApplicationsPageComponent);
    fixture.detectChanges();

    const comp = fixture.componentInstance;
    expect(comp.loading()).toBe(true);
    expect(comp.loadError()).toBe(false);
    expect(comp.applications()).toEqual([]);

    resolveList({ applications: [] });
  });

  // ─── messageFor: OptionalChaining L83 (null error shape) ─────────────────────

  it('messageFor falls back to generic copy when error has no error.error.code shape', async () => {
    // OptionalChaining L83: `(err as ...).error?.error?.code` — three optional chains.
    // Removing any one causes a crash when the error shape is missing.
    svc.approve = vi.fn(async () => { throw new Error('bare network error'); });
    const fixture = await setup();
    await fixture.componentInstance.approve('u1');
    expect(fixture.componentInstance.rowError('u1')).toContain('Something went wrong');
  });

  it('messageFor falls back to generic copy when error is null', async () => {
    svc.approve = vi.fn(async () => { throw null; });
    const fixture = await setup();
    await fixture.componentInstance.approve('u1');
    expect(fixture.componentInstance.rowError('u1')).toContain('Something went wrong');
  });

  // ─── clearError (kill BlockStatement L102 / ObjectLiteral L104) ───────────────

  it('re-approving clears the previous per-row error before calling the service again', async () => {
    // BlockStatement L102 empties clearError: the stale error would linger.
    // ObjectLiteral L104: the `{ ...e }` spread — clearing error must produce a new object.
    svc.approve = vi.fn(async () => {
      throw { error: { error: { code: APPLICATION_NOT_PENDING } } };
    });
    const fixture = await setup();
    const comp = fixture.componentInstance;

    // First attempt — sets a row error.
    await comp.approve('u1');
    expect(comp.rowError('u1')).toBeTruthy();

    // Set up a successful second attempt.
    svc.approve = vi.fn(async () => ({ status: 'APPROVED' }));
    // Before the second call resolves the row error must be cleared (clearError runs first).
    let resolveApprove!: (v: unknown) => void;
    svc.approve = vi.fn(() => new Promise((r) => { resolveApprove = r; }));
    const p = comp.approve('u1');
    // Error must be gone the moment the action starts (clearError ran synchronously before await).
    expect(comp.rowError('u1')).toBeUndefined();
    resolveApprove({ status: 'APPROVED' });
    await p;
    // Row is removed on success.
    expect(comp.applications().some((a) => a.uid === 'u1')).toBe(false);
  });
});
