import { CdkDragDrop } from '@angular/cdk/drag-drop';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import type { Module, ModuleId, CourseId } from '@learnwren/shared-data-models';

import { ModuleTreeComponent, type ModuleNode } from './module-tree.component';

function node(id: string): ModuleNode {
  const m: Module = {
    id: id as ModuleId,
    courseId: 'cid-1' as CourseId,
    title: id,
    order: 0,
    createdAt: '2026-05-12T00:00:00.000Z' as Module['createdAt'],
    updatedAt: '2026-05-12T00:00:00.000Z' as Module['updatedAt'],
  };
  return { module: m, lessons: [] };
}

describe('ModuleTreeComponent', () => {
  it('shows the empty state when there are no nodes', () => {
    TestBed.configureTestingModule({ imports: [ModuleTreeComponent] });
    const fixture = TestBed.createComponent(ModuleTreeComponent);
    fixture.componentRef.setInput('nodes', []);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('No modules yet');
  });

  it('emits reorderModules with the new id order on drop', () => {
    TestBed.configureTestingModule({ imports: [ModuleTreeComponent] });
    const fixture = TestBed.createComponent(ModuleTreeComponent);
    fixture.componentRef.setInput('nodes', [node('a'), node('b'), node('c')]);
    fixture.detectChanges();
    const spy = vi.spyOn(fixture.componentInstance.reorderModules, 'emit');
    fixture.componentInstance.onDrop({
      previousIndex: 2,
      currentIndex: 0,
    } as CdkDragDrop<ModuleNode[]>);
    expect(spy).toHaveBeenCalledWith(['c', 'a', 'b']);
  });
});
