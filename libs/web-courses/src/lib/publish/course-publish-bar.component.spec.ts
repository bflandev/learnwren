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
    expect(coursesSvc.publishCourse).not.toHaveBeenCalled(); // restore must NOT also publish
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

  it('handles a PUBLISH_NOT_ELIGIBLE error with NO details by setting empty reasons', async () => {
    fixture.componentRef.setInput('course', COURSE_DRAFT_BASE);
    publishSvc.setEligibility({ eligible: true, reasons: [] });
    // details omitted entirely — details?.reasons must guard against undefined.
    coursesSvc.publishCourse.mockRejectedValue({ error: { code: 'PUBLISH_NOT_ELIGIBLE' } });
    fixture.detectChanges();

    (fixture.nativeElement.querySelector('[data-testid="publish-bar-primary"]') as HTMLButtonElement).click();
    await fixture.whenStable();

    expect(publishSvc.eligibility()).toEqual({ eligible: false, reasons: [] });
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

  it('marks the primary button busy while a transition is in flight, then settles', async () => {
    fixture.componentRef.setInput('course', COURSE_DRAFT_BASE);
    publishSvc.setEligibility({ eligible: true, reasons: [] });
    let resolve!: (c: Course) => void;
    coursesSvc.publishCourse.mockReturnValue(new Promise<Course>((r) => { resolve = r; }));
    fixture.detectChanges();
    const primary = fixture.nativeElement.querySelector('[data-testid="publish-bar-primary"]') as HTMLButtonElement;

    primary.click(); // starts the transition
    fixture.detectChanges();
    // disabled by inFlight (independently of eligibility, which is true here)
    expect(primary.hasAttribute('disabled')).toBe(true);

    resolve({ ...COURSE_DRAFT_BASE, status: 'PUBLISHED' });
    await fixture.whenStable();
    fixture.detectChanges();
    // inFlight cleared in finally; published course → primary is now Unpublish (not disabled by inFlight)
    expect((fixture.nativeElement.querySelector('[data-testid="publish-bar-primary"]') as HTMLButtonElement).hasAttribute('disabled')).toBe(false);
  });

  it('disables the archive button while a transition is in flight', async () => {
    fixture.componentRef.setInput('course', { ...COURSE_DRAFT_BASE, status: 'PUBLISHED' });
    let resolve!: (c: Course) => void;
    coursesSvc.archiveCourse.mockReturnValue(new Promise<Course>((r) => { resolve = r; }));
    fixture.detectChanges();
    fixture.componentInstance.runConfirmedTransition('archive');
    fixture.detectChanges();
    const archive = fixture.nativeElement.querySelector('[data-testid="publish-bar-archive"]') as HTMLButtonElement;
    expect(archive.hasAttribute('disabled')).toBe(true);
    resolve({ ...COURSE_DRAFT_BASE, status: 'ARCHIVED' });
    await fixture.whenStable();
  });

  it('shows the archive button for DRAFT and PUBLISHED but hides it for ARCHIVED', () => {
    const archiveBtn = () => fixture.nativeElement.querySelector('[data-testid="publish-bar-archive"]');

    fixture.componentRef.setInput('course', COURSE_DRAFT_BASE); // DRAFT
    fixture.detectChanges();
    expect(archiveBtn()).not.toBeNull();

    fixture.componentRef.setInput('course', { ...COURSE_DRAFT_BASE, status: 'PUBLISHED' });
    fixture.detectChanges();
    expect(archiveBtn()).not.toBeNull();

    fixture.componentRef.setInput('course', { ...COURSE_DRAFT_BASE, status: 'ARCHIVED' });
    fixture.detectChanges();
    expect(archiveBtn()).toBeNull();
  });

  it('onPrimary does nothing for an unknown course status (no transition, no confirm)', () => {
    // Cast an out-of-union status so primaryKind() is null and onPrimary early-returns.
    fixture.componentRef.setInput('course', { ...COURSE_DRAFT_BASE, status: 'WEIRD' as never });
    fixture.detectChanges();
    let confirmed = false;
    fixture.componentInstance.requestConfirm.subscribe(() => { confirmed = true; });
    (fixture.componentInstance as unknown as { onPrimary: () => void }).onPrimary();
    expect(confirmed).toBe(false);
    expect(coursesSvc.publishCourse).not.toHaveBeenCalled();
    expect(coursesSvc.restoreCourse).not.toHaveBeenCalled();
  });

  it('primaryKind/primaryLabel are null/"" for an unknown status', () => {
    fixture.componentRef.setInput('course', { ...COURSE_DRAFT_BASE, status: 'WEIRD' as never });
    fixture.detectChanges();
    const internal = fixture.componentInstance as unknown as {
      primaryKind: () => string | null;
      primaryLabel: () => string;
      canArchive: () => boolean;
    };
    expect(internal.primaryKind()).toBeNull();
    expect(internal.primaryLabel()).toBe('');
    expect(internal.canArchive()).toBe(false);
    // the primary button renders with an empty label for an unknown status
    const primary = fixture.nativeElement.querySelector('[data-testid="publish-bar-primary"]');
    expect(primary?.textContent?.trim()).toBe('');
    // and the archive button is hidden (canArchive false)
    expect(fixture.nativeElement.querySelector('[data-testid="publish-bar-archive"]')).toBeNull();
  });

  it('clicking Publish does NOT restore, and restore path is gated on the restore kind', async () => {
    // DRAFT → publish branch only (kind === 'publish' true; kind === 'restore' false)
    fixture.componentRef.setInput('course', COURSE_DRAFT_BASE);
    publishSvc.setEligibility({ eligible: true, reasons: [] });
    coursesSvc.publishCourse.mockResolvedValue({ ...COURSE_DRAFT_BASE, status: 'PUBLISHED' });
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('[data-testid="publish-bar-primary"]') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(coursesSvc.publishCourse).toHaveBeenCalledTimes(1);
    expect(coursesSvc.restoreCourse).not.toHaveBeenCalled();
  });

  it('runConfirmedTransition unpublish does NOT archive and vice-versa', async () => {
    fixture.componentRef.setInput('course', { ...COURSE_DRAFT_BASE, status: 'PUBLISHED' });
    coursesSvc.unpublishCourse.mockResolvedValue({ ...COURSE_DRAFT_BASE, status: 'DRAFT' });
    fixture.detectChanges();
    fixture.componentInstance.runConfirmedTransition('unpublish');
    await fixture.whenStable();
    expect(coursesSvc.unpublishCourse).toHaveBeenCalledTimes(1);
    expect(coursesSvc.archiveCourse).not.toHaveBeenCalled();
  });

  it('clears a stale error and resets inFlight via the finally block on each transition', async () => {
    fixture.componentRef.setInput('course', { ...COURSE_DRAFT_BASE, status: 'PUBLISHED' });
    coursesSvc.unpublishCourse.mockRejectedValue(new Error('boom'));
    fixture.detectChanges();
    fixture.componentInstance.runConfirmedTransition('unpublish');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.banner')?.textContent).toContain('Something went wrong');
    // a subsequent successful archive clears the banner (genericError.set(null)) and inFlight resets
    coursesSvc.archiveCourse.mockResolvedValue({ ...COURSE_DRAFT_BASE, status: 'ARCHIVED' });
    fixture.componentInstance.runConfirmedTransition('archive');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.banner')).toBeNull();
  });
});
