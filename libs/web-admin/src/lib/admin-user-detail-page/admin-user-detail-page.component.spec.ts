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
  let svc: { getDetail: ReturnType<typeof vi.fn> };

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
    svc = { getDetail: vi.fn(async () => detail()) };
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
});
