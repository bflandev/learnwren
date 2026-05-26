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
