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

  it('seeds the drafts from the course input', () => {
    const fixture = build();
    expect(fixture.componentInstance.draftTitle()).toBe('Original');
    expect(fixture.componentInstance.draftDescription()).toBe('D');
  });

  it('re-seeds the drafts when the course input changes', () => {
    const fixture = build();
    fixture.componentRef.setInput('course', { ...COURSE, title: 'Renamed', description: 'E' });
    fixture.detectChanges();
    expect(fixture.componentInstance.draftTitle()).toBe('Renamed');
    expect(fixture.componentInstance.draftDescription()).toBe('E');
  });

  it('preserves an in-progress draft when an unrelated course update arrives (same values, new object)', () => {
    const fixture = build();
    fixture.componentInstance.draftTitle.set('Typing…');
    fixture.componentInstance.draftDescription.set('Also typing…');
    fixture.componentRef.setInput('course', {
      ...COURSE,
      updatedAt: '2026-05-13T00:00:00.000Z' as Course['updatedAt'],
    });
    fixture.detectChanges();
    expect(fixture.componentInstance.draftTitle()).toBe('Typing…');
    expect(fixture.componentInstance.draftDescription()).toBe('Also typing…');
  });

  it('keeps the title field empty while the user clears it to retype (no mid-edit revert)', async () => {
    const fixture = build();
    await fixture.whenStable();
    fixture.detectChanges();
    const input = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(
      '[data-testid="course-title"]',
    )!;
    input.dispatchEvent(new Event('focus'));
    // user starts retyping: partial input, then select-all + delete
    input.value = 'X';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await fixture.whenStable();
    input.value = '';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(input.value).toBe('');
    expect(fixture.componentInstance.draftTitle()).toBe('');
  });

  it('emits update with new title on blur after edit', () => {
    const fixture = build();
    const spy = vi.spyOn(fixture.componentInstance.update, 'emit');
    fixture.componentInstance.draftTitle.set('New');
    fixture.componentInstance.commitTitle();
    expect(spy).toHaveBeenCalledWith({ title: 'New' });
  });

  it('does NOT emit update when title is unchanged', () => {
    const fixture = build();
    const spy = vi.spyOn(fixture.componentInstance.update, 'emit');
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

  it('emits update with new description on commitDescription', () => {
    const fixture = build();
    const spy = vi.spyOn(fixture.componentInstance.update, 'emit');
    fixture.componentInstance.draftDescription.set('Updated body');
    fixture.componentInstance.commitDescription();
    expect(spy).toHaveBeenCalledWith({ description: 'Updated body' });
  });

  it('does NOT emit when description is unchanged from the source', () => {
    const fixture = build();
    const spy = vi.spyOn(fixture.componentInstance.update, 'emit');
    fixture.componentInstance.commitDescription();
    expect(spy).not.toHaveBeenCalled();
  });

  it('does NOT emit when title is whitespace-only', () => {
    const fixture = build();
    const spy = vi.spyOn(fixture.componentInstance.update, 'emit');
    fixture.componentInstance.draftTitle.set('   ');
    fixture.componentInstance.commitTitle();
    expect(spy).not.toHaveBeenCalled();
  });

  it('does NOT emit when description is whitespace-only', () => {
    const fixture = build();
    const spy = vi.spyOn(fixture.componentInstance.update, 'emit');
    fixture.componentInstance.draftDescription.set('  ');
    fixture.componentInstance.commitDescription();
    expect(spy).not.toHaveBeenCalled();
  });

  it('restores the stored title when the field is cleared and blurred', () => {
    // Clearing and clicking away is an abandoned edit, not a save: the field
    // must show the stored value again, not sit blank until a reload.
    const fixture = build();
    fixture.componentInstance.draftTitle.set('');
    fixture.componentInstance.commitTitle();
    expect(fixture.componentInstance.draftTitle()).toBe('Original');
  });

  it('restores the stored description when the field is cleared and blurred', () => {
    const fixture = build();
    fixture.componentInstance.draftDescription.set('   ');
    fixture.componentInstance.commitDescription();
    expect(fixture.componentInstance.draftDescription()).toBe('D');
  });

  it('normalizes an unchanged-but-padded title back to the stored value on blur', () => {
    const fixture = build();
    fixture.componentInstance.draftTitle.set('  Original ');
    fixture.componentInstance.commitTitle();
    expect(fixture.componentInstance.draftTitle()).toBe('Original');
  });
});
