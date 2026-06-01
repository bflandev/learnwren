import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  Course,
  CourseId,
  Enrollment,
  ISODateString,
  Lesson,
  Module,
  UserId,
} from '@learnwren/shared-data-models';

import type { CoursesRepository } from '../courses.repository';
import type { EnrollmentRepository } from '../enrollment/enrollment.repository';
import { RosterService } from './roster.service';

const CID = 'course-1' as CourseId;
const course = { id: CID, title: 'Course One' } as Course;

function lesson(id: string): Lesson {
  return { id } as Lesson;
}
function mod(id: string): Module {
  return { id } as Module;
}
function enrollment(userId: string, completed: string[], createdAt: string): Enrollment {
  return {
    userId: userId as UserId,
    courseId: CID,
    status: 'ACTIVE',
    createdAt: createdAt as ISODateString,
    progress: completed.map((lid) => ({
      lessonId: lid as never,
      completedAt: '2026-05-30T00:00:00.000Z' as ISODateString,
      lastWatchedSeconds: 0,
    })),
  } as Enrollment;
}

describe('RosterService', () => {
  let courses: {
    listModulesByCourse: ReturnType<typeof vi.fn>;
    listLessonsByModule: ReturnType<typeof vi.fn>;
  };
  let enrollments: { listActiveByCourse: ReturnType<typeof vi.fn> };
  let firestore: { collection: ReturnType<typeof vi.fn> };
  let service: RosterService;

  function stubUser(uid: string, data: Record<string, unknown> | null) {
    return {
      get: vi.fn().mockResolvedValue({ exists: data !== null, data: () => data }),
    };
  }

  beforeEach(() => {
    courses = {
      listModulesByCourse: vi.fn().mockResolvedValue([mod('m1')]),
      listLessonsByModule: vi.fn().mockResolvedValue([lesson('l1'), lesson('l2'), lesson('l3')]),
    };
    enrollments = { listActiveByCourse: vi.fn() };
    const users: Record<string, Record<string, unknown> | null> = {
      u1: { displayName: 'Ada', email: 'ada@example.com' },
      u2: { displayName: 'Bo', email: 'bo@example.com' },
    };
    firestore = {
      collection: vi.fn().mockReturnValue({
        doc: vi.fn((uid: string) => stubUser(uid, users[uid] ?? null)),
      }),
    };
    service = new RosterService(
      courses as unknown as CoursesRepository,
      enrollments as unknown as EnrollmentRepository,
      firestore as never,
    );
  });

  it('computes progress as distinct completed ÷ total lessons and joins name/email', async () => {
    enrollments.listActiveByCourse.mockResolvedValue([
      enrollment('u1', ['l1', 'l2'], '2026-05-20T00:00:00.000Z'),
    ]);
    const view = await service.getRoster(course);
    expect(view.totalLessons).toBe(3);
    expect(view.students).toHaveLength(1);
    expect(view.students[0]).toMatchObject({
      userId: 'u1',
      displayName: 'Ada',
      email: 'ada@example.com',
      completedLessons: 2,
      totalLessons: 3,
      progressPercent: 67,
    });
  });

  it('excludes completions for lessons that no longer exist and never exceeds total', async () => {
    enrollments.listActiveByCourse.mockResolvedValue([
      enrollment('u1', ['l1', 'l2', 'l3', 'deleted-lesson'], '2026-05-20T00:00:00.000Z'),
    ]);
    const view = await service.getRoster(course);
    expect(view.students[0].completedLessons).toBe(3);
    expect(view.students[0].progressPercent).toBe(100);
  });

  it('orders rows by enrolledAt descending (newest first)', async () => {
    enrollments.listActiveByCourse.mockResolvedValue([
      enrollment('u1', [], '2026-05-20T00:00:00.000Z'),
      enrollment('u2', [], '2026-05-25T00:00:00.000Z'),
    ]);
    const view = await service.getRoster(course);
    expect(view.students.map((s) => s.userId)).toEqual(['u2', 'u1']);
  });

  it('falls back to a default name and empty email when the user doc is missing', async () => {
    enrollments.listActiveByCourse.mockResolvedValue([
      enrollment('ghost', [], '2026-05-20T00:00:00.000Z'),
    ]);
    const view = await service.getRoster(course);
    expect(view.students[0].displayName).toBe('Student');
    expect(view.students[0].email).toBe('');
  });

  it('reports 0% with no divide-by-zero when the course has no lessons', async () => {
    courses.listModulesByCourse.mockResolvedValue([]);
    enrollments.listActiveByCourse.mockResolvedValue([
      enrollment('u1', [], '2026-05-20T00:00:00.000Z'),
    ]);
    const view = await service.getRoster(course);
    expect(view.totalLessons).toBe(0);
    expect(view.students[0].progressPercent).toBe(0);
  });
});
