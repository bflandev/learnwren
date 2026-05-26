# EP-06 Slice D — Course Outline Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship UC-06-04 (Navigate the Course Outline): the lesson-player page renders a collapsible left sidebar / mobile drawer listing every module and lesson; the active row is highlighted; completed rows carry a checkmark; non-`READY` rows are non-navigable; clicking a different `READY` row flushes any in-flight playback position and navigates.

**Architecture:** Extend the existing `learn/` submodule of `libs/api-courses` so `GET /api/learn/courses/:cid/lessons/:lid` returns an additive `outline` field. The projection is built inside `LearnService.getLessonView` by reading the course's `modules` subcollection (ordered by `module.order`) and each module's `lessons` subcollection (ordered by `lesson.order`) via the existing `CoursesRepository`, then joining `videoState` (from `VideoRepository.getVideoByLesson` in parallel) and `completedAt` (from the already-loaded enrolment doc's `progress[]`). The slice introduces one new standalone Angular component (`CourseOutlinePanelComponent`) under `libs/web-learn`, wires it into `LessonPlayerPageComponent` with desktop-sidebar / mobile-drawer modes, and routes `lessonSelected` through a flush-before-nav handler that awaits `saver.flush()` then `Router.navigateByUrl('/learn/${courseId}/${nextLessonId}')`. No new endpoints, no new error codes, no new Firestore rules, no new env vars, no new Nx libraries.

**Tech Stack:** NestJS 11, Firestore via `api-firebase`, Vitest + fake-firestore for backend unit tests, Playwright for api-e2e and web-e2e, Angular 21 standalone signal-based components, Tailwind utilities for grid + drawer styling, `@angular/cdk/a11y` `cdkTrapFocus` for the drawer focus trap.

**Spec:** [`docs/superpowers/specs/2026-05-25-ep06-slice-d-course-outline-design.md`](../specs/2026-05-25-ep06-slice-d-course-outline-design.md)

**Working tree:** Create an isolated worktree at `.claude/worktrees/ep06-slice-d-course-outline` on a new branch `ep06-slice-d-course-outline` branched from local `main` HEAD (NOT `origin/main` — local is 28+ commits ahead). Symlink `node_modules` to the parent (`ln -s ../../node_modules .claude/worktrees/ep06-slice-d-course-outline/node_modules`) so installs are instant. **Never run `git add -A`** in this worktree — the symlink evades `.gitignore`'s `node_modules/` rule and would be staged. Stage files by name. Use `superpowers:using-git-worktrees` to set this up before executing.

**Spec-vs-code reconciliations applied in this plan:**
- The spec says the projection runs over data "already loaded" by `getLessonView`. In reality, `LearnService.getLessonView` only loads the single `Lesson` doc (via the guard) plus one `Video` doc plus the caller's enrolment. Modules + all lessons + each lesson's video state are NOT yet loaded. This plan adds those reads explicitly inside `getLessonView`, behind the existing access check, using parallelised `getVideoByLesson` calls. The reads happen only after the guard has authorised the caller, matching the spec's intent.
- The spec calls the flush-before-nav helper `LearnService.flushPosition(cid, lid)`. The web `LearnService` has no such method — Slice C wired flush via `PositionSaver.flush()` and `PositionSaver.flushBeacon()`. This plan uses `this.saver?.flush()` in `LessonPlayerPageComponent.onLessonSelected` (parent owns the saver); no new method on `LearnService`.
- The route param names on the web side are `courseId` / `lessonId` (not `cid` / `lid`), per `libs/web-learn/src/lib/learn.routes.ts`. The plan uses `courseId` / `lessonId` everywhere on the web; API path segments stay `:cid` / `:lid`.

---

## Task 1: Add `CourseOutline` / `CourseOutlineLesson` types and extend `LessonView` with `outline`

**Files:**
- Modify: `libs/shared-data-models/src/lib/lesson-view.ts`
- Modify: `libs/shared-data-models/src/lib/shared-data-models.spec.ts` (or create `libs/shared-data-models/src/lib/lesson-view.spec.ts` — choose the one that already covers `LessonView`; if neither, create `lesson-view.spec.ts`)
- Modify: `libs/shared-data-models/src/index.ts` (only if `CourseOutline` / `CourseOutlineLesson` aren't already re-exported via `lesson-view.ts` re-export — check first; in this repo `lesson-view.ts` is re-exported wholesale, so simply adding the new exported interfaces to `lesson-view.ts` is sufficient)

- [ ] **Step 1: Locate the existing `LessonView` test file**

Run: `rg -l "LessonView" libs/shared-data-models/src`
Expected: a list including `lesson-view.ts` and any `.spec.ts` referencing it. If no spec file imports `LessonView`, create `libs/shared-data-models/src/lib/lesson-view.spec.ts`.

- [ ] **Step 2: Write the failing type-shape test**

Add to (or create) `libs/shared-data-models/src/lib/lesson-view.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';

import type {
  CourseOutline,
  CourseOutlineLesson,
  LessonView,
} from './lesson-view';
import type {
  CourseId,
  ISODateString,
  LessonId,
  ModuleId,
  VideoId,
} from './common';

describe('LessonView (Slice D)', () => {
  it('carries an `outline` field with modules and lessons in order', () => {
    const view: LessonView = {
      course: { id: 'c' as CourseId, title: 'C', status: 'PUBLISHED' },
      lesson: {
        id: 'l' as LessonId,
        moduleId: 'm' as ModuleId,
        title: 'L',
        videoId: 'v' as VideoId,
        videoState: 'READY',
      },
      progress: { completedAt: null, lastWatchedSeconds: 0 },
      outline: {
        modules: [
          {
            id: 'm' as ModuleId,
            title: 'M1',
            lessons: [
              {
                id: 'l' as LessonId,
                title: 'L',
                videoState: 'READY',
                completedAt: null,
              },
            ],
          },
        ],
      },
    };
    expect(view.outline.modules).toHaveLength(1);
    expect(view.outline.modules[0]!.lessons[0]!.completedAt).toBeNull();
  });

  it('allows completedAt to hold an ISODateString', () => {
    const row: CourseOutlineLesson = {
      id: 'l' as LessonId,
      title: 'L',
      videoState: 'READY',
      completedAt: '2026-05-25T12:00:00.000Z' as ISODateString,
    };
    expect(row.completedAt).toMatch(/2026/);
  });

  it('allows videoState to be null when no video has been uploaded yet', () => {
    const outline: CourseOutline = {
      modules: [
        {
          id: 'm' as ModuleId,
          title: 'M',
          lessons: [
            {
              id: 'l' as LessonId,
              title: 'L',
              videoState: null,
              completedAt: null,
            },
          ],
        },
      ],
    };
    expect(outline.modules[0]!.lessons[0]!.videoState).toBeNull();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails to compile**

Run: `pnpm nx test shared-data-models --skip-nx-cache`
Expected: TypeScript errors on `CourseOutline`, `CourseOutlineLesson`, and `outline` not being part of `LessonView`.

- [ ] **Step 4: Extend `lesson-view.ts`**

Open `libs/shared-data-models/src/lib/lesson-view.ts` and:

1. Add `ModuleId` and any missing imports if not already present (`ModuleId` is already imported).
2. Append the two new interfaces below the existing `LessonView`:

```ts
export interface CourseOutlineLesson {
  id: LessonId;
  title: string;
  videoState: VideoState | null;
  completedAt: ISODateString | null;
}

export interface CourseOutline {
  modules: Array<{
    id: ModuleId;
    title: string;
    lessons: CourseOutlineLesson[];
  }>;
}
```

3. Add an `outline: CourseOutline;` field to `LessonView` (required, not optional — the field is purely additive on the wire and every handler response will populate it).

- [ ] **Step 5: Run the test again to verify it passes**

Run: `pnpm nx test shared-data-models --skip-nx-cache`
Expected: PASS.

- [ ] **Step 6: Run lint + typecheck for the whole workspace to catch any consumers**

Run: `pnpm nx run-many -t typecheck,lint --projects=shared-data-models,api-courses,web-learn,web-courses,api,web --skip-nx-cache`
Expected: PASS. (If `api-courses` or `web-learn` already constructs a `LessonView` literal in fixtures, the new required field will surface here; fix those fixtures in the next task.)

- [ ] **Step 7: Commit**

```bash
git add libs/shared-data-models/src/lib/lesson-view.ts \
        libs/shared-data-models/src/lib/lesson-view.spec.ts
git commit -m "feat(shared-data-models): add CourseOutline to LessonView for EP-06 Slice D"
```

---

## Task 2: Add `VideoRepository.listVideoStatesForLessons` batch helper

The outline projector needs `videoState` for every lesson in the course. The existing `getVideoByLesson(lid)` is one query per lesson; calling it N times in parallel is fine for MVP course sizes (typical courses have ≤ 50 lessons), but a single-pass helper keeps `LearnService` clean and is easy to swap for a Firestore `in` query later.

**Files:**
- Modify: `libs/api-courses/src/lib/video/video.repository.ts`
- Modify: `libs/api-courses/src/lib/video/video.repository.spec.ts` (extend; if it doesn't exist, create it — check first with `ls libs/api-courses/src/lib/video/`)

- [ ] **Step 1: Confirm whether `video.repository.spec.ts` exists**

Run: `ls libs/api-courses/src/lib/video/video.repository.spec.ts 2>&1`
Expected: either an existing file path or "No such file or directory". If missing, create the spec file with the standard fake-firestore harness (`makeFakeFirestore()` from `libs/api-firebase`).

- [ ] **Step 2: Write the failing test**

Append to (or create) `libs/api-courses/src/lib/video/video.repository.spec.ts`:

```ts
it('listVideoStatesForLessons returns a Map keyed by lessonId with the latest VideoState for each', async () => {
  const fs = makeFakeFirestore();
  await fs.collection('videos').doc('v1').set({
    id: 'v1', lessonId: 'l1', state: 'READY',
  });
  await fs.collection('videos').doc('v2').set({
    id: 'v2', lessonId: 'l2', state: 'PROCESSING',
  });
  // l3 has no video at all
  const repo = new VideoRepository(fs as unknown as FirebaseFirestore.Firestore);

  const states = await repo.listVideoStatesForLessons([
    'l1' as LessonId,
    'l2' as LessonId,
    'l3' as LessonId,
  ]);

  expect(states.get('l1' as LessonId)).toBe('READY');
  expect(states.get('l2' as LessonId)).toBe('PROCESSING');
  expect(states.get('l3' as LessonId) ?? null).toBeNull();
});

it('listVideoStatesForLessons returns an empty Map for an empty input', async () => {
  const fs = makeFakeFirestore();
  const repo = new VideoRepository(fs as unknown as FirebaseFirestore.Firestore);
  const states = await repo.listVideoStatesForLessons([]);
  expect(states.size).toBe(0);
});
```

(If the existing spec has different import / harness helpers, mirror them — the fake-firestore import is `import { makeFakeFirestore } from '@learnwren/api-firebase/testing'` or similar; check a neighbouring spec like `libs/api-courses/src/lib/enrollment/enrollment.repository.spec.ts` for the exact pattern.)

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm nx test api-courses --testPathPattern=video.repository --skip-nx-cache`
Expected: FAIL with `listVideoStatesForLessons is not a function`.

- [ ] **Step 4: Add the method**

In `libs/api-courses/src/lib/video/video.repository.ts`, add below `getVideoByLesson`:

```ts
async listVideoStatesForLessons(
  lessonIds: LessonId[],
): Promise<Map<LessonId, VideoState>> {
  const out = new Map<LessonId, VideoState>();
  if (lessonIds.length === 0) return out;
  const results = await Promise.all(
    lessonIds.map((lid) => this.getVideoByLesson(lid)),
  );
  results.forEach((video, i) => {
    if (video) out.set(lessonIds[i]!, video.state);
  });
  return out;
}
```

Add `VideoState` to the existing `@learnwren/shared-data-models` import at the top of the file if not already imported.

- [ ] **Step 5: Run the test again to verify it passes**

Run: `pnpm nx test api-courses --testPathPattern=video.repository --skip-nx-cache`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add libs/api-courses/src/lib/video/video.repository.ts \
        libs/api-courses/src/lib/video/video.repository.spec.ts
git commit -m "feat(api-courses): add VideoRepository.listVideoStatesForLessons batch helper"
```

---

## Task 3: Inject `CoursesRepository` into `LearnService` and project the outline inside `getLessonView`

This is the heart of the slice. The projection runs **after** the existing access check (the guard validates `cid → lesson → instructorId vs userId / enrolment`), reads `modules` + per-module `lessons` via `CoursesRepository`, fetches `videoState` per lesson via the new batch helper, and joins `completedAt` from the already-loaded enrolment doc.

**Files:**
- Modify: `libs/api-courses/src/lib/learn/learn.service.ts`
- Modify: `libs/api-courses/src/lib/learn/learn.service.spec.ts`
- Modify: `libs/api-courses/src/lib/courses.module.ts` (if a DI rewire is needed — `CoursesRepository` is already provided in `CoursesModule`, so no change is expected, but verify)

- [ ] **Step 1: Re-read the existing `learn.service.spec.ts` to understand fixtures**

Run: `pnpm nx test api-courses --testPathPattern=learn.service --skip-nx-cache`
Expected: existing tests pass. Read the file to understand the `makeCourse` / `makeLesson` / `makeVideoRepo` / `makeEnrollmentRepo` factories.

- [ ] **Step 2: Write the failing tests**

Append the following block to `libs/api-courses/src/lib/learn/learn.service.spec.ts`. Use the existing `makeCourse` / `makeLesson` factories and add new `makeCoursesRepo` / `makeVideoRepoWithStates` helpers next to them.

```ts
// New factory: minimal CoursesRepository shape needed by the outline projector.
function makeCoursesRepo(args: {
  modules: Array<{ id: string; title: string; order: number }>;
  lessonsByModule: Record<string, Array<{ id: string; title: string; order: number; videoId?: string }>>;
}) {
  return {
    listModulesByCourse: vi.fn().mockResolvedValue(
      args.modules.map((m) => ({
        ...m,
        courseId: CID,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      })),
    ),
    listLessonsByModule: vi.fn().mockImplementation(async (_cid: string, mid: string) =>
      (args.lessonsByModule[mid] ?? []).map((l) => ({
        ...l,
        moduleId: mid,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      })),
    ),
  } as unknown as CoursesRepository;
}

function makeVideoRepoWithStates(args: {
  lessonView?: Video | null;
  outlineStates?: Record<string, 'READY' | 'PROCESSING' | 'UPLOADING' | 'FAILED' | null>;
}) {
  const outline = new Map<LessonId, 'READY' | 'PROCESSING' | 'UPLOADING' | 'FAILED'>();
  for (const [lid, st] of Object.entries(args.outlineStates ?? {})) {
    if (st !== null) outline.set(lid as LessonId, st);
  }
  return {
    getVideo: vi.fn().mockResolvedValue(args.lessonView ?? null),
    listVideoStatesForLessons: vi.fn().mockResolvedValue(outline),
  } as unknown as VideoRepository;
}

describe('LearnService.getLessonView outline (Slice D)', () => {
  const course = makeCourse({ status: 'PUBLISHED' });
  const lesson = makeLesson({ id: 'l1' as LessonId, moduleId: 'm1' as ModuleId });

  it('projects modules and lessons in persisted order', async () => {
    const courses = makeCoursesRepo({
      modules: [
        { id: 'm2', title: 'M2', order: 1 },
        { id: 'm1', title: 'M1', order: 0 },
      ],
      lessonsByModule: {
        m1: [
          { id: 'l1', title: 'L1', order: 0, videoId: 'v1' },
          { id: 'l2', title: 'L2', order: 1, videoId: 'v2' },
        ],
        m2: [{ id: 'l3', title: 'L3', order: 0 }],
      },
    });
    const videos = makeVideoRepoWithStates({
      lessonView: { id: 'v1' as VideoId, state: 'READY' } as Video,
      outlineStates: { l1: 'READY', l2: 'PROCESSING', l3: null },
    });
    const enrollment = makeEnrollmentRepo({ getEnrollment: null });
    const svc = new LearnService(videos, enrollment, courses);

    const view = await svc.getLessonView(STUDENT_ID, course, lesson);

    // listModulesByCourse is expected to return modules already ordered by `order`;
    // the projector preserves that order.
    expect(view.outline.modules.map((m) => m.id)).toEqual(['m2', 'm1']);
    expect(view.outline.modules[1]!.lessons.map((l) => l.id)).toEqual(['l1', 'l2']);
    expect(view.outline.modules[1]!.lessons[0]!.videoState).toBe('READY');
    expect(view.outline.modules[1]!.lessons[1]!.videoState).toBe('PROCESSING');
    expect(view.outline.modules[0]!.lessons[0]!.videoState).toBeNull();
  });

  it('joins completedAt from the caller enrolment by lessonId', async () => {
    const courses = makeCoursesRepo({
      modules: [{ id: 'm1', title: 'M1', order: 0 }],
      lessonsByModule: {
        m1: [
          { id: 'l1', title: 'L1', order: 0, videoId: 'v1' },
          { id: 'l2', title: 'L2', order: 1, videoId: 'v2' },
          { id: 'l3', title: 'L3', order: 2, videoId: 'v3' },
        ],
      },
    });
    const videos = makeVideoRepoWithStates({
      lessonView: { id: 'v1' as VideoId, state: 'READY' } as Video,
      outlineStates: { l1: 'READY', l2: 'READY', l3: 'READY' },
    });
    const enrollment = makeEnrollmentRepo({
      getEnrollment: {
        id: `${STUDENT_ID}__${CID}`,
        userId: STUDENT_ID,
        courseId: CID,
        status: 'ACTIVE',
        progress: [
          { lessonId: 'l1' as LessonId, completedAt: '2026-05-01T00:00:00Z', lastWatchedSeconds: 0 },
          { lessonId: 'l2' as LessonId, completedAt: null, lastWatchedSeconds: 12 },
        ],
        withdrawnAt: null,
      },
    });
    const svc = new LearnService(videos, enrollment, courses);

    const view = await svc.getLessonView(STUDENT_ID, course, lesson);
    const lessons = view.outline.modules[0]!.lessons;
    expect(lessons[0]!.completedAt).toBe('2026-05-01T00:00:00Z');
    expect(lessons[1]!.completedAt).toBeNull();
    expect(lessons[2]!.completedAt).toBeNull();
  });

  it('returns every completedAt as null for the course owner', async () => {
    const owner = course.instructorId; // owner is the caller
    const courses = makeCoursesRepo({
      modules: [{ id: 'm1', title: 'M1', order: 0 }],
      lessonsByModule: {
        m1: [{ id: 'l1', title: 'L1', order: 0, videoId: 'v1' }],
      },
    });
    const videos = makeVideoRepoWithStates({
      lessonView: { id: 'v1' as VideoId, state: 'READY' } as Video,
      outlineStates: { l1: 'READY' },
    });
    const enrollment = makeEnrollmentRepo({ getEnrollment: null });
    const svc = new LearnService(videos, enrollment, courses);

    const view = await svc.getLessonView(owner, course, lesson);
    expect(view.progress).toBeNull();
    expect(view.outline.modules[0]!.lessons[0]!.completedAt).toBeNull();
  });

  it('ignores orphan LessonProgress rows whose lesson no longer exists', async () => {
    const courses = makeCoursesRepo({
      modules: [{ id: 'm1', title: 'M1', order: 0 }],
      lessonsByModule: {
        m1: [{ id: 'l1', title: 'L1', order: 0, videoId: 'v1' }],
      },
    });
    const videos = makeVideoRepoWithStates({
      lessonView: { id: 'v1' as VideoId, state: 'READY' } as Video,
      outlineStates: { l1: 'READY' },
    });
    const enrollment = makeEnrollmentRepo({
      getEnrollment: {
        id: `${STUDENT_ID}__${CID}`,
        userId: STUDENT_ID,
        courseId: CID,
        status: 'ACTIVE',
        progress: [
          { lessonId: 'l1' as LessonId, completedAt: '2026-05-01T00:00:00Z', lastWatchedSeconds: 0 },
          { lessonId: 'l-deleted' as LessonId, completedAt: '2026-05-02T00:00:00Z', lastWatchedSeconds: 99 },
        ],
        withdrawnAt: null,
      },
    });
    const svc = new LearnService(videos, enrollment, courses);

    const view = await svc.getLessonView(STUDENT_ID, course, lesson);
    expect(view.outline.modules[0]!.lessons).toHaveLength(1);
    expect(view.outline.modules[0]!.lessons[0]!.completedAt).toBe('2026-05-01T00:00:00Z');
  });

  it('renders videoState: null when a lesson has no videoId', async () => {
    const courses = makeCoursesRepo({
      modules: [{ id: 'm1', title: 'M1', order: 0 }],
      lessonsByModule: {
        m1: [{ id: 'l1', title: 'L1', order: 0 /* no videoId */ }],
      },
    });
    const videos = makeVideoRepoWithStates({
      lessonView: null,
      outlineStates: { l1: null },
    });
    const enrollment = makeEnrollmentRepo({ getEnrollment: null });
    const svc = new LearnService(videos, enrollment, courses);

    const view = await svc.getLessonView(STUDENT_ID, course, lesson);
    expect(view.outline.modules[0]!.lessons[0]!.videoState).toBeNull();
  });
});
```

You will need to add `CoursesRepository` to the top-of-file `import type` statement and `Video` if not already present.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm nx test api-courses --testPathPattern=learn.service --skip-nx-cache`
Expected: FAIL — `LearnService` does not accept a third constructor argument, and `view.outline` is undefined.

- [ ] **Step 4: Update `LearnService` to inject `CoursesRepository` and project the outline**

In `libs/api-courses/src/lib/learn/learn.service.ts`:

1. Add imports:

   ```ts
   import type {
     Course,
     CourseOutline,
     ISODateString,
     Lesson,
     LessonId,
     LessonView,
     Module,
     ModuleId,
     UserId,
     VideoState,
   } from '@learnwren/shared-data-models';

   import { CoursesRepository } from '../courses.repository';
   ```

2. Add `private readonly courses: CoursesRepository` to the constructor as the third parameter.

3. Replace the existing `getLessonView` body so the outline is built after the existing access check. The simplest implementation is to extract a helper, **but keep the existing `touchLastAccessed` semantics unchanged**:

   ```ts
   async getLessonView(userId: UserId, course: Course, lesson: Lesson): Promise<LessonView> {
     let videoState: LessonView['lesson']['videoState'] = null;
     if (lesson.videoId) {
       const video = await this.videos.getVideo(lesson.videoId);
       videoState = video?.state ?? null;
     }

     const progress = await this.resolveProgress(userId, course, lesson);

     if (progress !== null) {
       try {
         await this.enrollment.touchLastAccessed(
           userId,
           course.id,
           lesson.id,
           new Date().toISOString() as ISODateString,
         );
       } catch (err) {
         this.logger.warn(
           `touchLastAccessed failed for user=${userId} course=${course.id} lesson=${lesson.id}: ${err instanceof Error ? err.message : String(err)}`,
         );
       }
     }

     const outline = await this.projectOutline(userId, course);

     return {
       course: { id: course.id, title: course.title, status: course.status },
       lesson: {
         id: lesson.id,
         moduleId: lesson.moduleId,
         title: lesson.title,
         description: lesson.description,
         videoId: lesson.videoId ?? null,
         videoState,
       },
       progress,
       outline,
     };
   }

   private async projectOutline(userId: UserId, course: Course): Promise<CourseOutline> {
     const modules = await this.courses.listModulesByCourse(course.id);
     const lessonsByModule = await Promise.all(
       modules.map((m) => this.courses.listLessonsByModule(course.id, m.id)),
     );
     const allLessonIds: LessonId[] = lessonsByModule.flat().map((l) => l.id);
     const stateByLesson = await this.videos.listVideoStatesForLessons(allLessonIds);

     const progressByLesson = new Map<LessonId, ISODateString | null>();
     if (course.instructorId !== userId) {
       const enrolment = await this.enrollment.getEnrollment(userId, course.id);
       for (const row of enrolment?.progress ?? []) {
         progressByLesson.set(row.lessonId, row.completedAt ?? null);
       }
     }

     return {
       modules: modules.map((m, i) => ({
         id: m.id,
         title: m.title,
         lessons: (lessonsByModule[i] ?? []).map((l) => ({
           id: l.id,
           title: l.title,
           videoState: (stateByLesson.get(l.id) ?? null) as VideoState | null,
           completedAt: progressByLesson.get(l.id) ?? null,
         })),
       })),
     };
   }
   ```

   Notes for the implementer:
   - `Module` / `ModuleId` imports may be unused once the body is written; remove unused imports to keep lint green.
   - `projectOutline` calls `getEnrollment` a second time for enrolled students. That's the price of "no shared loader between the two code paths"; if you'd rather thread the enrolment doc through, lift the existing `resolveProgress` read into a single fetch and pass it to `projectOutline`. Either is fine — pick whichever keeps the diff small. If you choose the unified-loader version, update the four new tests' `getEnrollment` mock to expect a single call.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm nx test api-courses --testPathPattern=learn.service --skip-nx-cache`
Expected: PASS (all existing tests + the five new tests).

- [ ] **Step 6: Run the full `api-courses` test suite to catch breakage in sibling fixtures**

Run: `pnpm nx test api-courses --skip-nx-cache`
Expected: PASS. If `learn.controller.spec.ts` fails because it builds a `LessonView` literal without `outline`, add an `outline: { modules: [] }` to every such literal.

- [ ] **Step 7: Commit**

```bash
git add libs/api-courses/src/lib/learn/learn.service.ts \
        libs/api-courses/src/lib/learn/learn.service.spec.ts \
        libs/api-courses/src/lib/learn/learn.controller.spec.ts \
        libs/api-courses/src/lib/learn/learn.exception-filter.spec.ts
git commit -m "feat(api-courses): project outline into LessonView for EP-06 Slice D"
```

(Only stage the controller / filter spec files if you actually edited them in Step 6.)

---

## Task 4: Extend the api-e2e learn spec with an outline assertion

**Files:**
- Modify: `apps/api-e2e/src/learn/*.spec.ts` (the file the existing slice-A/B/C tests live in — confirm with `ls apps/api-e2e/src/learn/`)

- [ ] **Step 1: Identify the existing learn e2e spec**

Run: `ls apps/api-e2e/src/learn/`
Expected: at least one `.spec.ts`. Read the closest sibling (e.g. `learn.spec.ts` or `mark-complete.spec.ts`) to understand the fixture setup helpers.

- [ ] **Step 2: Write the failing e2e test**

Append a new `it` block to the most appropriate existing spec (do not create a new file). The block enrols a student, marks lesson A complete, then GETs lesson B and asserts the outline reflects the completion:

```ts
it('includes the course outline with completedAt joined from the caller enrolment', async () => {
  // Reuse the seeded course from the file's `beforeAll` — assumes lessons A and B
  // exist in the same module. If the file's fixture has a different topology,
  // adapt the IDs but keep the assertion shape.
  await markLessonComplete(studentSession, courseId, lessonAId);

  const view = await getLessonView(studentSession, courseId, lessonBId);

  expect(view.outline).toBeDefined();
  const rows = view.outline.modules.flatMap((m: { lessons: Array<{ id: string; completedAt: string | null }> }) => m.lessons);
  const rowA = rows.find((r) => r.id === lessonAId);
  const rowB = rows.find((r) => r.id === lessonBId);
  expect(rowA?.completedAt).toMatch(/2026|2027/);
  expect(rowB?.completedAt).toBeNull();
});
```

The helpers `markLessonComplete` and `getLessonView` exist in the prior slices' specs — reuse them; if they don't, copy them from the closest existing test file.

- [ ] **Step 3: Run the e2e suite**

Run: `pnpm nx e2e api-e2e --skip-nx-cache --testPathPattern=learn`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/api-e2e/src/learn/
git commit -m "test(api-e2e): assert outline.completedAt reflects mark-complete in EP-06 Slice D"
```

---

## Task 5: Scaffold `CourseOutlinePanelComponent` (sidebar mode, rows only)

This task gets the rendered rows right (modules, lessons, glyphs, ARIA, click handler) without touching the drawer/toggle. The next task adds drawer mode.

**Files:**
- Create: `libs/web-learn/src/lib/course-outline-panel/course-outline-panel.component.ts`
- Create: `libs/web-learn/src/lib/course-outline-panel/course-outline-panel.component.html`
- Create: `libs/web-learn/src/lib/course-outline-panel/course-outline-panel.component.spec.ts`

- [ ] **Step 1: Write the failing component tests**

Create `libs/web-learn/src/lib/course-outline-panel/course-outline-panel.component.spec.ts`:

```ts
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';

import type { CourseId, CourseOutline, LessonId, ModuleId } from '@learnwren/shared-data-models';

import { CourseOutlinePanelComponent } from './course-outline-panel.component';

const CID = 'c1' as CourseId;
const MID = 'm1' as ModuleId;

function outline(): CourseOutline {
  return {
    modules: [
      {
        id: MID,
        title: 'M1',
        lessons: [
          { id: 'l1' as LessonId, title: 'L1', videoState: 'READY', completedAt: '2026-05-01T00:00:00Z' },
          { id: 'l2' as LessonId, title: 'L2', videoState: 'READY', completedAt: null },
          { id: 'l3' as LessonId, title: 'L3', videoState: 'PROCESSING', completedAt: null },
        ],
      },
    ],
  };
}

function build(): ComponentFixture<CourseOutlinePanelComponent> {
  TestBed.configureTestingModule({ imports: [CourseOutlinePanelComponent] });
  const fixture = TestBed.createComponent(CourseOutlinePanelComponent);
  fixture.componentRef.setInput('outline', outline());
  fixture.componentRef.setInput('activeLessonId', 'l2' as LessonId);
  fixture.componentRef.setInput('courseId', CID);
  fixture.componentRef.setInput('mode', 'sidebar');
  fixture.componentRef.setInput('outlineOpen', true);
  fixture.detectChanges();
  return fixture;
}

describe('CourseOutlinePanelComponent', () => {
  it('renders module headings and lesson rows in input order', () => {
    const fixture = build();
    const rows = fixture.nativeElement.querySelectorAll('button[data-testid="outline-row"]');
    expect(rows).toHaveLength(3);
    expect(rows[0].textContent).toContain('L1');
    expect(rows[1].textContent).toContain('L2');
    expect(rows[2].textContent).toContain('L3');
  });

  it('marks the active row with aria-current="page"', () => {
    const fixture = build();
    const active = fixture.nativeElement.querySelector('button[aria-current="page"]');
    expect(active?.textContent).toContain('L2');
  });

  it('renders a Completed glyph only on rows whose completedAt is non-null', () => {
    const fixture = build();
    const completed = fixture.nativeElement.querySelectorAll('[aria-label="Completed"]');
    expect(completed).toHaveLength(1);
    const row = completed[0].closest('button[data-testid="outline-row"]');
    expect(row?.textContent).toContain('L1');
  });

  it('marks non-READY rows aria-disabled and shows a processing suffix', () => {
    const fixture = build();
    const rows = fixture.nativeElement.querySelectorAll('button[data-testid="outline-row"]');
    expect(rows[2].getAttribute('aria-disabled')).toBe('true');
    expect(rows[2].textContent).toContain('(processing)');
  });

  it('emits lessonSelected when a READY non-active row is clicked', () => {
    const fixture = build();
    const emissions: LessonId[] = [];
    fixture.componentInstance.lessonSelected.subscribe((id) => emissions.push(id));
    const rows = fixture.nativeElement.querySelectorAll('button[data-testid="outline-row"]');
    rows[0].click(); // L1
    expect(emissions).toEqual(['l1']);
  });

  it('does not emit when the active row is clicked', () => {
    const fixture = build();
    const emissions: LessonId[] = [];
    fixture.componentInstance.lessonSelected.subscribe((id) => emissions.push(id));
    const rows = fixture.nativeElement.querySelectorAll('button[data-testid="outline-row"]');
    rows[1].click(); // active L2
    expect(emissions).toEqual([]);
  });

  it('does not emit when a non-READY row is clicked; surfaces an inline processing notice', () => {
    const fixture = build();
    const emissions: LessonId[] = [];
    fixture.componentInstance.lessonSelected.subscribe((id) => emissions.push(id));
    const rows = fixture.nativeElement.querySelectorAll('button[data-testid="outline-row"]');
    rows[2].click(); // PROCESSING L3
    fixture.detectChanges();
    expect(emissions).toEqual([]);
    const notice = fixture.nativeElement.querySelector('[data-testid="processing-notice"]');
    expect(notice?.textContent).toContain('still being processed');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm nx test web-learn --testPathPattern=course-outline-panel --skip-nx-cache`
Expected: FAIL — component doesn't exist.

- [ ] **Step 3: Create the component**

`libs/web-learn/src/lib/course-outline-panel/course-outline-panel.component.ts`:

```ts
import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, signal } from '@angular/core';

import type { CourseId, CourseOutline, LessonId } from '@learnwren/shared-data-models';

export type CourseOutlinePanelMode = 'sidebar' | 'drawer';

@Component({
  selector: 'lib-course-outline-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './course-outline-panel.component.html',
})
export class CourseOutlinePanelComponent {
  @Input({ required: true }) outline!: CourseOutline;
  @Input({ required: true }) activeLessonId!: LessonId;
  @Input({ required: true }) courseId!: CourseId;
  @Input({ required: true }) mode!: CourseOutlinePanelMode;
  @Input() outlineOpen = true;

  @Output() readonly lessonSelected = new EventEmitter<LessonId>();
  @Output() readonly outlineOpenChange = new EventEmitter<boolean>();

  readonly processingNoticeFor = signal<LessonId | null>(null);

  onRowClick(lessonId: LessonId, videoState: string | null): void {
    if (lessonId === this.activeLessonId) return;
    if (videoState !== 'READY') {
      this.processingNoticeFor.set(lessonId);
      return;
    }
    this.processingNoticeFor.set(null);
    this.lessonSelected.emit(lessonId);
  }
}
```

`libs/web-learn/src/lib/course-outline-panel/course-outline-panel.component.html`:

```html
<aside aria-label="Course outline" class="course-outline" [class.is-drawer]="mode === 'drawer'">
  @for (m of outline.modules; track m.id) {
    <section>
      <h3>{{ m.title }}</h3>
      <ol>
        @for (l of m.lessons; track l.id) {
          <li>
            <button
              type="button"
              data-testid="outline-row"
              [attr.aria-current]="l.id === activeLessonId ? 'page' : null"
              [attr.aria-disabled]="l.videoState !== 'READY' ? 'true' : null"
              [class.is-active]="l.id === activeLessonId"
              [class.is-processing]="l.videoState !== 'READY'"
              (click)="onRowClick(l.id, l.videoState)"
            >
              @if (l.completedAt) {
                <span aria-label="Completed">&#10003;</span>
              }
              <span>{{ l.title }}</span>
              @if (l.videoState !== 'READY') {
                <span> (processing)</span>
              }
            </button>
            @if (processingNoticeFor() === l.id) {
              <p data-testid="processing-notice">This lesson's video is still being processed.</p>
            }
          </li>
        }
      </ol>
    </section>
  }
</aside>
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm nx test web-learn --testPathPattern=course-outline-panel --skip-nx-cache`
Expected: all seven tests PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/web-learn/src/lib/course-outline-panel/
git commit -m "feat(web-learn): add CourseOutlinePanelComponent (sidebar rows)"
```

---

## Task 6: Add drawer mode (overlay + backdrop + Escape + focus trap)

**Files:**
- Modify: `libs/web-learn/src/lib/course-outline-panel/course-outline-panel.component.ts`
- Modify: `libs/web-learn/src/lib/course-outline-panel/course-outline-panel.component.html`
- Modify: `libs/web-learn/src/lib/course-outline-panel/course-outline-panel.component.spec.ts`

- [ ] **Step 1: Write the failing drawer tests**

Append to the spec file:

```ts
describe('CourseOutlinePanelComponent (drawer mode)', () => {
  it('emits outlineOpenChange(false) when Escape is pressed in drawer mode', () => {
    TestBed.configureTestingModule({ imports: [CourseOutlinePanelComponent] });
    const fixture = TestBed.createComponent(CourseOutlinePanelComponent);
    fixture.componentRef.setInput('outline', outline());
    fixture.componentRef.setInput('activeLessonId', 'l2' as LessonId);
    fixture.componentRef.setInput('courseId', CID);
    fixture.componentRef.setInput('mode', 'drawer');
    fixture.componentRef.setInput('outlineOpen', true);
    fixture.detectChanges();

    const emissions: boolean[] = [];
    fixture.componentInstance.outlineOpenChange.subscribe((v) => emissions.push(v));

    const event = new KeyboardEvent('keydown', { key: 'Escape' });
    fixture.nativeElement.querySelector('aside').dispatchEvent(event);
    expect(emissions).toEqual([false]);
  });

  it('emits outlineOpenChange(false) after selecting a lesson in drawer mode', () => {
    TestBed.configureTestingModule({ imports: [CourseOutlinePanelComponent] });
    const fixture = TestBed.createComponent(CourseOutlinePanelComponent);
    fixture.componentRef.setInput('outline', outline());
    fixture.componentRef.setInput('activeLessonId', 'l2' as LessonId);
    fixture.componentRef.setInput('courseId', CID);
    fixture.componentRef.setInput('mode', 'drawer');
    fixture.componentRef.setInput('outlineOpen', true);
    fixture.detectChanges();

    const opens: boolean[] = [];
    fixture.componentInstance.outlineOpenChange.subscribe((v) => opens.push(v));
    const selections: LessonId[] = [];
    fixture.componentInstance.lessonSelected.subscribe((id) => selections.push(id));

    fixture.nativeElement.querySelectorAll('button[data-testid="outline-row"]')[0].click();
    expect(selections).toEqual(['l1']);
    expect(opens).toEqual([false]);
  });

  it('emits outlineOpenChange(false) when the backdrop is clicked in drawer mode', () => {
    TestBed.configureTestingModule({ imports: [CourseOutlinePanelComponent] });
    const fixture = TestBed.createComponent(CourseOutlinePanelComponent);
    fixture.componentRef.setInput('outline', outline());
    fixture.componentRef.setInput('activeLessonId', 'l2' as LessonId);
    fixture.componentRef.setInput('courseId', CID);
    fixture.componentRef.setInput('mode', 'drawer');
    fixture.componentRef.setInput('outlineOpen', true);
    fixture.detectChanges();

    const opens: boolean[] = [];
    fixture.componentInstance.outlineOpenChange.subscribe((v) => opens.push(v));

    const backdrop = fixture.nativeElement.querySelector('[data-testid="outline-backdrop"]');
    backdrop.click();
    expect(opens).toEqual([false]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm nx test web-learn --testPathPattern=course-outline-panel --skip-nx-cache`
Expected: the three new tests FAIL.

- [ ] **Step 3: Add drawer behaviour**

Update the component:

```ts
import { ChangeDetectionStrategy, Component, EventEmitter, HostListener, Input, Output, signal } from '@angular/core';
import { A11yModule } from '@angular/cdk/a11y';

// …

@Component({
  selector: 'lib-course-outline-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [A11yModule],
  templateUrl: './course-outline-panel.component.html',
})
export class CourseOutlinePanelComponent {
  // existing inputs/outputs…

  onRowClick(lessonId: LessonId, videoState: string | null): void {
    if (lessonId === this.activeLessonId) return;
    if (videoState !== 'READY') {
      this.processingNoticeFor.set(lessonId);
      return;
    }
    this.processingNoticeFor.set(null);
    this.lessonSelected.emit(lessonId);
    if (this.mode === 'drawer') {
      this.outlineOpenChange.emit(false);
    }
  }

  onBackdropClick(): void {
    if (this.mode === 'drawer') this.outlineOpenChange.emit(false);
  }

  @HostListener('keydown.escape')
  onEscape(): void {
    if (this.mode === 'drawer' && this.outlineOpen) {
      this.outlineOpenChange.emit(false);
    }
  }
}
```

Update the template — wrap the existing `<aside>` and add a backdrop sibling for drawer mode:

```html
@if (mode === 'drawer' && outlineOpen) {
  <div data-testid="outline-backdrop" class="outline-backdrop" (click)="onBackdropClick()"></div>
}
<aside
  aria-label="Course outline"
  class="course-outline"
  [class.is-drawer]="mode === 'drawer'"
  [class.is-open]="outlineOpen"
  [attr.hidden]="mode === 'sidebar' && !outlineOpen ? '' : null"
  [cdkTrapFocus]="mode === 'drawer' && outlineOpen"
  [cdkTrapFocusAutoCapture]="mode === 'drawer' && outlineOpen"
>
  @for (m of outline.modules; track m.id) {
    <!-- existing module/lesson markup -->
  }
</aside>
```

Apply Tailwind classes for layout in a follow-up styling pass; the assertions above are structural only, so styling can be tuned without breaking tests.

- [ ] **Step 4: Run all panel tests to verify they pass**

Run: `pnpm nx test web-learn --testPathPattern=course-outline-panel --skip-nx-cache`
Expected: all ten tests PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/web-learn/src/lib/course-outline-panel/
git commit -m "feat(web-learn): add drawer mode + Escape/backdrop dismissal to outline panel"
```

---

## Task 7: Wire the outline panel into `LessonPlayerPageComponent`

**Files:**
- Modify: `libs/web-learn/src/lib/lesson-player-page/lesson-player-page.component.ts`
- Modify: `libs/web-learn/src/lib/lesson-player-page/lesson-player-page.component.html`
- Modify: `libs/web-learn/src/lib/lesson-player-page/lesson-player-page.component.spec.ts`

- [ ] **Step 1: Write the failing parent-integration tests**

Append to `lesson-player-page.component.spec.ts`:

```ts
describe('LessonPlayerPageComponent outline integration (Slice D)', () => {
  it('passes outline through to CourseOutlinePanelComponent on load', async () => {
    // Use the file's existing harness — typically a TestBed with HttpClientTesting,
    // a mocked LearnService, and a routed lesson player.
    const view = buildLessonView({
      outline: {
        modules: [
          {
            id: 'm1',
            title: 'M1',
            lessons: [
              { id: 'l1', title: 'L1', videoState: 'READY', completedAt: '2026-05-01T00:00:00Z' },
              { id: 'l2', title: 'L2', videoState: 'READY', completedAt: null },
            ],
          },
        ],
      },
    });
    const { fixture } = await renderPageWith(view);

    const panel = fixture.nativeElement.querySelector('lib-course-outline-panel');
    expect(panel).toBeTruthy();
    const rows = panel.querySelectorAll('button[data-testid="outline-row"]');
    expect(rows).toHaveLength(2);
  });

  it('toggles outlineOpen when the header button is clicked', async () => {
    const { fixture, componentInstance } = await renderPageWith(buildLessonView());
    const before = componentInstance.outlineOpen();
    fixture.nativeElement.querySelector('[data-testid="outline-toggle"]').click();
    fixture.detectChanges();
    expect(componentInstance.outlineOpen()).toBe(!before);
  });

  it('flushes the saver, then navigates, when lessonSelected fires', async () => {
    const router = TestBed.inject(Router);
    const navSpy = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    const { componentInstance } = await renderPageWith(buildLessonView());
    const flushSpy = vi.fn().mockResolvedValue(undefined);
    componentInstance['saver'] = { flush: flushSpy, stop: () => undefined } as never;

    await componentInstance.onLessonSelected('lnext' as LessonId);

    expect(flushSpy).toHaveBeenCalledTimes(1);
    expect(navSpy).toHaveBeenCalledWith('/learn/' + componentInstance.courseId + '/lnext');
    // Order: flush before navigate.
    expect(flushSpy.mock.invocationCallOrder[0]).toBeLessThan(navSpy.mock.invocationCallOrder[0]);
  });

  it('still navigates if the flush rejects, and logs a warning', async () => {
    const router = TestBed.inject(Router);
    const navSpy = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { componentInstance } = await renderPageWith(buildLessonView());
    componentInstance['saver'] = {
      flush: vi.fn().mockRejectedValue(new Error('network')),
      stop: () => undefined,
    } as never;

    await componentInstance.onLessonSelected('lnext' as LessonId);

    expect(navSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalled();
  });
});
```

The helpers `buildLessonView` and `renderPageWith` exist in the file's setup (or in a sibling test-utils file) — match the surrounding pattern; if the file uses inline `TestBed.createComponent`, adapt accordingly. The point of the assertions is unchanged: ordering of flush-then-nav, and graceful failure.

If the file's existing fixtures construct `LessonView` literals, **add `outline: { modules: [] }` to each**.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm nx test web-learn --testPathPattern=lesson-player-page --skip-nx-cache`
Expected: FAIL — `onLessonSelected` does not exist, `outlineOpen` signal does not exist, no `<lib-course-outline-panel>` in the template.

- [ ] **Step 3: Update the page component class**

In `lesson-player-page.component.ts`:

1. Add imports:

   ```ts
   import { Router } from '@angular/router';
   import { CourseOutlinePanelComponent } from '../course-outline-panel/course-outline-panel.component';
   import type { CourseOutline, LessonId } from '@learnwren/shared-data-models';
   ```

2. Add `Router` to the existing inject block:

   ```ts
   private readonly router = inject(Router);
   ```

3. Add to `imports: […]` in the decorator: `CourseOutlinePanelComponent`.

4. Add the new state and computed:

   ```ts
   readonly outline = computed<CourseOutline | null>(() => this.view()?.outline ?? null);
   readonly outlineOpen = signal<boolean>(
     typeof window !== 'undefined'
       ? window.matchMedia('(min-width: 1024px)').matches
       : true,
   );
   readonly outlineMode = computed<'sidebar' | 'drawer'>(() =>
     typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches
       ? 'sidebar'
       : 'drawer',
   );

   toggleOutline(): void {
     this.outlineOpen.update((v) => !v);
   }

   async onLessonSelected(nextLessonId: LessonId): Promise<void> {
     try {
       await this.saver?.flush();
     } catch (err) {
       console.warn('[learn] flushPosition rejected during outline nav', err);
     }
     await this.router.navigateByUrl(`/learn/${this.courseId}/${nextLessonId}`);
   }
   ```

   Note: `this.saver` is currently `private`. Either widen its access or move the flush call inside a small public method on `LessonPlayerPageComponent` and have `onLessonSelected` call that. Pick whichever the surrounding code prefers. The tests above reference `componentInstance['saver']` via bracket access to bypass the `private` modifier.

- [ ] **Step 4: Update the template**

In `lesson-player-page.component.html`, in the page header (locate the existing breadcrumb / title region), add:

```html
<button
  type="button"
  data-testid="outline-toggle"
  [attr.aria-expanded]="outlineOpen()"
  aria-controls="course-outline-panel"
  (click)="toggleOutline()"
>
  Course outline
</button>
```

Then, in the main content region, wrap the existing player container in a two-column grid and render the panel as a sibling:

```html
<div class="lg:grid lg:grid-cols-[20rem_1fr]">
  @if (outline(); as o) {
    <lib-course-outline-panel
      id="course-outline-panel"
      [outline]="o"
      [activeLessonId]="lessonId"
      [courseId]="courseId"
      [mode]="outlineMode()"
      [outlineOpen]="outlineOpen()"
      (outlineOpenChange)="outlineOpen.set($event)"
      (lessonSelected)="onLessonSelected($event)"
    />
  }
  <div>
    <!-- existing player + metadata + Mark Complete markup, unchanged -->
  </div>
</div>
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm nx test web-learn --testPathPattern=lesson-player-page --skip-nx-cache`
Expected: PASS.

- [ ] **Step 6: Run the full `web-learn` test suite**

Run: `pnpm nx test web-learn --skip-nx-cache`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add libs/web-learn/src/lib/lesson-player-page/
git commit -m "feat(web-learn): wire CourseOutlinePanelComponent into LessonPlayerPageComponent"
```

---

## Task 8: Extend the web-e2e learn spec

**Files:**
- Modify: `apps/web-e2e/src/learn/*.spec.ts` (the file the existing student-playback e2e lives in — confirm with `ls apps/web-e2e/src/learn/`)

- [ ] **Step 1: Identify the existing learn web-e2e spec**

Run: `ls apps/web-e2e/src/learn/`
Expected: at least one `.spec.ts` from Slice A/B/C.

- [ ] **Step 2: Add the outline-navigation scenario**

Append a new `test` block to the most appropriate existing spec:

```ts
test('clicking a different lesson in the outline navigates and preserves checkmarks', async ({ page }) => {
  // Reuse the existing helper that lands an enrolled student on lesson A.
  await openLessonAsStudent(page, courseId, lessonAId);

  await page.getByRole('button', { name: /mark complete/i }).click();
  await expect(page.getByRole('button', { name: /completed/i })).toBeVisible();

  // Click lesson B in the outline (desktop viewport — default Playwright viewport
  // is ≥1024 px so the sidebar is rendered).
  await page.locator('lib-course-outline-panel').getByRole('button', { name: /L2/ }).click();

  await expect(page).toHaveURL(new RegExp(`/learn/${courseId}/${lessonBId}$`));

  // Outline still shows the checkmark on lesson A.
  await expect(
    page
      .locator('lib-course-outline-panel button')
      .filter({ hasText: 'L1' })
      .locator('[aria-label="Completed"]'),
  ).toBeVisible();
});
```

Adapt fixture IDs and helper names to whatever the surrounding spec uses.

- [ ] **Step 3: Run the web-e2e suite**

Run: `pnpm nx e2e web-e2e --skip-nx-cache --testPathPattern=learn`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web-e2e/src/learn/
git commit -m "test(web-e2e): outline navigation preserves completion checkmarks"
```

---

## Task 9: Update `README.md` and `docs/USER_GUIDE.md`

**Files:**
- Modify: `README.md` — extend the EP-06 bullet list with a Slice D line.
- Modify: `docs/USER_GUIDE.md` — add a short "Course outline" subsection under the lesson playback section.

- [ ] **Step 1: Update `README.md`**

Locate the EP-06 section (it lists Slice A / B / C). Add:

```
- Slice D — Course Outline Panel (UC-06-04): the lesson player renders a collapsible left sidebar (desktop) or drawer (mobile) listing every module and lesson; the active lesson is highlighted; completed lessons carry a checkmark; non-`READY` lessons surface an inline notice. Clicking a different lesson flushes any in-flight playback position and navigates.
```

Match the prose style of the surrounding bullets.

- [ ] **Step 2: Update `docs/USER_GUIDE.md`**

Add a "Course outline" subsection under the lesson playback section that explains:
- the outline lists every module + lesson in the course;
- the active row is highlighted;
- completed lessons display a `✓`;
- lessons whose video is still processing render dimmed with a `(processing)` suffix and cannot be clicked;
- a "Course outline" toggle button shows/hides the panel;
- on mobile the panel appears as a drawer that closes on backdrop click, `Escape`, or after a selection.

- [ ] **Step 3: Commit**

```bash
git add README.md docs/USER_GUIDE.md
git commit -m "docs: document EP-06 Slice D course outline in README and USER_GUIDE"
```

---

## Task 10: Run all quality gates and finalise

- [ ] **Step 1: Run lint across the workspace**

Run: `pnpm nx run-many -t lint --skip-nx-cache`
Expected: PASS.

- [ ] **Step 2: Run typecheck across the workspace**

Run: `pnpm nx run-many -t typecheck --skip-nx-cache`
Expected: PASS.

- [ ] **Step 3: Run all unit tests**

Run: `pnpm nx run-many -t test --skip-nx-cache`
Expected: PASS. Pay particular attention to any prior `LessonView` fixture in `web-courses`, `web-catalog`, or `api-e2e` that constructs the type literally — those need `outline: { modules: [] }` added.

- [ ] **Step 4: Run the build**

Run: `pnpm nx run-many -t build --skip-nx-cache`
Expected: PASS.

- [ ] **Step 5: Run the e2e suites**

Run: `pnpm nx run-many -t e2e --skip-nx-cache`
Expected: PASS (modulo the 14 quarantined api-e2e video fixmes — those remain quarantined per `2026-05-23-fake-source-probe-seam-design.md`).

- [ ] **Step 6: Manual smoke**

Run `pnpm emulators` + `pnpm start`, sign in as a seeded student, enrol in a seeded course, open a lesson, mark another lesson complete, click around in the outline, verify:
- desktop sidebar renders at `≥1024 px`;
- toggle button hides and re-shows it;
- mobile viewport (`< 1024 px`) renders the drawer; backdrop click and Escape close it;
- non-`READY` rows surface the inline notice and do not navigate;
- clicking a different `READY` lesson navigates and the previous lesson's checkmark survives the page transition.

- [ ] **Step 7: Final commit + branch handoff**

If any housekeeping changes accumulated (e.g. fixture updates) and are not already committed:

```bash
git status
# stage by name, never -A; the symlinked node_modules would otherwise be added
git add <paths>
git commit -m "chore: tighten LessonView fixtures for outline field"
```

Then follow the project convention for landing the branch: local `--no-ff` merge into `main` (per the memory `Branch isolation preference`).

---

## Notes & deferred items (do not implement in this slice)

The following remain explicitly deferred (per the spec's "Non-Goals" / "Out-of-scope follow-ups"):

- Module-level completion rollups (UC-06-02 ext 3a/3b).
- "Course Completed" badge surfaces on profile / course cards.
- My Courses dashboard / cross-course resume list.
- Outline on the public `/catalog/:cid` page.
- "Next lesson" CTA on lesson-complete.
- The 14 quarantined `api-e2e` video fixmes.
- Persisting the collapse state across reloads / devices.
- Hover-preview, drag-reorder, keyboard chord shortcuts, search inside the outline.
- Watch-time aggregates / per-lesson "% watched" rendering in the outline.
- Unmark / reset-progress affordance.

EP-06 closes once this slice merges.
