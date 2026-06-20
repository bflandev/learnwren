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

  it('orders modules ascending by module.order when fed in REVERSE order (kills slice/sort/arithmetic)', async () => {
    // Two modules supplied descending (order 1 then 0). Each module has one lesson.
    // Correct ascending sort by `order` => m0's lesson (la) first, m1's lesson (lb) second.
    // A removed .sort(), a removed .slice(), or a swapped `b.order - a.order` would
    // reorder the output, so asserting ascending output kills all three mutants.
    courses.listModulesByCourse.mockResolvedValue([mod('m1', 1), mod('m0', 0)]);
    courses.listLessonsByModule.mockImplementation(async (_cid: string, mid: string) =>
      mid === 'm0' ? [lesson('la', 0)] : [lesson('lb', 0)],
    );
    const view = await service.getAnalytics(course);
    expect(view.lessons.map((l) => l.lessonId)).toEqual(['la', 'lb']);
  });

  it('orders lessons ascending by lesson.order within a module fed in REVERSE (kills per-module slice/sort)', async () => {
    // Single module; lessons supplied descending by order. Ascending output required.
    courses.listModulesByCourse.mockResolvedValue([mod('m1', 0)]);
    courses.listLessonsByModule.mockResolvedValue([
      lesson('l3', 2),
      lesson('l2', 1),
      lesson('l1', 0),
    ]);
    const view = await service.getAnalytics(course);
    expect(view.lessons.map((l) => l.lessonId)).toEqual(['l1', 'l2', 'l3']);
  });

  it('the per-lesson progress lookup matches by lessonId only (kills find→true)', async () => {
    // The enrolment for student A has a row for a DIFFERENT lesson ('l2') marked
    // completed+watched, plus a row for 'l1'. If find()'s predicate were forced to
    // `true` it would grab l2's row when computing l1 and the numbers would be wrong.
    enrollments.listActiveByCourse.mockResolvedValue([
      enrollment('A', '2026-05-30T00:00:00.000Z', [
        { lessonId: 'l2', completed: true, seconds: 999 },
        { lessonId: 'l1', completed: false, seconds: 10 },
      ]),
    ]);
    const view = await service.getAnalytics(course);
    const l1 = view.lessons.find((l) => l.lessonId === 'l1')!;
    expect(l1.completionRatePercent).toBe(0); // l1 row is NOT completed
    expect(l1.averageWatchedSeconds).toBe(10); // l1 row seconds, not l2's 999
    const l2 = view.lessons.find((l) => l.lessonId === 'l2')!;
    expect(l2.completionRatePercent).toBe(100); // l2 row IS completed
    expect(l2.averageWatchedSeconds).toBe(999);
  });

  it('treats a row with completedAt === null as not completed (kills != → ==)', async () => {
    // One enrolled student with an l1 row that is watched but NOT completed.
    // completionRatePercent must be 0; a flipped equality would count it as 1.
    enrollments.listActiveByCourse.mockResolvedValue([
      enrollment('A', '2026-05-30T00:00:00.000Z', [{ lessonId: 'l1', completed: false, seconds: 5 }]),
    ]);
    const view = await service.getAnalytics(course);
    const l1 = view.lessons.find((l) => l.lessonId === 'l1')!;
    expect(l1.completionRatePercent).toBe(0);
    expect(l1.watchedStudents).toBe(1);
  });

  it('completionRatePercent: zero cohort → 0, nonzero cohort → computed (kills ===0?0 conditional)', async () => {
    // Single enrolled student completed l1. enrolledTotal=1 (nonzero) => 100, not 0.
    enrollments.listActiveByCourse.mockResolvedValue([
      enrollment('A', '2026-05-30T00:00:00.000Z', [{ lessonId: 'l1', completed: true, seconds: 0 }]),
    ]);
    const view = await service.getAnalytics(course);
    const l1 = view.lessons.find((l) => l.lessonId === 'l1')!;
    expect(l1.completionRatePercent).toBe(100);
    // l2 has no completions in a nonzero cohort => 0 (the computed value, not the guard's 0).
    const l2 = view.lessons.find((l) => l.lessonId === 'l2')!;
    expect(l2.completionRatePercent).toBe(0);
  });

  it('averageWatchedSeconds: zero watchers → 0, nonzero watchers → computed (kills ===0?0 conditional)', async () => {
    // l1 has two watchers (60+40)/2=50; l2 has zero watchers => 0.
    enrollments.listActiveByCourse.mockResolvedValue([
      enrollment('A', '2026-05-30T00:00:00.000Z', [{ lessonId: 'l1', completed: false, seconds: 60 }]),
      enrollment('B', '2026-05-30T00:00:00.000Z', [{ lessonId: 'l1', completed: false, seconds: 40 }]),
    ]);
    const view = await service.getAnalytics(course);
    expect(view.lessons.find((l) => l.lessonId === 'l1')!.averageWatchedSeconds).toBe(50);
    expect(view.lessons.find((l) => l.lessonId === 'l2')!.averageWatchedSeconds).toBe(0);
    expect(view.lessons.find((l) => l.lessonId === 'l2')!.watchedStudents).toBe(0);
  });

  it('averageWatchedPercent is null when durationSec is 0 and computed when positive (kills && / >0 / truthiness)', async () => {
    enrollments.listActiveByCourse.mockResolvedValue([
      enrollment('A', '2026-05-30T00:00:00.000Z', [{ lessonId: 'l1', completed: false, seconds: 30 }]),
    ]);
    // durationSec exactly 0 → averageWatchedPercent must be null (the > 0 boundary).
    videos.listVideosForLessons.mockResolvedValue(new Map([['l1', readyVideo('l1', 0)]]));
    const zeroDur = await service.getAnalytics(course);
    const l1Zero = zeroDur.lessons.find((l) => l.lessonId === 'l1')!;
    expect(l1Zero.durationSec).toBe(0);
    expect(l1Zero.averageWatchedPercent).toBeNull();

    // Positive durationSec → computed percent (30/120 = 25).
    videos.listVideosForLessons.mockResolvedValue(new Map([['l1', readyVideo('l1', 120)]]));
    const posDur = await service.getAnalytics(course);
    const l1Pos = posDur.lessons.find((l) => l.lessonId === 'l1')!;
    expect(l1Pos.averageWatchedPercent).toBe(25);
  });

  it('averageCompletionPercent is 0 when there are enrollments but zero lessons (kills || / totalLessons===0)', async () => {
    // Enrollments present, but no modules/lessons => totalLessons===0 branch returns 0.
    courses.listModulesByCourse.mockResolvedValue([]);
    enrollments.listActiveByCourse.mockResolvedValue([
      enrollment('A', '2026-05-30T00:00:00.000Z', []),
    ]);
    const view = await service.getAnalytics(course);
    expect(view.enrolledTotal).toBe(1);
    expect(view.totalLessons).toBe(0);
    expect(view.averageCompletionPercent).toBe(0);
  });

  it('averageCompletionPercent is 0 when there are lessons but zero enrollments (kills || / enrollments.length===0)', async () => {
    // Lessons present (l1,l2 from beforeEach) but no enrollments => length===0 branch returns 0.
    enrollments.listActiveByCourse.mockResolvedValue([]);
    const view = await service.getAnalytics(course);
    expect(view.totalLessons).toBe(2);
    expect(view.enrolledTotal).toBe(0);
    expect(view.averageCompletionPercent).toBe(0);
  });

  it('counts an enrollment created exactly AT the 7-day cutoff (kills > vs >= boundary)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-01T00:00:00.000Z'));
    // createdAt exactly 7 days before now => Date.parse === cutoff. >= counts it; > would not.
    const exactly7 = new Date(Date.parse('2026-06-01T00:00:00.000Z') - 7 * 86400000).toISOString();
    enrollments.listActiveByCourse.mockResolvedValue([
      enrollment('A', exactly7, []),
    ]);
    const view = await service.getAnalytics(course);
    expect(view.newEnrollments.last7Days).toBe(1);
  });

  it('per-lesson completionRatePercent is 0 for a lesson with zero enrollments (kills the enrolledTotal===0?0 conditional)', async () => {
    // A lesson exists but NO active enrollments. The guard `enrolledTotal === 0 ? 0`
    // must return 0; the false-mutant would compute completedCount/0 => NaN.
    enrollments.listActiveByCourse.mockResolvedValue([]);
    const view = await service.getAnalytics(course);
    const l1 = view.lessons.find((l) => l.lessonId === 'l1')!;
    expect(view.enrolledTotal).toBe(0);
    expect(l1.completionRatePercent).toBe(0);
    expect(Number.isNaN(l1.completionRatePercent)).toBe(false);
  });

  it('does NOT mutate the modules array returned by the repository (kills the .slice() removal on modules)', async () => {
    // Hand the service an array in DESCENDING order and keep a reference. If
    // .slice() were removed, the in-place .sort() would reorder THIS array.
    const modulesArg = [mod('m1', 1), mod('m0', 0)];
    courses.listModulesByCourse.mockResolvedValue(modulesArg);
    courses.listLessonsByModule.mockResolvedValue([]);
    await service.getAnalytics(course);
    expect(modulesArg.map((m) => m.id)).toEqual(['m1', 'm0']);
  });

  it('does NOT mutate the per-module lessons array returned by the repository (kills the .slice() removal on lessons)', async () => {
    courses.listModulesByCourse.mockResolvedValue([mod('m1', 0)]);
    const lessonsArg = [lesson('l2', 1), lesson('l1', 0)];
    courses.listLessonsByModule.mockResolvedValue(lessonsArg);
    await service.getAnalytics(course);
    expect(lessonsArg.map((l) => l.id)).toEqual(['l2', 'l1']);
  });

  it('meanCompletion excludes non-completed rows so the && in its filter matters (kills predicate→true)', async () => {
    // Single student, single lesson l1, but the row is NOT completed.
    // Real predicate (completedAt != null && has) => 0 completed => 0%.
    // The →true mutant would count the incomplete row => 100%.
    courses.listModulesByCourse.mockResolvedValue([mod('m1', 0)]);
    courses.listLessonsByModule.mockResolvedValue([lesson('l1', 0)]);
    enrollments.listActiveByCourse.mockResolvedValue([
      enrollment('A', '2026-05-30T00:00:00.000Z', [
        { lessonId: 'l1', completed: false, seconds: 5 },
      ]),
    ]);
    const view = await service.getAnalytics(course);
    expect(view.totalLessons).toBe(1);
    expect(view.averageCompletionPercent).toBe(0);
  });
});
