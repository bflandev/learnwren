import { ExecutionContext } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthenticatedRequest } from '@learnwren/api-auth';
import type { Course, CourseId, UserId } from '@learnwren/shared-data-models';

import { CourseOwnerGuard } from './course-owner.guard';
import { CoursesRepository } from './courses.repository';
import {
  CourseNotFoundException,
  NotCourseOwnerException,
} from './errors/courses.exception';
import type { CourseScopedRequest } from './types/loaded-course';

function makeCourse(overrides: Partial<Course> = {}): Course {
  return {
    id: 'cid-1' as CourseId,
    title: 'T',
    description: 'D',
    instructorId: 'uid-1' as UserId,
    status: 'DRAFT',
    createdAt: '2026-05-12T00:00:00.000Z' as Course['createdAt'],
    updatedAt: '2026-05-12T00:00:00.000Z' as Course['updatedAt'],
    ...overrides,
  };
}

function buildContext(params: { cid: string; userUid: string | undefined }): ExecutionContext {
  const req: Partial<CourseScopedRequest> = {
    params: { cid: params.cid } as Record<string, string>,
    user:
      params.userUid === undefined
        ? undefined
        : {
            uid: params.userUid as UserId,
            email: 'i@example.com',
            role: 'INSTRUCTOR',
            emailVerified: true,
          },
  };
  return {
    switchToHttp: () => ({
      getRequest: () => req as AuthenticatedRequest,
      getResponse: () => ({}),
      getNext: () => undefined,
    }),
  } as unknown as ExecutionContext;
}

describe('CourseOwnerGuard', () => {
  let repo: { getCourse: ReturnType<typeof vi.fn> };
  let guard: CourseOwnerGuard;

  beforeEach(() => {
    repo = { getCourse: vi.fn() };
    guard = new CourseOwnerGuard(repo as unknown as CoursesRepository);
  });

  it('returns true and stashes the course when the user owns it', async () => {
    const course = makeCourse({ instructorId: 'uid-1' as UserId });
    repo.getCourse.mockResolvedValue(course);
    const ctx = buildContext({ cid: 'cid-1', userUid: 'uid-1' });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    const req = ctx.switchToHttp().getRequest() as CourseScopedRequest;
    expect(req.course).toEqual(course);
  });

  it('throws CourseNotFoundException when the course does not exist', async () => {
    repo.getCourse.mockResolvedValue(null);
    const ctx = buildContext({ cid: 'cid-1', userUid: 'uid-1' });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(CourseNotFoundException);
  });

  it('throws NotCourseOwnerException when another user owns the course', async () => {
    repo.getCourse.mockResolvedValue(makeCourse({ instructorId: 'uid-2' as UserId }));
    const ctx = buildContext({ cid: 'cid-1', userUid: 'uid-1' });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(NotCourseOwnerException);
  });

  it('throws NotCourseOwnerException when no user is attached (defensive — InstructorRoleGuard should have blocked already)', async () => {
    repo.getCourse.mockResolvedValue(makeCourse());
    const ctx = buildContext({ cid: 'cid-1', userUid: undefined });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(NotCourseOwnerException);
  });
});
