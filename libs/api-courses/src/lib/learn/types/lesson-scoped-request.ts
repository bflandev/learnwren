import type { Course, Lesson } from '@learnwren/shared-data-models';

import type { AuthenticatedRequest } from '@learnwren/api-auth';

export interface LessonScopedRequest extends AuthenticatedRequest {
  course?: Course;
  lesson?: Lesson;
  params: AuthenticatedRequest['params'] & { cid?: string; lid?: string };
}
