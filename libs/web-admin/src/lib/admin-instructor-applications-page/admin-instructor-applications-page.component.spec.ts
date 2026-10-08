import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  APPLICANT_NOT_VERIFIED,
  APPLICATION_NOT_FOUND,
  APPLICATION_NOT_PENDING,
  DECLINE_REASON_INVALID,
} from '@learnwren/shared-data-models';

import { AdminInstructorApplicationsService } from '../admin-instructor-applications.service';
import { AdminInstructorApplicationsPageComponent } from './admin-instructor-applications-page.component';

function row(uid: string, extra: Record<string, string> = {}) {
  return {
    uid,
    displayName: 'Ada',
    email: 'ada@example.com',
    statement: 's',
    expertise: 'e',
    status: 'PENDING',
    createdAt: '2026-05-29T00:00:00.000Z',
    ...extra,
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
    expect(svc.list).toHaveBeenCalledWith('PENDING');
  });

  it('switching to Declined loads that list and shows decision date + reason without actions', async () => {
    const fixture = await setup();
    svc.list = vi.fn(async () => ({
      applications: [
        row('u9', { status: 'DECLINED', resolvedAt: '2026-06-03T00:00:00.000Z', declineReason: 'Add a syllabus' }),
      ],
    }));
    await fixture.componentInstance.show('DECLINED');
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(svc.list).toHaveBeenCalledWith('DECLINED');
    expect(el.querySelector('[data-testid="decline-reason"]')?.textContent).toContain('Add a syllabus');
    expect(el.querySelector('[data-testid="resolved-at"]')?.textContent).toContain('2026');
    expect(el.querySelector('[data-testid="approve-button"]')).toBeNull();
    expect(el.querySelector('[data-testid="filter-DECLINED"]')?.getAttribute('aria-pressed')).toBe('true');
  });

  it('names the selected status in the empty state', async () => {
    const fixture = await setup();
    svc.list = vi.fn(async () => ({ applications: [] }));
    await fixture.componentInstance.show('APPROVED');
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('No approved applications');
  });

  it('ignores a stale list response that resolves after a newer filter switch', async () => {
    const fixture = await setup();
    let resolveSlow!: (v: { applications: ReturnType<typeof row>[] }) => void;
    svc.list = vi.fn((status: string) =>
      status === 'APPROVED'
        ? new Promise((r) => {
            resolveSlow = r;
          })
        : Promise.resolve({ applications: [row('d1', { status: 'DECLINED' })] }),
    );
    const comp = fixture.componentInstance;
    const slow = comp.show('APPROVED');
    await comp.show('DECLINED');
    resolveSlow({ applications: [row('a1', { status: 'APPROVED' })] });
    await slow;
    expect(comp.applications().map((a) => a.uid)).toEqual(['d1']);
    expect(comp.loading()).toBe(false);
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
    expect(svc.decline).toHaveBeenCalledWith('u2', undefined);
    expect(comp.applications().some((a) => a.uid === 'u2')).toBe(false);
  });

  it('decline sends the typed reason, then closes the reason form', async () => {
    const fixture = await setup();
    const comp = fixture.componentInstance;
    comp.startDecline('u1');
    fixture.detectChanges();
    const textarea = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="decline-reason-input"]',
    ) as HTMLTextAreaElement;
    expect(textarea).toBeTruthy();
    textarea.value = '  Add a syllabus ';
    textarea.dispatchEvent(new Event('input'));
    await comp.decline('u1');
    expect(svc.decline).toHaveBeenCalledWith('u1', 'Add a syllabus');
    expect(comp.decliningUid()).toBeNull();
    expect(comp.declineReason()).toBe('');
  });

  it('offers the three status filters in queue-first order', async () => {
    const fixture = await setup();
    expect(fixture.componentInstance.filters).toEqual(['PENDING', 'APPROVED', 'DECLINED']);
  });

  it('a stale failed load does not flag an error over a newer successful one', async () => {
    const fixture = await setup();
    let rejectSlow!: (e: Error) => void;
    svc.list = vi.fn((status: string) =>
      status === 'APPROVED'
        ? new Promise((_, reject) => {
            rejectSlow = reject;
          })
        : Promise.resolve({ applications: [row('d1', { status: 'DECLINED' })] }),
    );
    const comp = fixture.componentInstance;
    const slow = comp.show('APPROVED');
    await comp.show('DECLINED');
    rejectSlow(new Error('late failure'));
    await slow;
    expect(comp.loadError()).toBe(false);
    expect(comp.applications().map((a) => a.uid)).toEqual(['d1']);
  });

  it('opening the reason form on another row starts with an empty draft', async () => {
    const fixture = await setup();
    const comp = fixture.componentInstance;
    comp.startDecline('u1');
    comp.declineReason.set('draft for u1');
    comp.startDecline('u2');
    expect(comp.decliningUid()).toBe('u2');
    expect(comp.declineReason()).toBe('');
  });

  it('cancelDecline closes the reason form and clears the draft', async () => {
    const fixture = await setup();
    const comp = fixture.componentInstance;
    comp.startDecline('u1');
    comp.declineReason.set('draft');
    comp.cancelDecline();
    expect(comp.decliningUid()).toBeNull();
    expect(comp.declineReason()).toBe('');
  });

  it('keeps the reason form open when decline fails', async () => {
    svc.decline = vi.fn(async () => {
      throw { error: { error: { code: DECLINE_REASON_INVALID } } };
    });
    const fixture = await setup();
    const comp = fixture.componentInstance;
    comp.startDecline('u1');
    comp.declineReason.set('x');
    await comp.decline('u1');
    expect(comp.decliningUid()).toBe('u1');
    expect(comp.rowError('u1')).toBe('The reason must be 2000 characters or fewer.');
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
    // The loading state renders hlm-skeleton lines (announced via aria-label).
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('hlm-skeleton[aria-label="Loading applications"]'),
    ).toBeTruthy();
    resolveList({ applications: [row('u1')] });
    await fixture.whenStable();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('hlm-skeleton')).toBeNull();
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

  it('loading is true and loadError is false at construction, BEFORE ngOnInit reloads', () => {
    // Kills BooleanLiteral L24 loading=signal(true) and L25 loadError=signal(false),
    // plus ArrayDeclaration L23 applications=signal([]). The reload() that ngOnInit
    // triggers re-sets loading(true)/loadError(false), masking the initial-value
    // mutants — so we read the signals at construction, BEFORE the first
    // detectChanges() runs ngOnInit.
    TestBed.configureTestingModule({
      imports: [AdminInstructorApplicationsPageComponent],
      providers: [{ provide: AdminInstructorApplicationsService, useValue: svc }],
    });
    const fixture = TestBed.createComponent(AdminInstructorApplicationsPageComponent);
    // No detectChanges() yet: ngOnInit/reload have NOT run.
    expect(svc.list).not.toHaveBeenCalled();
    const comp = fixture.componentInstance;
    expect(comp.loading()).toBe(true);
    expect(comp.loadError()).toBe(false);
    expect(comp.applications()).toEqual([]);
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

  it('messageFor handles err.error present but err.error.error missing without crashing', async () => {
    // Kills the OptionalChaining on the LAST `?.` (L83): `.error?.error?.code` →
    // `.error?.error.code`. When err.error exists but err.error.error is undefined,
    // the un-guarded `.code` access throws instead of returning the generic copy.
    svc.approve = vi.fn(async () => { throw { error: {} }; });
    const fixture = await setup();
    await fixture.componentInstance.approve('u1');
    // Row must survive (no throw escaping the catch) with the generic message.
    expect(fixture.componentInstance.applications().some((a) => a.uid === 'u1')).toBe(true);
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

  it('clearError on one row preserves the error on another row (spread, not reset)', async () => {
    // Kills ObjectLiteral L104 `{ ...e }` → `{}`: with `{}` the spread is lost,
    // so clearing u1's error would also wipe u2's error. The other row's error
    // must survive the clear.
    svc.approve = vi.fn(async () => {
      throw { error: { error: { code: APPLICATION_NOT_PENDING } } };
    });
    svc.decline = vi.fn(async () => {
      throw { error: { error: { code: APPLICATION_NOT_PENDING } } };
    });
    const fixture = await setup();
    const comp = fixture.componentInstance;

    // Put an error on both u1 and u2.
    await comp.approve('u1');
    await comp.decline('u2');
    expect(comp.rowError('u1')).toBeTruthy();
    expect(comp.rowError('u2')).toBeTruthy();

    // Re-approve u1 — clearError(u1) runs synchronously before the await.
    let resolveApprove!: (v: unknown) => void;
    svc.approve = vi.fn(() => new Promise((r) => { resolveApprove = r; }));
    const p = comp.approve('u1');
    // u1's error is gone, but u2's error must be untouched.
    expect(comp.rowError('u1')).toBeUndefined();
    expect(comp.rowError('u2')).toBeTruthy();
    resolveApprove({ status: 'APPROVED' });
    await p;
    expect(comp.rowError('u2')).toBeTruthy();
  });
});
