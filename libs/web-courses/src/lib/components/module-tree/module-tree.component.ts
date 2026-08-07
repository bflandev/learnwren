import {
  CdkDragDrop,
  CdkDrag,
  CdkDropList,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import type { CourseId, Lesson, Module, VideoState } from '@learnwren/shared-data-models';

import { HlmButton } from '@learnwren/web-ui';

import { ModuleItemComponent } from '../module-item/module-item.component';

export interface ModuleNode {
  module: Module;
  lessons: Lesson[];
}

@Component({
  selector: 'lib-module-tree',
  standalone: true,
  imports: [CdkDropList, CdkDrag, ModuleItemComponent, HlmButton],
  templateUrl: './module-tree.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModuleTreeComponent {
  readonly nodes = input.required<ModuleNode[]>();
  readonly courseId = input.required<CourseId>();
  readonly coursePublished = input<boolean>(false);

  readonly reorderModules = output<string[]>();
  readonly notifyModule = output<string>();
  readonly renameModule = output<{ moduleId: string; title: string }>();
  readonly deleteModule = output<string>();
  readonly addLesson = output<{ moduleId: string; title: string }>();
  readonly renameLesson = output<{
    moduleId: string;
    lessonId: string;
    title: string;
  }>();
  readonly deleteLesson = output<{ moduleId: string; lessonId: string }>();
  readonly reorderLessons = output<{ moduleId: string; lessonIds: string[] }>();
  readonly videoChanged = output<void>();
  readonly videoStateChanged = output<VideoState>();

  onDrop(event: CdkDragDrop<ModuleNode[]>): void {
    if (event.previousIndex === event.currentIndex) return;
    this.commitReorder(event.previousIndex, event.currentIndex);
  }

  /**
   * Keyboard-operable alternative to the pointer-only `cdkDrag` handle above:
   * `cdkDrag` never wires up Space/Arrow reordering by default, and the drag
   * surface here is a plain (non-focusable) `<div>`, so without this pair of
   * buttons a keyboard user has no way to reorder modules at all. Routes
   * through the same `commitReorder` the drop handler above uses — one
   * reorder code path, two ways to trigger it.
   */
  moveModule(from: number, to: number): void {
    if (to < 0 || to >= this.nodes().length) return;
    this.commitReorder(from, to);
  }

  private commitReorder(from: number, to: number): void {
    const next = [...this.nodes()];
    moveItemInArray(next, from, to);
    this.reorderModules.emit(next.map((n) => n.module.id));
  }
}
