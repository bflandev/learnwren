import { CdkDragDrop } from '@angular/cdk/drag-drop';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import type { Module, ModuleId, CourseId } from '@learnwren/shared-data-models';
import { VideoService } from '@learnwren/web-video';

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
    TestBed.configureTestingModule({
      imports: [ModuleTreeComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), VideoService],
    });
    const fixture = TestBed.createComponent(ModuleTreeComponent);
    fixture.componentRef.setInput('nodes', []);
    fixture.componentRef.setInput('courseId', 'cid-1' as CourseId);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('No modules yet');
  });

  it('emits reorderModules with the new id order on drop', () => {
    TestBed.configureTestingModule({
      imports: [ModuleTreeComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), VideoService],
    });
    const fixture = TestBed.createComponent(ModuleTreeComponent);
    fixture.componentRef.setInput('nodes', [node('a'), node('b'), node('c')]);
    fixture.componentRef.setInput('courseId', 'cid-1' as CourseId);
    fixture.detectChanges();
    const spy = vi.spyOn(fixture.componentInstance.reorderModules, 'emit');
    fixture.componentInstance.onDrop({
      previousIndex: 2,
      currentIndex: 0,
    } as CdkDragDrop<ModuleNode[]>);
    expect(spy).toHaveBeenCalledWith(['c', 'a', 'b']);
  });

  it('does NOT emit reorderModules when the item is dropped in place', () => {
    TestBed.configureTestingModule({
      imports: [ModuleTreeComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), VideoService],
    });
    const fixture = TestBed.createComponent(ModuleTreeComponent);
    fixture.componentRef.setInput('nodes', [node('a'), node('b')]);
    fixture.componentRef.setInput('courseId', 'cid-1' as CourseId);
    fixture.detectChanges();
    const spy = vi.spyOn(fixture.componentInstance.reorderModules, 'emit');
    fixture.componentInstance.onDrop({
      previousIndex: 1,
      currentIndex: 1,
    } as CdkDragDrop<ModuleNode[]>);
    expect(spy).not.toHaveBeenCalled();
  });

  it('defaults coursePublished to false when the input is not provided', () => {
    TestBed.configureTestingModule({
      imports: [ModuleTreeComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), VideoService],
    });
    const fixture = TestBed.createComponent(ModuleTreeComponent);
    fixture.componentRef.setInput('nodes', [node('a')]);
    fixture.componentRef.setInput('courseId', 'cid-1' as CourseId);
    fixture.detectChanges();
    expect(fixture.componentInstance.coursePublished()).toBe(false);
  });
});
