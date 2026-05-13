import type { Course, Lesson, Module } from '@learnwren/shared-data-models';

import type { AuthenticatedRequest } from '@learnwren/api-auth';

/**
 * Hydrated course tree returned by GET /api/courses/:cid.
 */
export interface CourseTree {
  course: Course;
  modules: Array<{ module: Module; lessons: Lesson[] }>;
}

/**
 * Request shape after CourseOwnerGuard has loaded the course doc.
 */
export interface CourseScopedRequest extends AuthenticatedRequest {
  course?: Course;
}
