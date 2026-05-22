import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';

import { AuthService } from '@learnwren/web-auth';

import { DashboardComponent } from './dashboard.component';

describe('DashboardComponent', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            currentUser: () => ({ displayName: 'Ada', role: 'INSTRUCTOR' }),
            logout: async () => undefined,
          },
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  it('greets the signed-in user', () => {
    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();
    http.expectOne('/api/courses').flush([]);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Welcome back, Ada');
  });

  it('renders a Create a course link to /courses/new', () => {
    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();
    http.expectOne('/api/courses').flush([]);
    fixture.detectChanges();
    const link = (fixture.nativeElement as HTMLElement).querySelector<HTMLAnchorElement>(
      'a[routerLink="/courses/new"]',
    );
    expect(link).not.toBeNull();
  });

  it('loads and renders the instructor course titles', async () => {
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

  it('shows the empty state when there are no courses', async () => {
    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();
    http.expectOne('/api/courses').flush([]);
    await fixture.whenStable();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('No courses yet');
  });
});
