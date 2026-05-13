import { describe, expect, it } from 'vitest';

import type { Lesson, VideoId } from '../index';

describe('Lesson type', () => {
  it('allows constructing a Lesson without videoId or description', () => {
    const lesson: Lesson = {
      id: 'lid-1' as Lesson['id'],
      moduleId: 'mid-1' as Lesson['moduleId'],
      title: 'Intro',
      order: 0,
      createdAt: '2026-05-12T00:00:00.000Z' as Lesson['createdAt'],
      updatedAt: '2026-05-12T00:00:00.000Z' as Lesson['updatedAt'],
    };
    expect(lesson.title).toBe('Intro');
    expect(lesson.videoId).toBeUndefined();
    expect(lesson.description).toBeUndefined();
  });

  it('allows constructing a Lesson with optional description and videoId', () => {
    const lesson: Lesson = {
      id: 'lid-1' as Lesson['id'],
      moduleId: 'mid-1' as Lesson['moduleId'],
      title: 'Intro',
      description: 'Welcome',
      videoId: 'v-test' as VideoId,
      order: 0,
      createdAt: '2026-05-12T00:00:00.000Z' as Lesson['createdAt'],
      updatedAt: '2026-05-12T00:00:00.000Z' as Lesson['updatedAt'],
    };
    expect(lesson.description).toBe('Welcome');
    expect(lesson.videoId).toBe('v-test');
  });
});
