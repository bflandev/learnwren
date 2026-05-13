import { CdkDragDrop } from '@angular/cdk/drag-drop';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import type { Lesson, LessonId, ModuleId } from '@learnwren/shared-data-models';

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
    TestBed.configureTestingModule({ imports: [LessonListComponent] });
    const fixture = TestBed.createComponent(LessonListComponent);
    fixture.componentRef.setInput('lessons', items);
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
});
