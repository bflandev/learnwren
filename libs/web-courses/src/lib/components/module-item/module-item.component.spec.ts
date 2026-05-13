import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import type { Module, ModuleId, CourseId } from '@learnwren/shared-data-models';

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
    TestBed.configureTestingModule({ imports: [ModuleItemComponent] });
    const fixture = TestBed.createComponent(ModuleItemComponent);
    fixture.componentRef.setInput('module', M);
    fixture.componentRef.setInput('lessons', []);
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
});
