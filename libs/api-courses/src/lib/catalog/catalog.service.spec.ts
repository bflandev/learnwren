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

  it('does NOT filter by category when no category is supplied (returns categorised courses too)', async () => {
    // Kills the `if (query.category)` -> `if (true)` mutant: a forced-true branch
    // would run `c.category === undefined` and drop every categorised course.
    const svc = makeService([
      course({ id: 'c-prog' as CourseId, category: 'PROGRAMMING' }),
      course({ id: 'c-design' as CourseId, category: 'DESIGN' }),
    ]);

    const all = await svc.listCatalogue({});

    expect(all.items.map((i) => i.id).sort()).toEqual(['c-design', 'c-prog']);
  });

  it('does NOT filter by difficulty when none is supplied (returns courses carrying a difficulty)', async () => {
    // Kills the `if (query.difficulty)` -> `if (true)` mutant the same way.
    const svc = makeService([
      course({ id: 'c-beg' as CourseId, difficulty: 'BEGINNER' }),
      course({ id: 'c-adv' as CourseId, difficulty: 'ADVANCED' }),
    ]);

    const all = await svc.listCatalogue({});

    expect(all.items.map((i) => i.id).sort()).toEqual(['c-adv', 'c-beg']);
  });

  it('sorts NEWEST by publishedAt descending', async () => {
    const svc = makeService([
      course({ id: 'old' as CourseId, publishedAt: '2026-01-01T00:00:00.000Z' as ISODateString }),
      course({ id: 'new' as CourseId, publishedAt: '2026-03-01T00:00:00.000Z' as ISODateString }),
    ]);

    const page = await svc.listCatalogue({ sort: 'NEWEST' });

    expect(page.items.map((i) => i.id)).toEqual(['new', 'old']);
  });

  it('NEWEST ignores enrollmentCount (kills `else if (sort === POPULAR)` -> true)', async () => {
    // The newer course has the LOWER enrollmentCount. Under NEWEST the order must
    // be publishedAt-desc. If the POPULAR branch condition is forced true, the
    // result would re-sort by enrollmentCount-desc and put the older one first.
    const svc = makeService([
      course({
        id: 'new-unpopular' as CourseId,
        enrollmentCount: 1,
        publishedAt: '2026-08-01T00:00:00.000Z' as ISODateString,
      }),
      course({
        id: 'old-popular' as CourseId,
        enrollmentCount: 99,
        publishedAt: '2026-01-01T00:00:00.000Z' as ISODateString,
      }),
    ]);

    const page = await svc.listCatalogue({ sort: 'NEWEST' });

    expect(page.items.map((i) => i.id)).toEqual(['new-unpopular', 'old-popular']);
  });

  it('NEWEST ranks by publishedAt, NOT createdAt (kills `publishedAt ?? createdAt` -> `&&`)', async () => {
    // `a` was created last but published first; `b` was created first but
    // published last. NEWEST must key on publishedAt. The `&&` mutant would
    // return createdAt and flip the order.
    const svc = makeService([
      course({
        id: 'pub-first' as CourseId,
        publishedAt: '2026-01-01T00:00:00.000Z' as ISODateString,
        createdAt: '2026-09-09T00:00:00.000Z' as ISODateString,
      }),
      course({
        id: 'pub-last' as CourseId,
        publishedAt: '2026-06-01T00:00:00.000Z' as ISODateString,
        createdAt: '2026-02-02T00:00:00.000Z' as ISODateString,
      }),
    ]);

    const page = await svc.listCatalogue({ sort: 'NEWEST' });

    // By publishedAt desc => pub-last first. By createdAt (the mutant) => pub-first first.
    expect(page.items.map((i) => i.id)).toEqual(['pub-last', 'pub-first']);
  });

  it('sorts ALPHABETICAL by title, overriding the publishedAt-desc input order', async () => {
    // Give the alphabetically-first course the OLDER publishedAt so the upstream
    // listPublished (publishedAt desc) order is the reverse of the alphabetical
    // order. This kills both the `if (sort === 'ALPHABETICAL')` -> false mutant
    // (which would fall through to NEWEST/date order) and proves the sort runs.
    const svc = makeService([
      course({
        id: 'c-b' as CourseId,
        title: 'banana',
        publishedAt: '2026-09-01T00:00:00.000Z' as ISODateString,
      }),
      course({
        id: 'c-a' as CourseId,
        title: 'Apple',
        publishedAt: '2026-01-01T00:00:00.000Z' as ISODateString,
      }),
    ]);

    const page = await svc.listCatalogue({ sort: 'ALPHABETICAL' });

    // Alphabetical: Apple, banana. Date-desc (mutant fall-through): banana, Apple.
    expect(page.items.map((i) => i.title)).toEqual(['Apple', 'banana']);
  });

  it('ALPHABETICAL ties case-variants via { sensitivity: base } (kills the `{}` mutant)', async () => {
    // 'apple' vs 'Apple' differ ONLY by case. With sensitivity:'base' the
    // comparator returns 0 (a tie) so Array.sort keeps the upstream input order
    // — which here is publishedAt desc => lowercase 'apple' (newer) first.
    // Dropping the option makes the default comparator case-sensitive, returning
    // a non-zero value that reorders 'Apple' ahead of 'apple'.
    const svc = makeService([
      course({
        id: 'c-upper' as CourseId,
        title: 'Apple',
        publishedAt: '2026-09-01T00:00:00.000Z' as ISODateString,
      }),
      course({
        id: 'c-lower' as CourseId,
        title: 'apple',
        publishedAt: '2026-01-01T00:00:00.000Z' as ISODateString,
      }),
    ]);

    const page = await svc.listCatalogue({ sort: 'ALPHABETICAL' });

    // Input is publishedAt desc => ['Apple','apple']. base => tie => stable =>
    // ['Apple','apple']; mutant {} => case-sensitive => ['apple','Apple'].
    expect(page.items.map((i) => i.id)).toEqual(['c-upper', 'c-lower']);
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

  it('falls back to the "Instructor" default when the instructor has no user doc', async () => {
    // No `users/u-missing` doc => the directory ref is undefined. `ref?.displayName`
    // must short-circuit (the non-optional `ref.displayName` mutant would throw)
    // and `?? 'Instructor'` must supply the default (kills the "" StringLiteral),
    // while `ref?.photoUrl` must omit the photo (no throw).
    const svc = makeService([
      course({ id: 'c-1' as CourseId, instructorId: 'u-missing' as UserId }),
    ]);

    const page = await svc.listCatalogue({});

    expect(page.items[0]?.instructorDisplayName).toBe('Instructor');
    expect(page.items[0]?.instructorPhotoUrl).toBeUndefined();
  });

  it('uses the "Instructor" default when the user doc exists but has no displayName', async () => {
    // Kills the L154:48 `?? ''` StringLiteral mutant: ref is present (truthy) so
    // `ref?.displayName` is undefined and the `?? 'Instructor'` literal is used.
    const svc = makeService(
      [course({ id: 'c-1' as CourseId, instructorId: 'u-1' as UserId })],
      { 'users/u-1': { id: 'u-1' } },
    );

    const page = await svc.listCatalogue({});

    expect(page.items[0]?.instructorDisplayName).toBe('Instructor');
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

  it('trims surrounding whitespace from the query (kills the dropped `.trim()`)', async () => {
    // The mutant drops `.trim()`, so the search term becomes "  rust  " which
    // would not be a substring of any title/description and would match nothing.
    const svc = makeService([
      course({ id: 'c-rust' as CourseId, title: 'Rust Basics', description: 'd' }),
    ]);

    const page = await svc.search({ q: '  rust  ' });

    expect(page.items.map((i) => i.id)).toEqual(['c-rust']);
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
      { title: 'Module 1', lessons: [{ id: 'l-1', title: 'Lesson 1' }, { id: 'l-2', title: 'Lesson 2' }] },
    ]);
  });

  it('exposes lesson IDs on the outline so /learn can link to them', async () => {
    const firestore = createFakeFirestore({
      'courses/c-1': {
        id: 'c-1',
        title: 'Course One',
        description: 'short',
        instructorId: 'u-1',
        status: 'PUBLISHED',
        publishedAt: '2026-01-01T00:00:00.000Z',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      'courses/c-1/modules/m-1': { id: 'm-1', title: 'M', order: 0 },
      'courses/c-1/modules/m-1/lessons/l-1': { id: 'l-1', title: 'L1', order: 0 },
      'courses/c-1/modules/m-1/lessons/l-2': { id: 'l-2', title: 'L2', order: 1 },
      'users/u-1': { id: 'u-1', displayName: 'Instructor' },
    });
    const svc = new CatalogService(
      new CoursesRepository(firestore as never),
      new InstructorDirectory(firestore as never),
    );

    const detail = await svc.getCourseDetail('c-1' as CourseId);

    expect(detail.modules[0].lessons).toEqual([
      { id: 'l-1', title: 'L1' },
      { id: 'l-2', title: 'L2' },
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
    // Seed in publishedAt-desc order that is the REVERSE of the popularity order
    // so a POPULAR run must actively re-sort. This kills the
    // `else if (sort === 'POPULAR')` -> false mutant (which would fall through to
    // NEWEST and yield the input order) and proves enrollmentCount drives it.
    const svc = makeService([
      course({
        id: 'c-low' as CourseId,
        enrollmentCount: 2,
        publishedAt: '2026-09-03T00:00:00.000Z' as ISODateString,
      }),
      course({
        id: 'c-high' as CourseId,
        enrollmentCount: 9,
        publishedAt: '2026-09-02T00:00:00.000Z' as ISODateString,
      }),
      course({
        id: 'c-none' as CourseId, // no enrollmentCount field => treated as 0
        publishedAt: '2026-09-01T00:00:00.000Z' as ISODateString,
      }),
    ]);

    const page = await svc.listCatalogue({ sort: 'POPULAR' });

    expect(page.items.map((i) => i.id)).toEqual(['c-high', 'c-low', 'c-none']);
  });

  it('breaks an enrollmentCount tie by NEWEST (kills `|| compareNewest` and the compareNewest body)', async () => {
    // Two courses with the SAME enrollmentCount: the primary key returns 0, so
    // the `|| compareNewest(a,b)` tiebreak must order them by publishedAt desc.
    // The `&&` mutant short-circuits 0 (never calls the tiebreak); an emptied
    // compareNewest body returns undefined (no tiebreak). Both leave the input
    // order, which we make the reverse of the expected output.
    const svc = makeService([
      course({
        id: 'tie-older' as CourseId,
        enrollmentCount: 5,
        publishedAt: '2026-01-01T00:00:00.000Z' as ISODateString,
      }),
      course({
        id: 'tie-newer' as CourseId,
        enrollmentCount: 5,
        publishedAt: '2026-08-01T00:00:00.000Z' as ISODateString,
      }),
    ]);

    const page = await svc.listCatalogue({ sort: 'POPULAR' });

    expect(page.items.map((i) => i.id)).toEqual(['tie-newer', 'tie-older']);
  });
});

describe('CatalogService — instructor avatar projection', () => {
  it('getCatalogPage includes instructorId and instructorPhotoUrl on each summary', async () => {
    const svc = makeService(
      [
        course({ id: 'c-1' as CourseId, instructorId: 'u-1' as UserId }),
        course({ id: 'c-2' as CourseId, instructorId: 'u-2' as UserId }),
      ],
      {
        'users/u-1': {
          id: 'u-1',
          displayName: 'Ada Lovelace',
          photoUrl: 'https://example.com/p/u-1/avatar.jpg?v=1',
        },
        'users/u-2': { id: 'u-2', displayName: 'Grace Hopper' },
      },
    );

    const page = await svc.listCatalogue({});
    const byId = new Map(page.items.map((i) => [i.id, i]));

    expect(byId.get('c-1' as CourseId)?.instructorId).toBe('u-1');
    expect(byId.get('c-1' as CourseId)?.instructorPhotoUrl).toBe(
      'https://example.com/p/u-1/avatar.jpg?v=1',
    );
    expect(byId.get('c-2' as CourseId)?.instructorId).toBe('u-2');
    expect(byId.get('c-2' as CourseId)?.instructorPhotoUrl).toBeUndefined();
  });

  it('dedupes instructor reads across N courses on a page', async () => {
    // Build the firestore directly so we can wrap doc().get() with a counting
    // proxy — same pattern as instructor-directory.spec.ts.
    const baseFirestore = createFakeFirestore({
      'courses/c-1': {
        id: 'c-1',
        title: 'c-1',
        description: 'd',
        instructorId: 'u-1',
        status: 'PUBLISHED',
        publishedAt: '2026-01-01T00:00:00.000Z',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      'courses/c-2': {
        id: 'c-2',
        title: 'c-2',
        description: 'd',
        instructorId: 'u-1',
        status: 'PUBLISHED',
        publishedAt: '2026-01-02T00:00:00.000Z',
        createdAt: '2026-01-02T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
      },
      'courses/c-3': {
        id: 'c-3',
        title: 'c-3',
        description: 'd',
        instructorId: 'u-1',
        status: 'PUBLISHED',
        publishedAt: '2026-01-03T00:00:00.000Z',
        createdAt: '2026-01-03T00:00:00.000Z',
        updatedAt: '2026-01-03T00:00:00.000Z',
      },
      'users/u-1': { id: 'u-1', displayName: 'Ada' },
    });

    const getCounts = new Map<string, number>();
    const countingFirestore = {
      ...baseFirestore,
      collection(name: string) {
        const col = baseFirestore.collection(name);
        return {
          ...col,
          doc(id?: string) {
            const docRef = col.doc(id);
            return {
              ...docRef,
              async get() {
                getCounts.set(docRef.path, (getCounts.get(docRef.path) ?? 0) + 1);
                return docRef.get();
              },
            };
          },
        };
      },
    };

    const svc = new CatalogService(
      new CoursesRepository(countingFirestore as never),
      new InstructorDirectory(countingFirestore as never),
    );

    const page = await svc.listCatalogue({});

    expect(page.items).toHaveLength(3);
    expect(getCounts.get('users/u-1')).toBe(1);
  });

  it('getCourseDetail includes instructorId, instructorPhotoUrl, instructorBiography', async () => {
    const firestore = createFakeFirestore({
      'courses/c-1': {
        id: 'c-1',
        title: 'Course One',
        description: 'short',
        instructorId: 'u-1',
        status: 'PUBLISHED',
        publishedAt: '2026-01-01T00:00:00.000Z',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      'users/u-1': {
        id: 'u-1',
        displayName: 'Ada Lovelace',
        photoUrl: 'https://example.com/p/u-1/avatar.jpg?v=1',
        biography: 'Mathematician.',
      },
    });
    const svc = new CatalogService(
      new CoursesRepository(firestore as never),
      new InstructorDirectory(firestore as never),
    );

    const detail = await svc.getCourseDetail('c-1' as CourseId);

    expect(detail.instructorId).toBe('u-1');
    expect(detail.instructorPhotoUrl).toBe('https://example.com/p/u-1/avatar.jpg?v=1');
    expect(detail.instructorBiography).toBe('Mathematician.');
  });

  it('getCourseDetail falls back to defaults when the instructor has no user doc', async () => {
    // No users/* doc => ref is undefined. Exercises the detail-path optional
    // chains (L89 displayName, L90 photoUrl, L91 biography): the non-optional
    // mutants would throw, and the `?? 'Instructor'` default must be applied.
    const svc = makeService([
      course({ id: 'c-1' as CourseId, instructorId: 'u-gone' as UserId }),
    ]);

    const detail = await svc.getCourseDetail('c-1' as CourseId);

    expect(detail.instructorDisplayName).toBe('Instructor');
    expect(detail.instructorPhotoUrl).toBeUndefined();
    expect(detail.instructorBiography).toBeUndefined();
  });

  it('getCourseDetail uses the "Instructor" default when the user doc lacks a displayName', async () => {
    // Kills the L89:50 `?? ''` StringLiteral mutant (ref present, displayName absent).
    const svc = makeService(
      [course({ id: 'c-1' as CourseId, instructorId: 'u-1' as UserId })],
      { 'users/u-1': { id: 'u-1' } },
    );

    const detail = await svc.getCourseDetail('c-1' as CourseId);

    expect(detail.instructorDisplayName).toBe('Instructor');
  });

  it('getCourseDetail normalises empty/absent biography to undefined', async () => {
    const firestore = createFakeFirestore({
      'courses/c-1': {
        id: 'c-1',
        title: 'Course One',
        description: 'short',
        instructorId: 'u-1',
        status: 'PUBLISHED',
        publishedAt: '2026-01-01T00:00:00.000Z',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      'users/u-1': { id: 'u-1', displayName: 'Ada Lovelace', biography: '' },
    });
    const svc = new CatalogService(
      new CoursesRepository(firestore as never),
      new InstructorDirectory(firestore as never),
    );

    const detail = await svc.getCourseDetail('c-1' as CourseId);

    expect(detail.instructorBiography).toBeUndefined();
  });
});

describe('CatalogService — cover image projection', () => {
  it('includes coverImageUrl in CourseSummary when present on Course', async () => {
    const svc = makeService([
      course({ id: 'c-cover' as CourseId, coverImageUrl: 'https://cdn/x.jpg?v=1' }),
    ]);
    const page = await svc.listCatalogue({});
    const item = page.items.find((i) => i.id === 'c-cover');
    expect(item?.coverImageUrl).toBe('https://cdn/x.jpg?v=1');
  });

  it('omits coverImageUrl in CourseSummary when absent on Course', async () => {
    const svc = makeService([course({ id: 'c-bare' as CourseId })]);
    const page = await svc.listCatalogue({});
    expect(page.items.find((i) => i.id === 'c-bare')?.coverImageUrl).toBeUndefined();
  });

  it('includes coverImageUrl in CourseCatalogDetail when present', async () => {
    const svc = makeService([
      course({ id: 'c-cover' as CourseId, coverImageUrl: 'https://cdn/x.jpg?v=1' }),
    ]);
    const detail = await svc.getCourseDetail('c-cover' as CourseId);
    expect(detail.coverImageUrl).toBe('https://cdn/x.jpg?v=1');
  });
});
