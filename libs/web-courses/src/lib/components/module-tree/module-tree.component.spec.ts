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

  it('emits reorderModules with the new id order when moveModule moves an item', () => {
    TestBed.configureTestingModule({
      imports: [ModuleTreeComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), VideoService],
    });
    const fixture = TestBed.createComponent(ModuleTreeComponent);
    fixture.componentRef.setInput('nodes', [node('a'), node('b'), node('c')]);
    fixture.componentRef.setInput('courseId', 'cid-1' as CourseId);
    fixture.detectChanges();
    const spy = vi.spyOn(fixture.componentInstance.reorderModules, 'emit');
    fixture.componentInstance.moveModule(0, 1);
    expect(spy).toHaveBeenCalledWith(['b', 'a', 'c']);
  });

  it('emits reorderModules when moveModule targets index 0 (a valid, not out-of-range, target)', () => {
    TestBed.configureTestingModule({
      imports: [ModuleTreeComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), VideoService],
    });
    const fixture = TestBed.createComponent(ModuleTreeComponent);
    fixture.componentRef.setInput('nodes', [node('a'), node('b'), node('c')]);
    fixture.componentRef.setInput('courseId', 'cid-1' as CourseId);
    fixture.detectChanges();
    const spy = vi.spyOn(fixture.componentInstance.reorderModules, 'emit');
    fixture.componentInstance.moveModule(1, 0);
    expect(spy).toHaveBeenCalledWith(['b', 'a', 'c']);
  });

  it('does NOT emit reorderModules when moveModule targets an out-of-range index', () => {
    TestBed.configureTestingModule({
      imports: [ModuleTreeComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), VideoService],
    });
    const fixture = TestBed.createComponent(ModuleTreeComponent);
    fixture.componentRef.setInput('nodes', [node('a'), node('b')]);
    fixture.componentRef.setInput('courseId', 'cid-1' as CourseId);
    fixture.detectChanges();
    const spy = vi.spyOn(fixture.componentInstance.reorderModules, 'emit');
    fixture.componentInstance.moveModule(0, -1);
    fixture.componentInstance.moveModule(1, 2);
    expect(spy).not.toHaveBeenCalled();
  });

  it('does NOT emit reorderModules when moveModule is given an out-of-range from index', () => {
    TestBed.configureTestingModule({
      imports: [ModuleTreeComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), VideoService],
    });
    const fixture = TestBed.createComponent(ModuleTreeComponent);
    fixture.componentRef.setInput('nodes', [node('a'), node('b')]);
    fixture.componentRef.setInput('courseId', 'cid-1' as CourseId);
    fixture.detectChanges();
    const spy = vi.spyOn(fixture.componentInstance.reorderModules, 'emit');
    // `to` (0) is in range but `from` (5) is not — the movedNode guard, not
    // the `to` bounds guard above it, must be what stops this.
    fixture.componentInstance.moveModule(5, 0);
    expect(spy).not.toHaveBeenCalled();
  });

  /**
   * In the real app the parent (CourseEditorPageComponent) listens for
   * `reorderModules` and feeds the new order straight back in as the `nodes`
   * input — that round trip is what actually flips the boundary-disabled
   * state the focus-restoration logic reacts to. Without simulating it, the
   * DOM here would keep the pre-move order/disabled-state and the test would
   * pass for the wrong reason.
   */
  function buildWithReorderRoundTrip(
    nodes: ModuleNode[],
  ): ReturnType<typeof TestBed.createComponent<ModuleTreeComponent>> {
    TestBed.configureTestingModule({
      imports: [ModuleTreeComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), VideoService],
    });
    const fixture = TestBed.createComponent(ModuleTreeComponent);
    fixture.componentRef.setInput('nodes', nodes);
    fixture.componentRef.setInput('courseId', 'cid-1' as CourseId);
    fixture.detectChanges();
    fixture.componentInstance.reorderModules.subscribe((ids) => {
      const byId = new Map(fixture.componentInstance.nodes().map((n) => [n.module.id, n]));
      fixture.componentRef.setInput(
        'nodes',
        ids.map((id) => byId.get(id as ModuleNode['module']['id'])),
      );
    });
    return fixture;
  }

  it('restores focus to the moved row\'s own Move-down button after moving it down', async () => {
    const fixture = buildWithReorderRoundTrip([node('a'), node('b'), node('c')]);
    fixture.componentInstance.moveModule(0, 1);
    fixture.detectChanges();
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    const expected = root.querySelector('[data-module-id="a"] [data-testid="module-move-down"]');
    expect(document.activeElement).toBe(expected);
  });

  it('restores focus to the moved row\'s own Move-up button after moving it up', async () => {
    const fixture = buildWithReorderRoundTrip([node('a'), node('b'), node('c')]);
    fixture.componentInstance.moveModule(2, 1);
    fixture.detectChanges();
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    const expected = root.querySelector('[data-module-id="c"] [data-testid="module-move-up"]');
    expect(document.activeElement).toBe(expected);
  });

  it('falls back to Move-up when a downward move lands the row on the last (boundary) position', async () => {
    const fixture = buildWithReorderRoundTrip([node('a'), node('b')]);
    // 'a' moves down to the last slot — its own Move-down button becomes
    // disabled by the same render, so focus must fall back to Move-up.
    fixture.componentInstance.moveModule(0, 1);
    fixture.detectChanges();
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    const expected = root.querySelector('[data-module-id="a"] [data-testid="module-move-up"]');
    expect(document.activeElement).toBe(expected);
  });

  it('falls back to Move-down when an upward move lands the row on the first (boundary) position', async () => {
    const fixture = buildWithReorderRoundTrip([node('a'), node('b')]);
    fixture.componentInstance.moveModule(1, 0);
    fixture.detectChanges();
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    const expected = root.querySelector('[data-module-id="b"] [data-testid="module-move-down"]');
    expect(document.activeElement).toBe(expected);
  });

  it('starts with an empty announcement before any keyboard move', () => {
    TestBed.configureTestingModule({
      imports: [ModuleTreeComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), VideoService],
    });
    const fixture = TestBed.createComponent(ModuleTreeComponent);
    fixture.componentRef.setInput('nodes', [node('a'), node('b')]);
    fixture.componentRef.setInput('courseId', 'cid-1' as CourseId);
    fixture.detectChanges();
    expect(fixture.componentInstance.announcement()).toBe('');
  });

  it('does NOT emit reorderModules when moveModule is given the same from/to index', () => {
    TestBed.configureTestingModule({
      imports: [ModuleTreeComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), VideoService],
    });
    const fixture = TestBed.createComponent(ModuleTreeComponent);
    fixture.componentRef.setInput('nodes', [node('a'), node('b')]);
    fixture.componentRef.setInput('courseId', 'cid-1' as CourseId);
    fixture.detectChanges();
    const spy = vi.spyOn(fixture.componentInstance.reorderModules, 'emit');
    fixture.componentInstance.moveModule(1, 1);
    expect(spy).not.toHaveBeenCalled();
  });

  it('sets a screen-reader announcement after a keyboard move', () => {
    TestBed.configureTestingModule({
      imports: [ModuleTreeComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), VideoService],
    });
    const fixture = TestBed.createComponent(ModuleTreeComponent);
    fixture.componentRef.setInput('nodes', [node('a'), node('b')]);
    fixture.componentRef.setInput('courseId', 'cid-1' as CourseId);
    fixture.detectChanges();
    fixture.componentInstance.moveModule(0, 1);
    expect(fixture.componentInstance.announcement()).toBe('a moved to position 2 of 2');
  });

  it('disables Move up on the first row and Move down on the last row, with descriptive aria-labels', () => {
    TestBed.configureTestingModule({
      imports: [ModuleTreeComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), VideoService],
    });
    const fixture = TestBed.createComponent(ModuleTreeComponent);
    fixture.componentRef.setInput('nodes', [node('first-module'), node('mid-module'), node('last-module')]);
    fixture.componentRef.setInput('courseId', 'cid-1' as CourseId);
    fixture.detectChanges();
    const upButtons = fixture.nativeElement.querySelectorAll('[data-testid="module-move-up"]');
    const downButtons = fixture.nativeElement.querySelectorAll('[data-testid="module-move-down"]');

    expect(upButtons[0].disabled).toBe(true);
    expect(upButtons[1].disabled).toBe(false);
    expect(upButtons[2].disabled).toBe(false);
    expect(downButtons[0].disabled).toBe(false);
    expect(downButtons[1].disabled).toBe(false);
    expect(downButtons[2].disabled).toBe(true);

    expect(upButtons[0].getAttribute('aria-label')).toBe('Move first-module up');
    expect(downButtons[2].getAttribute('aria-label')).toBe('Move last-module down');
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
