import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  Course,
  CourseId,
  Enrollment,
  ISODateString,
  Lesson,
  Module,
  UserId,
  Video,
} from '@learnwren/shared-data-models';

import type { CoursesRepository } from '../courses.repository';
import type { EnrollmentRepository } from '../enrollment/enrollment.repository';
import type { VideoRepository } from '../video/video.repository';
import { AnalyticsService } from './analytics.service';

const CID = 'course-1' as CourseId;
const course = { id: CID, title: 'Course One' } as Course;

function mod(id: string, order: number): Module {
  return { id, order } as Module;
}
function lesson(id: string, order: number, title = id): Lesson {
  return { id, order, title } as Lesson;
}
function enrollment(
  userId: string,
  createdAt: string,
  rows: Array<{ lessonId: string; completed: boolean; seconds: number }>,
): Enrollment {
  return {
    userId: userId as UserId,
    courseId: CID,
    status: 'ACTIVE',
    createdAt: createdAt as ISODateString,
    progress: rows.map((r) => ({
      lessonId: r.lessonId as never,
      completedAt: r.completed ? ('2026-05-30T00:00:00.000Z' as ISODateString) : null,
      lastWatchedSeconds: r.seconds,
    })),
  } as Enrollment;
}
function readyVideo(lessonId: string, durationSec: number): Video {
  return { lessonId, state: 'READY', output: { bucket: 'b', manifestPath: 'm', durationSec } } as Video;
}

describe('AnalyticsService', () => {
  let courses: {
    listModulesByCourse: ReturnType<typeof vi.fn>;
    listLessonsByModule: ReturnType<typeof vi.fn>;
  };
  let enrollments: { listActiveByCourse: ReturnType<typeof vi.fn> };
  let videos: { listVideosForLessons: ReturnType<typeof vi.fn> };
  let service: AnalyticsService;

  beforeEach(() => {
    // One module, two lessons l1, l2 (in order).
    courses = {
      listModulesByCourse: vi.fn().mockResolvedValue([mod('m1', 0)]),
      listLessonsByModule: vi.fn().mockResolvedValue([lesson('l2', 1), lesson('l1', 0)]), // deliberately unordered
    };
    enrollments = { listActiveByCourse: vi.fn().mockResolvedValue([]) };
    videos = { listVideosForLessons: vi.fn().mockResolvedValue(new Map()) };
    service = new AnalyticsService(
      courses as unknown as CoursesRepository,
      enrollments as unknown as EnrollmentRepository,
      videos as unknown as VideoRepository,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('orders lessons by module order then lesson order, and counts totalLessons', async () => {
    const view = await service.getAnalytics(course);
    expect(view.totalLessons).toBe(2);
    expect(view.lessons.map((l) => l.lessonId)).toEqual(['l1', 'l2']);
  });

  it('averageCompletionPercent is the mean of per-student completion', async () => {
    // l1,l2 total=2. Student A completed both (100%), B completed l1 only (50%), C none (0%). mean=50.
    enrollments.listActiveByCourse.mockResolvedValue([
      enrollment('A', '2026-05-30T00:00:00.000Z', [
        { lessonId: 'l1', completed: true, seconds: 0 },
        { lessonId: 'l2', completed: true, seconds: 0 },
      ]),
      enrollment('B', '2026-05-30T00:00:00.000Z', [{ lessonId: 'l1', completed: true, seconds: 0 }]),
      enrollment('C', '2026-05-30T00:00:00.000Z', []),
    ]);
    const view = await service.getAnalytics(course);
    expect(view.enrolledTotal).toBe(3);
    expect(view.averageCompletionPercent).toBe(50);
  });

  it('counts new enrollments in the 7/30/90-day windows from the request clock', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-01T00:00:00.000Z'));
    const daysAgo = (n: number) =>
      new Date(Date.parse('2026-06-01T00:00:00.000Z') - n * 86400000).toISOString();
    enrollments.listActiveByCourse.mockResolvedValue([
      enrollment('A', daysAgo(3), []), // in 7/30/90
      enrollment('B', daysAgo(15), []), // in 30/90
      enrollment('C', daysAgo(60), []), // in 90
      enrollment('D', daysAgo(120), []), // in none
    ]);
    const view = await service.getAnalytics(course);
    expect(view.newEnrollments).toEqual({ last7Days: 1, last30Days: 2, last90Days: 3 });
  });

  it('per-lesson completion rate is over the whole cohort; watch avg is over engaged students', async () => {
    // l1: A completed+watched 80s, B watched 40s not completed, C no row. l2: none.
    enrollments.listActiveByCourse.mockResolvedValue([
      enrollment('A', '2026-05-30T00:00:00.000Z', [{ lessonId: 'l1', completed: true, seconds: 80 }]),
      enrollment('B', '2026-05-30T00:00:00.000Z', [{ lessonId: 'l1', completed: false, seconds: 40 }]),
      enrollment('C', '2026-05-30T00:00:00.000Z', []),
    ]);
    videos.listVideosForLessons.mockResolvedValue(new Map([['l1', readyVideo('l1', 120)]]));
    const view = await service.getAnalytics(course);
    const l1 = view.lessons.find((l) => l.lessonId === 'l1')!;
    expect(l1.completionRatePercent).toBe(33); // 1 of 3 cohort completed
    expect(l1.watchedStudents).toBe(2); // A and B have a row
    expect(l1.averageWatchedSeconds).toBe(60); // (80+40)/2
    expect(l1.durationSec).toBe(120);
    expect(l1.averageWatchedPercent).toBe(50); // 60/120
  });

  it('returns null duration and null watched-percent for a lesson whose video is not READY', async () => {
    enrollments.listActiveByCourse.mockResolvedValue([
      enrollment('A', '2026-05-30T00:00:00.000Z', [{ lessonId: 'l1', completed: false, seconds: 30 }]),
    ]);
    videos.listVideosForLessons.mockResolvedValue(new Map()); // no video for l1
    const view = await service.getAnalytics(course);
    const l1 = view.lessons.find((l) => l.lessonId === 'l1')!;
    expect(l1.durationSec).toBeNull();
    expect(l1.averageWatchedPercent).toBeNull();
    expect(l1.averageWatchedSeconds).toBe(30);
  });

  it('excludes completions for deleted lessons from averageCompletionPercent', async () => {
    enrollments.listActiveByCourse.mockResolvedValue([
      enrollment('A', '2026-05-30T00:00:00.000Z', [
        { lessonId: 'l1', completed: true, seconds: 0 },
        { lessonId: 'ghost', completed: true, seconds: 0 },
      ]),
    ]);
    const view = await service.getAnalytics(course);
    // total=2, A completed only l1 (existing) => 50%, not 100%.
    expect(view.averageCompletionPercent).toBe(50);
  });

  it('handles zero students and zero lessons without dividing by zero', async () => {
    courses.listModulesByCourse.mockResolvedValue([]);
    const view = await service.getAnalytics(course);
    expect(view.totalLessons).toBe(0);
    expect(view.enrolledTotal).toBe(0);
    expect(view.averageCompletionPercent).toBe(0);
    expect(view.lessons).toEqual([]);
  });
});
