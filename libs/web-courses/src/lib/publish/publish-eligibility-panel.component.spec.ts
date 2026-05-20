import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { CoursesService } from '../courses.service';
import { PublishEligibilityPanelComponent } from './publish-eligibility-panel.component';
import { PublishEligibilityService } from './publish-eligibility.service';

describe('PublishEligibilityPanelComponent', () => {
  let fixture: ComponentFixture<PublishEligibilityPanelComponent>;
  let publishSvc: PublishEligibilityService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [PublishEligibilityPanelComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), CoursesService],
    });
    publishSvc = TestBed.inject(PublishEligibilityService);
    fixture = TestBed.createComponent(PublishEligibilityPanelComponent);
  });

  it('renders the ready state when eligibility.eligible is true', () => {
    publishSvc.setEligibility({ eligible: true, reasons: [] });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Ready to publish');
  });

  it('renders the count + per-reason list when blocked', () => {
    publishSvc.setEligibility({
      eligible: false,
      reasons: [
        { kind: 'MODULE_HAS_NO_LESSONS', moduleId: 'm1' as never, moduleTitle: 'Materials', moduleOrder: 1 },
        { kind: 'LESSON_HAS_NO_VIDEO',
          moduleId: 'm2' as never, moduleTitle: 'Practice', moduleOrder: 2,
          lessonId: 'l1' as never, lessonTitle: 'Setup', lessonOrder: 0 },
      ],
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('2 things to fix');
    expect(fixture.nativeElement.textContent).toContain('Materials');
    expect(fixture.nativeElement.textContent).toContain('Setup');
  });

  it('omits jump link for LESSON_VIDEO_NOT_READY with TRANSCODING currentState', () => {
    publishSvc.setEligibility({
      eligible: false,
      reasons: [
        { kind: 'LESSON_VIDEO_NOT_READY',
          moduleId: 'm1' as never, moduleTitle: 'M', moduleOrder: 0,
          lessonId: 'l1' as never, lessonTitle: 'L', lessonOrder: 0,
          currentState: 'TRANSCODING' },
      ],
    });
    fixture.detectChanges();
    const jump = fixture.nativeElement.querySelector('[data-testid="jump-lesson"]');
    expect(jump).toBeNull();
  });

  it('renders jump link for LESSON_VIDEO_NOT_READY with FAILED currentState', () => {
    publishSvc.setEligibility({
      eligible: false,
      reasons: [
        { kind: 'LESSON_VIDEO_NOT_READY',
          moduleId: 'm1' as never, moduleTitle: 'M', moduleOrder: 0,
          lessonId: 'l1' as never, lessonTitle: 'L', lessonOrder: 0,
          currentState: 'FAILED' },
      ],
    });
    fixture.detectChanges();
    const jump = fixture.nativeElement.querySelector('[data-testid="jump-lesson"]');
    expect(jump).not.toBeNull();
  });

  it('shows the inline retry banner when lastError is set', () => {
    publishSvc.setEligibility({ eligible: true, reasons: [] });
    (publishSvc as never as { _lastError: { set: (s: string) => void } })._lastError.set('boom');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain("Couldn't check");
  });
});
