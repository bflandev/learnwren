import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';

import type { CourseSummary } from '@learnwren/shared-data-models';

import { CourseCardComponent } from './course-card.component';

const summary: CourseSummary = {
  id: 'c-1',
  title: 'Learn Rust',
  description: 'A short course',
  difficulty: 'BEGINNER',
  instructorDisplayName: 'Ada Lovelace',
  publishedAt: '2026-01-01T00:00:00.000Z' as CourseSummary['publishedAt'],
};

describe('CourseCardComponent', () => {
  function render(course: CourseSummary): HTMLElement {
    TestBed.configureTestingModule({
      imports: [CourseCardComponent],
      providers: [provideRouter([])],
    });
    const fixture = TestBed.createComponent(CourseCardComponent);
    fixture.componentRef.setInput('course', course);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('renders the title, instructor name and difficulty', () => {
    const el = render(summary);
    const text = el.textContent ?? '';
    expect(text).toContain('Learn Rust');
    expect(text).toContain('Ada Lovelace');
    expect(text).toContain('BEGINNER');
  });

  it('links to the course detail page', () => {
    const el = render(summary);
    const anchor = el.querySelector<HTMLAnchorElement>('a');
    expect(anchor?.getAttribute('href')).toBe('/catalog/c-1');
  });

  it('omits the difficulty pill when difficulty is absent', () => {
    const summaryWithoutDifficulty: CourseSummary = {
      id: 'c-2',
      title: 'Learn Go',
      description: 'A short course on Go',
      instructorDisplayName: 'Grace Hopper',
      publishedAt: '2026-01-01T00:00:00.000Z' as CourseSummary['publishedAt'],
    };
    const el = render(summaryWithoutDifficulty);
    expect(el.querySelector('lw-pill')).toBeNull();
  });
});
