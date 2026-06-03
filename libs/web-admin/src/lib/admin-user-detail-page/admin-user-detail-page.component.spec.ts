import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
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

  beforeEach(() => {
    svc = {
      getDetail: vi.fn(async () => detail()),
      promote: vi.fn(async () => ({ id: 'u1', role: 'INSTRUCTOR' })),
      demote: vi.fn(async () => ({ id: 'u1', role: 'STUDENT' })),
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
});
