import { describe, expect, it, vi } from 'vitest';

import type {
  CourseId,
  Lesson,
  LessonId,
  Module,
  ModuleId,
} from '@learnwren/shared-data-models';

import type { CoursesRepository } from '../../courses.repository';
import { findLessonInCourse } from './find-lesson-in-course';

const CID = 'c1' as CourseId;
const LID = 'l1' as LessonId;

function mod(id: string): Module {
  return { id, courseId: CID, title: id, order: 0 } as unknown as Module;
}

function lesson(id: string): Lesson {
  return { id, moduleId: 'm1' as ModuleId, title: id, order: 0 } as unknown as Lesson;
}

/**
 * Build a CoursesRepository whose getLesson returns the supplied per-module
 * results array positionally (modules.map preserves order, so result[i]
 * corresponds to modules[i]).
 */
function makeCourses(modules: Module[], perModule: Array<Lesson | null>): CoursesRepository {
  const byModule = new Map<string, Lesson | null>();
  modules.forEach((m, i) => byModule.set(m.id, perModule[i] ?? null));
  return {
    listModulesByCourse: vi.fn().mockResolvedValue(modules),
    getLesson: vi
      .fn()
      .mockImplementation((_cid: CourseId, mid: ModuleId) =>
        Promise.resolve(byModule.get(mid) ?? null),
      ),
  } as unknown as CoursesRepository;
}

describe('findLessonInCourse', () => {
  it('filters out null per-module results and returns the one matching lesson', async () => {
    // Three modules; only the SECOND yields the lesson, the others return null.
    // If the `lesson !== null` predicate were forced to `true`, find() would
    // return the first (null) entry and the result would be null, not the lesson.
    const target = lesson(LID);
    const courses = makeCourses([mod('m1'), mod('m2'), mod('m3')], [null, target, null]);
    const result = await findLessonInCourse(courses, CID, LID);
    expect(result).toBe(target);
  });

  it('returns null when every module lookup is null (lesson not in course)', async () => {
    const courses = makeCourses([mod('m1'), mod('m2')], [null, null]);
    const result = await findLessonInCourse(courses, CID, LID);
    expect(result).toBeNull();
  });

  it('returns null when the course has no modules', async () => {
    const courses = makeCourses([], []);
    const result = await findLessonInCourse(courses, CID, LID);
    expect(result).toBeNull();
  });
});
