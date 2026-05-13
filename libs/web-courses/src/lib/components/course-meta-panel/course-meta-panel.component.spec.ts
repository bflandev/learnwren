import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import type { Course, CourseId, UserId } from '@learnwren/shared-data-models';

import { CourseMetaPanelComponent } from './course-meta-panel.component';

const COURSE: Course = {
  id: 'cid-1' as CourseId,
  title: 'Original',
  description: 'D',
  instructorId: 'uid-1' as UserId,
  status: 'DRAFT',
  createdAt: '2026-05-12T00:00:00.000Z' as Course['createdAt'],
  updatedAt: '2026-05-12T00:00:00.000Z' as Course['updatedAt'],
};

describe('CourseMetaPanelComponent', () => {
  function build(): ReturnType<typeof TestBed.createComponent<CourseMetaPanelComponent>> {
    TestBed.configureTestingModule({ imports: [CourseMetaPanelComponent] });
    const fixture = TestBed.createComponent(CourseMetaPanelComponent);
    fixture.componentRef.setInput('course', COURSE);
    fixture.detectChanges();
    return fixture;
  }

  it('emits update with new title on blur after edit', () => {
    const fixture = build();
    const spy = vi.spyOn(fixture.componentInstance.update, 'emit');
    fixture.componentInstance.syncDrafts();
    fixture.componentInstance.draftTitle.set('New');
    fixture.componentInstance.commitTitle();
    expect(spy).toHaveBeenCalledWith({ title: 'New' });
  });

  it('does NOT emit update when title is unchanged', () => {
    const fixture = build();
    const spy = vi.spyOn(fixture.componentInstance.update, 'emit');
    fixture.componentInstance.syncDrafts();
    fixture.componentInstance.commitTitle();
    expect(spy).not.toHaveBeenCalled();
  });

  it('emits deleteCourse on button click', () => {
    const fixture = build();
    const spy = vi.spyOn(fixture.componentInstance.deleteCourse, 'emit');
    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('[data-testid="delete-course"]')!
      .click();
    expect(spy).toHaveBeenCalled();
  });
});
