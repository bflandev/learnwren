import { describe, expect, it } from 'vitest';

import type { Course, CourseCategory, CourseDifficulty } from '../index';
import { COURSE_CATEGORIES, COURSE_DIFFICULTIES } from '../index';
import type { CourseId, ISODateString, UserId } from '../index';

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

describe('Course — slice D fields', () => {
  it('accepts a course with publishedAt set', () => {
    const c: Course = {
      id: 'c1' as CourseId,
      title: 'T',
      description: 'D',
      instructorId: 'u1' as UserId,
      status: 'PUBLISHED',
      publishedAt: '2026-05-20T10:00:00.000Z' as ISODateString,
      createdAt: '2026-05-20T09:00:00.000Z' as ISODateString,
      updatedAt: '2026-05-20T10:00:00.000Z' as ISODateString,
    };
    expect(c.publishedAt).toBe('2026-05-20T10:00:00.000Z');
    expect(c.archivedAt).toBeUndefined();
  });

  it('accepts a course with archivedAt set', () => {
    const c: Course = {
      id: 'c2' as CourseId,
      title: 'T',
      description: 'D',
      instructorId: 'u1' as UserId,
      status: 'ARCHIVED',
      archivedAt: '2026-05-20T11:00:00.000Z' as ISODateString,
      createdAt: '2026-05-20T09:00:00.000Z' as ISODateString,
      updatedAt: '2026-05-20T11:00:00.000Z' as ISODateString,
    };
    expect(c.archivedAt).toBe('2026-05-20T11:00:00.000Z');
    expect(c.publishedAt).toBeUndefined();
  });

  it('accepts a course with neither field (legacy / pre-slice-D)', () => {
    const c: Course = {
      id: 'c3' as CourseId,
      title: 'T',
      description: 'D',
      instructorId: 'u1' as UserId,
      status: 'DRAFT',
      createdAt: '2026-05-20T09:00:00.000Z' as ISODateString,
      updatedAt: '2026-05-20T09:00:00.000Z' as ISODateString,
    };
    expect(c.publishedAt).toBeUndefined();
    expect(c.archivedAt).toBeUndefined();
  });
});
