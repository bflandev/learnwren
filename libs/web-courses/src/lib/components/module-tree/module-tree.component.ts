import {
  CdkDragDrop,
  CdkDrag,
  CdkDropList,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import type { CourseId, Lesson, Module, VideoState } from '@learnwren/shared-data-models';

import { ModuleItemComponent } from '../module-item/module-item.component';

export interface ModuleNode {
  module: Module;
  lessons: Lesson[];
}

@Component({
  selector: 'lib-module-tree',
  standalone: true,
  imports: [CdkDropList, CdkDrag, ModuleItemComponent],
  templateUrl: './module-tree.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModuleTreeComponent {
  readonly nodes = input.required<ModuleNode[]>();
  readonly courseId = input.required<CourseId>();

  readonly reorderModules = output<string[]>();
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
    const next = [...this.nodes()];
    moveItemInArray(next, event.previousIndex, event.currentIndex);
    this.reorderModules.emit(next.map((n) => n.module.id));
  }
}
