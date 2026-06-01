# EP-07 Slice B — Course Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give a course owner a live analytics page at `/courses/:cid/analytics` — enrolled total, mean per-student completion %, 7/30/90-day new enrollments, and a per-lesson breakdown (completion rate + average furthest-watched position vs. video duration) — backed by an owner-guarded `GET /api/courses/:cid/analytics`.

**Architecture:** A new `analytics/` submodule in `api-courses` (`AnalyticsService` + `AnalyticsController`) computes the view live by reusing `EnrollmentRepository.listActiveByCourse` (Slice A), the course module→lesson traversal, and `VideoRepository` for durations. The Angular `web-courses` lib adds a standalone analytics page. Mirrors the Slice A roster structure throughout.

**Tech Stack:** NestJS 11 + firebase-admin (Firestore), Angular 21 (standalone, signals, OnPush), Vitest, Playwright (api-e2e), Nx, pnpm.

**Spec:** `docs/superpowers/specs/2026-06-01-ep07-slice-b-course-analytics-design.md`

---

## Conventions used in this plan

- Run a single project's unit tests with `pnpm nx test <project>`. Red step = the new test fails; green step = the suite passes.
- Commit at the end of every task (Conventional Commits).
- **Never `git add -A`** in this worktree — its `node_modules` is a symlink that evades `.gitignore`. Always `git add <explicit paths>`.
- This slice closely parallels Slice A (`roster/` submodule, `course-students-page/`). When unsure of a pattern, read the corresponding Slice A file.

---

## File Structure

**Create:**
- `libs/shared-data-models/src/lib/analytics.ts` — `LessonAnalyticsRow`, `CourseAnalyticsView`.
- `libs/shared-data-models/src/lib/analytics.spec.ts`
- `libs/api-courses/src/lib/analytics/analytics.service.ts` — metric computation.
- `libs/api-courses/src/lib/analytics/analytics.service.spec.ts`
- `libs/api-courses/src/lib/analytics/analytics.controller.ts` — `GET /courses/:cid/analytics`.
- `libs/api-courses/src/lib/analytics/analytics.controller.spec.ts`
- `apps/api-e2e/src/analytics.e2e-spec.ts`
- `libs/web-courses/src/lib/course-analytics-page/seconds-to-clock.util.ts`
- `libs/web-courses/src/lib/course-analytics-page/seconds-to-clock.util.spec.ts`
- `libs/web-courses/src/lib/course-analytics-page/analytics.service.ts` — web HTTP wrapper.
- `libs/web-courses/src/lib/course-analytics-page/analytics.service.spec.ts`
- `libs/web-courses/src/lib/course-analytics-page/course-analytics-page.component.ts`
- `libs/web-courses/src/lib/course-analytics-page/course-analytics-page.component.html`
- `libs/web-courses/src/lib/course-analytics-page/course-analytics-page.component.spec.ts`

**Modify:**
- `libs/shared-data-models/src/index.ts` — export `./lib/analytics`.
- `libs/api-courses/src/lib/video/video.repository.ts` — add `listVideosForLessons`.
- `libs/api-courses/src/lib/video/video.repository.spec.ts` — test it.
- `libs/api-courses/src/lib/courses.module.ts` — register `AnalyticsController` + `AnalyticsService`.
- `libs/web-courses/src/lib/courses.routes.ts` — add `:id/analytics` child route.
- `libs/web-courses/src/lib/course-editor-page/course-editor-page.component.html` — add an "Analytics" link.
- `libs/web-courses/src/lib/course-editor-page/course-editor-page.component.spec.ts` — assert the link.
- `README.md` — feature record + endpoint table + slice inventory.
- `docs/USER_GUIDE.md` — analytics entry.

**Decisions locked here (from the spec):**
- **Filter:** reuse the existing `CoursesExceptionFilter` (same as `roster/` and `catalog/`). No new filter file.
- **Clock:** `AnalyticsService` reads `Date.now()` / `new Date()` inline; the window tests use Vitest fake timers (`vi.useFakeTimers()` + `vi.setSystemTime(...)`). No injected clock token.
- **Ordering:** the service sorts modules by `module.order`, then lessons by `lesson.order`, defensively (does not assume repo order).
- **Duration:** `durationSec` is taken only when `video.state === 'READY'` and `video.output` is present; otherwise `null`.

---

## Task 1: Shared types — `CourseAnalyticsView` / `LessonAnalyticsRow`

**Files:**
- Create: `libs/shared-data-models/src/lib/analytics.ts`
- Create: `libs/shared-data-models/src/lib/analytics.spec.ts`
- Modify: `libs/shared-data-models/src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `libs/shared-data-models/src/lib/analytics.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';

import type { CourseId, ISODateString, LessonId, ModuleId } from './common';
import type { CourseAnalyticsView, LessonAnalyticsRow } from './analytics';

describe('analytics model', () => {
  it('accepts a fully-populated LessonAnalyticsRow literal', () => {
    const row: LessonAnalyticsRow = {
      lessonId: 'l1' as LessonId,
      moduleId: 'm1' as ModuleId,
      title: 'Intro',
      completionRatePercent: 50,
      watchedStudents: 3,
      averageWatchedSeconds: 200,
      durationSec: 295,
      averageWatchedPercent: 68,
    };
    expect(row.averageWatchedPercent).toBe(68);
    expect(row.durationSec).toBe(295);
  });

  it('allows null duration and null averageWatchedPercent (video not ready)', () => {
    const row: LessonAnalyticsRow = {
      lessonId: 'l2' as LessonId,
      moduleId: 'm1' as ModuleId,
      title: 'No video yet',
      completionRatePercent: 0,
      watchedStudents: 0,
      averageWatchedSeconds: 0,
      durationSec: null,
      averageWatchedPercent: null,
    };
    expect(row.durationSec).toBeNull();
    expect(row.averageWatchedPercent).toBeNull();
  });

  it('accepts a CourseAnalyticsView with the 7/30/90 windows', () => {
    const view: CourseAnalyticsView = {
      courseId: 'c1' as CourseId,
      enrolledTotal: 4,
      averageCompletionPercent: 42,
      newEnrollments: { last7Days: 1, last30Days: 2, last90Days: 3 },
      totalLessons: 10,
      lessons: [],
      generatedAt: '2026-06-01T00:00:00.000Z' as ISODateString,
    };
    expect(view.newEnrollments.last30Days).toBe(2);
    expect(view.lessons).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test shared-data-models`
Expected: FAIL — `Cannot find module './analytics'`.

- [ ] **Step 3: Create the types**

Create `libs/shared-data-models/src/lib/analytics.ts`:

```ts
import type { CourseId, ISODateString, LessonId, ModuleId } from './common';

/** Per-lesson analytics row (US-07-02). */
export interface LessonAnalyticsRow {
  lessonId: LessonId;
  moduleId: ModuleId;
  title: string;
  /** ACTIVE students with completedAt for this lesson ÷ enrolledTotal, rounded. 0 when no students. */
  completionRatePercent: number;
  /** ACTIVE students who have a progress row for this lesson. */
  watchedStudents: number;
  /** Mean lastWatchedSeconds over watchedStudents (furthest position, NOT cumulative watch time). 0 when none. */
  averageWatchedSeconds: number;
  /** Lesson video's READY duration, or null when the video is missing/processing. */
  durationSec: number | null;
  /** averageWatchedSeconds ÷ durationSec, rounded; null when durationSec is unavailable. */
  averageWatchedPercent: number | null;
}

/** Response of GET /api/courses/:cid/analytics — owner-only course analytics. */
export interface CourseAnalyticsView {
  courseId: CourseId;
  enrolledTotal: number;
  /** Mean per-student progress % across ACTIVE enrollees. 0 when no students/lessons. */
  averageCompletionPercent: number;
  newEnrollments: {
    last7Days: number;
    last30Days: number;
    last90Days: number;
  };
  totalLessons: number;
  /** One row per current lesson, ordered by module order then lesson order. */
  lessons: LessonAnalyticsRow[];
  /** Request-time timestamp; conveys freshness in the UI. */
  generatedAt: ISODateString;
}
```

- [ ] **Step 4: Export from the barrel**

In `libs/shared-data-models/src/index.ts`, add after the `./lib/roster` line:

```ts
export * from './lib/analytics';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm nx test shared-data-models`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add libs/shared-data-models/src/lib/analytics.ts libs/shared-data-models/src/lib/analytics.spec.ts libs/shared-data-models/src/index.ts
git commit -m "feat(shared): add CourseAnalyticsView/LessonAnalyticsRow types"
```

---

## Task 2: Repository — `VideoRepository.listVideosForLessons`

**Files:**
- Modify: `libs/api-courses/src/lib/video/video.repository.ts`
- Modify: `libs/api-courses/src/lib/video/video.repository.spec.ts`

- [ ] **Step 1: Write the failing test**

**Read `libs/api-courses/src/lib/video/video.repository.spec.ts` first** to learn how it stubs Firestore (it uses the shared `createFakeFirestore` fake — the same one the enrollment repo spec uses). Add this test, reusing the file's existing harness for seeding `videos` docs:

```ts
it('listVideosForLessons returns full Video docs keyed by lessonId, omitting lessons without a video', async () => {
  // Seed two videos for lesson-1 and lesson-2; lesson-3 has none.
  // Use the SAME seeding mechanism the other tests in this file use.
  const v1 = makeVideo({ id: 'v1', lessonId: 'lesson-1', state: 'READY', output: { bucket: 'b', manifestPath: 'm', durationSec: 100 } });
  const v2 = makeVideo({ id: 'v2', lessonId: 'lesson-2', state: 'TRANSCODING' });
  const { repo } = repoWith({
    'videos/v1': v1,
    'videos/v2': v2,
  });

  const map = await repo.listVideosForLessons([
    'lesson-1' as LessonId,
    'lesson-2' as LessonId,
    'lesson-3' as LessonId,
  ]);

  expect(map.get('lesson-1' as LessonId)?.id).toBe('v1');
  expect(map.get('lesson-1' as LessonId)?.output?.durationSec).toBe(100);
  expect(map.get('lesson-2' as LessonId)?.state).toBe('TRANSCODING');
  expect(map.has('lesson-3' as LessonId)).toBe(false);
});
```

> Match the file's real helpers: if the spec already has a `makeVideo`/`repoWith` (or equivalently named) helper, use it; if it seeds via a different function, copy that exact mechanism. A `Video` doc requires at least `{ id, ownerInstructorId, courseId, lessonId, state, source, createdAt, updatedAt }` and, for the READY case, `output: { bucket, manifestPath, durationSec }`. Do not invent a second harness — if you cannot tell how the file seeds data, report NEEDS_CONTEXT.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test api-courses`
Expected: FAIL — `repo.listVideosForLessons is not a function`.

- [ ] **Step 3: Implement the method**

In `libs/api-courses/src/lib/video/video.repository.ts`, add this method to `VideoRepository`, directly after `listVideoStatesForLessons`:

```ts
/** Full Video docs for the given lessons, keyed by lessonId. Lessons with no video are absent. */
async listVideosForLessons(lessonIds: LessonId[]): Promise<Map<LessonId, Video>> {
  const out = new Map<LessonId, Video>();
  const unique = [...new Set(lessonIds)];
  if (unique.length === 0) return out;
  const results = await Promise.all(unique.map((lid) => this.getVideoByLesson(lid)));
  results.forEach((video, i) => {
    if (video) out.set(unique[i]!, video);
  });
  return out;
}
```

`Video` and `LessonId` are already imported at the top of the file.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm nx test api-courses`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/api-courses/src/lib/video/video.repository.ts libs/api-courses/src/lib/video/video.repository.spec.ts
git commit -m "feat(api-courses): listVideosForLessons on VideoRepository"
```

---

## Task 3: `AnalyticsService`

**Files:**
- Create: `libs/api-courses/src/lib/analytics/analytics.service.ts`
- Create: `libs/api-courses/src/lib/analytics/analytics.service.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `libs/api-courses/src/lib/analytics/analytics.service.spec.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test api-courses`
Expected: FAIL — `Cannot find module './analytics.service'`.

- [ ] **Step 3: Implement the service**

Create `libs/api-courses/src/lib/analytics/analytics.service.ts`:

```ts
import { Injectable } from '@nestjs/common';

import type {
  Course,
  CourseAnalyticsView,
  Enrollment,
  ISODateString,
  LessonAnalyticsRow,
  LessonId,
  ModuleId,
} from '@learnwren/shared-data-models';

import { CoursesRepository } from '../courses.repository';
import { EnrollmentRepository } from '../enrollment/enrollment.repository';
import { VideoRepository } from '../video/video.repository';

const DAY_MS = 86_400_000;

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly courses: CoursesRepository,
    private readonly enrollments: EnrollmentRepository,
    private readonly videos: VideoRepository,
  ) {}

  async getAnalytics(course: Course): Promise<CourseAnalyticsView> {
    const modules = (await this.courses.listModulesByCourse(course.id))
      .slice()
      .sort((a, b) => a.order - b.order);
    const lessonsByModule = await Promise.all(
      modules.map((m) => this.courses.listLessonsByModule(course.id, m.id)),
    );

    const ordered: Array<{ lessonId: LessonId; moduleId: ModuleId; title: string }> = [];
    modules.forEach((m, i) => {
      const ls = lessonsByModule[i].slice().sort((a, b) => a.order - b.order);
      for (const l of ls) ordered.push({ lessonId: l.id, moduleId: m.id, title: l.title });
    });
    const lessonIds = ordered.map((o) => o.lessonId);
    const lessonIdSet = new Set(lessonIds);
    const totalLessons = lessonIdSet.size;

    const enrollments = await this.enrollments.listActiveByCourse(course.id);
    const enrolledTotal = enrollments.length;
    const videos = await this.videos.listVideosForLessons(lessonIds);

    const nowMs = Date.now();
    const lessons: LessonAnalyticsRow[] = ordered.map(({ lessonId, moduleId, title }) => {
      let completedCount = 0;
      let watchedStudents = 0;
      let watchedSecondsSum = 0;
      for (const e of enrollments) {
        const row = e.progress.find((p) => p.lessonId === lessonId);
        if (!row) continue;
        watchedStudents += 1;
        watchedSecondsSum += row.lastWatchedSeconds;
        if (row.completedAt != null) completedCount += 1;
      }
      const completionRatePercent =
        enrolledTotal === 0 ? 0 : Math.round((completedCount / enrolledTotal) * 100);
      const averageWatchedSeconds =
        watchedStudents === 0 ? 0 : Math.round(watchedSecondsSum / watchedStudents);
      const video = videos.get(lessonId);
      const durationSec =
        video?.state === 'READY' && video.output ? video.output.durationSec : null;
      const averageWatchedPercent =
        durationSec && durationSec > 0
          ? Math.round((averageWatchedSeconds / durationSec) * 100)
          : null;
      return {
        lessonId,
        moduleId,
        title,
        completionRatePercent,
        watchedStudents,
        averageWatchedSeconds,
        durationSec,
        averageWatchedPercent,
      };
    });

    return {
      courseId: course.id,
      enrolledTotal,
      averageCompletionPercent: this.meanCompletion(enrollments, lessonIdSet, totalLessons),
      newEnrollments: {
        last7Days: this.countSince(enrollments, nowMs, 7),
        last30Days: this.countSince(enrollments, nowMs, 30),
        last90Days: this.countSince(enrollments, nowMs, 90),
      },
      totalLessons,
      lessons,
      generatedAt: new Date().toISOString() as ISODateString,
    };
  }

  private meanCompletion(
    enrollments: Enrollment[],
    lessonIdSet: Set<LessonId>,
    totalLessons: number,
  ): number {
    if (enrollments.length === 0 || totalLessons === 0) return 0;
    const sum = enrollments.reduce((acc, e) => {
      const completed = new Set(
        e.progress
          .filter((p) => p.completedAt != null && lessonIdSet.has(p.lessonId))
          .map((p) => p.lessonId),
      ).size;
      return acc + (completed / totalLessons) * 100;
    }, 0);
    return Math.round(sum / enrollments.length);
  }

  private countSince(enrollments: Enrollment[], nowMs: number, days: number): number {
    const cutoff = nowMs - days * DAY_MS;
    return enrollments.filter((e) => Date.parse(e.createdAt) >= cutoff).length;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm nx test api-courses`
Expected: PASS (all 7 AnalyticsService tests).

- [ ] **Step 5: Commit**

```bash
git add libs/api-courses/src/lib/analytics/analytics.service.ts libs/api-courses/src/lib/analytics/analytics.service.spec.ts
git commit -m "feat(api-courses): AnalyticsService computes live course analytics"
```

---

## Task 4: `AnalyticsController` + module wiring

**Files:**
- Create: `libs/api-courses/src/lib/analytics/analytics.controller.ts`
- Create: `libs/api-courses/src/lib/analytics/analytics.controller.spec.ts`
- Modify: `libs/api-courses/src/lib/courses.module.ts`

- [ ] **Step 1: Write the failing test**

Create `libs/api-courses/src/lib/analytics/analytics.controller.spec.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Course, CourseAnalyticsView, CourseId } from '@learnwren/shared-data-models';

import type { CourseScopedRequest } from '../types/loaded-course';
import { AnalyticsController } from './analytics.controller';
import type { AnalyticsService } from './analytics.service';

const CID = 'course-1' as CourseId;
const course = { id: CID } as Course;

describe('AnalyticsController', () => {
  let svc: { getAnalytics: ReturnType<typeof vi.fn> };
  let controller: AnalyticsController;

  beforeEach(() => {
    svc = {
      getAnalytics: vi.fn().mockResolvedValue({
        courseId: CID,
        enrolledTotal: 0,
        averageCompletionPercent: 0,
        newEnrollments: { last7Days: 0, last30Days: 0, last90Days: 0 },
        totalLessons: 0,
        lessons: [],
        generatedAt: '2026-06-01T00:00:00.000Z',
      } as CourseAnalyticsView),
    };
    controller = new AnalyticsController(svc as unknown as AnalyticsService);
  });

  it('GET :cid/analytics delegates the guard-loaded course to the service', async () => {
    const req = { user: { uid: 'owner' }, course } as CourseScopedRequest;
    const view = await controller.getAnalytics(req);
    expect(svc.getAnalytics).toHaveBeenCalledWith(course);
    expect(view.courseId).toBe(CID);
  });

  it('throws if the owner guard did not attach the course', async () => {
    const req = { user: { uid: 'owner' } } as CourseScopedRequest;
    await expect(controller.getAnalytics(req)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test api-courses`
Expected: FAIL — `Cannot find module './analytics.controller'`.

- [ ] **Step 3: Implement the controller**

Create `libs/api-courses/src/lib/analytics/analytics.controller.ts`:

```ts
import { Controller, Get, Req, UseFilters, UseGuards } from '@nestjs/common';

import type { CourseAnalyticsView } from '@learnwren/shared-data-models';

import { FirebaseSessionGuard } from '@learnwren/api-auth';

import { CourseOwnerGuard } from '../course-owner.guard';
import { CoursesExceptionFilter } from '../courses.exception-filter';
import type { CourseScopedRequest } from '../types/loaded-course';
import { AnalyticsService } from './analytics.service';

/**
 * Owner-only course analytics (US-07-02). `CourseOwnerGuard` loads and
 * authorizes the course (404 missing / 403 not-owner) and attaches it to the
 * request; the session guard supplies the authenticated user (401 otherwise).
 */
@Controller('courses')
@UseFilters(CoursesExceptionFilter)
@UseGuards(FirebaseSessionGuard)
export class AnalyticsController {
  constructor(private readonly service: AnalyticsService) {}

  @Get(':cid/analytics')
  @UseGuards(CourseOwnerGuard)
  getAnalytics(@Req() req: CourseScopedRequest): Promise<CourseAnalyticsView> {
    if (!req.course) {
      return Promise.reject(new Error('AnalyticsController: CourseOwnerGuard did not attach course'));
    }
    return this.service.getAnalytics(req.course);
  }
}
```

- [ ] **Step 4: Wire into the module**

In `libs/api-courses/src/lib/courses.module.ts`:

Add imports near the other submodule imports:

```ts
import { AnalyticsController } from './analytics/analytics.controller';
import { AnalyticsService } from './analytics/analytics.service';
```

Add `AnalyticsController` to the `controllers` array (after `RosterController`):

```ts
controllers: [CoursesController, CatalogController, EnrollmentController, LearnController, CoverController, RosterController, AnalyticsController],
```

Add `AnalyticsService` to the `providers` array (anywhere in the list):

```ts
    AnalyticsService,
```

`VideoRepository` is reachable: `CoursesModule` already imports `forwardRef(() => VideoModule)`, and `VideoModule` exports `VideoRepository`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm nx test api-courses`
Expected: PASS.

- [ ] **Step 6: Typecheck + build the API (proves DI wiring)**

Run: `pnpm nx typecheck api-courses`
Run: `pnpm nx build api`
Expected: both PASS. If `build api` fails on DI resolution (e.g. `VideoRepository` not resolvable), report BLOCKED with the error.

> Note (worktree hazard): if typecheck reports stale errors about `.d.ts` files in `dist/out-tsc`, delete `dist/out-tsc` and any `*.tsbuildinfo` for the affected libs and re-run with `NX_DAEMON=false`. This is a known parallel-worktree artifact, not a real error.

- [ ] **Step 7: Commit**

```bash
git add libs/api-courses/src/lib/analytics/analytics.controller.ts libs/api-courses/src/lib/analytics/analytics.controller.spec.ts libs/api-courses/src/lib/courses.module.ts
git commit -m "feat(api-courses): GET /courses/:cid/analytics endpoint"
```

---

## Task 5: api-e2e — owner guard + computed analytics

**Files:**
- Create: `apps/api-e2e/src/analytics.e2e-spec.ts`

> Needs the emulator + API running. The CONTROLLER of this plan runs this suite during the verification gate; the implementer should WRITE it and verify it **lints + typechecks**, NOT run the live suite.

- [ ] **Step 1: Write the e2e test**

Create `apps/api-e2e/src/analytics.e2e-spec.ts`:

```ts
// NOTE: Run `pnpm emulators` and `pnpm start:api` before executing this suite.
import { expect, test } from '@playwright/test';
import * as admin from 'firebase-admin';

import {
  API_BASE,
  initAdmin,
  registerAndPromoteInstructor,
  registerStudent,
  withAnonRequest,
} from './_helpers/auth';

initAdmin();

async function seedCourseWithReadyVideo(
  instructorId: string,
): Promise<{ cid: string; lessonIds: string[] }> {
  const cid = `analytics-e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const now = new Date().toISOString();
  const db = admin.firestore();
  await db.collection('courses').doc(cid).set({
    id: cid,
    title: 'Analytics e2e course',
    description: 'course',
    instructorId,
    status: 'PUBLISHED',
    enrollmentCount: 0,
    publishedAt: now,
    createdAt: now,
    updatedAt: now,
  });
  const mid = `${cid}-m1`;
  await db.collection('courses').doc(cid).collection('modules').doc(mid).set({
    id: mid,
    courseId: cid,
    title: 'Module 1',
    order: 0,
    createdAt: now,
    updatedAt: now,
  });
  const lessonIds = [`${cid}-l1`, `${cid}-l2`];
  for (let i = 0; i < lessonIds.length; i += 1) {
    const lid = lessonIds[i] as string;
    await db
      .collection('courses')
      .doc(cid)
      .collection('modules')
      .doc(mid)
      .collection('lessons')
      .doc(lid)
      .set({ id: lid, moduleId: mid, title: `Lesson ${i + 1}`, order: i, createdAt: now, updatedAt: now });
  }
  // A READY video for l1 with a known duration; l2 has no video.
  const vid = `${cid}-v1`;
  await db.collection('videos').doc(vid).set({
    id: vid,
    ownerInstructorId: instructorId,
    courseId: cid,
    lessonId: lessonIds[0],
    state: 'READY',
    source: { bucket: 'demo-learnwren.appspot.com', path: `videos/${vid}/source.mp4` },
    output: { bucket: 'demo-learnwren.appspot.com', manifestPath: `videos/${vid}/master.m3u8`, durationSec: 200 },
    createdAt: now,
    updatedAt: now,
  });
  return { cid, lessonIds };
}

test('owner sees computed course + per-lesson analytics', async ({ request }) => {
  const instructor = await registerAndPromoteInstructor(request);
  const student = await registerStudent(request);
  const { cid, lessonIds } = await seedCourseWithReadyVideo(instructor.uid);

  await request.post(`${API_BASE}/enrollments`, {
    headers: { cookie: student.cookieHeader },
    data: { courseId: cid },
  });
  // Complete l1 and save a position of 100s on it.
  await request.post(`${API_BASE}/learn/courses/${cid}/lessons/${lessonIds[0]}/complete`, {
    headers: { cookie: student.cookieHeader },
  });
  await request.post(`${API_BASE}/learn/courses/${cid}/lessons/${lessonIds[0]}/position`, {
    headers: { cookie: student.cookieHeader },
    data: { seconds: 100 },
  });

  const res = await request.get(`${API_BASE}/courses/${cid}/analytics`, {
    headers: { cookie: instructor.cookieHeader },
  });
  expect(res.status()).toBe(200);
  const view = await res.json();
  expect(view.enrolledTotal).toBe(1);
  expect(view.totalLessons).toBe(2);
  // One of two lessons completed => 50% mean completion for the single student.
  expect(view.averageCompletionPercent).toBe(50);
  expect(view.newEnrollments.last7Days).toBeGreaterThanOrEqual(1);

  const l1 = view.lessons.find((l: { lessonId: string }) => l.lessonId === lessonIds[0]);
  expect(l1.completionRatePercent).toBe(100); // the one student completed l1
  expect(l1.durationSec).toBe(200);
  expect(l1.averageWatchedSeconds).toBe(100);
  expect(l1.averageWatchedPercent).toBe(50); // 100/200

  const l2 = view.lessons.find((l: { lessonId: string }) => l.lessonId === lessonIds[1]);
  expect(l2.durationSec).toBeNull();
  expect(l2.completionRatePercent).toBe(0);
});

test('a non-owner instructor is forbidden', async ({ request }) => {
  const owner = await registerAndPromoteInstructor(request);
  const stranger = await registerAndPromoteInstructor(request);
  const { cid } = await seedCourseWithReadyVideo(owner.uid);

  const res = await request.get(`${API_BASE}/courses/${cid}/analytics`, {
    headers: { cookie: stranger.cookieHeader },
  });
  expect(res.status()).toBe(403);
});

test('an unauthenticated request is rejected', async ({ request }) => {
  const owner = await registerAndPromoteInstructor(request);
  const { cid } = await seedCourseWithReadyVideo(owner.uid);

  await withAnonRequest(async (anon) => {
    const res = await anon.get(`${API_BASE}/courses/${cid}/analytics`);
    expect(res.status()).toBe(401);
  });
});
```

> Before committing, verify the seeded subcollection paths (`courses/{cid}/modules/{mid}/lessons/{lid}`) and the lesson/module field names match what `CoursesRepository.listModulesByCourse`/`listLessonsByModule` read, and that the `videos` doc shape matches the `Video` type (the roster e2e from Slice A, `apps/api-e2e/src/roster.e2e-spec.ts`, is a correct reference for the course/module/lesson seed — copy its shapes). Confirm the position route is `POST /api/learn/courses/:cid/lessons/:lid/position` with body `{ seconds }` (see `libs/api-courses/src/lib/learn/learn.controller.ts`). Adjust the seed if any path/field differs.

- [ ] **Step 2: Lint + typecheck (do NOT run the live suite)**

Run: `pnpm nx lint api-e2e`
Run: `pnpm nx typecheck api-e2e`
Expected: both pass (no errors in the new file).

- [ ] **Step 3: Commit**

```bash
git add apps/api-e2e/src/analytics.e2e-spec.ts
git commit -m "test(api-e2e): analytics endpoint owner-guard and computed metrics"
```

---

## Task 6: Web `secondsToClock` util

**Files:**
- Create: `libs/web-courses/src/lib/course-analytics-page/seconds-to-clock.util.ts`
- Create: `libs/web-courses/src/lib/course-analytics-page/seconds-to-clock.util.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `libs/web-courses/src/lib/course-analytics-page/seconds-to-clock.util.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { secondsToClock } from './seconds-to-clock.util';

describe('secondsToClock', () => {
  it('formats sub-minute as 0:SS', () => {
    expect(secondsToClock(5)).toBe('0:05');
    expect(secondsToClock(0)).toBe('0:00');
  });

  it('formats minutes as M:SS', () => {
    expect(secondsToClock(65)).toBe('1:05');
    expect(secondsToClock(600)).toBe('10:00');
  });

  it('formats past an hour as H:MM:SS', () => {
    expect(secondsToClock(3661)).toBe('1:01:01');
  });

  it('rounds fractional seconds and floors negatives to 0:00', () => {
    expect(secondsToClock(59.6)).toBe('1:00');
    expect(secondsToClock(-5)).toBe('0:00');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test web-courses`
Expected: FAIL — `Cannot find module './seconds-to-clock.util'`.

- [ ] **Step 3: Implement the util**

Create `libs/web-courses/src/lib/course-analytics-page/seconds-to-clock.util.ts`:

```ts
/** Format a number of seconds as a clock string: M:SS, or H:MM:SS past an hour. */
export function secondsToClock(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, '0');
  if (h > 0) {
    const mm = String(m).padStart(2, '0');
    return `${h}:${mm}:${ss}`;
  }
  return `${m}:${ss}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm nx test web-courses`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/web-courses/src/lib/course-analytics-page/seconds-to-clock.util.ts libs/web-courses/src/lib/course-analytics-page/seconds-to-clock.util.spec.ts
git commit -m "feat(web-courses): secondsToClock duration formatter"
```

---

## Task 7: Web `AnalyticsService` (HTTP wrapper)

**Files:**
- Create: `libs/web-courses/src/lib/course-analytics-page/analytics.service.ts`
- Create: `libs/web-courses/src/lib/course-analytics-page/analytics.service.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `libs/web-courses/src/lib/course-analytics-page/analytics.service.spec.ts`:

```ts
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import type { CourseAnalyticsView } from '@learnwren/shared-data-models';

import { AnalyticsService } from './analytics.service';

describe('AnalyticsService (web)', () => {
  let service: AnalyticsService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AnalyticsService);
    http = TestBed.inject(HttpTestingController);
  });

  it('GETs /api/courses/:cid/analytics with credentials', async () => {
    const promise = service.getAnalytics('course-1');
    const reqs = http.match('/api/courses/course-1/analytics');
    expect(reqs).toHaveLength(1);
    expect(reqs[0].request.method).toBe('GET');
    expect(reqs[0].request.withCredentials).toBe(true);
    reqs[0].flush({
      courseId: 'course-1',
      enrolledTotal: 0,
      averageCompletionPercent: 0,
      newEnrollments: { last7Days: 0, last30Days: 0, last90Days: 0 },
      totalLessons: 0,
      lessons: [],
      generatedAt: '2026-06-01T00:00:00.000Z',
    } as CourseAnalyticsView);
    const view = await promise;
    expect(view.courseId).toBe('course-1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test web-courses`
Expected: FAIL — `Cannot find module './analytics.service'`.

- [ ] **Step 3: Implement the service**

Create `libs/web-courses/src/lib/course-analytics-page/analytics.service.ts`:

```ts
import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { CourseAnalyticsView } from '@learnwren/shared-data-models';

const OPTS = { withCredentials: true } as const;

@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  private readonly http = inject(HttpClient);

  getAnalytics(cid: string): Promise<CourseAnalyticsView> {
    return firstValueFrom(
      this.http.get<CourseAnalyticsView>(`/api/courses/${cid}/analytics`, OPTS),
    );
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm nx test web-courses`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/web-courses/src/lib/course-analytics-page/analytics.service.ts libs/web-courses/src/lib/course-analytics-page/analytics.service.spec.ts
git commit -m "feat(web-courses): AnalyticsService HTTP wrapper"
```

---

## Task 8: `CourseAnalyticsPageComponent` + route

**Files:**
- Create: `libs/web-courses/src/lib/course-analytics-page/course-analytics-page.component.ts`
- Create: `libs/web-courses/src/lib/course-analytics-page/course-analytics-page.component.html`
- Create: `libs/web-courses/src/lib/course-analytics-page/course-analytics-page.component.spec.ts`
- Modify: `libs/web-courses/src/lib/courses.routes.ts`

- [ ] **Step 1: Write the failing spec**

Create `libs/web-courses/src/lib/course-analytics-page/course-analytics-page.component.spec.ts`:

```ts
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { describe, expect, it } from 'vitest';

import type { CourseAnalyticsView } from '@learnwren/shared-data-models';

import { CourseAnalyticsPageComponent } from './course-analytics-page.component';

const VIEW: CourseAnalyticsView = {
  courseId: 'course-1' as never,
  enrolledTotal: 4,
  averageCompletionPercent: 55,
  newEnrollments: { last7Days: 1, last30Days: 2, last90Days: 3 },
  totalLessons: 2,
  lessons: [
    {
      lessonId: 'l1' as never,
      moduleId: 'm1' as never,
      title: 'Getting started',
      completionRatePercent: 75,
      watchedStudents: 4,
      averageWatchedSeconds: 100,
      durationSec: 200,
      averageWatchedPercent: 50,
    },
    {
      lessonId: 'l2' as never,
      moduleId: 'm1' as never,
      title: 'No video yet',
      completionRatePercent: 0,
      watchedStudents: 0,
      averageWatchedSeconds: 0,
      durationSec: null,
      averageWatchedPercent: null,
    },
  ],
  generatedAt: '2026-06-01T00:00:00.000Z' as never,
};

function setup() {
  TestBed.configureTestingModule({
    imports: [CourseAnalyticsPageComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      { provide: ActivatedRoute, useValue: { paramMap: of(new Map([['id', 'course-1']])) } },
    ],
  });
  const http = TestBed.inject(HttpTestingController);
  const fixture = TestBed.createComponent(CourseAnalyticsPageComponent);
  fixture.detectChanges();
  return { http, fixture };
}

describe('CourseAnalyticsPageComponent', () => {
  it('renders the course summary figures', async () => {
    const s = setup();
    s.http.expectOne('/api/courses/course-1/analytics').flush(VIEW);
    await s.fixture.whenStable();
    s.fixture.detectChanges();
    const text = (s.fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('4'); // enrolled total
    expect(text).toContain('55%'); // average completion
    expect(text).toContain('1'); // last 7 days
  });

  it('renders a per-lesson row with completion and avg progress', async () => {
    const s = setup();
    s.http.expectOne('/api/courses/course-1/analytics').flush(VIEW);
    await s.fixture.whenStable();
    s.fixture.detectChanges();
    const text = (s.fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Getting started');
    expect(text).toContain('75%'); // completion rate
    expect(text).toContain('1:40'); // 100s avg watched, secondsToClock
    expect(text).toContain('3:20'); // 200s duration
  });

  it('shows an em-dash for a lesson with no duration', async () => {
    const s = setup();
    s.http.expectOne('/api/courses/course-1/analytics').flush(VIEW);
    await s.fixture.whenStable();
    s.fixture.detectChanges();
    const rows = (s.fixture.nativeElement as HTMLElement).querySelectorAll(
      '[data-testid="lesson-duration"]',
    );
    // Second lesson has null duration -> rendered as "—".
    expect(rows[1].textContent).toContain('—');
  });

  it('shows the no-lessons empty state', async () => {
    const s = setup();
    s.http.expectOne('/api/courses/course-1/analytics').flush({
      ...VIEW,
      totalLessons: 0,
      lessons: [],
    } as CourseAnalyticsView);
    await s.fixture.whenStable();
    s.fixture.detectChanges();
    expect((s.fixture.nativeElement as HTMLElement).textContent).toContain('No lessons yet');
  });

  it('shows an error state when the load fails', async () => {
    const s = setup();
    s.http
      .expectOne('/api/courses/course-1/analytics')
      .flush('boom', { status: 500, statusText: 'Server Error' });
    await s.fixture.whenStable();
    s.fixture.detectChanges();
    expect((s.fixture.nativeElement as HTMLElement).textContent?.toLowerCase()).toContain(
      'could not load',
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test web-courses`
Expected: FAIL — `Cannot find module './course-analytics-page.component'`.

- [ ] **Step 3: Implement the component**

Create `libs/web-courses/src/lib/course-analytics-page/course-analytics-page.component.ts`:

```ts
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';

import type { CourseAnalyticsView } from '@learnwren/shared-data-models';
import { LwCardComponent } from '@learnwren/web-ui';

import { AnalyticsService } from './analytics.service';
import { secondsToClock } from './seconds-to-clock.util';

type State = 'loading' | 'loaded' | 'error';

@Component({
  selector: 'lib-course-analytics-page',
  standalone: true,
  imports: [RouterLink, DatePipe, LwCardComponent],
  templateUrl: './course-analytics-page.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CourseAnalyticsPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly service = inject(AnalyticsService);

  private readonly paramMap = toSignal(this.route.paramMap);
  readonly cid = computed(() => this.paramMap()?.get('id') ?? '');

  readonly state = signal<State>('loading');
  readonly view = signal<CourseAnalyticsView | null>(null);

  readonly clock = secondsToClock;

  constructor() {
    this.load();
  }

  async load(): Promise<void> {
    this.state.set('loading');
    try {
      this.view.set(await this.service.getAnalytics(this.cid()));
      this.state.set('loaded');
    } catch {
      this.state.set('error');
    }
  }
}
```

- [ ] **Step 4: Create the template**

Create `libs/web-courses/src/lib/course-analytics-page/course-analytics-page.component.html`:

```html
<section class="mx-auto max-w-4xl p-4">
  <header class="mb-5">
    <a [routerLink]="['/courses', cid(), 'edit']" class="text-sm text-ochre hover:underline"
      >← Back to course</a
    >
    <h1 class="mt-1 font-serif text-2xl text-ink">Course analytics</h1>
  </header>

  @switch (state()) {
    @case ('loading') {
      <p class="text-ink-3">Loading…</p>
    }
    @case ('error') {
      <lw-card>
        <p class="text-bad">We could not load the analytics.</p>
        <button type="button" class="lw-btn lw-btn-secondary mt-3" (click)="load()">Try again</button>
      </lw-card>
    }
    @case ('loaded') {
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <lw-card>
          <p class="text-ink-3 text-xs uppercase tracking-wide">Enrolled students</p>
          <p class="mt-1 font-serif text-3xl text-ink" data-testid="enrolled-total">
            {{ view()!.enrolledTotal }}
          </p>
        </lw-card>
        <lw-card>
          <p class="text-ink-3 text-xs uppercase tracking-wide">Average completion</p>
          <p class="mt-1 font-serif text-3xl text-ink" data-testid="avg-completion">
            {{ view()!.averageCompletionPercent }}%
          </p>
        </lw-card>
        <lw-card>
          <p class="text-ink-3 text-xs uppercase tracking-wide">New enrollments</p>
          <p class="mt-1 text-ink-2 text-sm" data-testid="new-enrollments">
            {{ view()!.newEnrollments.last7Days }} in 7d ·
            {{ view()!.newEnrollments.last30Days }} in 30d ·
            {{ view()!.newEnrollments.last90Days }} in 90d
          </p>
        </lw-card>
      </div>

      <p class="text-ink-3 mt-3 text-xs">Updated {{ view()!.generatedAt | date: 'medium' }}</p>

      @if (view()!.lessons.length === 0) {
        <lw-card>
          <p class="text-ink-2 mt-4">No lessons yet — add lessons to see per-lesson analytics.</p>
        </lw-card>
      } @else {
        <lw-card>
          <table class="mt-2 w-full text-left text-sm">
            <thead class="text-ink-3">
              <tr>
                <th class="py-2">Lesson</th>
                <th class="py-2">Completion</th>
                <th class="py-2">Avg. progress</th>
                <th class="py-2">Duration</th>
              </tr>
            </thead>
            <tbody>
              @for (row of view()!.lessons; track row.lessonId) {
                <tr class="border-t border-bg-2">
                  <td class="py-2 text-ink" data-testid="lesson-title">{{ row.title }}</td>
                  <td class="py-2 text-ink-2">{{ row.completionRatePercent }}%</td>
                  <td class="py-2 text-ink-2">
                    {{ clock(row.averageWatchedSeconds) }}
                    @if (row.averageWatchedPercent !== null) {
                      · {{ row.averageWatchedPercent }}%
                    }
                  </td>
                  <td class="py-2 text-ink-2" data-testid="lesson-duration">
                    {{ row.durationSec !== null ? clock(row.durationSec) : '—' }}
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </lw-card>
      }
    }
  }
</section>
```

- [ ] **Step 5: Register the route**

In `libs/web-courses/src/lib/courses.routes.ts`, add a child after the `:id/students` route:

```ts
      {
        path: ':id/analytics',
        loadComponent: () =>
          import('./course-analytics-page/course-analytics-page.component').then(
            (m) => m.CourseAnalyticsPageComponent,
          ),
      },
```

- [ ] **Step 6: Run tests + lint + typecheck**

Run: `pnpm nx test web-courses` → PASS (5 component tests + util + service + rest of suite).
Run: `pnpm nx lint web-courses` → no new errors.
Run: `pnpm nx typecheck web-courses` → PASS.

> If `LwCardComponent` import path/selector differs, verify against `libs/web-ui` and the Slice A `course-students-page.component.ts`, which uses the same import. `lw-btn`/`lw-btn-secondary` are the established global button classes.

- [ ] **Step 7: Commit**

```bash
git add libs/web-courses/src/lib/course-analytics-page libs/web-courses/src/lib/courses.routes.ts
git commit -m "feat(web-courses): course analytics page at /courses/:id/analytics"
```

---

## Task 9: "Analytics" link in the course editor

**Files:**
- Modify: `libs/web-courses/src/lib/course-editor-page/course-editor-page.component.html`
- Modify: `libs/web-courses/src/lib/course-editor-page/course-editor-page.component.spec.ts`

> Slice A added a "Students" link to this header inside a `flex items-center justify-between` header. Read the current header markup first.

- [ ] **Step 1: Write the failing test**

Open `libs/web-courses/src/lib/course-editor-page/course-editor-page.component.spec.ts`. It already has a test for the Students link (added in Slice A) that reuses the file's `initEditor()` arrange helper. Add a parallel test:

```ts
it('links to the analytics page for the course', async () => {
  // reuse the same arrange the 'links to the students roster' test uses (initEditor + whenStable)
  const link = (fixture.nativeElement as HTMLElement).querySelector<HTMLAnchorElement>(
    '[data-testid="view-analytics"]',
  );
  expect(link).not.toBeNull();
  expect(link!.getAttribute('href')).toContain('/analytics');
});
```

> Copy the exact arrange block from the existing `links to the students roster for the course` test in this file (same `initEditor()`/`whenStable()`/`detectChanges()` sequence). Assert on `data-testid="view-analytics"`.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test web-courses`
Expected: FAIL — no `[data-testid="view-analytics"]` element.

- [ ] **Step 3: Add the link**

In `libs/web-courses/src/lib/course-editor-page/course-editor-page.component.html`, the header (after Slice A) contains the "← My Courses" link and a "Students" link. Add an Analytics link next to the Students link. The header currently looks like:

```html
  <header class="mb-5 flex items-center justify-between">
    <a routerLink="/courses" class="text-sm text-ochre hover:underline">← My Courses</a>
    <a
      [routerLink]="['/courses', cid(), 'students']"
      data-testid="view-students"
      class="text-sm text-ochre hover:underline"
      >Students</a
    >
  </header>
```

Change it to group the two course-scoped links on the right:

```html
  <header class="mb-5 flex items-center justify-between">
    <a routerLink="/courses" class="text-sm text-ochre hover:underline">← My Courses</a>
    <span class="flex gap-4">
      <a
        [routerLink]="['/courses', cid(), 'students']"
        data-testid="view-students"
        class="text-sm text-ochre hover:underline"
        >Students</a
      >
      <a
        [routerLink]="['/courses', cid(), 'analytics']"
        data-testid="view-analytics"
        class="text-sm text-ochre hover:underline"
        >Analytics</a
      >
    </span>
  </header>
```

> If the real header markup differs from the snippet (e.g. Slice A structured it differently), preserve the existing "← My Courses" and "Students" links and `data-testid="view-students"`, and add the `view-analytics` link beside Students — match the file's real styling.

- [ ] **Step 4: Run tests + lint**

Run: `pnpm nx test web-courses` → PASS (existing Students-link test still green + new Analytics test).
Run: `pnpm nx lint web-courses` → no new errors.

- [ ] **Step 5: Commit**

```bash
git add libs/web-courses/src/lib/course-editor-page/course-editor-page.component.html libs/web-courses/src/lib/course-editor-page/course-editor-page.component.spec.ts
git commit -m "feat(web-courses): Analytics link from the course editor header"
```

---

## Task 10: Docs — README + USER_GUIDE

**Files:**
- Modify: `README.md`
- Modify: `docs/USER_GUIDE.md`

- [ ] **Step 1: Update the README feature record**

In `README.md`, add a bullet after the existing EP-07 Slice A bullet:

```markdown
> - **EP-07 Slice B: Course analytics (US-07-02)** — a course owner opens **Analytics** from the course editor to reach `/courses/:cid/analytics`: enrolled total, average per-student completion %, new enrollments in the last 7/30/90 days, and a per-lesson breakdown (completion rate + average progress into the lesson vs. the video's duration). Computed live on each request (the ≤24h freshness AC is met by construction). "Average watch time" is approximated by the furthest-watched position, since cumulative watch time is not recorded. Owner-only (`GET /api/courses/:cid/analytics`, `CourseOwnerGuard`). Only Slice C (new-module notification) remains in EP-07.
```

Update the "Not built yet" sentence: change the EP-07 phrase (currently `the rest of the instructor dashboard (EP-07 Slices B–C: analytics, new-module notifications)`) to `the rest of the instructor dashboard (EP-07 Slice C: new-module notification)`.

- [ ] **Step 2: Add the endpoint to the README API tables**

After the EP-07 Slice A roster endpoint table, add:

```markdown
The API endpoints exposed by EP-07 Slice B (course analytics — session cookie + course owner required):

| Method | Path | Purpose |
| :--- | :--- | :--- |
| `GET` | `/api/courses/:cid/analytics` | The course owner's live analytics: enrolled total, average completion %, new enrollments (7/30/90d), and per-lesson completion rate + average watched position vs. duration. `403` non-owner, `404` missing course. |
```

- [ ] **Step 3: Update USER_GUIDE**

In `docs/USER_GUIDE.md`, add a short subsection after the Slice A roster section, matching the file's heading style: how to reach the analytics page (editor **Analytics** link / `/courses/:cid/analytics`), the course summary figures, the per-lesson breakdown, the note that "average progress into the lesson" is the furthest-watched position (not cumulative watch time), and that it is owner-only and computed live. Also update any EP-07 "not built" note to reflect that only Slice C remains.

- [ ] **Step 4: Commit**

```bash
git add README.md docs/USER_GUIDE.md
git commit -m "docs(ep07): record course analytics (Slice B)"
```

---

## Task 11: Verification gate

**Files:** none (verification only).

- [ ] **Step 1: Sync TS project references**

Run: `pnpm nx sync`
If it changes tsconfig references, commit them:
```bash
git add tsconfig*.json '**/tsconfig*.json'
git commit -m "chore: nx sync project references for analytics"
```
(Skip the commit if nothing changed.)

- [ ] **Step 2: Run affected lint, test, typecheck, build**

Run: `pnpm nx run-many -t lint test typecheck build -p shared-data-models api-courses web-courses`
Expected: all green. (If the worktree dist hazard surfaces — stale `.d.ts` in `dist/out-tsc` — remove `dist/out-tsc` + stale `*.tsbuildinfo` and re-run with `NX_DAEMON=false`.)

- [ ] **Step 3: Run the api-e2e analytics suite**

With `pnpm emulators` and `pnpm start:api` running:

Run: `pnpm nx e2e api-e2e --grep analytics`
Expected: 3 tests pass.

- [ ] **Step 4: Browser walk-through**

With `pnpm emulators` + `pnpm start` running, as an instructor who owns a PUBLISHED course with at least one enrolled student and a READY-video lesson:
1. Open the course editor → click **Analytics**.
2. Confirm the three summary cards (enrolled, average completion %, 7/30/90 new) render legibly on the dark theme.
3. Confirm the per-lesson table shows completion %, average progress (`m:ss` + %), and duration; a lesson whose video is not READY shows "—" for duration.
4. Confirm the "Updated …" timestamp is present.
5. Visit `/courses/:cid/analytics` for a course you do not own → the error/forbidden state shows (API returns 403).

- [ ] **Step 5: Mutation check (quality bar)**

Scope Stryker to the new source files (a single `--mutate`; do NOT use a bare `*.ts` glob — it would also mutate spec files):

Run:
```bash
NX_DAEMON=false pnpm exec stryker run stryker.api-courses.config.mjs --mutate "libs/api-courses/src/lib/analytics/analytics.service.ts,libs/api-courses/src/lib/analytics/analytics.controller.ts"
```
Then:
```bash
NX_DAEMON=false pnpm exec stryker run stryker.web-courses.config.mjs --mutate "libs/web-courses/src/lib/course-analytics-page/seconds-to-clock.util.ts,libs/web-courses/src/lib/course-analytics-page/analytics.service.ts,libs/web-courses/src/lib/course-analytics-page/course-analytics-page.component.ts"
```
Read each summary table's "% covered" for the source files; each must be ≥ 80. If the component drops below, add targeted assertions (e.g. assert the `1:40`/`3:20`/`—` strings, the new-enrollment numbers, the error/empty branches). Do not chase equivalent mutants (CSS-class strings, the `medium` date format). Do NOT run the no-arg consolidated `report.mjs` from this worktree (it clobbers `docs/quality/mutation-report.md`).

- [ ] **Step 6: Final confirmation**

Run: `git log --oneline main..HEAD`
Expected: the task commits in order. The branch `feat/ep07-slice-b-analytics` is ready to merge to `main` via `git merge --no-ff` (per the project's branch-isolation workflow).

---

## Self-Review (completed by plan author)

**Spec coverage:**
- §1 metrics (enrolled total, mean completion, 7/30/90 windows, per-lesson completion rate, avg watched sec + %, duration) → Task 3 service + tests. ✅
- §2 shared types → Task 1. ✅
- §3 API service/controller/guards/filter → Tasks 3, 4. ✅
- §3.1 `listVideosForLessons` → Task 2. ✅
- §3.2 module wiring → Task 4. ✅
- §4 web service/util/component/route/entry-link → Tasks 6, 7, 8, 9. ✅
- §5 error handling (401/403/404, zero lessons, zero students, null duration, deleted lesson) → Task 3 unit tests + Task 5 e2e + Task 8 states. ✅
- §6 testing (shared, api unit + e2e, web, mutation) → Tasks 1–9 + Task 11. ✅
- §7 decomposition order → Tasks 1→11 bottom-up. ✅
- Data Limitation (furthest-position framing) → surfaced in Task 8 UI ("Avg. progress") + Task 10 docs. ✅

**Placeholder scan:** No TBD/TODO. Two steps instruct reading an existing file's harness before copying it (Task 2 video repo spec, Task 9 editor spec) — unavoidable because those fixtures must be reused verbatim; the assertion to add is given in full.

**Type consistency:** `CourseAnalyticsView`/`LessonAnalyticsRow` field names (`enrolledTotal`, `averageCompletionPercent`, `newEnrollments.last7Days/last30Days/last90Days`, `totalLessons`, `lessons`, `generatedAt`; row: `completionRatePercent`, `watchedStudents`, `averageWatchedSeconds`, `durationSec`, `averageWatchedPercent`) are identical across Tasks 1, 3, 4, 7, 8 and the e2e (Task 5). `getAnalytics(course)` matches between service (Task 3) and controller (Task 4). `secondsToClock` matches between Task 6 and Task 8. `listVideosForLessons` matches between Task 2 and Task 3. Route param `id` matches the editor convention and the component/link (Tasks 8, 9).
