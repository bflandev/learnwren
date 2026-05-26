import { TestBed, ComponentFixture } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';

import type { CourseId, CourseOutline, LessonId, ModuleId } from '@learnwren/shared-data-models';

import { CourseOutlinePanelComponent } from './course-outline-panel.component';

const CID = 'c1' as CourseId;
const MID = 'm1' as ModuleId;

function outline(): CourseOutline {
  return {
    modules: [
      {
        id: MID,
        title: 'M1',
        lessons: [
          { id: 'l1' as LessonId, title: 'L1', videoState: 'READY', completedAt: '2026-05-01T00:00:00Z' as never },
          { id: 'l2' as LessonId, title: 'L2', videoState: 'READY', completedAt: null },
          { id: 'l3' as LessonId, title: 'L3', videoState: 'TRANSCODING', completedAt: null },
        ],
      },
    ],
  };
}

function build(): ComponentFixture<CourseOutlinePanelComponent> {
  TestBed.configureTestingModule({ imports: [CourseOutlinePanelComponent] });
  const fixture = TestBed.createComponent(CourseOutlinePanelComponent);
  fixture.componentRef.setInput('outline', outline());
  fixture.componentRef.setInput('activeLessonId', 'l2' as LessonId);
  fixture.componentRef.setInput('courseId', CID);
  fixture.componentRef.setInput('mode', 'sidebar');
  fixture.componentRef.setInput('outlineOpen', true);
  fixture.detectChanges();
  return fixture;
}

describe('CourseOutlinePanelComponent', () => {
  it('renders module headings and lesson rows in input order', () => {
    const fixture = build();
    const rows = fixture.nativeElement.querySelectorAll('button[data-testid="outline-row"]');
    expect(rows).toHaveLength(3);
    expect(rows[0].textContent).toContain('L1');
    expect(rows[1].textContent).toContain('L2');
    expect(rows[2].textContent).toContain('L3');
  });

  it('marks the active row with aria-current="page"', () => {
    const fixture = build();
    const active = fixture.nativeElement.querySelector('button[aria-current="page"]');
    expect(active?.textContent).toContain('L2');
  });

  it('renders a Completed glyph only on rows whose completedAt is non-null', () => {
    const fixture = build();
    const completed = fixture.nativeElement.querySelectorAll('[aria-label="Completed"]');
    expect(completed).toHaveLength(1);
    const row = completed[0].closest('button[data-testid="outline-row"]');
    expect(row?.textContent).toContain('L1');
  });

  it('marks non-READY rows aria-disabled and shows a processing suffix', () => {
    const fixture = build();
    const rows = fixture.nativeElement.querySelectorAll('button[data-testid="outline-row"]');
    expect(rows[2].getAttribute('aria-disabled')).toBe('true');
    expect(rows[2].textContent).toContain('(processing)');
  });

  it('emits lessonSelected when a READY non-active row is clicked', () => {
    const fixture = build();
    const emissions: LessonId[] = [];
    fixture.componentInstance.lessonSelected.subscribe((id) => emissions.push(id));
    const rows = fixture.nativeElement.querySelectorAll('button[data-testid="outline-row"]');
    rows[0].click(); // L1
    expect(emissions).toEqual(['l1']);
  });

  it('does not emit when the active row is clicked', () => {
    const fixture = build();
    const emissions: LessonId[] = [];
    fixture.componentInstance.lessonSelected.subscribe((id) => emissions.push(id));
    const rows = fixture.nativeElement.querySelectorAll('button[data-testid="outline-row"]');
    rows[1].click(); // active L2
    expect(emissions).toEqual([]);
  });

  it('does not emit when a non-READY row is clicked; surfaces an inline processing notice', () => {
    const fixture = build();
    const emissions: LessonId[] = [];
    fixture.componentInstance.lessonSelected.subscribe((id) => emissions.push(id));
    const rows = fixture.nativeElement.querySelectorAll('button[data-testid="outline-row"]');
    rows[2].click(); // TRANSCODING L3
    fixture.detectChanges();
    expect(emissions).toEqual([]);
    const notice = fixture.nativeElement.querySelector('[data-testid="processing-notice"]');
    expect(notice?.textContent).toContain('still being processed');
  });
});

describe('CourseOutlinePanelComponent (drawer mode)', () => {
  it('emits outlineOpenChange(false) when Escape is pressed in drawer mode', () => {
    TestBed.configureTestingModule({ imports: [CourseOutlinePanelComponent] });
    const fixture = TestBed.createComponent(CourseOutlinePanelComponent);
    fixture.componentRef.setInput('outline', outline());
    fixture.componentRef.setInput('activeLessonId', 'l2' as LessonId);
    fixture.componentRef.setInput('courseId', CID);
    fixture.componentRef.setInput('mode', 'drawer');
    fixture.componentRef.setInput('outlineOpen', true);
    fixture.detectChanges();

    const emissions: boolean[] = [];
    fixture.componentInstance.outlineOpenChange.subscribe((v) => emissions.push(v));

    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
    fixture.nativeElement.querySelector('aside').dispatchEvent(event);
    expect(emissions).toEqual([false]);
  });

  it('emits outlineOpenChange(false) after selecting a lesson in drawer mode', () => {
    TestBed.configureTestingModule({ imports: [CourseOutlinePanelComponent] });
    const fixture = TestBed.createComponent(CourseOutlinePanelComponent);
    fixture.componentRef.setInput('outline', outline());
    fixture.componentRef.setInput('activeLessonId', 'l2' as LessonId);
    fixture.componentRef.setInput('courseId', CID);
    fixture.componentRef.setInput('mode', 'drawer');
    fixture.componentRef.setInput('outlineOpen', true);
    fixture.detectChanges();

    const opens: boolean[] = [];
    fixture.componentInstance.outlineOpenChange.subscribe((v) => opens.push(v));
    const selections: LessonId[] = [];
    fixture.componentInstance.lessonSelected.subscribe((id) => selections.push(id));

    fixture.nativeElement.querySelectorAll('button[data-testid="outline-row"]')[0].click();
    expect(selections).toEqual(['l1']);
    expect(opens).toEqual([false]);
  });

  it('emits outlineOpenChange(false) when the backdrop is clicked in drawer mode', () => {
    TestBed.configureTestingModule({ imports: [CourseOutlinePanelComponent] });
    const fixture = TestBed.createComponent(CourseOutlinePanelComponent);
    fixture.componentRef.setInput('outline', outline());
    fixture.componentRef.setInput('activeLessonId', 'l2' as LessonId);
    fixture.componentRef.setInput('courseId', CID);
    fixture.componentRef.setInput('mode', 'drawer');
    fixture.componentRef.setInput('outlineOpen', true);
    fixture.detectChanges();

    const opens: boolean[] = [];
    fixture.componentInstance.outlineOpenChange.subscribe((v) => opens.push(v));

    const backdrop = fixture.nativeElement.querySelector('[data-testid="outline-backdrop"]');
    backdrop.click();
    expect(opens).toEqual([false]);
  });
});
