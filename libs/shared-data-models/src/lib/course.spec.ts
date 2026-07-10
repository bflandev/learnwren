import { describe, expect, it } from 'vitest';

import type { Course, CourseCategory, CourseCategoryDoc } from '../index';
import { CATEGORY_NAME_MAX_LENGTH, COURSE_DIFFICULTIES } from '../index';
import type { CourseId, ISODateString, UserId } from '../index';

describe('Course types', () => {
  // Categories are admin-managed docs since US-08-02; the type contract is a
  // branded id referencing `courseCategories/{id}` plus the doc wire shape.
  it('models a category as an id-referenced document', () => {
    const doc: CourseCategoryDoc = {
      id: 'PROGRAMMING' as CourseCategory,
      name: 'Programming',
      createdAt: '2026-05-12T00:00:00.000Z' as ISODateString,
      updatedAt: '2026-05-12T00:00:00.000Z' as ISODateString,
    };
    expect(doc.id).toBe('PROGRAMMING');
    expect(CATEGORY_NAME_MAX_LENGTH).toBe(60);
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
      category: 'PROGRAMMING' as CourseCategory,
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

describe('Course — slice B field', () => {
  it('accepts a course with enrollmentCount set', () => {
    const c: Course = {
      id: 'c4' as CourseId,
      title: 'T',
      description: 'D',
      instructorId: 'u1' as UserId,
      status: 'PUBLISHED',
      enrollmentCount: 42,
      createdAt: '2026-05-22T09:00:00.000Z' as ISODateString,
      updatedAt: '2026-05-22T09:00:00.000Z' as ISODateString,
    };
    expect(c.enrollmentCount).toBe(42);
  });

  it('accepts a course without enrollmentCount (pre-slice-B legacy doc)', () => {
    const c: Course = {
      id: 'c5' as CourseId,
      title: 'T',
      description: 'D',
      instructorId: 'u1' as UserId,
      status: 'DRAFT',
      createdAt: '2026-05-22T09:00:00.000Z' as ISODateString,
      updatedAt: '2026-05-22T09:00:00.000Z' as ISODateString,
    };
    expect(c.enrollmentCount).toBeUndefined();
  });
});

describe('Course — cover image', () => {
  it('accepts a course with coverImageUrl set', () => {
    const c: Course = {
      id: 'c1' as CourseId,
      title: 'T',
      description: 'D',
      instructorId: 'u1' as UserId,
      status: 'DRAFT',
      coverImageUrl: 'https://cdn.example/course-covers/c1/cover.jpg?v=2026-05-25T00:00:00.000Z',
      createdAt: '2026-05-12T00:00:00.000Z' as ISODateString,
      updatedAt: '2026-05-12T00:00:00.000Z' as ISODateString,
    };
    expect(c.coverImageUrl).toMatch(/course-covers\/c1\/cover\.jpg\?v=/);
  });

  it('accepts a course with coverImageUrl absent', () => {
    const c: Course = {
      id: 'c1' as CourseId,
      title: 'T',
      description: 'D',
      instructorId: 'u1' as UserId,
      status: 'DRAFT',
      createdAt: '2026-05-12T00:00:00.000Z' as ISODateString,
      updatedAt: '2026-05-12T00:00:00.000Z' as ISODateString,
    };
    expect(c.coverImageUrl).toBeUndefined();
  });
});
