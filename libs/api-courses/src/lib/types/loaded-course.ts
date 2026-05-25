import type { Course } from '@learnwren/shared-data-models';

import type { AuthenticatedRequest } from '@learnwren/api-auth';

// CourseTree lives in shared-data-models so the web client and the server
// share a single source of truth for the response shape.
export type { CourseTree } from '@learnwren/shared-data-models';

/**
 * Request shape after CourseOwnerGuard has loaded the course doc.
 */
export interface CourseScopedRequest extends AuthenticatedRequest {
  course?: Course;
}
