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

  it('emits courseUpdated after a successful publish', async () => {
    fixture.componentRef.setInput('course', COURSE_DRAFT_BASE);
    publishSvc.setEligibility({ eligible: true, reasons: [] });
    const published: Course = { ...COURSE_DRAFT_BASE, status: 'PUBLISHED' };
    coursesSvc.publishCourse.mockResolvedValue(published);
    fixture.detectChanges();
    let updated: Course | undefined;
    fixture.componentInstance.courseUpdated.subscribe((c) => (updated = c));

    (fixture.nativeElement.querySelector('[data-testid="publish-bar-primary"]') as HTMLButtonElement).click();
    await fixture.whenStable();

    expect(updated).toEqual(published);
  });

  it('clicking the primary button on a published course requests an unpublish confirmation', () => {
    fixture.componentRef.setInput('course', { ...COURSE_DRAFT_BASE, status: 'PUBLISHED' });
    fixture.detectChanges();
    let requested: 'unpublish' | 'archive' | undefined;
    fixture.componentInstance.requestConfirm.subscribe((k) => (requested = k));

    (fixture.nativeElement.querySelector('[data-testid="publish-bar-primary"]') as HTMLButtonElement).click();

    expect(requested).toBe('unpublish');
    expect(coursesSvc.unpublishCourse).not.toHaveBeenCalled();
  });

  it('clicking the primary button on an archived course restores it to draft', async () => {
    fixture.componentRef.setInput('course', { ...COURSE_DRAFT_BASE, status: 'ARCHIVED' });
    coursesSvc.restoreCourse.mockResolvedValue({ ...COURSE_DRAFT_BASE, status: 'DRAFT' });
    fixture.detectChanges();
    let updated: Course | undefined;
    fixture.componentInstance.courseUpdated.subscribe((c) => (updated = c));

    (fixture.nativeElement.querySelector('[data-testid="publish-bar-primary"]') as HTMLButtonElement).click();
    await fixture.whenStable();

    expect(coursesSvc.restoreCourse).toHaveBeenCalledWith('c1');
    expect(updated?.status).toBe('DRAFT');
  });

  it('clicking the archive button requests an archive confirmation', () => {
    fixture.componentRef.setInput('course', COURSE_DRAFT_BASE);
    fixture.detectChanges();
    let requested: 'unpublish' | 'archive' | undefined;
    fixture.componentInstance.requestConfirm.subscribe((k) => (requested = k));

    (fixture.nativeElement.querySelector('[data-testid="publish-bar-archive"]') as HTMLButtonElement).click();

    expect(requested).toBe('archive');
  });

  it('runConfirmedTransition unpublishes the course and emits the update', async () => {
    fixture.componentRef.setInput('course', { ...COURSE_DRAFT_BASE, status: 'PUBLISHED' });
    coursesSvc.unpublishCourse.mockResolvedValue({ ...COURSE_DRAFT_BASE, status: 'DRAFT' });
    fixture.detectChanges();
    let updated: Course | undefined;
    fixture.componentInstance.courseUpdated.subscribe((c) => (updated = c));

    fixture.componentInstance.runConfirmedTransition('unpublish');
    await fixture.whenStable();

    expect(coursesSvc.unpublishCourse).toHaveBeenCalledWith('c1');
    expect(updated?.status).toBe('DRAFT');
  });

  it('runConfirmedTransition archives the course and emits the update', async () => {
    fixture.componentRef.setInput('course', COURSE_DRAFT_BASE);
    coursesSvc.archiveCourse.mockResolvedValue({ ...COURSE_DRAFT_BASE, status: 'ARCHIVED' });
    fixture.detectChanges();
    let updated: Course | undefined;
    fixture.componentInstance.courseUpdated.subscribe((c) => (updated = c));

    fixture.componentInstance.runConfirmedTransition('archive');
    await fixture.whenStable();

    expect(coursesSvc.archiveCourse).toHaveBeenCalledWith('c1');
    expect(updated?.status).toBe('ARCHIVED');
  });

  it('feeds a PUBLISH_NOT_ELIGIBLE failure back into the eligibility service', async () => {
    fixture.componentRef.setInput('course', COURSE_DRAFT_BASE);
    publishSvc.setEligibility({ eligible: true, reasons: [] });
    const reasons = [{ kind: 'COURSE_HAS_NO_MODULES' }];
    coursesSvc.publishCourse.mockRejectedValue({
      error: { code: 'PUBLISH_NOT_ELIGIBLE', details: { reasons } },
    });
    fixture.detectChanges();

    (fixture.nativeElement.querySelector('[data-testid="publish-bar-primary"]') as HTMLButtonElement).click();
    await fixture.whenStable();

    expect(publishSvc.eligibility()).toEqual({ eligible: false, reasons });
  });

  it('shows a refresh prompt when a transition fails with INVALID_TRANSITION', async () => {
    fixture.componentRef.setInput('course', { ...COURSE_DRAFT_BASE, status: 'PUBLISHED' });
    coursesSvc.unpublishCourse.mockRejectedValue({ error: { code: 'INVALID_TRANSITION' } });
    fixture.detectChanges();

    fixture.componentInstance.runConfirmedTransition('unpublish');
    await fixture.whenStable();
    fixture.detectChanges();

    const banner = fixture.nativeElement.querySelector('.banner');
    expect(banner?.textContent).toContain('The course state changed');
  });

  it('shows a generic error when a transition fails unexpectedly', async () => {
    fixture.componentRef.setInput('course', { ...COURSE_DRAFT_BASE, status: 'PUBLISHED' });
    coursesSvc.unpublishCourse.mockRejectedValue(new Error('boom'));
    fixture.detectChanges();

    fixture.componentInstance.runConfirmedTransition('unpublish');
    await fixture.whenStable();
    fixture.detectChanges();

    const banner = fixture.nativeElement.querySelector('.banner');
    expect(banner?.textContent).toContain('Something went wrong');
  });
});
