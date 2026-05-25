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
  for (const m of modules) {
    const lesson = await courses.getLesson(cid, m.id, lid);
    if (lesson) return lesson;
  }
  return null;
}
