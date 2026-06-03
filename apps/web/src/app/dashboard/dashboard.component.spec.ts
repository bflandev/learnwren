import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';

import { AuthService } from '@learnwren/web-auth';

import { DashboardComponent } from './dashboard.component';

function configure(role: 'INSTRUCTOR' | 'STUDENT'): HttpTestingController {
  TestBed.configureTestingModule({
    imports: [DashboardComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      {
        provide: AuthService,
        useValue: {
          currentUser: () => ({ displayName: 'Ada', role }),
          logout: async () => undefined,
        },
      },
    ],
  });
  return TestBed.inject(HttpTestingController);
}

describe('DashboardComponent', () => {
  it('greets the signed-in user', () => {
    const http = configure('INSTRUCTOR');
    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();
    http.expectOne('/api/courses').flush([]);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Welcome back, Ada');
  });

  it('renders a Create a course link to /courses/new for an instructor', () => {
    const http = configure('INSTRUCTOR');
    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();
    http.expectOne('/api/courses').flush([]);
    fixture.detectChanges();
    const link = (fixture.nativeElement as HTMLElement).querySelector<HTMLAnchorElement>(
      '[data-testid="create-course"]',
    );
    expect(link).not.toBeNull();
    expect(link!.getAttribute('routerLink')).toBe('/courses/new');
  });

  it('loads and renders the instructor course titles', async () => {
    const http = configure('INSTRUCTOR');
    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();
    http.expectOne('/api/courses').flush([
      { id: 'cid-1', title: 'Course One', description: 'D', status: 'DRAFT' },
      { id: 'cid-2', title: 'Course Two', description: 'D', status: 'PUBLISHED' },
    ]);
    await fixture.whenStable();
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Course One');
    expect(text).toContain('Course Two');
  });

  it('shows the empty state when an instructor has no courses', async () => {
    const http = configure('INSTRUCTOR');
    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();
    http.expectOne('/api/courses').flush([]);
    await fixture.whenStable();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('No courses yet');
  });

  it('shows a student only the welcome hero, with no instructor section or course request', () => {
    const http = configure('STUDENT');
    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Welcome back, Ada');
    expect(el.querySelector('[data-testid="create-course"]')).toBeNull();
    expect(el.textContent).not.toContain('My courses');
    http.verify();
  });

  it('loads courses when the user resolves to an instructor after construction', async () => {
    // Hard-reload race: currentUser() is undefined at construction, then the
    // GET /auth/me resolves to an instructor. The effect must fire the load
    // when the user resolves — not only at construction time.
    const user = signal<{ displayName: string; role: 'INSTRUCTOR' | 'STUDENT' } | undefined>(
      undefined,
    );
    TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: AuthService,
          useValue: { currentUser: user, logout: async () => undefined },
        },
      ],
    });
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();
    http.expectNone('/api/courses'); // unresolved auth → role unknown → no load yet

    user.set({ displayName: 'Ada', role: 'INSTRUCTOR' });
    fixture.detectChanges();
    http.expectOne('/api/courses').flush([]);
    await fixture.whenStable();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('No courses yet');
  });

  it('surfaces an error message when loading courses fails', async () => {
    const http = configure('INSTRUCTOR');
    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();
    http.expectOne('/api/courses').flush('boom', { status: 500, statusText: 'Server Error' });
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="courses-error"]')).not.toBeNull();
    expect(el.textContent).toContain('could not load your courses');
  });
});
