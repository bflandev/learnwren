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
    const fixture = await setup();
    const comp = fixture.componentInstance;
    svc.list.mockClear();
    await comp.goToPage(2);
    expect(svc.list).toHaveBeenCalledWith('', 2, 20);
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
});
