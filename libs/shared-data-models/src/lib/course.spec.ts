import { describe, expect, it } from 'vitest';

import type { Course, CourseCategory, CourseDifficulty } from '../index';
import { COURSE_CATEGORIES, COURSE_DIFFICULTIES } from '../index';

describe('Course types', () => {
  it('exposes the six predefined course categories', () => {
    expect(COURSE_CATEGORIES).toEqual([
      'PROGRAMMING',
      'DESIGN',
      'BUSINESS',
      'MARKETING',
      'PERSONAL_DEVELOPMENT',
      'OTHER',
    ]);
  });

  it('exposes the three difficulty levels', () => {
    expect(COURSE_DIFFICULTIES).toEqual(['BEGINNER', 'INTERMEDIATE', 'ADVANCED']);
  });

  it('allows constructing a Course with only required fields', () => {
    const course: Course = {
      id: 'cid-1' as Course['id'],
      title: 'T',
      description: 'D',
      instructorId: 'uid-1' as Course['instructorId'],
      status: 'DRAFT',
      createdAt: '2026-05-12T00:00:00.000Z' as Course['createdAt'],
      updatedAt: '2026-05-12T00:00:00.000Z' as Course['updatedAt'],
    };
    expect(course.title).toBe('T');
  });

  it('allows constructing a Course with optional fields', () => {
    const course: Course = {
      id: 'cid-1' as Course['id'],
      title: 'T',
      description: 'D',
      longDescription: 'LD',
      category: 'PROGRAMMING',
      difficulty: 'BEGINNER',
      instructorId: 'uid-1' as Course['instructorId'],
      status: 'DRAFT',
      createdAt: '2026-05-12T00:00:00.000Z' as Course['createdAt'],
      updatedAt: '2026-05-12T00:00:00.000Z' as Course['updatedAt'],
    };
    expect(course.category).toBe('PROGRAMMING');
  });
});
