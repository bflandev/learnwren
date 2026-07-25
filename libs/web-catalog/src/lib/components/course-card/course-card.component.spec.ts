import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';

import type { CourseSummary } from '@learnwren/shared-data-models';
import { coverToneForId } from '@learnwren/web-ui';

import { CourseCardComponent } from './course-card.component';

const summary: CourseSummary = {
  id: 'c-1',
  title: 'Learn Rust',
  description: 'A short course',
  difficulty: 'BEGINNER',
  instructorId: 'u-1' as CourseSummary['instructorId'],
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

  // The card's only runtime logic is `coverTone = computed(coverToneForId(id))`,
  // surfaced by lw-cover as [attr.data-tone]. Asserting the rendered tone is the
  // id-derived value catches a computed that returned undefined or ignored the
  // id. Two ids that hash to different tones prove it's keyed off the course id.
  // (Separate `it`s — the render() helper reconfigures TestBed, which can't be
  // called twice within one test.)
  it('applies the id-derived cover tone to <lw-cover> for c-1', () => {
    const tone = render(summary).querySelector('lw-cover')?.getAttribute('data-tone');
    expect(tone).toBe(coverToneForId('c-1'));
  });

  it('derives a different cover tone for a different course id', () => {
    expect(coverToneForId('c-2')).not.toBe(coverToneForId('c-1')); // guards the fixture choice
    const tone = render({ ...summary, id: 'c-2' })
      .querySelector('lw-cover')
      ?.getAttribute('data-tone');
    expect(tone).toBe(coverToneForId('c-2'));
  });

  it('links to the course detail page', () => {
    const el = render(summary);
    const anchor = el.querySelector<HTMLAnchorElement>('a');
    expect(anchor?.getAttribute('href')).toBe('/catalog/c-1');
  });

  it('omits the difficulty badge when difficulty is absent', () => {
    const summaryWithoutDifficulty: CourseSummary = {
      id: 'c-2',
      title: 'Learn Go',
      description: 'A short course on Go',
      instructorId: 'u-2' as CourseSummary['instructorId'],
      instructorDisplayName: 'Grace Hopper',
      publishedAt: '2026-01-01T00:00:00.000Z' as CourseSummary['publishedAt'],
    };
    const el = render(summaryWithoutDifficulty);
    expect(el.querySelector('[data-testid="card-difficulty-badge"]')).toBeNull();
  });

  it('renders <hlm-avatar> bound to instructorPhotoUrl', () => {
    const summaryWithPhoto: CourseSummary = {
      id: 'c-1' as CourseSummary['id'],
      title: 'Intro',
      description: 'd',
      instructorId: 'u-1' as CourseSummary['instructorId'],
      instructorDisplayName: 'Ada',
      instructorPhotoUrl: 'https://x/avatar.jpg?v=1',
      publishedAt: '2026-05-28T00:00:00.000Z' as CourseSummary['publishedAt'],
    };
    const el = render(summaryWithPhoto);
    const avatar = el.querySelector('hlm-avatar');
    expect(avatar).toBeTruthy();
    const img = avatar?.querySelector('img');
    expect(img?.getAttribute('src')).toContain('avatar.jpg');
  });

  it('renders initials fallback when instructorPhotoUrl is absent', () => {
    const summaryNoPhoto: CourseSummary = {
      id: 'c-1' as CourseSummary['id'],
      title: 'Intro',
      description: 'd',
      instructorId: 'u-1' as CourseSummary['instructorId'],
      instructorDisplayName: 'Ada',
      publishedAt: '2026-05-28T00:00:00.000Z' as CourseSummary['publishedAt'],
    };
    const el = render(summaryNoPhoto);
    expect(el.querySelector('hlm-avatar img')).toBeNull();
    expect(
      el.querySelector('[data-testid="card-avatar-initials"]')?.textContent?.trim(),
    ).toBe('AD');
  });

  it('shows a Completed pill when completed', () => {
    TestBed.configureTestingModule({
      imports: [CourseCardComponent],
      providers: [provideRouter([])],
    });
    const fixture = TestBed.createComponent(CourseCardComponent);
    fixture.componentRef.setInput('course', summary);
    fixture.componentRef.setInput('completed', true);
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('[data-testid="card-completed-pill"]'),
    ).toBeTruthy();
  });

  it('shows no Completed pill by default', () => {
    TestBed.configureTestingModule({
      imports: [CourseCardComponent],
      providers: [provideRouter([])],
    });
    const fixture = TestBed.createComponent(CourseCardComponent);
    fixture.componentRef.setInput('course', summary);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="card-completed-pill"]')).toBeNull();
  });
});
