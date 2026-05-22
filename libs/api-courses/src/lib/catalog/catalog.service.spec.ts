import { describe, expect, it } from 'vitest';

import type {
  Course,
  CourseId,
  ISODateString,
  UserId,
} from '@learnwren/shared-data-models';

import { CoursesException } from '../errors/courses.exception';
import { createFakeFirestore } from '../testing/fake-firestore';
import { CoursesRepository } from '../courses.repository';
import { InstructorDirectory } from './instructor-directory';
import { CatalogService } from './catalog.service';

function course(over: Partial<Course> & Pick<Course, 'id'>): Course {
  return {
    title: over.id,
    description: 'desc',
    instructorId: 'u-1' as UserId,
    status: 'PUBLISHED',
    publishedAt: '2026-01-01T00:00:00.000Z' as ISODateString,
    createdAt: '2026-01-01T00:00:00.000Z' as ISODateString,
    updatedAt: '2026-01-01T00:00:00.000Z' as ISODateString,
    ...over,
  } as Course;
}

/** Build a CatalogService over a fake Firestore seeded with course docs. */
function makeService(
  courses: Course[],
  users: Record<string, Record<string, unknown>> = {},
): CatalogService {
  const seed: Record<string, Record<string, unknown>> = { ...users };
  for (const c of courses) seed[`courses/${c.id}`] = { ...c } as Record<string, unknown>;
  const firestore = createFakeFirestore(seed);
  const repo = new CoursesRepository(firestore as never);
  const directory = new InstructorDirectory(firestore as never);
  return new CatalogService(repo, directory);
}

describe('CatalogService.listCatalogue', () => {
  it('returns only published courses with pagination metadata', async () => {
    const svc = makeService([
      course({ id: 'c-1' as CourseId }),
      course({ id: 'c-2' as CourseId }),
      course({ id: 'c-draft' as CourseId, status: 'DRAFT' }),
    ]);

    const page = await svc.listCatalogue({});

    expect(page.total).toBe(2);
    expect(page.page).toBe(1);
    expect(page.pageSize).toBe(20);
    expect(page.totalPages).toBe(1);
    expect(page.items.map((i) => i.id).sort()).toEqual(['c-1', 'c-2']);
  });

  it('filters by category and difficulty', async () => {
    const svc = makeService([
      course({ id: 'c-prog-beg' as CourseId, category: 'PROGRAMMING', difficulty: 'BEGINNER' }),
      course({ id: 'c-prog-adv' as CourseId, category: 'PROGRAMMING', difficulty: 'ADVANCED' }),
      course({ id: 'c-design' as CourseId, category: 'DESIGN', difficulty: 'BEGINNER' }),
    ]);

    const byCategory = await svc.listCatalogue({ category: 'PROGRAMMING' });
    expect(byCategory.items.map((i) => i.id).sort()).toEqual(['c-prog-adv', 'c-prog-beg']);

    const byBoth = await svc.listCatalogue({ category: 'PROGRAMMING', difficulty: 'BEGINNER' });
    expect(byBoth.items.map((i) => i.id)).toEqual(['c-prog-beg']);
  });

  it('sorts NEWEST by publishedAt descending', async () => {
    const svc = makeService([
      course({ id: 'old' as CourseId, publishedAt: '2026-01-01T00:00:00.000Z' as ISODateString }),
      course({ id: 'new' as CourseId, publishedAt: '2026-03-01T00:00:00.000Z' as ISODateString }),
    ]);

    const page = await svc.listCatalogue({ sort: 'NEWEST' });

    expect(page.items.map((i) => i.id)).toEqual(['new', 'old']);
  });

  it('sorts ALPHABETICAL by title case-insensitively', async () => {
    const svc = makeService([
      course({ id: 'c-b' as CourseId, title: 'banana' }),
      course({ id: 'c-a' as CourseId, title: 'Apple' }),
    ]);

    const page = await svc.listCatalogue({ sort: 'ALPHABETICAL' });

    expect(page.items.map((i) => i.title)).toEqual(['Apple', 'banana']);
  });

  it('paginates with 20 items per page', async () => {
    const courses = Array.from({ length: 25 }, (_, i) =>
      course({ id: `c-${String(i).padStart(2, '0')}` as CourseId }),
    );
    const svc = makeService(courses);

    const p1 = await svc.listCatalogue({ page: 1 });
    expect(p1.items).toHaveLength(20);
    expect(p1.totalPages).toBe(2);

    const p2 = await svc.listCatalogue({ page: 2 });
    expect(p2.items).toHaveLength(5);
  });

  it('returns an empty page (not an error) past the last page', async () => {
    const svc = makeService([course({ id: 'c-1' as CourseId })]);

    const page = await svc.listCatalogue({ page: 99 });

    expect(page.items).toEqual([]);
    expect(page.total).toBe(1);
  });

  it('resolves the instructor display name onto each summary', async () => {
    const svc = makeService([course({ id: 'c-1' as CourseId, instructorId: 'u-1' as UserId })], {
      'users/u-1': { id: 'u-1', displayName: 'Ada Lovelace' },
    });

    const page = await svc.listCatalogue({});

    expect(page.items[0]?.instructorDisplayName).toBe('Ada Lovelace');
  });

  it('reports zero totalPages for an empty catalogue', async () => {
    const svc = makeService([]);

    const page = await svc.listCatalogue({});

    expect(page.total).toBe(0);
    expect(page.totalPages).toBe(0);
    expect(page.items).toEqual([]);
  });
});

describe('CatalogService.search', () => {
  it('matches title and description case-insensitively', async () => {
    const svc = makeService([
      course({ id: 'c-1' as CourseId, title: 'Learn TypeScript', description: 'd' }),
      course({ id: 'c-2' as CourseId, title: 'Cooking', description: 'about typescript too' }),
      course({ id: 'c-3' as CourseId, title: 'Gardening', description: 'plants' }),
    ]);

    const page = await svc.search({ q: 'TYPESCRIPT' });

    expect(page.items.map((i) => i.id).sort()).toEqual(['c-1', 'c-2']);
  });

  it('ranks a title match above a description-only match', async () => {
    const svc = makeService([
      course({ id: 'desc-only' as CourseId, title: 'Cooking', description: 'uses rust' }),
      course({ id: 'title-hit' as CourseId, title: 'Rust Basics', description: 'd' }),
    ]);

    const page = await svc.search({ q: 'rust' });

    expect(page.items.map((i) => i.id)).toEqual(['title-hit', 'desc-only']);
  });

  it('excludes non-published courses from search results', async () => {
    const svc = makeService([
      course({ id: 'c-draft' as CourseId, title: 'Rust draft', status: 'DRAFT' }),
    ]);

    const page = await svc.search({ q: 'rust' });

    expect(page.items).toEqual([]);
  });
});

describe('CatalogService.getCourseDetail', () => {
  it('assembles the detail payload with the module outline and lesson count', async () => {
    const firestore = createFakeFirestore({
      'courses/c-1': {
        id: 'c-1',
        title: 'Course One',
        description: 'short',
        longDescription: 'long',
        instructorId: 'u-1',
        status: 'PUBLISHED',
        publishedAt: '2026-01-01T00:00:00.000Z',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      'courses/c-1/modules/m-1': { id: 'm-1', title: 'Module 1', order: 0 },
      'courses/c-1/modules/m-1/lessons/l-2': { id: 'l-2', title: 'Lesson 2', order: 1 },
      'courses/c-1/modules/m-1/lessons/l-1': { id: 'l-1', title: 'Lesson 1', order: 0 },
      'users/u-1': { id: 'u-1', displayName: 'Ada Lovelace' },
    });
    const svc = new CatalogService(
      new CoursesRepository(firestore as never),
      new InstructorDirectory(firestore as never),
    );

    const detail = await svc.getCourseDetail('c-1' as CourseId);

    expect(detail.title).toBe('Course One');
    expect(detail.instructorDisplayName).toBe('Ada Lovelace');
    expect(detail.lessonCount).toBe(2);
    expect(detail.modules).toEqual([
      { title: 'Module 1', lessons: [{ title: 'Lesson 1' }, { title: 'Lesson 2' }] },
    ]);
  });

  it('throws COURSE_NOT_FOUND for a missing course', async () => {
    const svc = makeService([]);
    await expect(svc.getCourseDetail('c-ghost' as CourseId)).rejects.toMatchObject({
      code: 'COURSE_NOT_FOUND',
      status: 404,
    });
  });

  it('throws COURSE_NOT_FOUND for a DRAFT course (no draft leak)', async () => {
    const svc = makeService([course({ id: 'c-draft' as CourseId, status: 'DRAFT' })]);
    await expect(svc.getCourseDetail('c-draft' as CourseId)).rejects.toBeInstanceOf(
      CoursesException,
    );
  });

  it('throws COURSE_NOT_FOUND for an ARCHIVED course', async () => {
    const svc = makeService([course({ id: 'c-arch' as CourseId, status: 'ARCHIVED' })]);
    await expect(svc.getCourseDetail('c-arch' as CourseId)).rejects.toMatchObject({
      code: 'COURSE_NOT_FOUND',
    });
  });
});

describe('CatalogService.listCatalogue — POPULAR sort', () => {
  it('orders by enrollmentCount descending, treating a missing count as 0', async () => {
    const svc = makeService([
      course({ id: 'c-low' as CourseId, enrollmentCount: 2 }),
      course({ id: 'c-high' as CourseId, enrollmentCount: 9 }),
      course({ id: 'c-none' as CourseId }), // no enrollmentCount field
    ]);

    const page = await svc.listCatalogue({ sort: 'POPULAR' });

    expect(page.items.map((i) => i.id)).toEqual(['c-high', 'c-low', 'c-none']);
  });
});
