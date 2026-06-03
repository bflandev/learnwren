import type { CourseId, Lesson, LessonId } from '@learnwren/shared-data-models';

import type { CoursesRepository } from '../../courses.repository';

/**
 * Iterate the course's modules and return the first lesson whose id matches.
 * Returns null when the lesson does not exist in any module of the course.
 */
export async function findLessonInCourse(
  courses: CoursesRepository,
  cid: CourseId,
  lid: LessonId,
): Promise<Lesson | null> {
  const modules = await courses.listModulesByCourse(cid);
  // Fan the per-module lookups out in parallel rather than awaiting them one at a
  // time — this runs on every learn request, so a serial loop added O(N modules)
  // of round-trip latency. Array order is preserved, so the first match is still
  // returned (a lesson id belongs to at most one module anyway).
  const lessons = await Promise.all(modules.map((m) => courses.getLesson(cid, m.id, lid)));
  return lessons.find((lesson): lesson is Lesson => lesson !== null) ?? null;
}
