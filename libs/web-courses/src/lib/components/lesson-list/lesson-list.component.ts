import {
  CdkDragDrop,
  CdkDrag,
  CdkDropList,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  inject,
  input,
  output,
  signal,
} from '@angular/core';

import type { CourseId, Lesson, VideoState } from '@learnwren/shared-data-models';

import { HlmButton } from '@learnwren/web-ui';

import { focusReorderButton, reorderAnnouncement } from '../../keyboard-reorder.util';
import { LessonItemComponent } from '../lesson-item/lesson-item.component';

@Component({
  selector: 'lib-lesson-list',
  standalone: true,
  imports: [CdkDropList, CdkDrag, LessonItemComponent, HlmButton],
  templateUrl: './lesson-list.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LessonListComponent {
  private readonly elementRef = inject(ElementRef<HTMLElement>);
  private readonly injector = inject(Injector);

  readonly lessons = input.required<Lesson[]>();
  readonly courseId = input.required<CourseId>();
  readonly reorder = output<string[]>();
  readonly renameLesson = output<{ lessonId: string; title: string }>();
  readonly deleteLesson = output<string>();
  readonly videoChanged = output<void>();
  readonly videoStateChanged = output<VideoState>();

  /** Live region text for the keyboard reorder buttons — see ModuleTreeComponent's announcement field for the rationale. */
  readonly announcement = signal('');

  onDrop(event: CdkDragDrop<Lesson[]>): void {
    if (event.previousIndex === event.currentIndex) return;
    this.commitReorder(event.previousIndex, event.currentIndex);
  }

  /**
   * Keyboard-operable alternative to the pointer-only `cdkDrag` handle in the
   * template below — identical trap and identical fix as
   * ModuleTreeComponent.moveModule: routes through the same `commitReorder`
   * the drop handler uses.
   */
  moveLesson(from: number, to: number): void {
    if (from === to) return;
    if (to < 0 || to >= this.lessons().length) return;
    const moved = this.lessons()[from];
    if (!moved) return;
    const total = this.lessons().length;
    this.commitReorder(from, to);
    this.announcement.set(reorderAnnouncement(moved.title, to, total));
    // Stryker disable next-line EqualityOperator: equivalent — `from === to` already returned above, so `to >= from` and `to > from` agree on every reachable input.
    const direction: 'up' | 'down' = to > from ? 'down' : 'up';
    afterNextRender(
      () => focusReorderButton(this.elementRef.nativeElement, 'lesson', moved.id, direction),
      { injector: this.injector },
    );
  }

  private commitReorder(from: number, to: number): void {
    const next = [...this.lessons()];
    moveItemInArray(next, from, to);
    this.reorder.emit(next.map((l) => l.id));
  }
}
