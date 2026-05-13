import {
  CdkDragDrop,
  CdkDrag,
  CdkDropList,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
import { Component, EventEmitter, Output, input } from '@angular/core';

import type { CourseId, Lesson, Module } from '@learnwren/shared-data-models';

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
})
export class ModuleTreeComponent {
  readonly nodes = input.required<ModuleNode[]>();
  readonly courseId = input.required<CourseId>();

  @Output() readonly reorderModules = new EventEmitter<string[]>();
  @Output() readonly renameModule = new EventEmitter<{ moduleId: string; title: string }>();
  @Output() readonly deleteModule = new EventEmitter<string>();
  @Output() readonly addLesson = new EventEmitter<{ moduleId: string; title: string }>();
  @Output() readonly renameLesson = new EventEmitter<{
    moduleId: string;
    lessonId: string;
    title: string;
  }>();
  @Output() readonly deleteLesson = new EventEmitter<{ moduleId: string; lessonId: string }>();
  @Output() readonly reorderLessons = new EventEmitter<{ moduleId: string; lessonIds: string[] }>();
  @Output() readonly videoChanged = new EventEmitter<void>();

  onDrop(event: CdkDragDrop<ModuleNode[]>): void {
    if (event.previousIndex === event.currentIndex) return;
    const next = [...this.nodes()];
    moveItemInArray(next, event.previousIndex, event.currentIndex);
    this.reorderModules.emit(next.map((n) => n.module.id));
  }
}
