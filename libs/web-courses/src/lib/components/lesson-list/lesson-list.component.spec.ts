import { CdkDragDrop } from '@angular/cdk/drag-drop';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import type { CourseId, Lesson, LessonId, ModuleId } from '@learnwren/shared-data-models';
import { VideoService } from '@learnwren/web-video';

import { LessonListComponent } from './lesson-list.component';

function lesson(id: string, order: number): Lesson {
  return {
    id: id as LessonId,
    moduleId: 'mid-1' as ModuleId,
    title: id,
    order,
    createdAt: '2026-05-12T00:00:00.000Z' as Lesson['createdAt'],
    updatedAt: '2026-05-12T00:00:00.000Z' as Lesson['updatedAt'],
  };
}

describe('LessonListComponent', () => {
  function build(items: Lesson[]): ReturnType<typeof TestBed.createComponent<LessonListComponent>> {
    TestBed.configureTestingModule({
      imports: [LessonListComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        VideoService,
      ],
    });
    const fixture = TestBed.createComponent(LessonListComponent);
    fixture.componentRef.setInput('lessons', items);
    fixture.componentRef.setInput('courseId', 'c1' as CourseId);
    fixture.detectChanges();
    return fixture;
  }

  it('renders an empty state when there are no lessons', () => {
    const fixture = build([]);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('No lessons yet.');
  });

  it('emits reorder with the new id order on drop', () => {
    const fixture = build([lesson('a', 0), lesson('b', 1), lesson('c', 2)]);
    const spy = vi.spyOn(fixture.componentInstance.reorder, 'emit');
    fixture.componentInstance.onDrop({
      previousIndex: 0,
      currentIndex: 2,
    } as CdkDragDrop<Lesson[]>);
    expect(spy).toHaveBeenCalledWith(['b', 'c', 'a']);
  });

  it('does not emit reorder when previousIndex === currentIndex', () => {
    const fixture = build([lesson('a', 0), lesson('b', 1)]);
    const spy = vi.spyOn(fixture.componentInstance.reorder, 'emit');
    fixture.componentInstance.onDrop({
      previousIndex: 1,
      currentIndex: 1,
    } as CdkDragDrop<Lesson[]>);
    expect(spy).not.toHaveBeenCalled();
  });

  it('emits reorder with the new id order when moveLesson moves an item', () => {
    const fixture = build([lesson('a', 0), lesson('b', 1), lesson('c', 2)]);
    const spy = vi.spyOn(fixture.componentInstance.reorder, 'emit');
    fixture.componentInstance.moveLesson(0, 1);
    expect(spy).toHaveBeenCalledWith(['b', 'a', 'c']);
  });

  it('emits reorder when moveLesson targets index 0 (a valid, not out-of-range, target)', () => {
    const fixture = build([lesson('a', 0), lesson('b', 1), lesson('c', 2)]);
    const spy = vi.spyOn(fixture.componentInstance.reorder, 'emit');
    fixture.componentInstance.moveLesson(1, 0);
    expect(spy).toHaveBeenCalledWith(['b', 'a', 'c']);
  });

  it('does NOT emit reorder when moveLesson is given an out-of-range from index', () => {
    const fixture = build([lesson('a', 0), lesson('b', 1)]);
    const spy = vi.spyOn(fixture.componentInstance.reorder, 'emit');
    // `to` (0) is in range but `from` (5) is not — the `moved` guard, not the
    // `to` bounds guard above it, must be what stops this.
    fixture.componentInstance.moveLesson(5, 0);
    expect(spy).not.toHaveBeenCalled();
  });

  /**
   * In the real app the parent (CourseEditorPageComponent) listens for
   * `reorder` and feeds the new order straight back in as the `lessons`
   * input — that round trip is what actually flips the boundary-disabled
   * state the focus-restoration logic reacts to. Without simulating it, the
   * DOM here would keep the pre-move order/disabled-state and the test would
   * pass for the wrong reason.
   */
  function buildWithReorderRoundTrip(
    items: Lesson[],
  ): ReturnType<typeof TestBed.createComponent<LessonListComponent>> {
    const fixture = build(items);
    fixture.componentInstance.reorder.subscribe((ids) => {
      const byId = new Map(fixture.componentInstance.lessons().map((l) => [l.id, l]));
      fixture.componentRef.setInput(
        'lessons',
        ids.map((id) => byId.get(id as Lesson['id'])),
      );
    });
    return fixture;
  }

  it('restores focus to the moved row\'s own Move-down button after moving it down', async () => {
    const fixture = buildWithReorderRoundTrip([lesson('a', 0), lesson('b', 1), lesson('c', 2)]);
    fixture.componentInstance.moveLesson(0, 1);
    fixture.detectChanges();
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    const expected = root.querySelector('[data-lesson-id="a"] [data-testid="lesson-move-down"]');
    expect(document.activeElement).toBe(expected);
  });

  it('restores focus to the moved row\'s own Move-up button after moving it up', async () => {
    const fixture = buildWithReorderRoundTrip([lesson('a', 0), lesson('b', 1), lesson('c', 2)]);
    fixture.componentInstance.moveLesson(2, 1);
    fixture.detectChanges();
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    const expected = root.querySelector('[data-lesson-id="c"] [data-testid="lesson-move-up"]');
    expect(document.activeElement).toBe(expected);
  });

  it('falls back to Move-up when a downward move lands the row on the last (boundary) position', async () => {
    const fixture = buildWithReorderRoundTrip([lesson('a', 0), lesson('b', 1)]);
    fixture.componentInstance.moveLesson(0, 1);
    fixture.detectChanges();
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    const expected = root.querySelector('[data-lesson-id="a"] [data-testid="lesson-move-up"]');
    expect(document.activeElement).toBe(expected);
  });

  it('falls back to Move-down when an upward move lands the row on the first (boundary) position', async () => {
    const fixture = buildWithReorderRoundTrip([lesson('a', 0), lesson('b', 1)]);
    fixture.componentInstance.moveLesson(1, 0);
    fixture.detectChanges();
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    const expected = root.querySelector('[data-lesson-id="b"] [data-testid="lesson-move-down"]');
    expect(document.activeElement).toBe(expected);
  });

  it('starts with an empty announcement before any keyboard move', () => {
    const fixture = build([lesson('a', 0), lesson('b', 1)]);
    expect(fixture.componentInstance.announcement()).toBe('');
  });

  it('does NOT emit reorder when moveLesson is given the same from/to index', () => {
    const fixture = build([lesson('a', 0), lesson('b', 1)]);
    const spy = vi.spyOn(fixture.componentInstance.reorder, 'emit');
    fixture.componentInstance.moveLesson(1, 1);
    expect(spy).not.toHaveBeenCalled();
  });

  it('does NOT emit reorder when moveLesson targets an out-of-range index', () => {
    const fixture = build([lesson('a', 0), lesson('b', 1)]);
    const spy = vi.spyOn(fixture.componentInstance.reorder, 'emit');
    fixture.componentInstance.moveLesson(0, -1);
    fixture.componentInstance.moveLesson(1, 2);
    expect(spy).not.toHaveBeenCalled();
  });

  it('sets a screen-reader announcement after a keyboard move', () => {
    const fixture = build([lesson('a', 0), lesson('b', 1)]);
    fixture.componentInstance.moveLesson(0, 1);
    expect(fixture.componentInstance.announcement()).toBe('a moved to position 2 of 2');
  });

  it('disables Move up on the first row and Move down on the last row, with descriptive aria-labels', () => {
    const fixture = build([lesson('first-lesson', 0), lesson('mid-lesson', 1), lesson('last-lesson', 2)]);
    const upButtons = fixture.nativeElement.querySelectorAll('[data-testid="lesson-move-up"]');
    const downButtons = fixture.nativeElement.querySelectorAll('[data-testid="lesson-move-down"]');

    expect(upButtons[0].disabled).toBe(true);
    expect(upButtons[1].disabled).toBe(false);
    expect(upButtons[2].disabled).toBe(false);
    expect(downButtons[0].disabled).toBe(false);
    expect(downButtons[1].disabled).toBe(false);
    expect(downButtons[2].disabled).toBe(true);

    expect(upButtons[0].getAttribute('aria-label')).toBe('Move first-lesson up');
    expect(downButtons[2].getAttribute('aria-label')).toBe('Move last-lesson down');
  });
});
