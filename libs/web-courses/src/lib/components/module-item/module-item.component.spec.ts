import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import type { Module, ModuleId, CourseId } from '@learnwren/shared-data-models';
import { VideoService } from '@learnwren/web-video';

import { ModuleItemComponent } from './module-item.component';

const M: Module = {
  id: 'mid-1' as ModuleId,
  courseId: 'cid-1' as CourseId,
  title: 'M1',
  order: 0,
  createdAt: '2026-05-12T00:00:00.000Z' as Module['createdAt'],
  updatedAt: '2026-05-12T00:00:00.000Z' as Module['updatedAt'],
};

describe('ModuleItemComponent', () => {
  function build(): ReturnType<typeof TestBed.createComponent<ModuleItemComponent>> {
    TestBed.configureTestingModule({
      imports: [ModuleItemComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        VideoService,
      ],
    });
    const fixture = TestBed.createComponent(ModuleItemComponent);
    fixture.componentRef.setInput('module', M);
    fixture.componentRef.setInput('lessons', []);
    fixture.componentRef.setInput('courseId', 'cid-1' as CourseId);
    fixture.detectChanges();
    return fixture;
  }

  it('renders the module title', () => {
    const fixture = build();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('M1');
  });

  it('emits renameModule on commit', () => {
    const fixture = build();
    const spy = vi.spyOn(fixture.componentInstance.renameModule, 'emit');
    fixture.componentInstance.startEdit();
    fixture.componentInstance.draftTitle.set('Renamed');
    fixture.componentInstance.commit();
    expect(spy).toHaveBeenCalledWith('Renamed');
  });

  it('emits addLesson when a new lesson title is committed', () => {
    const fixture = build();
    const spy = vi.spyOn(fixture.componentInstance.addLesson, 'emit');
    fixture.componentInstance.beginAddLesson();
    fixture.componentInstance.newLessonTitle.set('New lesson');
    fixture.componentInstance.commitAddLesson();
    expect(spy).toHaveBeenCalledWith('New lesson');
  });

  it('emits deleteModule when the button is clicked', () => {
    const fixture = build();
    const spy = vi.spyOn(fixture.componentInstance.deleteModule, 'emit');
    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('[data-testid="module-delete"]')!
      .click();
    expect(spy).toHaveBeenCalled();
  });

  it('does NOT double-emit addLesson when commit fires twice (Enter then blur race)', () => {
    const fixture = build();
    const spy = vi.spyOn(fixture.componentInstance.addLesson, 'emit');
    fixture.componentInstance.beginAddLesson();
    fixture.componentInstance.newLessonTitle.set('Only once');
    fixture.componentInstance.commitAddLesson(); // simulates keydown.enter
    fixture.componentInstance.commitAddLesson(); // simulates blur on the detached input
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('Only once');
  });

  it('starts collapsed: not editing, not adding, with empty drafts', () => {
    const c = build().componentInstance;
    expect(c.editing()).toBe(false);
    expect(c.addingLesson()).toBe(false);
    expect(c.draftTitle()).toBe('');
    expect(c.newLessonTitle()).toBe('');
  });

  it('startEdit() enters edit mode seeded with the current title', () => {
    const c = build().componentInstance;
    c.startEdit();
    expect(c.editing()).toBe(true);
    expect(c.draftTitle()).toBe('M1');
  });

  it('commit() does NOT emit renameModule for a blank title, but exits edit mode', () => {
    const c = build().componentInstance;
    const spy = vi.spyOn(c.renameModule, 'emit');
    c.startEdit();
    c.draftTitle.set('   ');
    c.commit();
    expect(spy).not.toHaveBeenCalled();
    expect(c.editing()).toBe(false);
  });

  it('commit() does NOT emit renameModule when the title is unchanged', () => {
    const c = build().componentInstance;
    const spy = vi.spyOn(c.renameModule, 'emit');
    c.startEdit();
    c.draftTitle.set('M1'); // identical to the current module title
    c.commit();
    expect(spy).not.toHaveBeenCalled();
    expect(c.editing()).toBe(false);
  });

  it('commit() trims the draft before emitting', () => {
    const c = build().componentInstance;
    const spy = vi.spyOn(c.renameModule, 'emit');
    c.startEdit();
    c.draftTitle.set('  Renamed  ');
    c.commit();
    expect(spy).toHaveBeenCalledWith('Renamed');
  });

  it('cancel() exits edit mode without emitting', () => {
    const c = build().componentInstance;
    const spy = vi.spyOn(c.renameModule, 'emit');
    c.startEdit();
    c.cancel();
    expect(c.editing()).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it('beginAddLesson() opens the add-lesson input with an empty draft', () => {
    const c = build().componentInstance;
    c.beginAddLesson();
    expect(c.addingLesson()).toBe(true);
    expect(c.newLessonTitle()).toBe('');
  });

  it('commitAddLesson() does NOT emit addLesson for a blank title, but closes the input', () => {
    const c = build().componentInstance;
    const spy = vi.spyOn(c.addLesson, 'emit');
    c.beginAddLesson();
    c.newLessonTitle.set('   ');
    c.commitAddLesson();
    expect(spy).not.toHaveBeenCalled();
    expect(c.addingLesson()).toBe(false);
  });

  it('commitAddLesson() trims the new lesson title before emitting', () => {
    const c = build().componentInstance;
    const spy = vi.spyOn(c.addLesson, 'emit');
    c.beginAddLesson();
    c.newLessonTitle.set('  Lesson 2  ');
    c.commitAddLesson();
    expect(spy).toHaveBeenCalledWith('Lesson 2');
  });
});
