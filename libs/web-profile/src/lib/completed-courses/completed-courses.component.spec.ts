import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, beforeEach, expect, it, vi } from 'vitest';

import { EnrollmentService } from '@learnwren/web-enrollment';
import { CompletedCoursesComponent } from './completed-courses.component';

describe('CompletedCoursesComponent', () => {
  const listMyEnrollments = vi.fn();

  async function create(): Promise<ComponentFixture<CompletedCoursesComponent>> {
    await TestBed.configureTestingModule({
      imports: [CompletedCoursesComponent],
      providers: [
        provideRouter([]),
        { provide: EnrollmentService, useValue: { listMyEnrollments } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(CompletedCoursesComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  it('lists completed courses with links to the catalog page', async () => {
    listMyEnrollments.mockResolvedValue({
      enrollments: [
        { courseId: 'c1', courseTitle: 'Done Course', completedAt: '2026-07-09T00:00:00.000Z' },
        { courseId: 'c2', courseTitle: 'In Progress', completedAt: null },
      ],
    });
    const fixture = await create();
    const links = fixture.nativeElement.querySelectorAll('[data-testid="completed-course-link"]');
    expect(links.length).toBe(1);
    expect(links[0].textContent).toContain('Done Course');
    expect(links[0].getAttribute('href')).toBe('/catalog/c1');
  });

  it('renders nothing when there are no completed courses', async () => {
    listMyEnrollments.mockResolvedValue({ enrollments: [] });
    const fixture = await create();
    expect(fixture.nativeElement.querySelector('[data-testid="completed-courses-section"]')).toBeNull();
  });

  it('renders nothing when the load fails', async () => {
    listMyEnrollments.mockRejectedValue(new Error('boom'));
    const fixture = await create();
    expect(fixture.nativeElement.querySelector('[data-testid="completed-courses-section"]')).toBeNull();
  });
});
