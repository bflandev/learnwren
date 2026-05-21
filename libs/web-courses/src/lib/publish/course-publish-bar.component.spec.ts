import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Course } from '@learnwren/shared-data-models';

import { CoursesService } from '../courses.service';
import { CoursePublishBarComponent } from './course-publish-bar.component';
import { PublishEligibilityService } from './publish-eligibility.service';

const COURSE_DRAFT_BASE: Course = {
  id: 'c1' as never,
  title: 'My Course',
  description: 'D',
  instructorId: 'u1' as never,
  status: 'DRAFT',
  createdAt: '2026-05-20T10:00:00.000Z' as never,
  updatedAt: '2026-05-20T10:00:00.000Z' as never,
};

describe('CoursePublishBarComponent', () => {
  let fixture: ComponentFixture<CoursePublishBarComponent>;
  let coursesSvc: { publishCourse: ReturnType<typeof vi.fn>; unpublishCourse: ReturnType<typeof vi.fn>; archiveCourse: ReturnType<typeof vi.fn>; restoreCourse: ReturnType<typeof vi.fn>; };
  let publishSvc: PublishEligibilityService;

  beforeEach(() => {
    coursesSvc = {
      publishCourse: vi.fn(),
      unpublishCourse: vi.fn(),
      archiveCourse: vi.fn(),
      restoreCourse: vi.fn(),
    };
    TestBed.configureTestingModule({
      imports: [CoursePublishBarComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: CoursesService, useValue: coursesSvc },
      ],
    });
    publishSvc = TestBed.inject(PublishEligibilityService);
    fixture = TestBed.createComponent(CoursePublishBarComponent);
  });

  it('renders DRAFT pill + Publish button (disabled when ineligible)', () => {
    fixture.componentRef.setInput('course', COURSE_DRAFT_BASE);
    publishSvc.setEligibility({ eligible: false, reasons: [{ kind: 'COURSE_HAS_NO_MODULES' }] });
    fixture.detectChanges();
    const pill = fixture.nativeElement.querySelector('[data-testid="publish-bar-pill"]');
    const primary = fixture.nativeElement.querySelector('[data-testid="publish-bar-primary"]');
    expect(pill?.textContent).toContain('DRAFT');
    expect(primary?.textContent).toContain('Publish');
    expect(primary?.hasAttribute('disabled')).toBe(true);
  });

  it('enables Publish when eligibility is { eligible: true, reasons: [] }', () => {
    fixture.componentRef.setInput('course', COURSE_DRAFT_BASE);
    publishSvc.setEligibility({ eligible: true, reasons: [] });
    fixture.detectChanges();
    const primary = fixture.nativeElement.querySelector('[data-testid="publish-bar-primary"]');
    expect(primary?.hasAttribute('disabled')).toBe(false);
  });

  it('renders PUBLISHED pill + Unpublish primary when status is PUBLISHED', () => {
    fixture.componentRef.setInput('course', { ...COURSE_DRAFT_BASE, status: 'PUBLISHED' });
    fixture.detectChanges();
    const pill = fixture.nativeElement.querySelector('[data-testid="publish-bar-pill"]');
    const primary = fixture.nativeElement.querySelector('[data-testid="publish-bar-primary"]');
    expect(pill?.textContent).toContain('PUBLISHED');
    expect(primary?.textContent).toContain('Unpublish');
  });

  it('renders ARCHIVED pill + Restore primary when status is ARCHIVED', () => {
    fixture.componentRef.setInput('course', { ...COURSE_DRAFT_BASE, status: 'ARCHIVED' });
    fixture.detectChanges();
    const pill = fixture.nativeElement.querySelector('[data-testid="publish-bar-pill"]');
    const primary = fixture.nativeElement.querySelector('[data-testid="publish-bar-primary"]');
    expect(pill?.textContent).toContain('ARCHIVED');
    expect(primary?.textContent).toContain('Restore');
  });

  it('clicking Publish calls coursesSvc.publishCourse with the bound cid', async () => {
    fixture.componentRef.setInput('course', COURSE_DRAFT_BASE);
    publishSvc.setEligibility({ eligible: true, reasons: [] });
    coursesSvc.publishCourse.mockResolvedValue({ ...COURSE_DRAFT_BASE, status: 'PUBLISHED' });
    fixture.detectChanges();
    const primary = fixture.nativeElement.querySelector('[data-testid="publish-bar-primary"]') as HTMLButtonElement;
    primary.click();
    await fixture.whenStable();
    expect(coursesSvc.publishCourse).toHaveBeenCalledWith('c1');
  });
});
