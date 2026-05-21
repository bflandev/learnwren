import type { firestore as adminFirestore } from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FIRESTORE, type FirestoreHandle } from '@learnwren/api-firebase';
import type {
  Course,
  CourseId,
  ISODateString,
  Lesson,
  LessonId,
  Module,
  ModuleId,
  UserId,
} from '@learnwren/shared-data-models';

import { CoursesRepository } from './courses.repository';
import { CourseNotFoundException } from './errors/courses.exception';
import { createFakeFirestore, type FakeFirestore } from './testing/fake-firestore';

const INSTRUCTOR = 'uid-instructor-1' as UserId;
const SEED_DATE = '2026-05-12T00:00:00.000Z' as ISODateString;
const NOW = new Date('2026-05-21T12:00:00.000Z');

function makeCourse(overrides: Partial<Course> = {}): Course {
  return {
    id: 'cid-1' as CourseId,
    title: 'Intro to Wren',
    description: 'A course.',
    instructorId: INSTRUCTOR,
    status: 'DRAFT',
    createdAt: SEED_DATE,
    updatedAt: SEED_DATE,
    ...overrides,
  };
}

function makeModule(overrides: Partial<Module> = {}): Module {
  return {
    id: 'mid-1' as ModuleId,
    courseId: 'cid-1' as CourseId,
    title: 'Module 1',
    order: 0,
    createdAt: SEED_DATE,
    updatedAt: SEED_DATE,
    ...overrides,
  };
}

function makeLesson(overrides: Partial<Lesson> = {}): Lesson {
  return {
    id: 'lid-1' as LessonId,
    moduleId: 'mid-1' as ModuleId,
    title: 'Lesson 1',
    order: 0,
    createdAt: SEED_DATE,
    updatedAt: SEED_DATE,
    ...overrides,
  };
}

async function buildRepo(fake: FakeFirestore): Promise<CoursesRepository> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      CoursesRepository,
      { provide: FIRESTORE, useValue: fake as unknown as FirestoreHandle },
    ],
  }).compile();
  return moduleRef.get(CoursesRepository);
}

/** Run a callback inside a fake transaction, casting to the admin SDK type the repo expects. */
function withTxn<T>(
  fake: FakeFirestore,
  fn: (t: adminFirestore.Transaction) => Promise<T>,
): Promise<T> {
  return fake.runTransaction((t) => fn(t as unknown as adminFirestore.Transaction));
}

describe('CoursesRepository — Course', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  it('createCourse writes the course at courses/{id}', async () => {
    const fake = createFakeFirestore();
    const repo = await buildRepo(fake);
    const course = makeCourse();

    await repo.createCourse(course);

    expect(fake.__store.get('courses/cid-1')).toEqual(course);
  });

  it('getCourse returns the stored course, or null when absent', async () => {
    const fake = createFakeFirestore({ 'courses/cid-1': makeCourse() });
    const repo = await buildRepo(fake);

    expect(await repo.getCourse('cid-1' as CourseId)).toEqual(makeCourse());
    expect(await repo.getCourse('cid-missing' as CourseId)).toBeNull();
  });

  it('listCoursesByInstructor filters by instructorId and orders by updatedAt desc', async () => {
    const fake = createFakeFirestore({
      'courses/c-old': makeCourse({
        id: 'c-old' as CourseId,
        updatedAt: '2026-05-01T00:00:00.000Z' as ISODateString,
      }),
      'courses/c-new': makeCourse({
        id: 'c-new' as CourseId,
        updatedAt: '2026-05-19T00:00:00.000Z' as ISODateString,
      }),
      'courses/c-other': makeCourse({
        id: 'c-other' as CourseId,
        instructorId: 'uid-someone-else' as UserId,
      }),
    });
    const repo = await buildRepo(fake);

    const result = await repo.listCoursesByInstructor(INSTRUCTOR);

    // Excludes the other instructor's course; newest first.
    expect(result.map((c) => c.id)).toEqual(['c-new', 'c-old']);
  });

  it('updateCourse merges the patch and refreshes updatedAt', async () => {
    const fake = createFakeFirestore({ 'courses/cid-1': makeCourse() });
    const repo = await buildRepo(fake);

    await repo.updateCourse('cid-1' as CourseId, { title: 'Renamed' });

    const stored = fake.__store.get('courses/cid-1') as Course;
    expect(stored.title).toBe('Renamed');
    expect(stored.description).toBe('A course.'); // untouched
    expect(stored.updatedAt).toBe(NOW.toISOString());
  });

  it('deleteCourseRecursive removes the course and every nested module and lesson', async () => {
    const fake = createFakeFirestore({
      'courses/cid-1': makeCourse(),
      'courses/cid-1/modules/mid-1': makeModule(),
      'courses/cid-1/modules/mid-1/lessons/lid-1': makeLesson(),
      'courses/cid-keep': makeCourse({ id: 'cid-keep' as CourseId }),
    });
    const repo = await buildRepo(fake);

    await repo.deleteCourseRecursive('cid-1' as CourseId);

    expect(fake.__store.has('courses/cid-1')).toBe(false);
    expect(fake.__store.has('courses/cid-1/modules/mid-1')).toBe(false);
    expect(fake.__store.has('courses/cid-1/modules/mid-1/lessons/lid-1')).toBe(false);
    expect(fake.__store.has('courses/cid-keep')).toBe(true); // unrelated course survives
  });
});

describe('CoursesRepository — Module', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  it('appendModule assigns order = sibling count and touches the course', async () => {
    const fake = createFakeFirestore({ 'courses/cid-1': makeCourse() });
    const repo = await buildRepo(fake);

    const first = await repo.appendModule('cid-1' as CourseId, {
      id: 'mid-1' as ModuleId,
      courseId: 'cid-1' as CourseId,
      title: 'M1',
    });
    const second = await repo.appendModule('cid-1' as CourseId, {
      id: 'mid-2' as ModuleId,
      courseId: 'cid-1' as CourseId,
      title: 'M2',
    });

    expect(first.order).toBe(0);
    expect(second.order).toBe(1);
    expect(first.createdAt).toBe(NOW.toISOString());
    expect((fake.__store.get('courses/cid-1') as Course).updatedAt).toBe(NOW.toISOString());
  });

  it('getModule returns the stored module, or null when absent', async () => {
    const fake = createFakeFirestore({
      'courses/cid-1': makeCourse(),
      'courses/cid-1/modules/mid-1': makeModule(),
    });
    const repo = await buildRepo(fake);

    expect(await repo.getModule('cid-1' as CourseId, 'mid-1' as ModuleId)).toEqual(makeModule());
    expect(await repo.getModule('cid-1' as CourseId, 'mid-x' as ModuleId)).toBeNull();
  });

  it('listModulesByCourse returns modules ordered by `order` ascending', async () => {
    const fake = createFakeFirestore({
      'courses/cid-1': makeCourse(),
      'courses/cid-1/modules/mid-b': makeModule({ id: 'mid-b' as ModuleId, order: 1 }),
      'courses/cid-1/modules/mid-a': makeModule({ id: 'mid-a' as ModuleId, order: 0 }),
    });
    const repo = await buildRepo(fake);

    const modules = await repo.listModulesByCourse('cid-1' as CourseId);

    expect(modules.map((m) => m.id)).toEqual(['mid-a', 'mid-b']);
  });

  it('updateModule merges the patch and refreshes updatedAt', async () => {
    const fake = createFakeFirestore({
      'courses/cid-1': makeCourse(),
      'courses/cid-1/modules/mid-1': makeModule(),
    });
    const repo = await buildRepo(fake);

    await repo.updateModule('cid-1' as CourseId, 'mid-1' as ModuleId, { title: 'New title' });

    const stored = fake.__store.get('courses/cid-1/modules/mid-1') as Module;
    expect(stored.title).toBe('New title');
    expect(stored.updatedAt).toBe(NOW.toISOString());
  });

  it('deleteModuleRecursive removes the module and its lessons only', async () => {
    const fake = createFakeFirestore({
      'courses/cid-1': makeCourse(),
      'courses/cid-1/modules/mid-1': makeModule(),
      'courses/cid-1/modules/mid-1/lessons/lid-1': makeLesson(),
      'courses/cid-1/modules/mid-keep': makeModule({ id: 'mid-keep' as ModuleId }),
    });
    const repo = await buildRepo(fake);

    await repo.deleteModuleRecursive('cid-1' as CourseId, 'mid-1' as ModuleId);

    expect(fake.__store.has('courses/cid-1/modules/mid-1')).toBe(false);
    expect(fake.__store.has('courses/cid-1/modules/mid-1/lessons/lid-1')).toBe(false);
    expect(fake.__store.has('courses/cid-1/modules/mid-keep')).toBe(true);
    expect(fake.__store.has('courses/cid-1')).toBe(true); // course itself survives
  });

  it('writeModuleOrder rewrites each module order to its array index', async () => {
    const fake = createFakeFirestore({
      'courses/cid-1': makeCourse(),
      'courses/cid-1/modules/mid-a': makeModule({ id: 'mid-a' as ModuleId, order: 0 }),
      'courses/cid-1/modules/mid-b': makeModule({ id: 'mid-b' as ModuleId, order: 1 }),
    });
    const repo = await buildRepo(fake);

    await repo.writeModuleOrder('cid-1' as CourseId, ['mid-b', 'mid-a'] as ModuleId[]);

    expect((fake.__store.get('courses/cid-1/modules/mid-b') as Module).order).toBe(0);
    expect((fake.__store.get('courses/cid-1/modules/mid-a') as Module).order).toBe(1);
    expect((fake.__store.get('courses/cid-1') as Course).updatedAt).toBe(NOW.toISOString());
  });
});

describe('CoursesRepository — Lesson', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  it('appendLesson assigns order = sibling count and touches the course', async () => {
    const fake = createFakeFirestore({
      'courses/cid-1': makeCourse(),
      'courses/cid-1/modules/mid-1': makeModule(),
    });
    const repo = await buildRepo(fake);

    const first = await repo.appendLesson('cid-1' as CourseId, 'mid-1' as ModuleId, {
      id: 'lid-1' as LessonId,
      moduleId: 'mid-1' as ModuleId,
      title: 'L1',
    });
    const second = await repo.appendLesson('cid-1' as CourseId, 'mid-1' as ModuleId, {
      id: 'lid-2' as LessonId,
      moduleId: 'mid-1' as ModuleId,
      title: 'L2',
    });

    expect(first.order).toBe(0);
    expect(second.order).toBe(1);
    expect((fake.__store.get('courses/cid-1') as Course).updatedAt).toBe(NOW.toISOString());
  });

  it('moduleExists reports presence of the module document', async () => {
    const fake = createFakeFirestore({
      'courses/cid-1': makeCourse(),
      'courses/cid-1/modules/mid-1': makeModule(),
    });
    const repo = await buildRepo(fake);

    expect(await repo.moduleExists('cid-1' as CourseId, 'mid-1' as ModuleId)).toBe(true);
    expect(await repo.moduleExists('cid-1' as CourseId, 'mid-x' as ModuleId)).toBe(false);
  });

  it('getLesson returns the stored lesson, or null when absent', async () => {
    const fake = createFakeFirestore({
      'courses/cid-1': makeCourse(),
      'courses/cid-1/modules/mid-1': makeModule(),
      'courses/cid-1/modules/mid-1/lessons/lid-1': makeLesson(),
    });
    const repo = await buildRepo(fake);

    expect(
      await repo.getLesson('cid-1' as CourseId, 'mid-1' as ModuleId, 'lid-1' as LessonId),
    ).toEqual(makeLesson());
    expect(
      await repo.getLesson('cid-1' as CourseId, 'mid-1' as ModuleId, 'lid-x' as LessonId),
    ).toBeNull();
  });

  it('listLessonsByModule returns lessons ordered by `order` ascending', async () => {
    const fake = createFakeFirestore({
      'courses/cid-1': makeCourse(),
      'courses/cid-1/modules/mid-1': makeModule(),
      'courses/cid-1/modules/mid-1/lessons/lid-b': makeLesson({
        id: 'lid-b' as LessonId,
        order: 1,
      }),
      'courses/cid-1/modules/mid-1/lessons/lid-a': makeLesson({
        id: 'lid-a' as LessonId,
        order: 0,
      }),
    });
    const repo = await buildRepo(fake);

    const lessons = await repo.listLessonsByModule('cid-1' as CourseId, 'mid-1' as ModuleId);

    expect(lessons.map((l) => l.id)).toEqual(['lid-a', 'lid-b']);
  });

  it('updateLesson merges the patch and refreshes updatedAt', async () => {
    const fake = createFakeFirestore({
      'courses/cid-1': makeCourse(),
      'courses/cid-1/modules/mid-1': makeModule(),
      'courses/cid-1/modules/mid-1/lessons/lid-1': makeLesson(),
    });
    const repo = await buildRepo(fake);

    await repo.updateLesson('cid-1' as CourseId, 'mid-1' as ModuleId, 'lid-1' as LessonId, {
      title: 'New lesson title',
    });

    const stored = fake.__store.get('courses/cid-1/modules/mid-1/lessons/lid-1') as Lesson;
    expect(stored.title).toBe('New lesson title');
    expect(stored.updatedAt).toBe(NOW.toISOString());
  });

  it('deleteLesson removes only the target lesson', async () => {
    const fake = createFakeFirestore({
      'courses/cid-1': makeCourse(),
      'courses/cid-1/modules/mid-1': makeModule(),
      'courses/cid-1/modules/mid-1/lessons/lid-1': makeLesson(),
      'courses/cid-1/modules/mid-1/lessons/lid-keep': makeLesson({ id: 'lid-keep' as LessonId }),
    });
    const repo = await buildRepo(fake);

    await repo.deleteLesson('cid-1' as CourseId, 'mid-1' as ModuleId, 'lid-1' as LessonId);

    expect(fake.__store.has('courses/cid-1/modules/mid-1/lessons/lid-1')).toBe(false);
    expect(fake.__store.has('courses/cid-1/modules/mid-1/lessons/lid-keep')).toBe(true);
  });

  it('writeLessonOrder rewrites each lesson order to its array index', async () => {
    const fake = createFakeFirestore({
      'courses/cid-1': makeCourse(),
      'courses/cid-1/modules/mid-1': makeModule(),
      'courses/cid-1/modules/mid-1/lessons/lid-a': makeLesson({ id: 'lid-a' as LessonId, order: 0 }),
      'courses/cid-1/modules/mid-1/lessons/lid-b': makeLesson({ id: 'lid-b' as LessonId, order: 1 }),
    });
    const repo = await buildRepo(fake);

    await repo.writeLessonOrder('cid-1' as CourseId, 'mid-1' as ModuleId, [
      'lid-b',
      'lid-a',
    ] as LessonId[]);

    expect(
      (fake.__store.get('courses/cid-1/modules/mid-1/lessons/lid-b') as Lesson).order,
    ).toBe(0);
    expect(
      (fake.__store.get('courses/cid-1/modules/mid-1/lessons/lid-a') as Lesson).order,
    ).toBe(1);
    expect((fake.__store.get('courses/cid-1') as Course).updatedAt).toBe(NOW.toISOString());
  });
});

describe('CoursesRepository — misc', () => {
  it('newId returns a non-empty string and never collides', async () => {
    const fake = createFakeFirestore();
    const repo = await buildRepo(fake);

    const a = repo.newId<CourseId>();
    const b = repo.newId<CourseId>();

    expect(a).toMatch(/.+/);
    expect(a).not.toBe(b);
  });

  it('rawFirestore exposes the injected handle', async () => {
    const fake = createFakeFirestore();
    const repo = await buildRepo(fake);

    expect(repo.rawFirestore).toBe(fake);
  });
});

describe('CoursesRepository — transaction helpers (publish gate)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  it('getCourseInTxn returns the course', async () => {
    const fake = createFakeFirestore({ 'courses/cid-1': makeCourse() });
    const repo = await buildRepo(fake);

    const course = await withTxn(fake, (t) => repo.getCourseInTxn(t, 'cid-1' as CourseId));

    expect(course).toEqual(makeCourse());
  });

  it('getCourseInTxn throws CourseNotFoundException when the course is absent', async () => {
    const fake = createFakeFirestore();
    const repo = await buildRepo(fake);

    await expect(
      withTxn(fake, (t) => repo.getCourseInTxn(t, 'cid-missing' as CourseId)),
    ).rejects.toBeInstanceOf(CourseNotFoundException);
  });

  it('listModulesByCourseInTxn returns modules ordered by `order`', async () => {
    const fake = createFakeFirestore({
      'courses/cid-1': makeCourse(),
      'courses/cid-1/modules/mid-b': makeModule({ id: 'mid-b' as ModuleId, order: 1 }),
      'courses/cid-1/modules/mid-a': makeModule({ id: 'mid-a' as ModuleId, order: 0 }),
    });
    const repo = await buildRepo(fake);

    const modules = await withTxn(fake, (t) =>
      repo.listModulesByCourseInTxn(t, 'cid-1' as CourseId),
    );

    expect(modules.map((m) => m.id)).toEqual(['mid-a', 'mid-b']);
  });

  it('listLessonsByModuleInTxn returns lessons ordered by `order`', async () => {
    const fake = createFakeFirestore({
      'courses/cid-1': makeCourse(),
      'courses/cid-1/modules/mid-1': makeModule(),
      'courses/cid-1/modules/mid-1/lessons/lid-b': makeLesson({
        id: 'lid-b' as LessonId,
        order: 1,
      }),
      'courses/cid-1/modules/mid-1/lessons/lid-a': makeLesson({
        id: 'lid-a' as LessonId,
        order: 0,
      }),
    });
    const repo = await buildRepo(fake);

    const lessons = await withTxn(fake, (t) =>
      repo.listLessonsByModuleInTxn(t, 'cid-1' as CourseId, 'mid-1' as ModuleId),
    );

    expect(lessons.map((l) => l.id)).toEqual(['lid-a', 'lid-b']);
  });
});

describe('CoursesRepository.updateStatusInTxn', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  it('writes the new status, refreshes updatedAt, and composes the returned doc from the pre-read', async () => {
    const fake = createFakeFirestore({ 'courses/cid-1': makeCourse() });
    const repo = await buildRepo(fake);

    const result = await withTxn(fake, (t) =>
      repo.updateStatusInTxn(t, 'cid-1' as CourseId, 'PUBLISHED'),
    );

    // Returned doc carries the new status plus the untouched original fields.
    expect(result.status).toBe('PUBLISHED');
    expect(result.updatedAt).toBe(NOW.toISOString());
    expect(result.title).toBe('Intro to Wren');
    expect(result.instructorId).toBe(INSTRUCTOR);
    // The stored doc was updated, not just the return value.
    const stored = fake.__store.get('courses/cid-1') as Course;
    expect(stored.status).toBe('PUBLISHED');
    expect(stored.updatedAt).toBe(NOW.toISOString());
  });

  it('applies a publishedAt patch to both the stored doc and the returned doc', async () => {
    const fake = createFakeFirestore({ 'courses/cid-1': makeCourse() });
    const repo = await buildRepo(fake);
    const publishedAt = '2026-05-21T12:00:00.000Z' as ISODateString;

    const result = await withTxn(fake, (t) =>
      repo.updateStatusInTxn(t, 'cid-1' as CourseId, 'PUBLISHED', { publishedAt }),
    );

    expect(result.publishedAt).toBe(publishedAt);
    expect((fake.__store.get('courses/cid-1') as Course).publishedAt).toBe(publishedAt);
  });

  it('applies an archivedAt patch when archiving', async () => {
    const fake = createFakeFirestore({
      'courses/cid-1': makeCourse({ status: 'PUBLISHED' }),
    });
    const repo = await buildRepo(fake);
    const archivedAt = '2026-05-21T12:00:00.000Z' as ISODateString;

    const result = await withTxn(fake, (t) =>
      repo.updateStatusInTxn(t, 'cid-1' as CourseId, 'ARCHIVED', { archivedAt }),
    );

    expect(result.archivedAt).toBe(archivedAt);
    expect((fake.__store.get('courses/cid-1') as Course).archivedAt).toBe(archivedAt);
  });

  it('clears archivedAt when the patch passes archivedAt: null (FieldValue.delete)', async () => {
    const fake = createFakeFirestore({
      'courses/cid-1': makeCourse({
        status: 'ARCHIVED',
        archivedAt: '2026-05-10T00:00:00.000Z' as ISODateString,
      }),
    });
    const repo = await buildRepo(fake);

    const result = await withTxn(fake, (t) =>
      repo.updateStatusInTxn(t, 'cid-1' as CourseId, 'DRAFT', { archivedAt: null }),
    );

    // archivedAt is removed from the stored document, not written as null.
    expect('archivedAt' in (fake.__store.get('courses/cid-1') as Course)).toBe(false);
    expect(result.archivedAt).toBeUndefined();
  });

  it('throws CourseNotFoundException without writing when the course is absent', async () => {
    const fake = createFakeFirestore();
    const repo = await buildRepo(fake);

    await expect(
      withTxn(fake, (t) => repo.updateStatusInTxn(t, 'cid-missing' as CourseId, 'PUBLISHED')),
    ).rejects.toBeInstanceOf(CourseNotFoundException);
    expect(fake.__store.size).toBe(0);
  });
});
