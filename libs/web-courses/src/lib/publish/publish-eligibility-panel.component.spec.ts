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

  it('renders the COURSE_HAS_NO_MODULES prose', () => {
    publishSvc.setEligibility({
      eligible: false,
      reasons: [{ kind: 'COURSE_HAS_NO_MODULES' }],
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Add a module before publishing');
  });

  it('renders the "upload in progress" prose for LESSON_VIDEO_NOT_READY UPLOADING', () => {
    publishSvc.setEligibility({
      eligible: false,
      reasons: [
        {
          kind: 'LESSON_VIDEO_NOT_READY',
          moduleId: 'm1' as never, moduleTitle: 'M', moduleOrder: 0,
          lessonId: 'l1' as never, lessonTitle: 'L', lessonOrder: 0,
          currentState: 'UPLOADING',
        },
      ],
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('upload is in progress');
  });

  it('renders the "re-upload required" prose for LESSON_VIDEO_NOT_READY FAILED', () => {
    publishSvc.setEligibility({
      eligible: false,
      reasons: [
        {
          kind: 'LESSON_VIDEO_NOT_READY',
          moduleId: 'm1' as never, moduleTitle: 'M', moduleOrder: 0,
          lessonId: 'l1' as never, lessonTitle: 'L', lessonOrder: 0,
          currentState: 'FAILED',
        },
      ],
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('processing failed');
  });

  it('emits jumpToModule when a MODULE_HAS_NO_LESSONS link is clicked', () => {
    publishSvc.setEligibility({
      eligible: false,
      reasons: [
        { kind: 'MODULE_HAS_NO_LESSONS', moduleId: 'm-x' as never, moduleTitle: 'X', moduleOrder: 0 },
      ],
    });
    fixture.detectChanges();
    let emitted: string | undefined;
    let lessonEmitted = false;
    fixture.componentInstance.jumpToModule.subscribe((id: string) => { emitted = id; });
    fixture.componentInstance.jumpToLesson.subscribe(() => { lessonEmitted = true; });
    const btn = fixture.nativeElement.querySelector(
      '[data-testid="jump-module"]',
    ) as HTMLButtonElement | null;
    btn?.click();
    expect(emitted).toBe('m-x');
    expect(lessonEmitted).toBe(false); // a module jump must NOT emit jumpToLesson
  });

  it('emits jumpToLesson when a LESSON_HAS_NO_VIDEO link is clicked', () => {
    publishSvc.setEligibility({
      eligible: false,
      reasons: [
        {
          kind: 'LESSON_HAS_NO_VIDEO',
          moduleId: 'm1' as never, moduleTitle: 'M', moduleOrder: 0,
          lessonId: 'l-y' as never, lessonTitle: 'L', lessonOrder: 0,
        },
      ],
    });
    fixture.detectChanges();
    let emitted: string | undefined;
    let moduleEmitted = false;
    fixture.componentInstance.jumpToLesson.subscribe((id: string) => { emitted = id; });
    fixture.componentInstance.jumpToModule.subscribe(() => { moduleEmitted = true; });
    const btn = fixture.nativeElement.querySelector(
      '[data-testid="jump-lesson"]',
    ) as HTMLButtonElement | null;
    btn?.click();
    expect(emitted).toBe('l-y');
    expect(moduleEmitted).toBe(false); // a lesson jump must NOT emit jumpToModule
  });

  it('emits jumpToLesson when a LESSON_VIDEO_NOT_READY FAILED link is clicked', () => {
    publishSvc.setEligibility({
      eligible: false,
      reasons: [
        {
          kind: 'LESSON_VIDEO_NOT_READY',
          moduleId: 'm1' as never, moduleTitle: 'M', moduleOrder: 0,
          lessonId: 'l-z' as never, lessonTitle: 'L', lessonOrder: 0,
          currentState: 'FAILED',
        },
      ],
    });
    fixture.detectChanges();
    let emitted: string | undefined;
    fixture.componentInstance.jumpToLesson.subscribe((id: string) => { emitted = id; });
    const btn = fixture.nativeElement.querySelector(
      '[data-testid="jump-lesson"]',
    ) as HTMLButtonElement | null;
    btn?.click();
    expect(emitted).toBe('l-z');
  });

  it('does NOT emit when a MODULE_HAS_NO_LESSONS reason exists but the LESSON jump button is clicked elsewhere', () => {
    publishSvc.setEligibility({
      eligible: false,
      reasons: [
        { kind: 'MODULE_HAS_NO_LESSONS', moduleId: 'm-x' as never, moduleTitle: 'X', moduleOrder: 0 },
      ],
    });
    fixture.detectChanges();
    let emittedLesson = false;
    fixture.componentInstance.jumpToLesson.subscribe(() => { emittedLesson = true; });
    // Confirm there is no jump-lesson rendered, so the (lesson-side) branch
    // of onJump is unreachable from the DOM for this reason kind.
    expect(fixture.nativeElement.querySelector('[data-testid="jump-lesson"]')).toBeNull();
    expect(emittedLesson).toBe(false);
  });

  it.each([
    ['PENDING_UPLOAD', 'upload is in progress'],
    ['UPLOADED', 'upload is in progress'],
    ['TRANSCODING', 'still transcoding'],
  ] as const)('renders the prose for LESSON_VIDEO_NOT_READY %s', (currentState, snippet) => {
    publishSvc.setEligibility({
      eligible: false,
      reasons: [
        {
          kind: 'LESSON_VIDEO_NOT_READY',
          moduleId: 'm1' as never, moduleTitle: 'M', moduleOrder: 0,
          lessonId: 'l1' as never, lessonTitle: 'L', lessonOrder: 0,
          currentState,
        },
      ],
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain(snippet);
  });

  it('reasonCount returns 0 when eligibility is eligible:true (despite reasons array)', () => {
    publishSvc.setEligibility({ eligible: true, reasons: [] });
    fixture.detectChanges();
    // The count UI is suppressed in the eligible state.
    expect(fixture.nativeElement.textContent).not.toMatch(/\d+ things to fix/);
  });

  it('reasonCount returns 0 when eligibility is null (not yet checked)', () => {
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toMatch(/\d+ things to fix/);
  });

  it('reasonCount returns the reasons.length when eligible:false', () => {
    publishSvc.setEligibility({
      eligible: false,
      reasons: [
        { kind: 'COURSE_HAS_NO_MODULES' },
        { kind: 'COURSE_HAS_NO_MODULES' },
        { kind: 'COURSE_HAS_NO_MODULES' },
      ],
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('3 things to fix');
  });

  describe('protected method logic (direct unit checks)', () => {
    type Internal = {
      reasonCount: () => number;
      jumpLinkVisible: (r: unknown) => 'lesson' | 'module' | null;
      reasonText: (r: unknown) => string;
      onJump: (r: unknown) => void;
    };
    function internal(): Internal {
      return fixture.componentInstance as unknown as Internal;
    }

    const mod = { kind: 'MODULE_HAS_NO_LESSONS', moduleId: 'm1', moduleTitle: 'Mods', moduleOrder: 0 };
    const noVideo = {
      kind: 'LESSON_HAS_NO_VIDEO', moduleId: 'm1', moduleTitle: 'Mod', moduleOrder: 0,
      lessonId: 'l1', lessonTitle: 'Les', lessonOrder: 0,
    };
    const notReadyFailed = {
      kind: 'LESSON_VIDEO_NOT_READY', moduleId: 'm1', moduleTitle: 'Mod', moduleOrder: 0,
      lessonId: 'l1', lessonTitle: 'Les', lessonOrder: 0, currentState: 'FAILED',
    };
    const notReadyTranscoding = { ...notReadyFailed, currentState: 'TRANSCODING' };

    it('reasonCount is 0 when eligible:true even with a non-empty reasons array', () => {
      publishSvc.setEligibility({ eligible: true, reasons: [{ kind: 'COURSE_HAS_NO_MODULES' }] as never });
      expect(internal().reasonCount()).toBe(0);
    });

    it('reasonCount equals reasons.length when eligible:false', () => {
      publishSvc.setEligibility({
        eligible: false,
        reasons: [{ kind: 'COURSE_HAS_NO_MODULES' }, { kind: 'COURSE_HAS_NO_MODULES' }],
      });
      expect(internal().reasonCount()).toBe(2);
    });

    it('jumpLinkVisible maps each reason kind to its link target', () => {
      const i = internal();
      expect(i.jumpLinkVisible(mod)).toBe('module');
      expect(i.jumpLinkVisible(noVideo)).toBe('lesson');
      expect(i.jumpLinkVisible(notReadyFailed)).toBe('lesson');
      // NOT_READY but not FAILED -> no link
      expect(i.jumpLinkVisible(notReadyTranscoding)).toBeNull();
      expect(i.jumpLinkVisible({ kind: 'COURSE_HAS_NO_MODULES' })).toBeNull();
    });

    it('jumpLinkVisible requires the kind to be LESSON_VIDEO_NOT_READY, not just currentState===FAILED', () => {
      // A malformed reason that is NOT a video-not-ready kind but carries
      // currentState:'FAILED'. The kind guard must reject it (null), proving the
      // kind check is load-bearing (not just the currentState check).
      const malformed = { kind: 'COURSE_HAS_NO_MODULES', currentState: 'FAILED' };
      expect(internal().jumpLinkVisible(malformed)).toBeNull();
    });

    it('reasonText returns distinct prose per reason kind', () => {
      const i = internal();
      expect(i.reasonText({ kind: 'COURSE_HAS_NO_MODULES' })).toBe('Add a module before publishing.');
      expect(i.reasonText(mod)).toBe('Module "Mods" has no lessons.');
      expect(i.reasonText(noVideo)).toBe('Mod › Les — no video uploaded yet.');
      expect(i.reasonText(notReadyFailed)).toBe('Mod › Les — Video processing failed — re-upload required.');
      expect(i.reasonText(notReadyTranscoding)).toBe('Mod › Les — Video is still transcoding. Status will update automatically.');
    });

    it('reasonText returns "" for an unknown reason kind (default branch)', () => {
      expect(internal().reasonText({ kind: 'SOMETHING_ELSE' })).toBe('');
    });

    it('onJump emits ONLY jumpToModule for a module reason', () => {
      let mEmit: string | undefined;
      let lEmit: string | undefined;
      fixture.componentInstance.jumpToModule.subscribe((id: string) => { mEmit = id; });
      fixture.componentInstance.jumpToLesson.subscribe((id: string) => { lEmit = id; });
      internal().onJump(mod);
      expect(mEmit).toBe('m1');
      expect(lEmit).toBeUndefined();
    });

    it('onJump emits ONLY jumpToLesson for a lesson reason', () => {
      let mEmit: string | undefined;
      let lEmit: string | undefined;
      fixture.componentInstance.jumpToModule.subscribe((id: string) => { mEmit = id; });
      fixture.componentInstance.jumpToLesson.subscribe((id: string) => { lEmit = id; });
      internal().onJump(noVideo);
      expect(lEmit).toBe('l1');
      expect(mEmit).toBeUndefined();
    });

    // The following decouple jumpLinkVisible's result from r.kind (via a spy) so
    // BOTH operands of each onJump guard are independently exercised. This kills
    // the otherwise-"redundant" kind-check mutants (link===X && kind===Y).
    it('onJump does NOT emit module when link is module but kind is not MODULE_HAS_NO_LESSONS', () => {
      const i = internal();
      vi.spyOn(i as unknown as { jumpLinkVisible: () => string }, 'jumpLinkVisible').mockReturnValue('module');
      let mEmit = false;
      fixture.componentInstance.jumpToModule.subscribe(() => { mEmit = true; });
      i.onJump({ kind: 'COURSE_HAS_NO_MODULES', moduleId: 'mZ' });
      expect(mEmit).toBe(false);
    });

    it('onJump does NOT emit module when kind is MODULE but link is not module', () => {
      const i = internal();
      vi.spyOn(i as unknown as { jumpLinkVisible: () => string | null }, 'jumpLinkVisible').mockReturnValue(null);
      let mEmit = false;
      fixture.componentInstance.jumpToModule.subscribe(() => { mEmit = true; });
      i.onJump({ kind: 'MODULE_HAS_NO_LESSONS', moduleId: 'mZ', moduleTitle: 'Z', moduleOrder: 0 });
      expect(mEmit).toBe(false);
    });

    it('onJump does NOT emit lesson when link is lesson but kind is neither lesson kind', () => {
      const i = internal();
      vi.spyOn(i as unknown as { jumpLinkVisible: () => string }, 'jumpLinkVisible').mockReturnValue('lesson');
      let lEmit = false;
      fixture.componentInstance.jumpToLesson.subscribe(() => { lEmit = true; });
      i.onJump({ kind: 'COURSE_HAS_NO_MODULES', lessonId: 'lZ' });
      expect(lEmit).toBe(false);
    });

    it('onJump emits module only when BOTH link is module AND kind is MODULE_HAS_NO_LESSONS', () => {
      const i = internal();
      vi.spyOn(i as unknown as { jumpLinkVisible: () => string }, 'jumpLinkVisible').mockReturnValue('module');
      let mEmit: string | undefined;
      fixture.componentInstance.jumpToModule.subscribe((id: string) => { mEmit = id; });
      i.onJump({ kind: 'MODULE_HAS_NO_LESSONS', moduleId: 'mOK', moduleTitle: 'Z', moduleOrder: 0 });
      expect(mEmit).toBe('mOK');
    });

    it('onJump emits nothing for a reason with no visible jump link', () => {
      let mEmit = false;
      let lEmit = false;
      fixture.componentInstance.jumpToModule.subscribe(() => { mEmit = true; });
      fixture.componentInstance.jumpToLesson.subscribe(() => { lEmit = true; });
      internal().onJump(notReadyTranscoding);
      internal().onJump({ kind: 'COURSE_HAS_NO_MODULES' });
      expect(mEmit).toBe(false);
      expect(lEmit).toBe(false);
    });
  });
});
