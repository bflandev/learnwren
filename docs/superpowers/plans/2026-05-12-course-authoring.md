# Course Authoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement EP-02 US-02-01..03 (course, module, lesson authoring) per `docs/superpowers/specs/2026-05-12-course-authoring-design.md`. Publish (US-02-04) and cover image are deferred to later slices.

**Architecture:** Two new Nx libraries — `libs/api-courses` (NestJS REST surface, server-only Firestore writes via Admin SDK) and `libs/web-courses` (Angular feature lib with the course list, create form, and drag-and-drop editor). Firestore is the source of truth, with subcollections `courses/{cid}/modules/{mid}/lessons/{lid}`; rules deny-all from clients. Authorization is layered: existing `FirebaseSessionGuard` → new `InstructorRoleGuard` → new `CourseOwnerGuard`. A dev ops script `tools/promote-to-instructor.ts` mints instructors.

**Tech Stack:** NestJS 11, Angular 21 standalone + signals + CDK DragDrop, Firebase Admin SDK 13, Vitest 4, Playwright (api-e2e + web-e2e), `@firebase/rules-unit-testing` (rules tests), Stryker 9 (mutation), class-validator (DTOs).

**Useful references during execution:**

- Spec: `docs/superpowers/specs/2026-05-12-course-authoring-design.md`
- Prior plan (most recent slice, same patterns): `docs/superpowers/plans/2026-05-06-auth-hardening.md`
- `libs/api-auth/src/lib/auth.service.spec.ts` — canonical NestJS service spec with hand-built `FakeAuth` / `FakeFirestore`.
- `libs/api-auth/src/lib/auth-attempts.repository.ts` — canonical repository pattern (transactions, FIRESTORE injection).
- `libs/api-auth/src/lib/firebase-session.guard.ts` — guard pattern; we reuse this guard and add two new guards alongside it.
- `apps/api-e2e/src/auth.e2e-spec.ts` — Playwright + Admin SDK e2e pattern.
- `apps/api-e2e/src/firestore-rules.e2e-spec.ts` — `@firebase/rules-unit-testing` pattern.
- `libs/web-auth/src/lib/auth.guard.ts` — `CanActivateFn` shape (functional guards).
- `libs/web-auth/src/lib/auth.service.ts` — signal-based state and `HttpClient` usage.
- `apps/web/src/app/app.routes.ts` — where new routes are wired.

**Conventions:**

- Run all nx tasks via `pnpm nx ...` per CLAUDE.md.
- Commits follow `feat(scope)`, `fix(scope)`, `docs(scope)`, `refactor(scope)`, `chore(scope)`. Commit at every step labeled "commit".
- TS path maps live in `tsconfig.base.json` — add the two new libs there during scaffolding.
- API listens on `:3333`; api-e2e Playwright config boots `dist/apps/api/main.js` and waits on `/api/health`.
- Test framework is **Vitest** (not Jest). Specs are `*.spec.ts` next to the file under test.
- The api app's `AppModule` already wires `ValidationPipe` with `{ whitelist: true, forbidNonWhitelisted: true, transform: true }` — DTOs do not need `@Type` decorators for plain primitives.
- Error response shape (existing api-auth convention): `{ error: { code: string, message: string, details?: Record<string, unknown> } }`. Field-level validation errors go in `details.fieldErrors`.
- Branded ID types from `@learnwren/shared-data-models` (`CourseId`, `ModuleId`, `LessonId`, `UserId`) are `string` at runtime; on the wire they serialize as raw strings. Cast at the API boundary.
- Dates on the wire are ISO 8601 strings (`ISODateString` brand). Use `new Date().toISOString() as ISODateString` when constructing.

**Spec coverage map (verify each row before declaring the plan done):**

| Spec section | Covered by |
| :--- | :--- |
| §1 Architecture overview | Tasks 3, 14 (api lib + AppModule wiring), 18, 27 (web lib + app routes) |
| §2.1 Shared data model changes | Task 1 |
| §2.2 Firestore document layout (subcollections) | Task 6 (repository encodes subcollection paths) |
| §2.3 Firestore security rules | Tasks 2 (rules), 15 (rules tests) |
| §3.1 Guards (Session/Role/Owner) | Task 7 (InstructorRoleGuard), Task 8 (CourseOwnerGuard); Session reused from api-auth |
| §3.2 API endpoints | Task 13 (CoursesController) |
| §3.3 DTOs | Task 5 |
| §3.4 Response shapes (hydrated tree) | Task 9 (`getCourseTree`), Task 13 (controller) |
| §3.5 Error contract | Task 4 (codes/exceptions), Task 12 (exception filter) |
| §4.1 Ordering scheme (transactional append, reorder validation) | Task 6 (repo append + batch), Tasks 10 + 11 (service set-comparison) |
| §4.2 Cascade delete | Task 6 (repo `recursiveDelete`), Tasks 9 + 10 (service callers) |
| §4.3 Concurrency (LWW, 409 stale reorder) | Tasks 10, 11 (service), 17 (e2e) |
| §4.4 Validation summary | Task 5 (DTOs) |
| §4.5 Edge cases (zero modules/lessons, no Publish button) | Task 22 (empty list), Task 24 (empty lessons), Task 25 (empty modules), Task 26 (editor renders no Publish button) |
| §5 Frontend structure | Tasks 18–27 |
| §6 Ops tool | Task 29 |
| §7 Testing layers | unit tests inline in Tasks 4, 7, 8, 9, 10, 11, 12, 13, 19, 20, 21, 22, 23, 24, 25, 26; rules tests in Task 15; api-e2e in Tasks 16, 17; web-e2e in Task 28; mutation in Task 30 |
| §8 Acceptance bar (mutation ≥85%, README) | Task 30 (Stryker), Task 31 (README), Final verification |

---

## Task 1: Update `shared-data-models` for course/module/lesson

**Files:**
- Modify: `libs/shared-data-models/src/lib/course.ts`
- Modify: `libs/shared-data-models/src/lib/lesson.ts`
- Modify: `libs/shared-data-models/src/index.ts`
- Test: `libs/shared-data-models/src/lib/course.spec.ts` (new)
- Test: `libs/shared-data-models/src/lib/lesson.spec.ts` (new)

- [ ] **Step 1: Write the failing course type test**

Create `libs/shared-data-models/src/lib/course.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';

import type {
  Course,
  CourseCategory,
  CourseDifficulty,
} from './course';
import { COURSE_CATEGORIES, COURSE_DIFFICULTIES } from './course';

describe('Course types', () => {
  it('exposes the six predefined course categories', () => {
    expect(COURSE_CATEGORIES).toEqual([
      'PROGRAMMING',
      'DESIGN',
      'BUSINESS',
      'MARKETING',
      'PERSONAL_DEVELOPMENT',
      'OTHER',
    ]);
  });

  it('exposes the three difficulty levels', () => {
    expect(COURSE_DIFFICULTIES).toEqual(['BEGINNER', 'INTERMEDIATE', 'ADVANCED']);
  });

  it('allows constructing a Course with only required fields', () => {
    const course: Course = {
      id: 'cid-1' as Course['id'],
      title: 'T',
      description: 'D',
      instructorId: 'uid-1' as Course['instructorId'],
      status: 'DRAFT',
      createdAt: '2026-05-12T00:00:00.000Z' as Course['createdAt'],
      updatedAt: '2026-05-12T00:00:00.000Z' as Course['updatedAt'],
    };
    expect(course.title).toBe('T');
  });

  it('allows constructing a Course with optional fields', () => {
    const course: Course = {
      id: 'cid-1' as Course['id'],
      title: 'T',
      description: 'D',
      longDescription: 'LD',
      category: 'PROGRAMMING' as CourseCategory,
      difficulty: 'BEGINNER' as CourseDifficulty,
      instructorId: 'uid-1' as Course['instructorId'],
      status: 'DRAFT',
      createdAt: '2026-05-12T00:00:00.000Z' as Course['createdAt'],
      updatedAt: '2026-05-12T00:00:00.000Z' as Course['updatedAt'],
    };
    expect(course.category).toBe('PROGRAMMING');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm nx test shared-data-models`
Expected: FAIL — `COURSE_CATEGORIES` and `COURSE_DIFFICULTIES` are not exported.

- [ ] **Step 3: Update `libs/shared-data-models/src/lib/course.ts`**

Replace the file's contents with:

```ts
import type { CourseId, ISODateString, UserId } from './common';

export const COURSE_CATEGORIES = [
  'PROGRAMMING',
  'DESIGN',
  'BUSINESS',
  'MARKETING',
  'PERSONAL_DEVELOPMENT',
  'OTHER',
] as const;
export type CourseCategory = (typeof COURSE_CATEGORIES)[number];

export const COURSE_DIFFICULTIES = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'] as const;
export type CourseDifficulty = (typeof COURSE_DIFFICULTIES)[number];

export type CourseStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

export interface Course {
  id: CourseId;
  title: string;
  description: string;
  longDescription?: string;
  category?: CourseCategory;
  difficulty?: CourseDifficulty;
  instructorId: UserId;
  status: CourseStatus;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}
```

- [ ] **Step 4: Run the course test — should pass**

Run: `pnpm nx test shared-data-models -- --testNamePattern="Course types"`
Expected: PASS for all four `Course types` cases.

- [ ] **Step 5: Write the failing lesson test**

Create `libs/shared-data-models/src/lib/lesson.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';

import type { Lesson } from './lesson';

describe('Lesson type', () => {
  it('allows constructing a Lesson without videoUrl or description', () => {
    const lesson: Lesson = {
      id: 'lid-1' as Lesson['id'],
      moduleId: 'mid-1' as Lesson['moduleId'],
      title: 'Intro',
      order: 0,
      createdAt: '2026-05-12T00:00:00.000Z' as Lesson['createdAt'],
      updatedAt: '2026-05-12T00:00:00.000Z' as Lesson['updatedAt'],
    };
    expect(lesson.title).toBe('Intro');
    expect(lesson.videoUrl).toBeUndefined();
    expect(lesson.description).toBeUndefined();
  });

  it('allows constructing a Lesson with optional description and videoUrl', () => {
    const lesson: Lesson = {
      id: 'lid-1' as Lesson['id'],
      moduleId: 'mid-1' as Lesson['moduleId'],
      title: 'Intro',
      description: 'Welcome',
      videoUrl: 'https://stream.example.com/manifest.m3u8',
      order: 0,
      createdAt: '2026-05-12T00:00:00.000Z' as Lesson['createdAt'],
      updatedAt: '2026-05-12T00:00:00.000Z' as Lesson['updatedAt'],
    };
    expect(lesson.description).toBe('Welcome');
    expect(lesson.videoUrl).toContain('manifest');
  });
});
```

- [ ] **Step 6: Update `libs/shared-data-models/src/lib/lesson.ts`**

Replace the file's contents with:

```ts
import type { ISODateString, LessonId, ModuleId } from './common';

export interface Lesson {
  id: LessonId;
  moduleId: ModuleId;
  title: string;
  description?: string;
  videoUrl?: string;
  order: number;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}
```

- [ ] **Step 7: Re-export from the barrel**

Open `libs/shared-data-models/src/index.ts` and confirm it includes:

```ts
export * from './lib/common';
export * from './lib/user';
export * from './lib/course';
export * from './lib/module';
export * from './lib/lesson';
export * from './lib/enrollment';
```

It already does — no change needed, but verify before moving on.

- [ ] **Step 8: Run the full lib test suite**

Run: `pnpm nx test shared-data-models`
Expected: PASS (all cases, including the new Course and Lesson cases).

- [ ] **Step 9: Typecheck the workspace to catch downstream breakage**

Run: `pnpm typecheck`
Expected: PASS. (If any existing code accessed `Lesson.videoUrl` as non-nullable, you will see a TS error. None should — `videoUrl` was never read in api-auth/web-auth code.)

- [ ] **Step 10: Commit**

```bash
git add libs/shared-data-models/
git commit -m "feat(shared-data-models): add Course optional fields and make Lesson.videoUrl optional"
```

---

## Task 2: Add Firestore rules for the courses tree (deny-all from clients)

**Files:**
- Modify: `firestore.rules`
- Modify: `firestore.emulator.rules`

- [ ] **Step 1: Add the rules block to `firestore.rules`**

Open `firestore.rules`. Find the existing `match /auth_attempts/{emailHash}` block. Immediately after it (still inside `match /databases/{database}/documents`), insert:

```
    match /courses/{courseId} {
      allow read, write: if false;

      match /modules/{moduleId} {
        allow read, write: if false;

        match /lessons/{lessonId} {
          allow read, write: if false;
        }
      }
    }
```

The catch-all deny at the bottom already covers this, but explicit blocks document intent and give the rules tests a clean target.

- [ ] **Step 2: Apply the same block to `firestore.emulator.rules`**

`firestore.emulator.rules` is the rules file the emulator suite uses (`apps/api-e2e/src/firestore-rules.e2e-spec.ts` reads it). Add the identical `match /courses/{courseId}` block in the same position (right after the `auth_attempts` block, before the catch-all deny).

- [ ] **Step 3: Sanity-check both files**

Run: `grep -n "match /courses" firestore.rules firestore.emulator.rules`
Expected: One match line in each file at the same nesting level as `match /auth_attempts`.

- [ ] **Step 4: Commit**

```bash
git add firestore.rules firestore.emulator.rules
git commit -m "feat(rules): deny-all on courses/{cid}/modules/{mid}/lessons/{lid}"
```

---

## Task 3: Generate the `api-courses` lib and wire path map

**Files:**
- Create: `libs/api-courses/**` (via generator)
- Modify: `tsconfig.base.json`
- Modify: `libs/api-courses/src/index.ts`

- [ ] **Step 1: Generate the lib via Nx**

Run:

```bash
pnpm nx g @nx/nest:library --directory=libs/api-courses --name=api-courses --strict --buildable=false --unitTestRunner=vitest --no-interactive
```

Expected output: lib scaffolded under `libs/api-courses/` with `src/lib/api-courses.module.ts`, `src/index.ts`, `project.json`, `vitest.config.mts`, etc.

If the generator created `api-courses.controller.ts` and `api-courses.service.ts` stub files, delete them — we will create properly-named files in later tasks:

```bash
rm -f libs/api-courses/src/lib/api-courses.controller.ts libs/api-courses/src/lib/api-courses.service.ts
rm -f libs/api-courses/src/lib/api-courses.controller.spec.ts libs/api-courses/src/lib/api-courses.service.spec.ts
```

- [ ] **Step 2: Rename the generated module**

The generator names the module `ApiCoursesModule`. Rename to `CoursesModule` to match the spec.

Open `libs/api-courses/src/lib/api-courses.module.ts`, rename:

```ts
import { Module } from '@nestjs/common';

@Module({
  controllers: [],
  providers: [],
  exports: [],
})
export class CoursesModule {}
```

Then rename the file:

```bash
git mv libs/api-courses/src/lib/api-courses.module.ts libs/api-courses/src/lib/courses.module.ts
```

(Or use `mv` if not yet tracked.)

- [ ] **Step 3: Update the barrel**

Replace `libs/api-courses/src/index.ts` with:

```ts
export { CoursesModule } from './lib/courses.module';
```

- [ ] **Step 4: Add the path map entry**

Open `tsconfig.base.json`. In `compilerOptions.paths`, add (alphabetically after `@learnwren/api-firebase`):

```json
      "@learnwren/api-courses": ["./libs/api-courses/src/index.ts"],
```

- [ ] **Step 5: Typecheck and run the lib's empty test suite**

Run: `pnpm nx test api-courses && pnpm typecheck`
Expected: Both PASS. The test suite is empty (no specs yet) which is fine; vitest reports "no test files found" gracefully.

- [ ] **Step 6: Commit**

```bash
git add libs/api-courses tsconfig.base.json
git commit -m "feat(api-courses): scaffold NestJS lib with CoursesModule and path map"
```

---

## Task 4: Error codes and exception classes for api-courses

**Files:**
- Create: `libs/api-courses/src/lib/errors/courses-error.codes.ts`
- Create: `libs/api-courses/src/lib/errors/courses.exception.ts`
- Test: `libs/api-courses/src/lib/errors/courses.exception.spec.ts`

- [ ] **Step 1: Create the error-codes file**

Create `libs/api-courses/src/lib/errors/courses-error.codes.ts`:

```ts
export type CoursesErrorCode =
  | 'VALIDATION_FAILED'
  | 'INSUFFICIENT_ROLE'
  | 'NOT_COURSE_OWNER'
  | 'COURSE_NOT_FOUND'
  | 'MODULE_NOT_FOUND'
  | 'LESSON_NOT_FOUND'
  | 'STALE_REORDER'
  | 'INTERNAL';
```

- [ ] **Step 2: Write the failing exception test**

Create `libs/api-courses/src/lib/errors/courses.exception.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';

import {
  CourseNotFoundException,
  CoursesException,
  InsufficientRoleException,
  LessonNotFoundException,
  ModuleNotFoundException,
  NotCourseOwnerException,
  StaleReorderException,
} from './courses.exception';

describe('CoursesException family', () => {
  it('CoursesException carries code, message, status, and optional details', () => {
    const ex = new CoursesException('VALIDATION_FAILED', 'bad input', 400, { foo: 'bar' });
    expect(ex.code).toBe('VALIDATION_FAILED');
    expect(ex.message).toBe('bad input');
    expect(ex.status).toBe(400);
    expect(ex.details).toEqual({ foo: 'bar' });
  });

  it('InsufficientRoleException is 403 with code INSUFFICIENT_ROLE', () => {
    const ex = new InsufficientRoleException();
    expect(ex.code).toBe('INSUFFICIENT_ROLE');
    expect(ex.status).toBe(403);
  });

  it('NotCourseOwnerException is 403 with code NOT_COURSE_OWNER', () => {
    const ex = new NotCourseOwnerException();
    expect(ex.code).toBe('NOT_COURSE_OWNER');
    expect(ex.status).toBe(403);
  });

  it('CourseNotFoundException is 404 with code COURSE_NOT_FOUND', () => {
    const ex = new CourseNotFoundException();
    expect(ex.code).toBe('COURSE_NOT_FOUND');
    expect(ex.status).toBe(404);
  });

  it('ModuleNotFoundException is 404 with code MODULE_NOT_FOUND', () => {
    const ex = new ModuleNotFoundException();
    expect(ex.code).toBe('MODULE_NOT_FOUND');
    expect(ex.status).toBe(404);
  });

  it('LessonNotFoundException is 404 with code LESSON_NOT_FOUND', () => {
    const ex = new LessonNotFoundException();
    expect(ex.code).toBe('LESSON_NOT_FOUND');
    expect(ex.status).toBe(404);
  });

  it('StaleReorderException is 409 with code STALE_REORDER', () => {
    const ex = new StaleReorderException();
    expect(ex.code).toBe('STALE_REORDER');
    expect(ex.status).toBe(409);
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `pnpm nx test api-courses`
Expected: FAIL — `courses.exception` not found.

- [ ] **Step 4: Implement the exception classes**

Create `libs/api-courses/src/lib/errors/courses.exception.ts`:

```ts
import type { CoursesErrorCode } from './courses-error.codes';

export class CoursesException extends Error {
  constructor(
    public readonly code: CoursesErrorCode,
    message: string,
    public readonly status: number,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'CoursesException';
  }
}

export class InsufficientRoleException extends CoursesException {
  constructor() {
    super('INSUFFICIENT_ROLE', 'Instructor role required.', 403);
  }
}

export class NotCourseOwnerException extends CoursesException {
  constructor() {
    super('NOT_COURSE_OWNER', 'You do not own this course.', 403);
  }
}

export class CourseNotFoundException extends CoursesException {
  constructor() {
    super('COURSE_NOT_FOUND', 'Course not found.', 404);
  }
}

export class ModuleNotFoundException extends CoursesException {
  constructor() {
    super('MODULE_NOT_FOUND', 'Module not found.', 404);
  }
}

export class LessonNotFoundException extends CoursesException {
  constructor() {
    super('LESSON_NOT_FOUND', 'Lesson not found.', 404);
  }
}

export class StaleReorderException extends CoursesException {
  constructor() {
    super(
      'STALE_REORDER',
      'Reorder body does not match current children — refetch and retry.',
      409,
    );
  }
}
```

- [ ] **Step 5: Run tests — should pass**

Run: `pnpm nx test api-courses`
Expected: PASS for all seven cases.

- [ ] **Step 6: Commit**

```bash
git add libs/api-courses/src/lib/errors
git commit -m "feat(api-courses): error codes and exception classes"
```

---

## Task 5: DTOs with class-validator

**Files:**
- Create: `libs/api-courses/src/lib/dto/create-course.dto.ts`
- Create: `libs/api-courses/src/lib/dto/update-course.dto.ts`
- Create: `libs/api-courses/src/lib/dto/create-module.dto.ts`
- Create: `libs/api-courses/src/lib/dto/update-module.dto.ts`
- Create: `libs/api-courses/src/lib/dto/create-lesson.dto.ts`
- Create: `libs/api-courses/src/lib/dto/update-lesson.dto.ts`
- Create: `libs/api-courses/src/lib/dto/reorder.dto.ts`
- Test: `libs/api-courses/src/lib/dto/dto.spec.ts`

- [ ] **Step 1: Write the failing validator test**

Create `libs/api-courses/src/lib/dto/dto.spec.ts`:

```ts
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { CreateCourseDto } from './create-course.dto';
import { CreateLessonDto } from './create-lesson.dto';
import { CreateModuleDto } from './create-module.dto';
import { ReorderDto } from './reorder.dto';
import { UpdateCourseDto } from './update-course.dto';
import { UpdateLessonDto } from './update-lesson.dto';
import { UpdateModuleDto } from './update-module.dto';

async function errorsFor<T extends object>(
  cls: new () => T,
  payload: Record<string, unknown>,
): Promise<string[]> {
  const instance = plainToInstance(cls, payload);
  const errors = await validate(instance);
  return errors.flatMap((e) => Object.keys(e.constraints ?? {}));
}

describe('CreateCourseDto', () => {
  it('accepts the minimal payload (title + description)', async () => {
    const errors = await errorsFor(CreateCourseDto, {
      title: 'Intro to TypeScript',
      description: 'A short intro.',
    });
    expect(errors).toEqual([]);
  });

  it('rejects missing title', async () => {
    const errors = await errorsFor(CreateCourseDto, { description: 'D' });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects title over 100 chars', async () => {
    const errors = await errorsFor(CreateCourseDto, {
      title: 'a'.repeat(101),
      description: 'D',
    });
    expect(errors).toContain('isLength');
  });

  it('rejects description over 500 chars', async () => {
    const errors = await errorsFor(CreateCourseDto, {
      title: 'T',
      description: 'a'.repeat(501),
    });
    expect(errors).toContain('isLength');
  });

  it('rejects unknown category', async () => {
    const errors = await errorsFor(CreateCourseDto, {
      title: 'T',
      description: 'D',
      category: 'NONSENSE',
    });
    expect(errors).toContain('isIn');
  });

  it('rejects unknown difficulty', async () => {
    const errors = await errorsFor(CreateCourseDto, {
      title: 'T',
      description: 'D',
      difficulty: 'EXPERT',
    });
    expect(errors).toContain('isIn');
  });

  it('accepts a fully populated optional set', async () => {
    const errors = await errorsFor(CreateCourseDto, {
      title: 'T',
      description: 'D',
      longDescription: 'LD',
      category: 'PROGRAMMING',
      difficulty: 'BEGINNER',
    });
    expect(errors).toEqual([]);
  });
});

describe('UpdateCourseDto', () => {
  it('accepts an empty body (partial update)', async () => {
    const errors = await errorsFor(UpdateCourseDto, {});
    expect(errors).toEqual([]);
  });

  it('rejects an over-long title', async () => {
    const errors = await errorsFor(UpdateCourseDto, { title: 'a'.repeat(101) });
    expect(errors).toContain('isLength');
  });
});

describe('Module DTOs', () => {
  it('CreateModuleDto rejects missing title', async () => {
    const errors = await errorsFor(CreateModuleDto, {});
    expect(errors.length).toBeGreaterThan(0);
  });

  it('CreateModuleDto rejects empty title', async () => {
    const errors = await errorsFor(CreateModuleDto, { title: '' });
    expect(errors).toContain('isLength');
  });

  it('UpdateModuleDto requires title (used for rename)', async () => {
    const errors = await errorsFor(UpdateModuleDto, {});
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe('Lesson DTOs', () => {
  it('CreateLessonDto accepts title only', async () => {
    const errors = await errorsFor(CreateLessonDto, { title: 'Intro' });
    expect(errors).toEqual([]);
  });

  it('CreateLessonDto rejects description over 2000 chars', async () => {
    const errors = await errorsFor(CreateLessonDto, {
      title: 'T',
      description: 'a'.repeat(2001),
    });
    expect(errors).toContain('maxLength');
  });

  it('UpdateLessonDto accepts an empty body', async () => {
    const errors = await errorsFor(UpdateLessonDto, {});
    expect(errors).toEqual([]);
  });
});

describe('ReorderDto', () => {
  it('accepts a non-empty array of strings', async () => {
    const errors = await errorsFor(ReorderDto, { ids: ['a', 'b', 'c'] });
    expect(errors).toEqual([]);
  });

  it('rejects an empty array', async () => {
    const errors = await errorsFor(ReorderDto, { ids: [] });
    expect(errors).toContain('arrayNotEmpty');
  });

  it('rejects non-string elements', async () => {
    const errors = await errorsFor(ReorderDto, { ids: [1, 2, 3] });
    expect(errors).toContain('isString');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm nx test api-courses`
Expected: FAIL — DTO files do not exist.

- [ ] **Step 3: Create each DTO file**

`libs/api-courses/src/lib/dto/create-course.dto.ts`:

```ts
import { IsIn, IsOptional, IsString, Length, MaxLength } from 'class-validator';

import {
  COURSE_CATEGORIES,
  COURSE_DIFFICULTIES,
  type CourseCategory,
  type CourseDifficulty,
} from '@learnwren/shared-data-models';

export class CreateCourseDto {
  @IsString()
  @Length(1, 100)
  title!: string;

  @IsString()
  @Length(1, 500)
  description!: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  longDescription?: string;

  @IsOptional()
  @IsIn(COURSE_CATEGORIES as readonly string[])
  category?: CourseCategory;

  @IsOptional()
  @IsIn(COURSE_DIFFICULTIES as readonly string[])
  difficulty?: CourseDifficulty;
}
```

`libs/api-courses/src/lib/dto/update-course.dto.ts`:

```ts
import { IsIn, IsOptional, IsString, Length, MaxLength } from 'class-validator';

import {
  COURSE_CATEGORIES,
  COURSE_DIFFICULTIES,
  type CourseCategory,
  type CourseDifficulty,
} from '@learnwren/shared-data-models';

export class UpdateCourseDto {
  @IsOptional()
  @IsString()
  @Length(1, 100)
  title?: string;

  @IsOptional()
  @IsString()
  @Length(1, 500)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  longDescription?: string;

  @IsOptional()
  @IsIn(COURSE_CATEGORIES as readonly string[])
  category?: CourseCategory;

  @IsOptional()
  @IsIn(COURSE_DIFFICULTIES as readonly string[])
  difficulty?: CourseDifficulty;
}
```

`libs/api-courses/src/lib/dto/create-module.dto.ts`:

```ts
import { IsString, Length } from 'class-validator';

export class CreateModuleDto {
  @IsString()
  @Length(1, 100)
  title!: string;
}
```

`libs/api-courses/src/lib/dto/update-module.dto.ts`:

```ts
import { IsString, Length } from 'class-validator';

export class UpdateModuleDto {
  @IsString()
  @Length(1, 100)
  title!: string;
}
```

`libs/api-courses/src/lib/dto/create-lesson.dto.ts`:

```ts
import { IsOptional, IsString, Length, MaxLength } from 'class-validator';

export class CreateLessonDto {
  @IsString()
  @Length(1, 100)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}
```

`libs/api-courses/src/lib/dto/update-lesson.dto.ts`:

```ts
import { IsOptional, IsString, Length, MaxLength } from 'class-validator';

export class UpdateLessonDto {
  @IsOptional()
  @IsString()
  @Length(1, 100)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}
```

`libs/api-courses/src/lib/dto/reorder.dto.ts`:

```ts
import { ArrayNotEmpty, IsArray, IsString } from 'class-validator';

export class ReorderDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  ids!: string[];
}
```

- [ ] **Step 4: Run tests — should pass**

Run: `pnpm nx test api-courses`
Expected: PASS for all DTO cases.

- [ ] **Step 5: Commit**

```bash
git add libs/api-courses/src/lib/dto
git commit -m "feat(api-courses): DTOs with class-validator for course/module/lesson operations"
```

---

## Task 6: CoursesRepository — thin Firestore adapter

**Design note:** This repository is intentionally thin — it owns Firestore I/O (collection paths, transactions, batches, recursive delete) but no validation logic. Business rules live in the service (Task 9–11). Repository behavior is verified end-to-end by api-e2e (Task 18); the repository itself is excluded from Stryker mutations in Task 34 (matches the precedent of `email-transport/*` in api-auth's Stryker config).

**Files:**
- Create: `libs/api-courses/src/lib/courses.repository.ts`
- Create: `libs/api-courses/src/lib/types/loaded-course.ts`

- [ ] **Step 1: Create the shared types file**

Create `libs/api-courses/src/lib/types/loaded-course.ts`:

```ts
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
```

- [ ] **Step 2: Create the repository class**

Create `libs/api-courses/src/lib/courses.repository.ts`:

```ts
import { Inject, Injectable } from '@nestjs/common';
import type { firestore as adminFirestore } from 'firebase-admin';

import { FIRESTORE, type FirestoreHandle } from '@learnwren/api-firebase';
import type {
  Course,
  CourseId,
  ISODateString,
  Lesson,
  LessonId,
  Module,
  ModuleId,
  UserId,
} from '@learnwren/shared-data-models';

const COURSES = 'courses';

function nowIso(): ISODateString {
  return new Date().toISOString() as ISODateString;
}

@Injectable()
export class CoursesRepository {
  constructor(@Inject(FIRESTORE) private readonly firestore: FirestoreHandle) {}

  // ────────────────────────── Course ──────────────────────────

  async createCourse(course: Course): Promise<void> {
    await this.firestore.collection(COURSES).doc(course.id).set(course);
  }

  async getCourse(cid: CourseId): Promise<Course | null> {
    const snap = await this.firestore.collection(COURSES).doc(cid).get();
    return snap.exists ? (snap.data() as Course) : null;
  }

  async listCoursesByInstructor(uid: UserId): Promise<Course[]> {
    const snap = await this.firestore
      .collection(COURSES)
      .where('instructorId', '==', uid)
      .orderBy('updatedAt', 'desc')
      .get();
    return snap.docs.map((d) => d.data() as Course);
  }

  async updateCourse(cid: CourseId, patch: Partial<Course>): Promise<void> {
    await this.firestore
      .collection(COURSES)
      .doc(cid)
      .update({ ...patch, updatedAt: nowIso() });
  }

  async deleteCourseRecursive(cid: CourseId): Promise<void> {
    const ref = this.firestore.collection(COURSES).doc(cid);
    await this.firestore.recursiveDelete(ref);
  }

  // ────────────────────────── Module ──────────────────────────

  /**
   * Append a new module at the end of the course in a transaction so two
   * concurrent appends do not collide on `order`.
   */
  async appendModule(
    cid: CourseId,
    seed: Omit<Module, 'order' | 'createdAt' | 'updatedAt'>,
  ): Promise<Module> {
    const moduleRef = this.firestore
      .collection(COURSES)
      .doc(cid)
      .collection('modules')
      .doc(seed.id);
    const siblingsRef = this.firestore.collection(COURSES).doc(cid).collection('modules');
    const courseRef = this.firestore.collection(COURSES).doc(cid);

    return this.firestore.runTransaction(async (t) => {
      const siblings = await t.get(siblingsRef);
      const order = siblings.size;
      const now = nowIso();
      const created: Module = { ...seed, order, createdAt: now, updatedAt: now };
      t.set(moduleRef, created);
      t.update(courseRef, { updatedAt: now });
      return created;
    });
  }

  async getModule(cid: CourseId, mid: ModuleId): Promise<Module | null> {
    const snap = await this.firestore
      .collection(COURSES)
      .doc(cid)
      .collection('modules')
      .doc(mid)
      .get();
    return snap.exists ? (snap.data() as Module) : null;
  }

  async listModulesByCourse(cid: CourseId): Promise<Module[]> {
    const snap = await this.firestore
      .collection(COURSES)
      .doc(cid)
      .collection('modules')
      .orderBy('order', 'asc')
      .get();
    return snap.docs.map((d) => d.data() as Module);
  }

  async updateModule(cid: CourseId, mid: ModuleId, patch: Partial<Module>): Promise<void> {
    await this.firestore
      .collection(COURSES)
      .doc(cid)
      .collection('modules')
      .doc(mid)
      .update({ ...patch, updatedAt: nowIso() });
  }

  async deleteModuleRecursive(cid: CourseId, mid: ModuleId): Promise<void> {
    const ref = this.firestore
      .collection(COURSES)
      .doc(cid)
      .collection('modules')
      .doc(mid);
    await this.firestore.recursiveDelete(ref);
  }

  /**
   * Write each module's new `order` (the array index in `orderedIds`) in one batch,
   * along with a single course `updatedAt` touch.
   */
  async writeModuleOrder(cid: CourseId, orderedIds: ModuleId[]): Promise<void> {
    const batch = this.firestore.batch();
    const now = nowIso();
    orderedIds.forEach((mid, index) => {
      const ref = this.firestore
        .collection(COURSES)
        .doc(cid)
        .collection('modules')
        .doc(mid);
      batch.update(ref, { order: index, updatedAt: now });
    });
    batch.update(this.firestore.collection(COURSES).doc(cid), { updatedAt: now });
    await batch.commit();
  }

  // ────────────────────────── Lesson ──────────────────────────

  async appendLesson(
    cid: CourseId,
    mid: ModuleId,
    seed: Omit<Lesson, 'order' | 'createdAt' | 'updatedAt'>,
  ): Promise<Lesson> {
    const lessonRef = this.firestore
      .collection(COURSES)
      .doc(cid)
      .collection('modules')
      .doc(mid)
      .collection('lessons')
      .doc(seed.id);
    const siblingsRef = this.firestore
      .collection(COURSES)
      .doc(cid)
      .collection('modules')
      .doc(mid)
      .collection('lessons');
    const courseRef = this.firestore.collection(COURSES).doc(cid);

    return this.firestore.runTransaction(async (t) => {
      const siblings = await t.get(siblingsRef);
      const order = siblings.size;
      const now = nowIso();
      const created: Lesson = { ...seed, order, createdAt: now, updatedAt: now };
      t.set(lessonRef, created);
      t.update(courseRef, { updatedAt: now });
      return created;
    });
  }

  async getLesson(cid: CourseId, mid: ModuleId, lid: LessonId): Promise<Lesson | null> {
    const snap = await this.firestore
      .collection(COURSES)
      .doc(cid)
      .collection('modules')
      .doc(mid)
      .collection('lessons')
      .doc(lid)
      .get();
    return snap.exists ? (snap.data() as Lesson) : null;
  }

  async listLessonsByModule(cid: CourseId, mid: ModuleId): Promise<Lesson[]> {
    const snap = await this.firestore
      .collection(COURSES)
      .doc(cid)
      .collection('modules')
      .doc(mid)
      .collection('lessons')
      .orderBy('order', 'asc')
      .get();
    return snap.docs.map((d) => d.data() as Lesson);
  }

  async updateLesson(
    cid: CourseId,
    mid: ModuleId,
    lid: LessonId,
    patch: Partial<Lesson>,
  ): Promise<void> {
    await this.firestore
      .collection(COURSES)
      .doc(cid)
      .collection('modules')
      .doc(mid)
      .collection('lessons')
      .doc(lid)
      .update({ ...patch, updatedAt: nowIso() });
  }

  async deleteLesson(cid: CourseId, mid: ModuleId, lid: LessonId): Promise<void> {
    await this.firestore
      .collection(COURSES)
      .doc(cid)
      .collection('modules')
      .doc(mid)
      .collection('lessons')
      .doc(lid)
      .delete();
  }

  async writeLessonOrder(
    cid: CourseId,
    mid: ModuleId,
    orderedIds: LessonId[],
  ): Promise<void> {
    const batch = this.firestore.batch();
    const now = nowIso();
    orderedIds.forEach((lid, index) => {
      const ref = this.firestore
        .collection(COURSES)
        .doc(cid)
        .collection('modules')
        .doc(mid)
        .collection('lessons')
        .doc(lid);
      batch.update(ref, { order: index, updatedAt: now });
    });
    batch.update(this.firestore.collection(COURSES).doc(cid), { updatedAt: now });
    await batch.commit();
  }

  /**
   * Generate a new branded ID. Uses Firestore's auto-id generator
   * (collection path is irrelevant — we just need the random ID).
   */
  newId<T extends string>(): T {
    return this.firestore.collection('_ids').doc().id as T;
  }

  /** @internal — exposed for service-level helpers that need the raw handle. */
  get rawFirestore(): FirestoreHandle {
    return this.firestore;
  }
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm nx typecheck api-courses`
Expected: PASS. If `FirestoreHandle` does not expose `recursiveDelete` or `batch`, open `libs/api-firebase/src/lib/firebase.tokens.ts` and confirm the type — Firestore's full Admin type does include both. If the alias is too narrow, widen `FirestoreHandle` to `adminFirestore.Firestore` directly.

- [ ] **Step 4: Commit**

```bash
git add libs/api-courses/src/lib
git commit -m "feat(api-courses): CoursesRepository thin adapter for Firestore"
```

---

## Task 7: InstructorRoleGuard

**Files:**
- Create: `libs/api-courses/src/lib/instructor-role.guard.ts`
- Test: `libs/api-courses/src/lib/instructor-role.guard.spec.ts`

- [ ] **Step 1: Write the failing guard test**

Create `libs/api-courses/src/lib/instructor-role.guard.spec.ts`:

```ts
import { ExecutionContext } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import type { AuthenticatedRequest } from '@learnwren/api-auth';
import type { UserId, UserRole } from '@learnwren/shared-data-models';

import { InsufficientRoleException } from './errors/courses.exception';
import { InstructorRoleGuard } from './instructor-role.guard';

function buildContext(role: UserRole | null): ExecutionContext {
  const req: Partial<AuthenticatedRequest> = {
    user:
      role === null
        ? undefined
        : {
            uid: 'uid-1' as UserId,
            email: 'i@example.com',
            role,
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

describe('InstructorRoleGuard', () => {
  const guard = new InstructorRoleGuard();

  it('allows INSTRUCTOR', () => {
    expect(guard.canActivate(buildContext('INSTRUCTOR'))).toBe(true);
  });

  it('rejects STUDENT with InsufficientRoleException', () => {
    expect(() => guard.canActivate(buildContext('STUDENT'))).toThrow(
      InsufficientRoleException,
    );
  });

  it('rejects ADMIN (administration is not authoring)', () => {
    expect(() => guard.canActivate(buildContext('ADMIN'))).toThrow(
      InsufficientRoleException,
    );
  });

  it('rejects requests with no user attached', () => {
    expect(() => guard.canActivate(buildContext(null))).toThrow(InsufficientRoleException);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm nx test api-courses -- instructor-role.guard.spec`
Expected: FAIL — `instructor-role.guard` not found.

- [ ] **Step 3: Implement the guard**

Create `libs/api-courses/src/lib/instructor-role.guard.ts`:

```ts
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

import type { AuthenticatedRequest } from '@learnwren/api-auth';

import { InsufficientRoleException } from './errors/courses.exception';

@Injectable()
export class InstructorRoleGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    if (req.user?.role !== 'INSTRUCTOR') {
      throw new InsufficientRoleException();
    }
    return true;
  }
}
```

- [ ] **Step 4: Run tests — should pass**

Run: `pnpm nx test api-courses -- instructor-role.guard.spec`
Expected: PASS for all four cases.

- [ ] **Step 5: Commit**

```bash
git add libs/api-courses/src/lib/instructor-role.guard.ts libs/api-courses/src/lib/instructor-role.guard.spec.ts
git commit -m "feat(api-courses): InstructorRoleGuard"
```

---

## Task 8: CourseOwnerGuard

**Files:**
- Create: `libs/api-courses/src/lib/course-owner.guard.ts`
- Test: `libs/api-courses/src/lib/course-owner.guard.spec.ts`

- [ ] **Step 1: Write the failing guard test**

Create `libs/api-courses/src/lib/course-owner.guard.spec.ts`:

```ts
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
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm nx test api-courses -- course-owner.guard.spec`
Expected: FAIL.

- [ ] **Step 3: Implement the guard**

Create `libs/api-courses/src/lib/course-owner.guard.ts`:

```ts
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

import type { CourseId } from '@learnwren/shared-data-models';

import { CoursesRepository } from './courses.repository';
import {
  CourseNotFoundException,
  NotCourseOwnerException,
} from './errors/courses.exception';
import type { CourseScopedRequest } from './types/loaded-course';

@Injectable()
export class CourseOwnerGuard implements CanActivate {
  constructor(private readonly repo: CoursesRepository) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<CourseScopedRequest>();
    const cid = req.params?.['cid'] as CourseId | undefined;
    if (!cid) throw new CourseNotFoundException();

    const course = await this.repo.getCourse(cid);
    if (!course) throw new CourseNotFoundException();
    if (course.instructorId !== req.user?.uid) {
      throw new NotCourseOwnerException();
    }

    req.course = course;
    return true;
  }
}
```

- [ ] **Step 4: Run tests — should pass**

Run: `pnpm nx test api-courses -- course-owner.guard.spec`
Expected: PASS for all four cases.

- [ ] **Step 5: Commit**

```bash
git add libs/api-courses/src/lib/course-owner.guard.ts libs/api-courses/src/lib/course-owner.guard.spec.ts libs/api-courses/src/lib/types/loaded-course.ts
git commit -m "feat(api-courses): CourseOwnerGuard with course pre-load"
```

---

## Task 9: CoursesService — course operations

**Files:**
- Create: `libs/api-courses/src/lib/courses.service.ts`
- Test: `libs/api-courses/src/lib/courses.service.spec.ts`

This task introduces the service shell and the four course-level operations: `createCourse`, `listCoursesForInstructor`, `getCourseTree`, `updateCourse`, `deleteCourse`. Module and lesson operations are layered on in Tasks 10 and 11.

- [ ] **Step 1: Write the failing service test**

Create `libs/api-courses/src/lib/courses.service.spec.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  Course,
  CourseId,
  ISODateString,
  Lesson,
  LessonId,
  Module,
  ModuleId,
  UserId,
} from '@learnwren/shared-data-models';

import { CoursesRepository } from './courses.repository';
import { CoursesService } from './courses.service';
import { CourseNotFoundException } from './errors/courses.exception';

const INSTRUCTOR_UID = 'uid-instructor-1' as UserId;
const FIXED_DATE = '2026-05-12T12:00:00.000Z' as ISODateString;

function makeCourse(overrides: Partial<Course> = {}): Course {
  return {
    id: 'cid-1' as CourseId,
    title: 'T',
    description: 'D',
    instructorId: INSTRUCTOR_UID,
    status: 'DRAFT',
    createdAt: FIXED_DATE,
    updatedAt: FIXED_DATE,
    ...overrides,
  };
}

interface RepoFake {
  newId: ReturnType<typeof vi.fn>;
  createCourse: ReturnType<typeof vi.fn>;
  getCourse: ReturnType<typeof vi.fn>;
  listCoursesByInstructor: ReturnType<typeof vi.fn>;
  updateCourse: ReturnType<typeof vi.fn>;
  deleteCourseRecursive: ReturnType<typeof vi.fn>;
  appendModule: ReturnType<typeof vi.fn>;
  getModule: ReturnType<typeof vi.fn>;
  listModulesByCourse: ReturnType<typeof vi.fn>;
  updateModule: ReturnType<typeof vi.fn>;
  deleteModuleRecursive: ReturnType<typeof vi.fn>;
  writeModuleOrder: ReturnType<typeof vi.fn>;
  appendLesson: ReturnType<typeof vi.fn>;
  getLesson: ReturnType<typeof vi.fn>;
  listLessonsByModule: ReturnType<typeof vi.fn>;
  updateLesson: ReturnType<typeof vi.fn>;
  deleteLesson: ReturnType<typeof vi.fn>;
  writeLessonOrder: ReturnType<typeof vi.fn>;
}

function buildRepoFake(): RepoFake {
  return {
    newId: vi.fn(() => 'generated-id'),
    createCourse: vi.fn(async () => undefined),
    getCourse: vi.fn(async () => null),
    listCoursesByInstructor: vi.fn(async () => []),
    updateCourse: vi.fn(async () => undefined),
    deleteCourseRecursive: vi.fn(async () => undefined),
    appendModule: vi.fn(),
    getModule: vi.fn(async () => null),
    listModulesByCourse: vi.fn(async () => []),
    updateModule: vi.fn(async () => undefined),
    deleteModuleRecursive: vi.fn(async () => undefined),
    writeModuleOrder: vi.fn(async () => undefined),
    appendLesson: vi.fn(),
    getLesson: vi.fn(async () => null),
    listLessonsByModule: vi.fn(async () => []),
    updateLesson: vi.fn(async () => undefined),
    deleteLesson: vi.fn(async () => undefined),
    writeLessonOrder: vi.fn(async () => undefined),
  };
}

describe('CoursesService — course operations', () => {
  let repo: RepoFake;
  let service: CoursesService;

  beforeEach(() => {
    repo = buildRepoFake();
    let counter = 0;
    repo.newId.mockImplementation(() => `id-${++counter}`);
    service = new CoursesService(repo as unknown as CoursesRepository);
  });

  describe('createCourse', () => {
    it('writes a new DRAFT course with generated id and instructor ownership', async () => {
      const out = await service.createCourse(INSTRUCTOR_UID, {
        title: 'Intro',
        description: 'A short intro.',
      });

      expect(out.id).toBe('id-1');
      expect(out.instructorId).toBe(INSTRUCTOR_UID);
      expect(out.status).toBe('DRAFT');
      expect(out.title).toBe('Intro');
      expect(out.description).toBe('A short intro.');
      expect(out.longDescription).toBeUndefined();
      expect(out.category).toBeUndefined();
      expect(out.difficulty).toBeUndefined();
      expect(repo.createCourse).toHaveBeenCalledWith(out);
    });

    it('includes optional fields when supplied', async () => {
      const out = await service.createCourse(INSTRUCTOR_UID, {
        title: 'T',
        description: 'D',
        longDescription: 'LD',
        category: 'PROGRAMMING',
        difficulty: 'BEGINNER',
      });
      expect(out.longDescription).toBe('LD');
      expect(out.category).toBe('PROGRAMMING');
      expect(out.difficulty).toBe('BEGINNER');
    });
  });

  describe('listCoursesForInstructor', () => {
    it('delegates to the repository', async () => {
      const list = [makeCourse({ id: 'cid-a' as CourseId }), makeCourse({ id: 'cid-b' as CourseId })];
      repo.listCoursesByInstructor.mockResolvedValue(list);
      const out = await service.listCoursesForInstructor(INSTRUCTOR_UID);
      expect(out).toEqual(list);
      expect(repo.listCoursesByInstructor).toHaveBeenCalledWith(INSTRUCTOR_UID);
    });
  });

  describe('getCourseTree', () => {
    it('returns hydrated course + modules + lessons', async () => {
      const course = makeCourse();
      const modules: Module[] = [
        { id: 'mid-1' as ModuleId, courseId: course.id, title: 'M1', order: 0, createdAt: FIXED_DATE, updatedAt: FIXED_DATE },
        { id: 'mid-2' as ModuleId, courseId: course.id, title: 'M2', order: 1, createdAt: FIXED_DATE, updatedAt: FIXED_DATE },
      ];
      const lessonsM1: Lesson[] = [
        { id: 'lid-a' as LessonId, moduleId: 'mid-1' as ModuleId, title: 'L1', order: 0, createdAt: FIXED_DATE, updatedAt: FIXED_DATE },
      ];
      const lessonsM2: Lesson[] = [];
      repo.getCourse.mockResolvedValue(course);
      repo.listModulesByCourse.mockResolvedValue(modules);
      repo.listLessonsByModule.mockImplementation(async (_cid, mid) =>
        mid === 'mid-1' ? lessonsM1 : lessonsM2,
      );

      const tree = await service.getCourseTree(course.id);

      expect(tree.course).toEqual(course);
      expect(tree.modules).toEqual([
        { module: modules[0], lessons: lessonsM1 },
        { module: modules[1], lessons: lessonsM2 },
      ]);
    });

    it('throws CourseNotFoundException when the course is missing', async () => {
      repo.getCourse.mockResolvedValue(null);
      await expect(service.getCourseTree('nope' as CourseId)).rejects.toBeInstanceOf(
        CourseNotFoundException,
      );
    });
  });

  describe('updateCourse', () => {
    it('forwards the patch to the repository unchanged', async () => {
      await service.updateCourse('cid-1' as CourseId, { title: 'New' });
      expect(repo.updateCourse).toHaveBeenCalledWith('cid-1', { title: 'New' });
    });

    it('forwards a multi-field patch', async () => {
      await service.updateCourse('cid-1' as CourseId, {
        title: 'X',
        description: 'Y',
        category: 'DESIGN',
      });
      expect(repo.updateCourse).toHaveBeenCalledWith('cid-1', {
        title: 'X',
        description: 'Y',
        category: 'DESIGN',
      });
    });
  });

  describe('deleteCourse', () => {
    it('invokes recursive delete', async () => {
      await service.deleteCourse('cid-1' as CourseId);
      expect(repo.deleteCourseRecursive).toHaveBeenCalledWith('cid-1');
    });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm nx test api-courses -- courses.service.spec`
Expected: FAIL — `courses.service` not found.

- [ ] **Step 3: Implement the service with course operations only**

Create `libs/api-courses/src/lib/courses.service.ts`:

```ts
import { Injectable } from '@nestjs/common';

import type {
  Course,
  CourseCategory,
  CourseDifficulty,
  CourseId,
  ISODateString,
  UserId,
} from '@learnwren/shared-data-models';

import { CoursesRepository } from './courses.repository';
import { CourseNotFoundException } from './errors/courses.exception';
import type { CourseTree } from './types/loaded-course';

export interface CreateCourseInput {
  title: string;
  description: string;
  longDescription?: string;
  category?: CourseCategory;
  difficulty?: CourseDifficulty;
}

export interface UpdateCourseInput {
  title?: string;
  description?: string;
  longDescription?: string;
  category?: CourseCategory;
  difficulty?: CourseDifficulty;
}

function nowIso(): ISODateString {
  return new Date().toISOString() as ISODateString;
}

@Injectable()
export class CoursesService {
  constructor(private readonly repo: CoursesRepository) {}

  async createCourse(uid: UserId, input: CreateCourseInput): Promise<Course> {
    const now = nowIso();
    const course: Course = {
      id: this.repo.newId<CourseId>(),
      title: input.title,
      description: input.description,
      longDescription: input.longDescription,
      category: input.category,
      difficulty: input.difficulty,
      instructorId: uid,
      status: 'DRAFT',
      createdAt: now,
      updatedAt: now,
    };
    await this.repo.createCourse(course);
    return course;
  }

  async listCoursesForInstructor(uid: UserId): Promise<Course[]> {
    return this.repo.listCoursesByInstructor(uid);
  }

  async getCourseTree(cid: CourseId): Promise<CourseTree> {
    const course = await this.repo.getCourse(cid);
    if (!course) throw new CourseNotFoundException();

    const modules = await this.repo.listModulesByCourse(cid);
    const childModules = await Promise.all(
      modules.map(async (m) => ({
        module: m,
        lessons: await this.repo.listLessonsByModule(cid, m.id),
      })),
    );
    return { course, modules: childModules };
  }

  async updateCourse(cid: CourseId, patch: UpdateCourseInput): Promise<void> {
    await this.repo.updateCourse(cid, patch);
  }

  async deleteCourse(cid: CourseId): Promise<void> {
    await this.repo.deleteCourseRecursive(cid);
  }
}
```

- [ ] **Step 4: Run tests — should pass**

Run: `pnpm nx test api-courses -- courses.service.spec`
Expected: PASS for all course-level cases.

- [ ] **Step 5: Commit**

```bash
git add libs/api-courses/src/lib/courses.service.ts libs/api-courses/src/lib/courses.service.spec.ts
git commit -m "feat(api-courses): CoursesService course-level operations"
```

---

## Task 10: CoursesService — module operations

**Files:**
- Modify: `libs/api-courses/src/lib/courses.service.ts`
- Modify: `libs/api-courses/src/lib/courses.service.spec.ts`

- [ ] **Step 1: Add the failing module-operation tests**

Append the following `describe` block to `libs/api-courses/src/lib/courses.service.spec.ts` (after the existing `describe('CoursesService — course operations')` block):

```ts
describe('CoursesService — module operations', () => {
  let repo: RepoFake;
  let service: CoursesService;
  const CID = 'cid-1' as CourseId;

  beforeEach(() => {
    repo = buildRepoFake();
    let counter = 0;
    repo.newId.mockImplementation(() => `id-${++counter}`);
    service = new CoursesService(repo as unknown as CoursesRepository);
  });

  describe('createModule', () => {
    it('appends a new module with a generated id', async () => {
      repo.appendModule.mockImplementation(async (cid, seed) => ({
        ...seed,
        order: 0,
        createdAt: FIXED_DATE,
        updatedAt: FIXED_DATE,
      }));

      const out = await service.createModule(CID, { title: 'Intro module' });
      expect(out.id).toBe('id-1');
      expect(out.courseId).toBe(CID);
      expect(out.title).toBe('Intro module');
      expect(repo.appendModule).toHaveBeenCalledWith(CID, {
        id: 'id-1',
        courseId: CID,
        title: 'Intro module',
      });
    });
  });

  describe('updateModule', () => {
    it('forwards a rename patch', async () => {
      repo.getModule.mockResolvedValue({
        id: 'mid-1' as ModuleId,
        courseId: CID,
        title: 'Old',
        order: 0,
        createdAt: FIXED_DATE,
        updatedAt: FIXED_DATE,
      });
      await service.updateModule(CID, 'mid-1' as ModuleId, { title: 'New' });
      expect(repo.updateModule).toHaveBeenCalledWith(CID, 'mid-1', { title: 'New' });
    });

    it('throws ModuleNotFoundException when the module does not exist', async () => {
      repo.getModule.mockResolvedValue(null);
      const { ModuleNotFoundException } = await import('./errors/courses.exception');
      await expect(
        service.updateModule(CID, 'nope' as ModuleId, { title: 'X' }),
      ).rejects.toBeInstanceOf(ModuleNotFoundException);
    });
  });

  describe('deleteModule', () => {
    it('checks existence then recursive-deletes', async () => {
      repo.getModule.mockResolvedValue({
        id: 'mid-1' as ModuleId,
        courseId: CID,
        title: 'M',
        order: 0,
        createdAt: FIXED_DATE,
        updatedAt: FIXED_DATE,
      });
      await service.deleteModule(CID, 'mid-1' as ModuleId);
      expect(repo.deleteModuleRecursive).toHaveBeenCalledWith(CID, 'mid-1');
    });

    it('throws ModuleNotFoundException when the module does not exist', async () => {
      repo.getModule.mockResolvedValue(null);
      const { ModuleNotFoundException } = await import('./errors/courses.exception');
      await expect(service.deleteModule(CID, 'nope' as ModuleId)).rejects.toBeInstanceOf(
        ModuleNotFoundException,
      );
      expect(repo.deleteModuleRecursive).not.toHaveBeenCalled();
    });
  });

  describe('reorderModules', () => {
    const m = (id: string, order: number): Module => ({
      id: id as ModuleId,
      courseId: CID,
      title: id,
      order,
      createdAt: FIXED_DATE,
      updatedAt: FIXED_DATE,
    });

    it('writes the new order when ids match current children exactly', async () => {
      repo.listModulesByCourse.mockResolvedValue([m('a', 0), m('b', 1), m('c', 2)]);
      await service.reorderModules(CID, ['c', 'a', 'b'] as ModuleId[]);
      expect(repo.writeModuleOrder).toHaveBeenCalledWith(CID, ['c', 'a', 'b']);
    });

    it('throws StaleReorderException when ids are missing one', async () => {
      repo.listModulesByCourse.mockResolvedValue([m('a', 0), m('b', 1), m('c', 2)]);
      const { StaleReorderException } = await import('./errors/courses.exception');
      await expect(
        service.reorderModules(CID, ['a', 'b'] as ModuleId[]),
      ).rejects.toBeInstanceOf(StaleReorderException);
      expect(repo.writeModuleOrder).not.toHaveBeenCalled();
    });

    it('throws StaleReorderException when ids include a stranger', async () => {
      repo.listModulesByCourse.mockResolvedValue([m('a', 0), m('b', 1)]);
      const { StaleReorderException } = await import('./errors/courses.exception');
      await expect(
        service.reorderModules(CID, ['a', 'b', 'z'] as ModuleId[]),
      ).rejects.toBeInstanceOf(StaleReorderException);
    });

    it('throws StaleReorderException when ids contain duplicates', async () => {
      repo.listModulesByCourse.mockResolvedValue([m('a', 0), m('b', 1)]);
      const { StaleReorderException } = await import('./errors/courses.exception');
      await expect(
        service.reorderModules(CID, ['a', 'a'] as ModuleId[]),
      ).rejects.toBeInstanceOf(StaleReorderException);
    });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm nx test api-courses -- courses.service.spec`
Expected: FAIL — `createModule`, `updateModule`, `deleteModule`, `reorderModules` not on the service.

- [ ] **Step 3: Add module operations to the service**

Open `libs/api-courses/src/lib/courses.service.ts`. Add these methods to the `CoursesService` class (after `deleteCourse`):

```ts
  // ────────────────────────── Module ──────────────────────────

  async createModule(cid: CourseId, input: { title: string }): Promise<Module> {
    const id = this.repo.newId<ModuleId>();
    return this.repo.appendModule(cid, {
      id,
      courseId: cid,
      title: input.title,
    });
  }

  async updateModule(
    cid: CourseId,
    mid: ModuleId,
    patch: { title?: string },
  ): Promise<void> {
    const existing = await this.repo.getModule(cid, mid);
    if (!existing) throw new ModuleNotFoundException();
    await this.repo.updateModule(cid, mid, patch);
  }

  async deleteModule(cid: CourseId, mid: ModuleId): Promise<void> {
    const existing = await this.repo.getModule(cid, mid);
    if (!existing) throw new ModuleNotFoundException();
    await this.repo.deleteModuleRecursive(cid, mid);
  }

  async reorderModules(cid: CourseId, ids: ModuleId[]): Promise<Module[]> {
    const current = await this.repo.listModulesByCourse(cid);
    assertReorderSetMatches(
      current.map((m) => m.id),
      ids,
    );
    await this.repo.writeModuleOrder(cid, ids);
    return ids.map((id, index) => ({
      ...current.find((m) => m.id === id)!,
      order: index,
    }));
  }
```

Add these imports/types at the top of the file:

```ts
import type { Module, ModuleId } from '@learnwren/shared-data-models';

import {
  ModuleNotFoundException,
  StaleReorderException,
} from './errors/courses.exception';
```

And add this private helper at the bottom of the file (outside the class):

```ts
function assertReorderSetMatches(currentIds: string[], proposedIds: string[]): void {
  if (currentIds.length !== proposedIds.length) throw new StaleReorderException();
  const current = new Set(currentIds);
  const proposed = new Set(proposedIds);
  if (current.size !== proposed.size) throw new StaleReorderException();
  for (const id of proposed) {
    if (!current.has(id)) throw new StaleReorderException();
  }
}
```

- [ ] **Step 4: Run tests — should pass**

Run: `pnpm nx test api-courses -- courses.service.spec`
Expected: PASS for all module-level cases (plus the existing course-level ones).

- [ ] **Step 5: Commit**

```bash
git add libs/api-courses/src/lib/courses.service.ts libs/api-courses/src/lib/courses.service.spec.ts
git commit -m "feat(api-courses): CoursesService module operations + reorder set-check"
```

---

## Task 11: CoursesService — lesson operations

**Files:**
- Modify: `libs/api-courses/src/lib/courses.service.ts`
- Modify: `libs/api-courses/src/lib/courses.service.spec.ts`

- [ ] **Step 1: Add the failing lesson-operation tests**

Append the following `describe` block to `libs/api-courses/src/lib/courses.service.spec.ts`:

```ts
describe('CoursesService — lesson operations', () => {
  let repo: RepoFake;
  let service: CoursesService;
  const CID = 'cid-1' as CourseId;
  const MID = 'mid-1' as ModuleId;

  beforeEach(() => {
    repo = buildRepoFake();
    let counter = 0;
    repo.newId.mockImplementation(() => `id-${++counter}`);
    service = new CoursesService(repo as unknown as CoursesRepository);
    repo.getModule.mockResolvedValue({
      id: MID,
      courseId: CID,
      title: 'M',
      order: 0,
      createdAt: FIXED_DATE,
      updatedAt: FIXED_DATE,
    });
  });

  describe('createLesson', () => {
    it('requires the module to exist', async () => {
      repo.getModule.mockResolvedValue(null);
      const { ModuleNotFoundException } = await import('./errors/courses.exception');
      await expect(service.createLesson(CID, MID, { title: 'L' })).rejects.toBeInstanceOf(
        ModuleNotFoundException,
      );
      expect(repo.appendLesson).not.toHaveBeenCalled();
    });

    it('appends a new lesson with a generated id', async () => {
      repo.appendLesson.mockImplementation(async (cid, mid, seed) => ({
        ...seed,
        order: 0,
        createdAt: FIXED_DATE,
        updatedAt: FIXED_DATE,
      }));
      const out = await service.createLesson(CID, MID, {
        title: 'L1',
        description: 'first',
      });
      expect(out.id).toBe('id-1');
      expect(out.moduleId).toBe(MID);
      expect(out.title).toBe('L1');
      expect(out.description).toBe('first');
      expect(repo.appendLesson).toHaveBeenCalledWith(CID, MID, {
        id: 'id-1',
        moduleId: MID,
        title: 'L1',
        description: 'first',
      });
    });
  });

  describe('updateLesson', () => {
    it('forwards the patch when the lesson exists', async () => {
      repo.getLesson.mockResolvedValue({
        id: 'lid-1' as LessonId,
        moduleId: MID,
        title: 'Old',
        order: 0,
        createdAt: FIXED_DATE,
        updatedAt: FIXED_DATE,
      });
      await service.updateLesson(CID, MID, 'lid-1' as LessonId, { title: 'New' });
      expect(repo.updateLesson).toHaveBeenCalledWith(CID, MID, 'lid-1', { title: 'New' });
    });

    it('throws LessonNotFoundException when the lesson is missing', async () => {
      repo.getLesson.mockResolvedValue(null);
      const { LessonNotFoundException } = await import('./errors/courses.exception');
      await expect(
        service.updateLesson(CID, MID, 'lid-x' as LessonId, { title: 'X' }),
      ).rejects.toBeInstanceOf(LessonNotFoundException);
    });
  });

  describe('deleteLesson', () => {
    it('throws LessonNotFoundException when the lesson is missing', async () => {
      repo.getLesson.mockResolvedValue(null);
      const { LessonNotFoundException } = await import('./errors/courses.exception');
      await expect(service.deleteLesson(CID, MID, 'lid-x' as LessonId)).rejects.toBeInstanceOf(
        LessonNotFoundException,
      );
      expect(repo.deleteLesson).not.toHaveBeenCalled();
    });

    it('deletes the lesson when it exists', async () => {
      repo.getLesson.mockResolvedValue({
        id: 'lid-1' as LessonId,
        moduleId: MID,
        title: 'L',
        order: 0,
        createdAt: FIXED_DATE,
        updatedAt: FIXED_DATE,
      });
      await service.deleteLesson(CID, MID, 'lid-1' as LessonId);
      expect(repo.deleteLesson).toHaveBeenCalledWith(CID, MID, 'lid-1');
    });
  });

  describe('reorderLessons', () => {
    const l = (id: string, order: number): Lesson => ({
      id: id as LessonId,
      moduleId: MID,
      title: id,
      order,
      createdAt: FIXED_DATE,
      updatedAt: FIXED_DATE,
    });

    it('writes the new order when ids match current children exactly', async () => {
      repo.listLessonsByModule.mockResolvedValue([l('a', 0), l('b', 1)]);
      await service.reorderLessons(CID, MID, ['b', 'a'] as LessonId[]);
      expect(repo.writeLessonOrder).toHaveBeenCalledWith(CID, MID, ['b', 'a']);
    });

    it('throws StaleReorderException when ids mismatch', async () => {
      repo.listLessonsByModule.mockResolvedValue([l('a', 0), l('b', 1)]);
      const { StaleReorderException } = await import('./errors/courses.exception');
      await expect(
        service.reorderLessons(CID, MID, ['a'] as LessonId[]),
      ).rejects.toBeInstanceOf(StaleReorderException);
    });

    it('requires the parent module to exist', async () => {
      repo.getModule.mockResolvedValue(null);
      const { ModuleNotFoundException } = await import('./errors/courses.exception');
      await expect(
        service.reorderLessons(CID, MID, ['a'] as LessonId[]),
      ).rejects.toBeInstanceOf(ModuleNotFoundException);
    });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm nx test api-courses -- courses.service.spec`
Expected: FAIL — lesson methods do not exist on the service yet.

- [ ] **Step 3: Add lesson operations to the service**

Open `libs/api-courses/src/lib/courses.service.ts`. Add these methods to the `CoursesService` class (after `reorderModules`):

```ts
  // ────────────────────────── Lesson ──────────────────────────

  async createLesson(
    cid: CourseId,
    mid: ModuleId,
    input: { title: string; description?: string },
  ): Promise<Lesson> {
    const parent = await this.repo.getModule(cid, mid);
    if (!parent) throw new ModuleNotFoundException();
    const id = this.repo.newId<LessonId>();
    return this.repo.appendLesson(cid, mid, {
      id,
      moduleId: mid,
      title: input.title,
      ...(input.description !== undefined ? { description: input.description } : {}),
    });
  }

  async updateLesson(
    cid: CourseId,
    mid: ModuleId,
    lid: LessonId,
    patch: { title?: string; description?: string },
  ): Promise<void> {
    const existing = await this.repo.getLesson(cid, mid, lid);
    if (!existing) throw new LessonNotFoundException();
    await this.repo.updateLesson(cid, mid, lid, patch);
  }

  async deleteLesson(cid: CourseId, mid: ModuleId, lid: LessonId): Promise<void> {
    const existing = await this.repo.getLesson(cid, mid, lid);
    if (!existing) throw new LessonNotFoundException();
    await this.repo.deleteLesson(cid, mid, lid);
  }

  async reorderLessons(
    cid: CourseId,
    mid: ModuleId,
    ids: LessonId[],
  ): Promise<Lesson[]> {
    const parent = await this.repo.getModule(cid, mid);
    if (!parent) throw new ModuleNotFoundException();
    const current = await this.repo.listLessonsByModule(cid, mid);
    assertReorderSetMatches(
      current.map((l) => l.id),
      ids,
    );
    await this.repo.writeLessonOrder(cid, mid, ids);
    return ids.map((id, index) => ({
      ...current.find((l) => l.id === id)!,
      order: index,
    }));
  }
```

Extend the imports at the top of the file:

```ts
import type { Lesson, LessonId } from '@learnwren/shared-data-models';

import { LessonNotFoundException } from './errors/courses.exception';
```

- [ ] **Step 4: Run tests — should pass**

Run: `pnpm nx test api-courses -- courses.service.spec`
Expected: PASS for all course-, module-, and lesson-level cases.

- [ ] **Step 5: Commit**

```bash
git add libs/api-courses/src/lib/courses.service.ts libs/api-courses/src/lib/courses.service.spec.ts
git commit -m "feat(api-courses): CoursesService lesson operations"
```

---

## Task 12: CoursesExceptionFilter

**Files:**
- Create: `libs/api-courses/src/lib/courses.exception-filter.ts`
- Test: `libs/api-courses/src/lib/courses.exception-filter.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `libs/api-courses/src/lib/courses.exception-filter.spec.ts`:

```ts
import { ArgumentsHost, BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { CoursesExceptionFilter } from './courses.exception-filter';
import {
  CourseNotFoundException,
  StaleReorderException,
} from './errors/courses.exception';

function buildHost(): { host: ArgumentsHost; status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> } {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({}),
      getNext: () => undefined,
    }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

describe('CoursesExceptionFilter', () => {
  it('maps a CoursesException to its declared status and code', () => {
    const filter = new CoursesExceptionFilter();
    const { host, status, json } = buildHost();
    filter.catch(new CourseNotFoundException(), host);
    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({
      error: { code: 'COURSE_NOT_FOUND', message: 'Course not found.' },
    });
  });

  it('preserves details when present', () => {
    const filter = new CoursesExceptionFilter();
    const { host, status, json } = buildHost();
    filter.catch(new StaleReorderException(), host);
    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith({
      error: {
        code: 'STALE_REORDER',
        message: 'Reorder body does not match current children — refetch and retry.',
      },
    });
  });

  it('maps a NestJS BadRequestException (DTO validation) to VALIDATION_FAILED with fieldErrors', () => {
    const filter = new CoursesExceptionFilter();
    const { host, status, json } = buildHost();
    // class-validator + APP_PIPE produces this shape:
    const dtoErr = new BadRequestException({
      message: ['title must be longer than or equal to 1 characters'],
      error: 'Bad Request',
      statusCode: 400,
    });
    filter.catch(dtoErr, host);
    expect(status).toHaveBeenCalledWith(400);
    const body = json.mock.calls[0][0];
    expect(body.error.code).toBe('VALIDATION_FAILED');
    expect(body.error.details?.fieldErrors).toBeTruthy();
  });

  it('falls back to INTERNAL for unknown exceptions', () => {
    const filter = new CoursesExceptionFilter();
    const { host, status, json } = buildHost();
    filter.catch(new Error('boom'), host);
    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      error: { code: 'INTERNAL', message: 'An internal error occurred.' },
    });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm nx test api-courses -- courses.exception-filter.spec`
Expected: FAIL.

- [ ] **Step 3: Implement the filter**

Create `libs/api-courses/src/lib/courses.exception-filter.ts`:

```ts
import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';

import { CoursesException } from './errors/courses.exception';

interface CoursesErrorBody {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

@Catch()
export class CoursesExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('CoursesExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof CoursesException) {
      const body: CoursesErrorBody = {
        error: { code: exception.code, message: exception.message },
      };
      if (exception.details) {
        body.error.details = exception.details;
      }
      response.status(exception.status).json(body);
      return;
    }

    if (exception instanceof BadRequestException) {
      const payload = exception.getResponse() as { message?: string[] | string };
      const messages = Array.isArray(payload.message)
        ? payload.message
        : payload.message
          ? [payload.message]
          : [];
      const fieldErrors = parseFieldErrors(messages);
      response.status(400).json({
        error: {
          code: 'VALIDATION_FAILED',
          message: 'Request body failed validation.',
          details: { fieldErrors },
        },
      } satisfies CoursesErrorBody);
      return;
    }

    this.logger.error(
      exception instanceof Error ? (exception.stack ?? exception.message) : String(exception),
    );
    response.status(500).json({
      error: { code: 'INTERNAL', message: 'An internal error occurred.' },
    } satisfies CoursesErrorBody);
  }
}

/**
 * class-validator emits messages like "title must be longer than or equal to 1 characters".
 * Extract the leading field name (the first word) as the key.
 */
function parseFieldErrors(messages: string[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const msg of messages) {
    const field = msg.split(' ')[0];
    if (!out[field]) out[field] = [];
    out[field].push(msg);
  }
  return out;
}
```

- [ ] **Step 4: Run tests — should pass**

Run: `pnpm nx test api-courses -- courses.exception-filter.spec`
Expected: PASS for all four cases.

- [ ] **Step 5: Commit**

```bash
git add libs/api-courses/src/lib/courses.exception-filter.ts libs/api-courses/src/lib/courses.exception-filter.spec.ts
git commit -m "feat(api-courses): CoursesExceptionFilter maps domain + validation errors"
```

---

## Task 13: CoursesController — all endpoints

**Files:**
- Create: `libs/api-courses/src/lib/courses.controller.ts`
- Test: `libs/api-courses/src/lib/courses.controller.spec.ts`

The controller is a thin delegation layer over `CoursesService`. Tests verify routing, parameter wiring, and that the right service method is called with the right arguments — the service's behavior is already covered in Tasks 9–11.

- [ ] **Step 1: Write the failing controller test**

Create `libs/api-courses/src/lib/courses.controller.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthenticatedRequest } from '@learnwren/api-auth';
import { FIREBASE_AUTH, FIRESTORE } from '@learnwren/api-firebase';
import type {
  Course,
  CourseId,
  Lesson,
  LessonId,
  Module,
  ModuleId,
  UserId,
} from '@learnwren/shared-data-models';

import { CourseOwnerGuard } from './course-owner.guard';
import { CoursesController } from './courses.controller';
import { CoursesRepository } from './courses.repository';
import { CoursesService } from './courses.service';
import { InstructorRoleGuard } from './instructor-role.guard';
import type { CourseScopedRequest } from './types/loaded-course';

const UID = 'uid-1' as UserId;
const CID = 'cid-1' as CourseId;
const MID = 'mid-1' as ModuleId;
const LID = 'lid-1' as LessonId;

function makeReq(overrides: Partial<CourseScopedRequest> = {}): CourseScopedRequest {
  return {
    user: { uid: UID, email: 'i@example.com', role: 'INSTRUCTOR', emailVerified: true },
    ...overrides,
  } as CourseScopedRequest;
}

function buildService(): CoursesService {
  return {
    createCourse: vi.fn(async () => ({ id: CID }) as Course),
    listCoursesForInstructor: vi.fn(async () => []),
    getCourseTree: vi.fn(async () => ({ course: { id: CID } as Course, modules: [] })),
    updateCourse: vi.fn(async () => undefined),
    deleteCourse: vi.fn(async () => undefined),
    createModule: vi.fn(async () => ({ id: MID }) as Module),
    updateModule: vi.fn(async () => undefined),
    deleteModule: vi.fn(async () => undefined),
    reorderModules: vi.fn(async () => []),
    createLesson: vi.fn(async () => ({ id: LID }) as Lesson),
    updateLesson: vi.fn(async () => undefined),
    deleteLesson: vi.fn(async () => undefined),
    reorderLessons: vi.fn(async () => []),
  } as unknown as CoursesService;
}

async function buildController(service: CoursesService): Promise<CoursesController> {
  const mod = await Test.createTestingModule({
    controllers: [CoursesController],
    providers: [
      { provide: CoursesService, useValue: service },
      { provide: CoursesRepository, useValue: {} },
      { provide: InstructorRoleGuard, useValue: { canActivate: () => true } },
      { provide: CourseOwnerGuard, useValue: { canActivate: () => true } },
      { provide: FIRESTORE, useValue: {} },
      { provide: FIREBASE_AUTH, useValue: {} },
    ],
  })
    .overrideGuard(InstructorRoleGuard)
    .useValue({ canActivate: () => true })
    .overrideGuard(CourseOwnerGuard)
    .useValue({ canActivate: () => true })
    .compile();
  return mod.get(CoursesController);
}

describe('CoursesController', () => {
  let service: CoursesService;
  let controller: CoursesController;

  beforeEach(async () => {
    service = buildService();
    controller = await buildController(service);
  });

  it('POST /courses delegates to CoursesService.createCourse with uid + dto', async () => {
    const req = makeReq();
    await controller.createCourse(
      { title: 'T', description: 'D' },
      req as unknown as AuthenticatedRequest,
    );
    expect(service.createCourse).toHaveBeenCalledWith(UID, {
      title: 'T',
      description: 'D',
    });
  });

  it('GET /courses lists current instructor courses', async () => {
    const req = makeReq();
    await controller.listCourses(req as unknown as AuthenticatedRequest);
    expect(service.listCoursesForInstructor).toHaveBeenCalledWith(UID);
  });

  it('GET /courses/:cid returns hydrated tree', async () => {
    await controller.getCourse(CID);
    expect(service.getCourseTree).toHaveBeenCalledWith(CID);
  });

  it('PATCH /courses/:cid forwards the patch', async () => {
    const result = await controller.updateCourse(CID, { title: 'New' }, makeReq());
    expect(service.updateCourse).toHaveBeenCalledWith(CID, { title: 'New' });
    expect(result).toBeDefined();
  });

  it('DELETE /courses/:cid deletes the course', async () => {
    await controller.deleteCourse(CID);
    expect(service.deleteCourse).toHaveBeenCalledWith(CID);
  });

  it('POST /courses/:cid/modules creates a module', async () => {
    await controller.createModule(CID, { title: 'M' });
    expect(service.createModule).toHaveBeenCalledWith(CID, { title: 'M' });
  });

  it('PATCH /courses/:cid/modules/:mid updates a module', async () => {
    await controller.updateModule(CID, MID, { title: 'New' });
    expect(service.updateModule).toHaveBeenCalledWith(CID, MID, { title: 'New' });
  });

  it('DELETE /courses/:cid/modules/:mid deletes a module', async () => {
    await controller.deleteModule(CID, MID);
    expect(service.deleteModule).toHaveBeenCalledWith(CID, MID);
  });

  it('PUT /courses/:cid/modules/order reorders modules', async () => {
    await controller.reorderModules(CID, { ids: ['m1', 'm2'] });
    expect(service.reorderModules).toHaveBeenCalledWith(CID, ['m1', 'm2']);
  });

  it('POST /courses/:cid/modules/:mid/lessons creates a lesson', async () => {
    await controller.createLesson(CID, MID, { title: 'L' });
    expect(service.createLesson).toHaveBeenCalledWith(CID, MID, { title: 'L' });
  });

  it('PATCH /courses/:cid/modules/:mid/lessons/:lid updates a lesson', async () => {
    await controller.updateLesson(CID, MID, LID, { title: 'New' });
    expect(service.updateLesson).toHaveBeenCalledWith(CID, MID, LID, { title: 'New' });
  });

  it('DELETE /courses/:cid/modules/:mid/lessons/:lid deletes a lesson', async () => {
    await controller.deleteLesson(CID, MID, LID);
    expect(service.deleteLesson).toHaveBeenCalledWith(CID, MID, LID);
  });

  it('PUT /courses/:cid/modules/:mid/lessons/order reorders lessons', async () => {
    await controller.reorderLessons(CID, MID, { ids: ['l1', 'l2'] });
    expect(service.reorderLessons).toHaveBeenCalledWith(CID, MID, ['l1', 'l2']);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm nx test api-courses -- courses.controller.spec`
Expected: FAIL — controller does not exist.

- [ ] **Step 3: Implement the controller**

Create `libs/api-courses/src/lib/courses.controller.ts`:

```ts
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Req,
  UseFilters,
  UseGuards,
} from '@nestjs/common';

import { FirebaseSessionGuard } from '@learnwren/api-auth';
import type { AuthenticatedRequest } from '@learnwren/api-auth';
import type {
  Course,
  CourseId,
  Lesson,
  LessonId,
  Module,
  ModuleId,
} from '@learnwren/shared-data-models';

import { CourseOwnerGuard } from './course-owner.guard';
import { CoursesExceptionFilter } from './courses.exception-filter';
import { CoursesService } from './courses.service';
import { CreateCourseDto } from './dto/create-course.dto';
import { CreateLessonDto } from './dto/create-lesson.dto';
import { CreateModuleDto } from './dto/create-module.dto';
import { ReorderDto } from './dto/reorder.dto';
import { UpdateCourseDto } from './dto/update-course.dto';
import { UpdateLessonDto } from './dto/update-lesson.dto';
import { UpdateModuleDto } from './dto/update-module.dto';
import { InstructorRoleGuard } from './instructor-role.guard';
import type { CourseTree } from './types/loaded-course';

@Controller('courses')
@UseFilters(CoursesExceptionFilter)
@UseGuards(FirebaseSessionGuard, InstructorRoleGuard)
export class CoursesController {
  constructor(private readonly service: CoursesService) {}

  // ────────────────────────── Course ──────────────────────────

  @Post()
  async createCourse(
    @Body() dto: CreateCourseDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<Course> {
    return this.service.createCourse(req.user!.uid, dto);
  }

  @Get()
  async listCourses(@Req() req: AuthenticatedRequest): Promise<Course[]> {
    return this.service.listCoursesForInstructor(req.user!.uid);
  }

  @Get(':cid')
  @UseGuards(CourseOwnerGuard)
  async getCourse(@Param('cid') cid: CourseId): Promise<CourseTree> {
    return this.service.getCourseTree(cid);
  }

  @Patch(':cid')
  @UseGuards(CourseOwnerGuard)
  async updateCourse(
    @Param('cid') cid: CourseId,
    @Body() dto: UpdateCourseDto,
    @Req() _req: AuthenticatedRequest,
  ): Promise<{ ok: true }> {
    await this.service.updateCourse(cid, dto);
    return { ok: true };
  }

  @Delete(':cid')
  @HttpCode(204)
  @UseGuards(CourseOwnerGuard)
  async deleteCourse(@Param('cid') cid: CourseId): Promise<void> {
    await this.service.deleteCourse(cid);
  }

  // ────────────────────────── Module ──────────────────────────

  @Post(':cid/modules')
  @UseGuards(CourseOwnerGuard)
  async createModule(
    @Param('cid') cid: CourseId,
    @Body() dto: CreateModuleDto,
  ): Promise<Module> {
    return this.service.createModule(cid, dto);
  }

  @Patch(':cid/modules/:mid')
  @UseGuards(CourseOwnerGuard)
  async updateModule(
    @Param('cid') cid: CourseId,
    @Param('mid') mid: ModuleId,
    @Body() dto: UpdateModuleDto,
  ): Promise<{ ok: true }> {
    await this.service.updateModule(cid, mid, dto);
    return { ok: true };
  }

  @Delete(':cid/modules/:mid')
  @HttpCode(204)
  @UseGuards(CourseOwnerGuard)
  async deleteModule(
    @Param('cid') cid: CourseId,
    @Param('mid') mid: ModuleId,
  ): Promise<void> {
    await this.service.deleteModule(cid, mid);
  }

  @Put(':cid/modules/order')
  @UseGuards(CourseOwnerGuard)
  async reorderModules(
    @Param('cid') cid: CourseId,
    @Body() dto: ReorderDto,
  ): Promise<Module[]> {
    return this.service.reorderModules(cid, dto.ids as ModuleId[]);
  }

  // ────────────────────────── Lesson ──────────────────────────

  @Post(':cid/modules/:mid/lessons')
  @UseGuards(CourseOwnerGuard)
  async createLesson(
    @Param('cid') cid: CourseId,
    @Param('mid') mid: ModuleId,
    @Body() dto: CreateLessonDto,
  ): Promise<Lesson> {
    return this.service.createLesson(cid, mid, dto);
  }

  @Patch(':cid/modules/:mid/lessons/:lid')
  @UseGuards(CourseOwnerGuard)
  async updateLesson(
    @Param('cid') cid: CourseId,
    @Param('mid') mid: ModuleId,
    @Param('lid') lid: LessonId,
    @Body() dto: UpdateLessonDto,
  ): Promise<{ ok: true }> {
    await this.service.updateLesson(cid, mid, lid, dto);
    return { ok: true };
  }

  @Delete(':cid/modules/:mid/lessons/:lid')
  @HttpCode(204)
  @UseGuards(CourseOwnerGuard)
  async deleteLesson(
    @Param('cid') cid: CourseId,
    @Param('mid') mid: ModuleId,
    @Param('lid') lid: LessonId,
  ): Promise<void> {
    await this.service.deleteLesson(cid, mid, lid);
  }

  @Put(':cid/modules/:mid/lessons/order')
  @UseGuards(CourseOwnerGuard)
  async reorderLessons(
    @Param('cid') cid: CourseId,
    @Param('mid') mid: ModuleId,
    @Body() dto: ReorderDto,
  ): Promise<Lesson[]> {
    return this.service.reorderLessons(cid, mid, dto.ids as LessonId[]);
  }
}
```

- [ ] **Step 4: Run tests — should pass**

Run: `pnpm nx test api-courses -- courses.controller.spec`
Expected: PASS for all controller cases.

- [ ] **Step 5: Commit**

```bash
git add libs/api-courses/src/lib/courses.controller.ts libs/api-courses/src/lib/courses.controller.spec.ts
git commit -m "feat(api-courses): CoursesController endpoints for course/module/lesson"
```

---

## Task 14: CoursesModule + wire into AppModule

**Files:**
- Modify: `libs/api-courses/src/lib/courses.module.ts`
- Modify: `libs/api-courses/src/index.ts`
- Modify: `apps/api/src/app/app.module.ts`

- [ ] **Step 1: Wire the module providers**

Replace `libs/api-courses/src/lib/courses.module.ts` with:

```ts
import { Module } from '@nestjs/common';

import { AuthModule } from '@learnwren/api-auth';

import { CourseOwnerGuard } from './course-owner.guard';
import { CoursesController } from './courses.controller';
import { CoursesExceptionFilter } from './courses.exception-filter';
import { CoursesRepository } from './courses.repository';
import { CoursesService } from './courses.service';
import { InstructorRoleGuard } from './instructor-role.guard';

@Module({
  imports: [AuthModule],
  controllers: [CoursesController],
  providers: [
    CoursesService,
    CoursesRepository,
    CoursesExceptionFilter,
    InstructorRoleGuard,
    CourseOwnerGuard,
  ],
})
export class CoursesModule {}
```

- [ ] **Step 2: Update the lib barrel**

Replace `libs/api-courses/src/index.ts` with:

```ts
export { CoursesModule } from './lib/courses.module';
```

- [ ] **Step 3: Add CoursesModule to AppModule**

Open `apps/api/src/app/app.module.ts`. Add the import and include it in `imports`:

```ts
import { CoursesModule } from '@learnwren/api-courses';
```

And update the `@Module({ imports: [...] })` line:

```ts
imports: [FirebaseAdminModule.forRoot(), AuthModule, CoursesModule],
```

- [ ] **Step 4: Build and lint**

Run: `pnpm nx run-many -t build typecheck lint -p api,api-courses,api-auth,api-firebase`
Expected: PASS.

- [ ] **Step 5: Smoke-start the API and curl the unauth path**

In one shell:

```bash
pnpm nx serve api
```

Wait for `Listening on http://localhost:3333/api`.

In another shell:

```bash
curl -sS -o /dev/null -w '%{http_code}\n' http://localhost:3333/api/courses
```

Expected: `401` (no session cookie).

Stop the API (`Ctrl+C`).

- [ ] **Step 6: Commit**

```bash
git add libs/api-courses/src/lib/courses.module.ts libs/api-courses/src/index.ts apps/api/src/app/app.module.ts
git commit -m "feat(api-courses): wire CoursesModule into AppModule"
```

---

## Task 15: Firestore rules tests — deny-all on courses tree

**Files:**
- Modify: `apps/api-e2e/src/firestore-rules.e2e-spec.ts`

- [ ] **Step 1: Add the failing rules tests**

Append at the bottom of `apps/api-e2e/src/firestore-rules.e2e-spec.ts` (before the file ends, but inside the same test module):

```ts
test('anonymous client cannot read /courses/{cid}', async () => {
  const ctx = testEnv.unauthenticatedContext();
  const ref = doc(ctx.firestore(), 'courses', 'cid-1');
  await assertFails(getDoc(ref));
});

test('STUDENT client cannot read /courses/{cid}', async () => {
  const ctx = testEnv.authenticatedContext('uid-student', { role: 'STUDENT' });
  const ref = doc(ctx.firestore(), 'courses', 'cid-1');
  await assertFails(getDoc(ref));
});

test('INSTRUCTOR client cannot read /courses/{cid} (server-only path)', async () => {
  const ctx = testEnv.authenticatedContext('uid-instructor', { role: 'INSTRUCTOR' });
  const ref = doc(ctx.firestore(), 'courses', 'cid-1');
  await assertFails(getDoc(ref));
});

test('INSTRUCTOR client cannot write /courses/{cid}', async () => {
  const ctx = testEnv.authenticatedContext('uid-instructor', { role: 'INSTRUCTOR' });
  const ref = doc(ctx.firestore(), 'courses', 'cid-1');
  await assertFails(setDoc(ref, { title: 'X' }));
});

test('INSTRUCTOR client cannot read /courses/{cid}/modules/{mid}', async () => {
  const ctx = testEnv.authenticatedContext('uid-instructor', { role: 'INSTRUCTOR' });
  const ref = doc(ctx.firestore(), 'courses/cid-1/modules/mid-1');
  await assertFails(getDoc(ref));
});

test('INSTRUCTOR client cannot read /courses/{cid}/modules/{mid}/lessons/{lid}', async () => {
  const ctx = testEnv.authenticatedContext('uid-instructor', { role: 'INSTRUCTOR' });
  const ref = doc(ctx.firestore(), 'courses/cid-1/modules/mid-1/lessons/lid-1');
  await assertFails(getDoc(ref));
});

test('a privileged context (rules disabled) can seed a course doc for fixture setup', async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const ref = doc(ctx.firestore(), 'courses/cid-seed');
    await assertSucceeds(setDoc(ref, { title: 'seed' }));
  });
});
```

- [ ] **Step 2: Run the rules tests**

Run: `pnpm nx e2e api-e2e -- --grep "courses"`
Expected: PASS for all seven new tests.

- [ ] **Step 3: Commit**

```bash
git add apps/api-e2e/src/firestore-rules.e2e-spec.ts
git commit -m "test(rules): deny-all assertions for courses/modules/lessons subcollections"
```

---

## Task 16: API e2e — full course-authoring lifecycle

**Files:**
- Create: `apps/api-e2e/src/courses.e2e-spec.ts`

- [ ] **Step 1: Create the e2e spec**

Create `apps/api-e2e/src/courses.e2e-spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import * as admin from 'firebase-admin';

const API_BASE = 'http://localhost:3333/api';

if (admin.apps.length === 0) {
  process.env['FIREBASE_AUTH_EMULATOR_HOST'] = '127.0.0.1:9099';
  process.env['FIRESTORE_EMULATOR_HOST'] = '127.0.0.1:8080';
  admin.initializeApp({ projectId: 'demo-learnwren' });
}

const uniqueEmail = () =>
  `courses-e2e-${Date.now()}-${Math.floor(Math.random() * 1000)}@example.com`;

interface SessionContext {
  uid: string;
  cookieHeader: string;
}

/** Register a STUDENT, mark verified, then promote to INSTRUCTOR and re-mint the session cookie. */
async function registerAndPromoteInstructor(
  request: import('@playwright/test').APIRequestContext,
): Promise<SessionContext> {
  const email = uniqueEmail();
  const password = 'Aa1!aaaaaaaa';
  const reg = await request.post(`${API_BASE}/auth/register`, {
    data: { email, password, displayName: 'I' },
  });
  expect(reg.status()).toBe(201);
  const { uid } = (await reg.json()) as { uid: string };

  // Mark verified + promote to INSTRUCTOR via Admin SDK
  await admin.auth().updateUser(uid, { emailVerified: true });
  await admin.auth().setCustomUserClaims(uid, { role: 'INSTRUCTOR' });
  await admin.firestore().collection('users').doc(uid).update({ role: 'INSTRUCTOR' });

  // Log in to get a fresh session cookie with the new claim
  const login = await request.post(`${API_BASE}/auth/login`, {
    data: { email, password },
  });
  expect(login.status()).toBe(200);
  const setCookie = login.headers()['set-cookie'];
  const match = setCookie!.match(/__session=([^;]+)/);
  expect(match).not.toBeNull();
  const cookieHeader = `__session=${match![1]}`;
  return { uid, cookieHeader };
}

async function registerStudent(
  request: import('@playwright/test').APIRequestContext,
): Promise<SessionContext> {
  const email = uniqueEmail();
  const password = 'Aa1!aaaaaaaa';
  const reg = await request.post(`${API_BASE}/auth/register`, {
    data: { email, password, displayName: 'S' },
  });
  expect(reg.status()).toBe(201);
  const { uid } = (await reg.json()) as { uid: string };
  const setCookie = reg.headers()['set-cookie'];
  const match = setCookie!.match(/__session=([^;]+)/);
  return { uid, cookieHeader: `__session=${match![1]}` };
}

test('full lifecycle: instructor creates course, modules, lessons, reorders, deletes', async ({
  request,
}) => {
  const instructor = await registerAndPromoteInstructor(request);
  const hdr = { Cookie: instructor.cookieHeader };

  // Create a course
  const create = await request.post(`${API_BASE}/courses`, {
    headers: hdr,
    data: { title: 'TS Intro', description: 'Short intro to TypeScript.' },
  });
  expect(create.status()).toBe(201);
  const course = await create.json();
  expect(course.status).toBe('DRAFT');
  expect(course.instructorId).toBe(instructor.uid);

  // List shows the new course
  const list = await request.get(`${API_BASE}/courses`, { headers: hdr });
  expect(list.status()).toBe(200);
  const items = await list.json();
  expect(items).toEqual(expect.arrayContaining([expect.objectContaining({ id: course.id })]));

  // Add two modules
  const m1 = await request.post(`${API_BASE}/courses/${course.id}/modules`, {
    headers: hdr,
    data: { title: 'Module A' },
  });
  expect(m1.status()).toBe(201);
  const moduleA = await m1.json();
  expect(moduleA.order).toBe(0);

  const m2 = await request.post(`${API_BASE}/courses/${course.id}/modules`, {
    headers: hdr,
    data: { title: 'Module B' },
  });
  const moduleB = await m2.json();
  expect(moduleB.order).toBe(1);

  // Add lessons to module A
  const l1 = await request.post(`${API_BASE}/courses/${course.id}/modules/${moduleA.id}/lessons`, {
    headers: hdr,
    data: { title: 'Hello' },
  });
  expect(l1.status()).toBe(201);
  const lessonA1 = await l1.json();
  expect(lessonA1.order).toBe(0);

  const l2 = await request.post(`${API_BASE}/courses/${course.id}/modules/${moduleA.id}/lessons`, {
    headers: hdr,
    data: { title: 'World', description: 'second' },
  });
  const lessonA2 = await l2.json();
  expect(lessonA2.order).toBe(1);

  // Reorder modules: B before A
  const reorderModules = await request.put(`${API_BASE}/courses/${course.id}/modules/order`, {
    headers: hdr,
    data: { ids: [moduleB.id, moduleA.id] },
  });
  expect(reorderModules.status()).toBe(200);

  // Reorder lessons in module A: A2 before A1
  const reorderLessons = await request.put(
    `${API_BASE}/courses/${course.id}/modules/${moduleA.id}/lessons/order`,
    { headers: hdr, data: { ids: [lessonA2.id, lessonA1.id] } },
  );
  expect(reorderLessons.status()).toBe(200);

  // Hydrated tree reflects the new orders
  const tree = await request.get(`${API_BASE}/courses/${course.id}`, { headers: hdr });
  expect(tree.status()).toBe(200);
  const treeBody = await tree.json();
  expect(treeBody.modules[0].module.id).toBe(moduleB.id);
  expect(treeBody.modules[1].module.id).toBe(moduleA.id);
  expect(treeBody.modules[1].lessons[0].id).toBe(lessonA2.id);
  expect(treeBody.modules[1].lessons[1].id).toBe(lessonA1.id);

  // Rename module A
  const renameModule = await request.patch(
    `${API_BASE}/courses/${course.id}/modules/${moduleA.id}`,
    { headers: hdr, data: { title: 'Module A (renamed)' } },
  );
  expect(renameModule.status()).toBe(200);

  // Update course
  const updateCourse = await request.patch(`${API_BASE}/courses/${course.id}`, {
    headers: hdr,
    data: { title: 'TS Intro (rev)', category: 'PROGRAMMING', difficulty: 'BEGINNER' },
  });
  expect(updateCourse.status()).toBe(200);

  // Delete a lesson
  const delLesson = await request.delete(
    `${API_BASE}/courses/${course.id}/modules/${moduleA.id}/lessons/${lessonA1.id}`,
    { headers: hdr },
  );
  expect(delLesson.status()).toBe(204);

  // Delete a module (cascades remaining lessons)
  const delModule = await request.delete(
    `${API_BASE}/courses/${course.id}/modules/${moduleA.id}`,
    { headers: hdr },
  );
  expect(delModule.status()).toBe(204);

  // Delete the course (cascades remaining module)
  const delCourse = await request.delete(`${API_BASE}/courses/${course.id}`, { headers: hdr });
  expect(delCourse.status()).toBe(204);

  // After delete, GET returns 404
  const after = await request.get(`${API_BASE}/courses/${course.id}`, { headers: hdr });
  expect(after.status()).toBe(404);
});
```

- [ ] **Step 2: Run the spec against the emulator**

Boot the emulator if not already running:

```bash
pnpm emulators
```

In another shell:

```bash
pnpm nx e2e api-e2e -- --grep "full lifecycle"
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/api-e2e/src/courses.e2e-spec.ts
git commit -m "test(api-e2e): full course-authoring lifecycle"
```

---

## Task 17: API e2e — authorization and stale-reorder

**Files:**
- Modify: `apps/api-e2e/src/courses.e2e-spec.ts`

- [ ] **Step 1: Add the failing authorization tests**

Append to `apps/api-e2e/src/courses.e2e-spec.ts`:

```ts
test('STUDENT gets 403 INSUFFICIENT_ROLE on POST /courses', async ({ request }) => {
  const student = await registerStudent(request);
  const res = await request.post(`${API_BASE}/courses`, {
    headers: { Cookie: student.cookieHeader },
    data: { title: 'X', description: 'Y' },
  });
  expect(res.status()).toBe(403);
  const body = await res.json();
  expect(body.error.code).toBe('INSUFFICIENT_ROLE');
});

test('unauthenticated request gets 401', async ({ request }) => {
  const res = await request.get(`${API_BASE}/courses`);
  expect(res.status()).toBe(401);
});

test('instructor B cannot access instructor A’s course (403 NOT_COURSE_OWNER)', async ({
  request,
}) => {
  const a = await registerAndPromoteInstructor(request);
  const b = await registerAndPromoteInstructor(request);

  const create = await request.post(`${API_BASE}/courses`, {
    headers: { Cookie: a.cookieHeader },
    data: { title: 'A-owned', description: 'D' },
  });
  const course = await create.json();

  const get = await request.get(`${API_BASE}/courses/${course.id}`, {
    headers: { Cookie: b.cookieHeader },
  });
  expect(get.status()).toBe(403);
  const body = await get.json();
  expect(body.error.code).toBe('NOT_COURSE_OWNER');
});

test('stale reorder returns 409 STALE_REORDER', async ({ request }) => {
  const i = await registerAndPromoteInstructor(request);
  const hdr = { Cookie: i.cookieHeader };

  const c = await request.post(`${API_BASE}/courses`, {
    headers: hdr,
    data: { title: 'C', description: 'D' },
  });
  const course = await c.json();
  const m1 = await (
    await request.post(`${API_BASE}/courses/${course.id}/modules`, { headers: hdr, data: { title: 'A' } })
  ).json();
  const m2 = await (
    await request.post(`${API_BASE}/courses/${course.id}/modules`, { headers: hdr, data: { title: 'B' } })
  ).json();

  // Stale: only one of two ids
  const res = await request.put(`${API_BASE}/courses/${course.id}/modules/order`, {
    headers: hdr,
    data: { ids: [m1.id] },
  });
  expect(res.status()).toBe(409);
  const body = await res.json();
  expect(body.error.code).toBe('STALE_REORDER');

  // Stale: foreign id
  const res2 = await request.put(`${API_BASE}/courses/${course.id}/modules/order`, {
    headers: hdr,
    data: { ids: [m1.id, m2.id, 'mid-stranger'] },
  });
  expect(res2.status()).toBe(409);
});

test('GET on non-existent course returns 404', async ({ request }) => {
  const i = await registerAndPromoteInstructor(request);
  const res = await request.get(`${API_BASE}/courses/cid-nonexistent`, {
    headers: { Cookie: i.cookieHeader },
  });
  expect(res.status()).toBe(404);
  const body = await res.json();
  expect(body.error.code).toBe('COURSE_NOT_FOUND');
});

test('validation: missing title returns 400 VALIDATION_FAILED', async ({ request }) => {
  const i = await registerAndPromoteInstructor(request);
  const res = await request.post(`${API_BASE}/courses`, {
    headers: { Cookie: i.cookieHeader },
    data: { description: 'no title' },
  });
  expect(res.status()).toBe(400);
  const body = await res.json();
  expect(body.error.code).toBe('VALIDATION_FAILED');
  expect(body.error.details?.fieldErrors).toBeTruthy();
});
```

- [ ] **Step 2: Run the new tests**

Run: `pnpm nx e2e api-e2e -- --grep "STUDENT|cannot access|stale|non-existent|VALIDATION_FAILED|unauthenticated"`
Expected: PASS for all six.

- [ ] **Step 3: Commit**

```bash
git add apps/api-e2e/src/courses.e2e-spec.ts
git commit -m "test(api-e2e): courses authorization, stale-reorder, 404, validation"
```

---

## Task 18: Generate `web-courses` lib

**Files:**
- Create: `libs/web-courses/**` (via generator)
- Modify: `tsconfig.base.json`

- [ ] **Step 1: Generate the Angular lib**

Run:

```bash
pnpm nx g @nx/angular:library --directory=libs/web-courses --name=web-courses --prefix=lib --standalone --skipTests=false --unitTestRunner=vitest --no-interactive
```

If the generator scaffolds a default component `web-courses.component.ts`, leave it in place for now — we will replace it with proper components in later tasks.

- [ ] **Step 2: Update the path map**

Open `tsconfig.base.json`. In `compilerOptions.paths`, add (after `@learnwren/web-auth`):

```json
      "@learnwren/web-courses": ["./libs/web-courses/src/index.ts"],
```

- [ ] **Step 3: Add CDK DragDrop to the workspace**

The drag-drop editor requires `@angular/cdk`. Check whether it's already installed:

```bash
node -e "console.log(require('./package.json').dependencies?.['@angular/cdk'] ?? 'missing')"
```

If `missing`, install:

```bash
pnpm add @angular/cdk@~21.2.0
```

(Pin to the Angular 21 line — the workspace uses Angular ~21.2.0 per `package.json`.)

- [ ] **Step 4: Run the empty lib's tests + typecheck**

Run: `pnpm nx test web-courses && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/web-courses tsconfig.base.json package.json pnpm-lock.yaml
git commit -m "feat(web-courses): scaffold Angular lib + add @angular/cdk for DragDrop"
```

---

## Task 19: web-courses `CoursesService` (HTTP client)

**Files:**
- Create: `libs/web-courses/src/lib/courses.service.ts`
- Create: `libs/web-courses/src/lib/types/api-error.ts`
- Test: `libs/web-courses/src/lib/courses.service.spec.ts`

- [ ] **Step 1: Define the error body type**

Create `libs/web-courses/src/lib/types/api-error.ts`:

```ts
export type CoursesApiErrorCode =
  | 'VALIDATION_FAILED'
  | 'INSUFFICIENT_ROLE'
  | 'NOT_COURSE_OWNER'
  | 'COURSE_NOT_FOUND'
  | 'MODULE_NOT_FOUND'
  | 'LESSON_NOT_FOUND'
  | 'STALE_REORDER'
  | 'INTERNAL';

export interface CoursesApiErrorBody {
  error: {
    code: CoursesApiErrorCode;
    message: string;
    details?: Record<string, unknown>;
  };
}
```

- [ ] **Step 2: Write the failing service test**

Create `libs/web-courses/src/lib/courses.service.spec.ts`:

```ts
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { CoursesService } from './courses.service';

const BASE = '/api/courses';

describe('CoursesService', () => {
  let service: CoursesService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        CoursesService,
      ],
    });
    service = TestBed.inject(CoursesService);
    http = TestBed.inject(HttpTestingController);
  });

  it('createCourse POSTs to /api/courses', async () => {
    const promise = service.createCourse({ title: 'T', description: 'D' });
    const req = http.expectOne(BASE);
    expect(req.request.method).toBe('POST');
    req.flush({ id: 'cid-1', title: 'T', description: 'D' });
    await expect(promise).resolves.toEqual(expect.objectContaining({ id: 'cid-1' }));
  });

  it('listCourses GETs /api/courses', async () => {
    const promise = service.listCourses();
    const req = http.expectOne(BASE);
    expect(req.request.method).toBe('GET');
    req.flush([]);
    await expect(promise).resolves.toEqual([]);
  });

  it('getCourseTree GETs /api/courses/:cid', async () => {
    const promise = service.getCourseTree('cid-1');
    const req = http.expectOne(`${BASE}/cid-1`);
    expect(req.request.method).toBe('GET');
    req.flush({ course: { id: 'cid-1' }, modules: [] });
    await expect(promise).resolves.toEqual({ course: { id: 'cid-1' }, modules: [] });
  });

  it('updateCourse PATCHes /api/courses/:cid', async () => {
    const promise = service.updateCourse('cid-1', { title: 'X' });
    const req = http.expectOne(`${BASE}/cid-1`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ title: 'X' });
    req.flush({ ok: true });
    await promise;
  });

  it('deleteCourse DELETEs /api/courses/:cid', async () => {
    const promise = service.deleteCourse('cid-1');
    const req = http.expectOne(`${BASE}/cid-1`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
    await promise;
  });

  it('createModule POSTs to /api/courses/:cid/modules', async () => {
    const promise = service.createModule('cid-1', { title: 'M' });
    const req = http.expectOne(`${BASE}/cid-1/modules`);
    expect(req.request.method).toBe('POST');
    req.flush({ id: 'mid-1', title: 'M' });
    await promise;
  });

  it('reorderModules PUTs to /api/courses/:cid/modules/order with ids body', async () => {
    const promise = service.reorderModules('cid-1', ['a', 'b']);
    const req = http.expectOne(`${BASE}/cid-1/modules/order`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ ids: ['a', 'b'] });
    req.flush([]);
    await promise;
  });

  it('createLesson POSTs to /api/courses/:cid/modules/:mid/lessons', async () => {
    const promise = service.createLesson('cid-1', 'mid-1', { title: 'L' });
    const req = http.expectOne(`${BASE}/cid-1/modules/mid-1/lessons`);
    expect(req.request.method).toBe('POST');
    req.flush({ id: 'lid-1', title: 'L' });
    await promise;
  });

  it('reorderLessons PUTs to /api/courses/:cid/modules/:mid/lessons/order', async () => {
    const promise = service.reorderLessons('cid-1', 'mid-1', ['a', 'b']);
    const req = http.expectOne(`${BASE}/cid-1/modules/mid-1/lessons/order`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ ids: ['a', 'b'] });
    req.flush([]);
    await promise;
  });

  it('sets withCredentials so the session cookie is sent', async () => {
    const promise = service.listCourses();
    const req = http.expectOne(BASE);
    expect(req.request.withCredentials).toBe(true);
    req.flush([]);
    await promise;
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `pnpm nx test web-courses -- courses.service.spec`
Expected: FAIL — `courses.service` not found.

- [ ] **Step 4: Implement the service**

Create `libs/web-courses/src/lib/courses.service.ts`:

```ts
import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type {
  Course,
  CourseCategory,
  CourseDifficulty,
  Lesson,
  Module,
} from '@learnwren/shared-data-models';

const BASE = '/api/courses';
const OPTS = { withCredentials: true } as const;

export interface CreateCourseInput {
  title: string;
  description: string;
  longDescription?: string;
  category?: CourseCategory;
  difficulty?: CourseDifficulty;
}

export interface UpdateCourseInput {
  title?: string;
  description?: string;
  longDescription?: string;
  category?: CourseCategory;
  difficulty?: CourseDifficulty;
}

export interface CourseTree {
  course: Course;
  modules: Array<{ module: Module; lessons: Lesson[] }>;
}

@Injectable({ providedIn: 'root' })
export class CoursesService {
  private readonly http = inject(HttpClient);

  createCourse(input: CreateCourseInput): Promise<Course> {
    return firstValueFrom(this.http.post<Course>(BASE, input, OPTS));
  }

  listCourses(): Promise<Course[]> {
    return firstValueFrom(this.http.get<Course[]>(BASE, OPTS));
  }

  getCourseTree(cid: string): Promise<CourseTree> {
    return firstValueFrom(this.http.get<CourseTree>(`${BASE}/${cid}`, OPTS));
  }

  updateCourse(cid: string, patch: UpdateCourseInput): Promise<void> {
    return firstValueFrom(
      this.http.patch<void>(`${BASE}/${cid}`, patch, OPTS),
    );
  }

  deleteCourse(cid: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${BASE}/${cid}`, OPTS));
  }

  createModule(cid: string, input: { title: string }): Promise<Module> {
    return firstValueFrom(
      this.http.post<Module>(`${BASE}/${cid}/modules`, input, OPTS),
    );
  }

  updateModule(cid: string, mid: string, patch: { title: string }): Promise<void> {
    return firstValueFrom(
      this.http.patch<void>(`${BASE}/${cid}/modules/${mid}`, patch, OPTS),
    );
  }

  deleteModule(cid: string, mid: string): Promise<void> {
    return firstValueFrom(
      this.http.delete<void>(`${BASE}/${cid}/modules/${mid}`, OPTS),
    );
  }

  reorderModules(cid: string, ids: string[]): Promise<Module[]> {
    return firstValueFrom(
      this.http.put<Module[]>(`${BASE}/${cid}/modules/order`, { ids }, OPTS),
    );
  }

  createLesson(
    cid: string,
    mid: string,
    input: { title: string; description?: string },
  ): Promise<Lesson> {
    return firstValueFrom(
      this.http.post<Lesson>(`${BASE}/${cid}/modules/${mid}/lessons`, input, OPTS),
    );
  }

  updateLesson(
    cid: string,
    mid: string,
    lid: string,
    patch: { title?: string; description?: string },
  ): Promise<void> {
    return firstValueFrom(
      this.http.patch<void>(`${BASE}/${cid}/modules/${mid}/lessons/${lid}`, patch, OPTS),
    );
  }

  deleteLesson(cid: string, mid: string, lid: string): Promise<void> {
    return firstValueFrom(
      this.http.delete<void>(`${BASE}/${cid}/modules/${mid}/lessons/${lid}`, OPTS),
    );
  }

  reorderLessons(cid: string, mid: string, ids: string[]): Promise<Lesson[]> {
    return firstValueFrom(
      this.http.put<Lesson[]>(`${BASE}/${cid}/modules/${mid}/lessons/order`, { ids }, OPTS),
    );
  }
}
```

- [ ] **Step 5: Run tests — should pass**

Run: `pnpm nx test web-courses -- courses.service.spec`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add libs/web-courses/src/lib/courses.service.ts libs/web-courses/src/lib/courses.service.spec.ts libs/web-courses/src/lib/types
git commit -m "feat(web-courses): CoursesService HTTP wrapper"
```

---

## Task 20: web-courses `instructorRoleGuard`

**Files:**
- Create: `libs/web-courses/src/lib/instructor-role.guard.ts`
- Test: `libs/web-courses/src/lib/instructor-role.guard.spec.ts`

- [ ] **Step 1: Write the failing guard test**

Create `libs/web-courses/src/lib/instructor-role.guard.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { Router, type ActivatedRouteSnapshot, type RouterStateSnapshot } from '@angular/router';
import { signal } from '@angular/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthService } from '@learnwren/web-auth';

import { instructorRoleGuard } from './instructor-role.guard';

function runGuard(): unknown {
  const route = {} as ActivatedRouteSnapshot;
  const state = { url: '/courses' } as RouterStateSnapshot;
  return TestBed.runInInjectionContext(() => instructorRoleGuard(route, state));
}

describe('instructorRoleGuard', () => {
  let auth: { currentUser: ReturnType<typeof signal>; refresh: ReturnType<typeof vi.fn> };
  let router: { createUrlTree: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    auth = {
      currentUser: signal<{ role: string } | null | undefined>(undefined),
      refresh: vi.fn(async () => undefined),
    };
    router = { createUrlTree: vi.fn((path: string[]) => ({ __path: path })) };

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: auth },
        { provide: Router, useValue: router },
      ],
    });
  });

  it('allows INSTRUCTOR', async () => {
    auth.currentUser = signal({ role: 'INSTRUCTOR' }) as never;
    await expect(runGuard()).resolves.toBe(true);
  });

  it('redirects STUDENT to /', async () => {
    auth.currentUser = signal({ role: 'STUDENT' }) as never;
    const tree = await runGuard();
    expect(router.createUrlTree).toHaveBeenCalledWith(['/']);
    expect(tree).toEqual({ __path: ['/'] });
  });

  it('redirects unauthenticated to /login with redirect query', async () => {
    auth.currentUser = signal(null) as never;
    const tree = await runGuard();
    expect(router.createUrlTree).toHaveBeenCalledWith(['/login'], {
      queryParams: { redirect: '/courses' },
    });
    expect(tree).toEqual(expect.objectContaining({ __path: ['/login'] }));
  });

  it('calls refresh() when currentUser is undefined, then re-evaluates', async () => {
    auth.refresh = vi.fn(async () => {
      auth.currentUser = signal({ role: 'INSTRUCTOR' }) as never;
    });
    await expect(runGuard()).resolves.toBe(true);
    expect(auth.refresh).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm nx test web-courses -- instructor-role.guard.spec`
Expected: FAIL.

- [ ] **Step 3: Implement the guard**

Create `libs/web-courses/src/lib/instructor-role.guard.ts`:

```ts
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthService } from '@learnwren/web-auth';

export const instructorRoleGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.currentUser() === undefined) {
    await auth.refresh();
  }

  const user = auth.currentUser();
  if (!user) {
    return router.createUrlTree(['/login'], {
      queryParams: { redirect: state.url },
    });
  }
  if (user.role !== 'INSTRUCTOR') {
    return router.createUrlTree(['/']);
  }
  return true;
};
```

- [ ] **Step 4: Run tests — should pass**

Run: `pnpm nx test web-courses -- instructor-role.guard.spec`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/web-courses/src/lib/instructor-role.guard.ts libs/web-courses/src/lib/instructor-role.guard.spec.ts
git commit -m "feat(web-courses): instructorRoleGuard"
```

---

## Task 21: ConfirmDialogComponent (shared)

**Files:**
- Create: `libs/web-courses/src/lib/components/confirm-dialog/confirm-dialog.component.ts`
- Create: `libs/web-courses/src/lib/components/confirm-dialog/confirm-dialog.component.html`
- Test: `libs/web-courses/src/lib/components/confirm-dialog/confirm-dialog.component.spec.ts`

- [ ] **Step 1: Write the failing component test**

Create `libs/web-courses/src/lib/components/confirm-dialog/confirm-dialog.component.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import { ConfirmDialogComponent } from './confirm-dialog.component';

describe('ConfirmDialogComponent', () => {
  function build(): { fixture: ReturnType<typeof TestBed.createComponent<ConfirmDialogComponent>>; cmp: ConfirmDialogComponent } {
    TestBed.configureTestingModule({ imports: [ConfirmDialogComponent] });
    const fixture = TestBed.createComponent(ConfirmDialogComponent);
    return { fixture, cmp: fixture.componentInstance };
  }

  it('renders the supplied message', () => {
    const { fixture, cmp } = build();
    fixture.componentRef.setInput('message', 'Delete this lesson?');
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Delete this lesson?');
  });

  it('emits confirmed=true when Confirm is clicked', () => {
    const { fixture, cmp } = build();
    const spy = vi.spyOn(cmp.closed, 'emit');
    fixture.componentRef.setInput('message', 'Are you sure?');
    fixture.detectChanges();
    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('[data-testid="confirm"]')!
      .click();
    expect(spy).toHaveBeenCalledWith(true);
  });

  it('emits confirmed=false when Cancel is clicked', () => {
    const { fixture, cmp } = build();
    const spy = vi.spyOn(cmp.closed, 'emit');
    fixture.componentRef.setInput('message', 'Are you sure?');
    fixture.detectChanges();
    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('[data-testid="cancel"]')!
      .click();
    expect(spy).toHaveBeenCalledWith(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm nx test web-courses -- confirm-dialog`
Expected: FAIL.

- [ ] **Step 3: Implement the component**

Create `libs/web-courses/src/lib/components/confirm-dialog/confirm-dialog.component.ts`:

```ts
import { Component, EventEmitter, Output, input } from '@angular/core';

@Component({
  selector: 'lib-confirm-dialog',
  standalone: true,
  templateUrl: './confirm-dialog.component.html',
})
export class ConfirmDialogComponent {
  readonly message = input.required<string>();
  readonly confirmLabel = input<string>('Delete');
  readonly cancelLabel = input<string>('Cancel');
  @Output() readonly closed = new EventEmitter<boolean>();
}
```

Create `libs/web-courses/src/lib/components/confirm-dialog/confirm-dialog.component.html`:

```html
<div role="dialog" aria-modal="true" data-testid="confirm-dialog">
  <p>{{ message() }}</p>
  <div>
    <button type="button" data-testid="cancel" (click)="closed.emit(false)">{{ cancelLabel() }}</button>
    <button type="button" data-testid="confirm" (click)="closed.emit(true)">{{ confirmLabel() }}</button>
  </div>
</div>
```

- [ ] **Step 4: Run tests — should pass**

Run: `pnpm nx test web-courses -- confirm-dialog`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/web-courses/src/lib/components/confirm-dialog
git commit -m "feat(web-courses): ConfirmDialogComponent (shared)"
```

---

## Task 22: CoursesListPageComponent

**Files:**
- Create: `libs/web-courses/src/lib/courses-list-page/courses-list-page.component.ts`
- Create: `libs/web-courses/src/lib/courses-list-page/courses-list-page.component.html`
- Test: `libs/web-courses/src/lib/courses-list-page/courses-list-page.component.spec.ts`

- [ ] **Step 1: Write the failing component test**

Create `libs/web-courses/src/lib/courses-list-page/courses-list-page.component.spec.ts`:

```ts
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';

import { CoursesListPageComponent } from './courses-list-page.component';

describe('CoursesListPageComponent', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [CoursesListPageComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
  });

  it('renders the empty state when there are no courses', async () => {
    const fixture = TestBed.createComponent(CoursesListPageComponent);
    fixture.detectChanges();
    http.expectOne('/api/courses').flush([]);
    await fixture.whenStable();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('No courses yet');
  });

  it('renders course titles when the list is non-empty', async () => {
    const fixture = TestBed.createComponent(CoursesListPageComponent);
    fixture.detectChanges();
    http.expectOne('/api/courses').flush([
      { id: 'cid-1', title: 'Course One', description: 'D', status: 'DRAFT' },
      { id: 'cid-2', title: 'Course Two', description: 'D', status: 'DRAFT' },
    ]);
    await fixture.whenStable();
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Course One');
    expect(text).toContain('Course Two');
  });

  it('renders a Create Course link', () => {
    const fixture = TestBed.createComponent(CoursesListPageComponent);
    fixture.detectChanges();
    http.expectOne('/api/courses').flush([]);
    fixture.detectChanges();
    const anchor = (fixture.nativeElement as HTMLElement).querySelector<HTMLAnchorElement>(
      '[data-testid="create-course"]',
    );
    expect(anchor).not.toBeNull();
    expect(anchor!.getAttribute('routerLink')).toBe('/courses/new');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm nx test web-courses -- courses-list-page`
Expected: FAIL.

- [ ] **Step 3: Implement the component**

Create `libs/web-courses/src/lib/courses-list-page/courses-list-page.component.ts`:

```ts
import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import type { Course } from '@learnwren/shared-data-models';

import { CoursesService } from '../courses.service';

@Component({
  selector: 'lib-courses-list-page',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './courses-list-page.component.html',
})
export class CoursesListPageComponent {
  private readonly service = inject(CoursesService);
  readonly courses = signal<Course[] | null>(null);

  constructor() {
    this.refresh();
  }

  async refresh(): Promise<void> {
    this.courses.set(null);
    this.courses.set(await this.service.listCourses());
  }
}
```

Create `libs/web-courses/src/lib/courses-list-page/courses-list-page.component.html`:

```html
<header>
  <h1>My Courses</h1>
  <a data-testid="create-course" routerLink="/courses/new">Create Course</a>
</header>

@if (courses() === null) {
  <p>Loading…</p>
} @else if (courses()!.length === 0) {
  <p>No courses yet. Click "Create Course" to begin.</p>
} @else {
  <ul>
    @for (course of courses(); track course.id) {
      <li>
        <a [routerLink]="['/courses', course.id, 'edit']">{{ course.title }}</a>
      </li>
    }
  </ul>
}
```

- [ ] **Step 4: Run tests — should pass**

Run: `pnpm nx test web-courses -- courses-list-page`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/web-courses/src/lib/courses-list-page
git commit -m "feat(web-courses): CoursesListPageComponent with empty + populated states"
```

---

## Task 23: CourseCreatePageComponent

**Files:**
- Create: `libs/web-courses/src/lib/course-create-page/course-create-page.component.ts`
- Create: `libs/web-courses/src/lib/course-create-page/course-create-page.component.html`
- Test: `libs/web-courses/src/lib/course-create-page/course-create-page.component.spec.ts`

- [ ] **Step 1: Write the failing component test**

Create `libs/web-courses/src/lib/course-create-page/course-create-page.component.spec.ts`:

```ts
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CourseCreatePageComponent } from './course-create-page.component';

describe('CourseCreatePageComponent', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [CourseCreatePageComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
  });

  it('disables submit while form is invalid', () => {
    const fixture = TestBed.createComponent(CourseCreatePageComponent);
    fixture.detectChanges();
    const submit = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '[data-testid="submit"]',
    )!;
    expect(submit.disabled).toBe(true);
  });

  it('POSTs to /api/courses on submit and navigates to /courses/:id/edit', async () => {
    const router = TestBed.inject(Router);
    const navSpy = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    const fixture = TestBed.createComponent(CourseCreatePageComponent);
    fixture.detectChanges();
    const cmp = fixture.componentInstance;
    cmp.form.controls.title.setValue('Intro');
    cmp.form.controls.description.setValue('A short intro.');
    fixture.detectChanges();

    const submit = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '[data-testid="submit"]',
    )!;
    submit.click();

    const req = http.expectOne('/api/courses');
    expect(req.request.body).toEqual({ title: 'Intro', description: 'A short intro.' });
    req.flush({ id: 'cid-new' });
    await fixture.whenStable();
    expect(navSpy).toHaveBeenCalledWith('/courses/cid-new/edit');
  });

  it('shows VALIDATION_FAILED field errors when API returns 400', async () => {
    const fixture = TestBed.createComponent(CourseCreatePageComponent);
    fixture.detectChanges();
    const cmp = fixture.componentInstance;
    cmp.form.controls.title.setValue('T');
    cmp.form.controls.description.setValue('D');
    fixture.detectChanges();

    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('[data-testid="submit"]')!
      .click();

    const req = http.expectOne('/api/courses');
    req.flush(
      {
        error: {
          code: 'VALIDATION_FAILED',
          message: 'Bad',
          details: { fieldErrors: { title: ['title is too short'] } },
        },
      },
      { status: 400, statusText: 'Bad Request' },
    );
    await fixture.whenStable();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('title is too short');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm nx test web-courses -- course-create-page`
Expected: FAIL.

- [ ] **Step 3: Implement the component**

Create `libs/web-courses/src/lib/course-create-page/course-create-page.component.ts`:

```ts
import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import {
  COURSE_CATEGORIES,
  COURSE_DIFFICULTIES,
  type CourseCategory,
  type CourseDifficulty,
} from '@learnwren/shared-data-models';

import { CoursesService } from '../courses.service';
import type { CoursesApiErrorBody } from '../types/api-error';

@Component({
  selector: 'lib-course-create-page',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './course-create-page.component.html',
})
export class CourseCreatePageComponent {
  private readonly service = inject(CoursesService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  readonly categories = COURSE_CATEGORIES;
  readonly difficulties = COURSE_DIFFICULTIES;

  readonly form = this.fb.nonNullable.group({
    title: ['', [Validators.required, Validators.maxLength(100)]],
    description: ['', [Validators.required, Validators.maxLength(500)]],
    longDescription: [''],
    category: [''],
    difficulty: [''],
  });

  readonly busy = signal(false);
  readonly fieldErrors = signal<Record<string, string[]>>({});
  readonly genericError = signal<string | null>(null);

  async submit(): Promise<void> {
    if (this.form.invalid || this.busy()) return;
    this.busy.set(true);
    this.fieldErrors.set({});
    this.genericError.set(null);
    const v = this.form.getRawValue();
    const payload = {
      title: v.title.trim(),
      description: v.description.trim(),
      ...(v.longDescription ? { longDescription: v.longDescription.trim() } : {}),
      ...(v.category ? { category: v.category as CourseCategory } : {}),
      ...(v.difficulty ? { difficulty: v.difficulty as CourseDifficulty } : {}),
    };
    try {
      const course = await this.service.createCourse(payload);
      await this.router.navigateByUrl(`/courses/${course.id}/edit`);
    } catch (err) {
      if (err instanceof HttpErrorResponse) {
        const body = err.error as CoursesApiErrorBody;
        if (body?.error?.code === 'VALIDATION_FAILED') {
          this.fieldErrors.set(
            (body.error.details?.['fieldErrors'] as Record<string, string[]>) ?? {},
          );
        } else {
          this.genericError.set(body?.error?.message ?? 'Failed to create course.');
        }
      } else {
        this.genericError.set('Failed to create course.');
      }
    } finally {
      this.busy.set(false);
    }
  }
}
```

Create `libs/web-courses/src/lib/course-create-page/course-create-page.component.html`:

```html
<header>
  <h1>Create Course</h1>
  <a routerLink="/courses">Cancel</a>
</header>

<form [formGroup]="form" (ngSubmit)="submit()">
  <label>
    Title
    <input data-testid="title" formControlName="title" maxlength="100" />
  </label>
  @for (e of fieldErrors()['title'] ?? []; track e) {
    <p class="error">{{ e }}</p>
  }

  <label>
    Short description
    <textarea data-testid="description" formControlName="description" maxlength="500"></textarea>
  </label>
  @for (e of fieldErrors()['description'] ?? []; track e) {
    <p class="error">{{ e }}</p>
  }

  <label>
    Long description (optional)
    <textarea formControlName="longDescription" maxlength="5000"></textarea>
  </label>

  <label>
    Category (optional)
    <select formControlName="category">
      <option value="">—</option>
      @for (c of categories; track c) {
        <option [value]="c">{{ c }}</option>
      }
    </select>
  </label>

  <label>
    Difficulty (optional)
    <select formControlName="difficulty">
      <option value="">—</option>
      @for (d of difficulties; track d) {
        <option [value]="d">{{ d }}</option>
      }
    </select>
  </label>

  @if (genericError()) {
    <p class="error" data-testid="generic-error">{{ genericError() }}</p>
  }

  <button data-testid="submit" type="submit" [disabled]="form.invalid || busy()">
    {{ busy() ? 'Creating…' : 'Create' }}
  </button>
</form>
```

- [ ] **Step 4: Run tests — should pass**

Run: `pnpm nx test web-courses -- course-create-page`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/web-courses/src/lib/course-create-page
git commit -m "feat(web-courses): CourseCreatePageComponent with validation surfacing"
```

---

## Task 24: LessonItem + LessonList components (with drag-drop)

**Files:**
- Create: `libs/web-courses/src/lib/components/lesson-item/lesson-item.component.{ts,html}`
- Create: `libs/web-courses/src/lib/components/lesson-list/lesson-list.component.{ts,html}`
- Test: `libs/web-courses/src/lib/components/lesson-item/lesson-item.component.spec.ts`
- Test: `libs/web-courses/src/lib/components/lesson-list/lesson-list.component.spec.ts`

`LessonItem` shows a single lesson with inline rename and delete. `LessonList` wraps an array of lesson items in a `cdkDropList` for drag-drop reorder.

- [ ] **Step 1: Implement LessonItem**

Create `libs/web-courses/src/lib/components/lesson-item/lesson-item.component.ts`:

```ts
import { Component, EventEmitter, Output, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import type { Lesson } from '@learnwren/shared-data-models';

@Component({
  selector: 'lib-lesson-item',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './lesson-item.component.html',
})
export class LessonItemComponent {
  readonly lesson = input.required<Lesson>();
  @Output() readonly rename = new EventEmitter<string>();
  @Output() readonly delete = new EventEmitter<void>();

  readonly editing = signal(false);
  readonly draftTitle = signal('');

  startEdit(): void {
    this.draftTitle.set(this.lesson().title);
    this.editing.set(true);
  }

  commit(): void {
    const next = this.draftTitle().trim();
    if (next.length === 0 || next === this.lesson().title) {
      this.editing.set(false);
      return;
    }
    this.rename.emit(next);
    this.editing.set(false);
  }

  cancel(): void {
    this.editing.set(false);
  }
}
```

Create `libs/web-courses/src/lib/components/lesson-item/lesson-item.component.html`:

```html
<div class="lesson-item" data-testid="lesson-item">
  @if (editing()) {
    <input
      data-testid="lesson-rename-input"
      type="text"
      [ngModel]="draftTitle()"
      (ngModelChange)="draftTitle.set($event)"
      (blur)="commit()"
      (keydown.enter)="commit()"
      (keydown.escape)="cancel()"
      autofocus
    />
  } @else {
    <span data-testid="lesson-title" (click)="startEdit()">{{ lesson().title }}</span>
  }
  <button data-testid="lesson-delete" type="button" (click)="delete.emit()">Delete</button>
</div>
```

- [ ] **Step 2: Write LessonItem spec**

Create `libs/web-courses/src/lib/components/lesson-item/lesson-item.component.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import type { Lesson, LessonId, ModuleId } from '@learnwren/shared-data-models';

import { LessonItemComponent } from './lesson-item.component';

const LESSON: Lesson = {
  id: 'lid-1' as LessonId,
  moduleId: 'mid-1' as ModuleId,
  title: 'Hello',
  order: 0,
  createdAt: '2026-05-12T00:00:00.000Z' as Lesson['createdAt'],
  updatedAt: '2026-05-12T00:00:00.000Z' as Lesson['updatedAt'],
};

describe('LessonItemComponent', () => {
  function build(): ReturnType<typeof TestBed.createComponent<LessonItemComponent>> {
    TestBed.configureTestingModule({ imports: [LessonItemComponent] });
    const fixture = TestBed.createComponent(LessonItemComponent);
    fixture.componentRef.setInput('lesson', LESSON);
    fixture.detectChanges();
    return fixture;
  }

  it('renders the lesson title', () => {
    const fixture = build();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Hello');
  });

  it('emits rename on commit with a new non-empty title', () => {
    const fixture = build();
    const spy = vi.spyOn(fixture.componentInstance.rename, 'emit');
    fixture.componentInstance.startEdit();
    fixture.componentInstance.draftTitle.set('New name');
    fixture.componentInstance.commit();
    expect(spy).toHaveBeenCalledWith('New name');
  });

  it('does NOT emit rename when committed title is empty (reverts)', () => {
    const fixture = build();
    const spy = vi.spyOn(fixture.componentInstance.rename, 'emit');
    fixture.componentInstance.startEdit();
    fixture.componentInstance.draftTitle.set('');
    fixture.componentInstance.commit();
    expect(spy).not.toHaveBeenCalled();
  });

  it('emits delete when the delete button is clicked', () => {
    const fixture = build();
    const spy = vi.spyOn(fixture.componentInstance.delete, 'emit');
    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('[data-testid="lesson-delete"]')!
      .click();
    expect(spy).toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Implement LessonList**

Create `libs/web-courses/src/lib/components/lesson-list/lesson-list.component.ts`:

```ts
import {
  CdkDragDrop,
  CdkDrag,
  CdkDropList,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
import { Component, EventEmitter, Output, input } from '@angular/core';

import type { Lesson } from '@learnwren/shared-data-models';

import { LessonItemComponent } from '../lesson-item/lesson-item.component';

@Component({
  selector: 'lib-lesson-list',
  standalone: true,
  imports: [CdkDropList, CdkDrag, LessonItemComponent],
  templateUrl: './lesson-list.component.html',
})
export class LessonListComponent {
  readonly lessons = input.required<Lesson[]>();
  @Output() readonly reorder = new EventEmitter<string[]>();
  @Output() readonly renameLesson = new EventEmitter<{ lessonId: string; title: string }>();
  @Output() readonly deleteLesson = new EventEmitter<string>();

  onDrop(event: CdkDragDrop<Lesson[]>): void {
    if (event.previousIndex === event.currentIndex) return;
    const next = [...this.lessons()];
    moveItemInArray(next, event.previousIndex, event.currentIndex);
    this.reorder.emit(next.map((l) => l.id));
  }
}
```

Create `libs/web-courses/src/lib/components/lesson-list/lesson-list.component.html`:

```html
<ul cdkDropList (cdkDropListDropped)="onDrop($event)" data-testid="lesson-list">
  @for (lesson of lessons(); track lesson.id) {
    <li cdkDrag>
      <lib-lesson-item
        [lesson]="lesson"
        (rename)="renameLesson.emit({ lessonId: lesson.id, title: $event })"
        (delete)="deleteLesson.emit(lesson.id)"
      ></lib-lesson-item>
    </li>
  } @empty {
    <li class="empty">No lessons yet.</li>
  }
</ul>
```

- [ ] **Step 4: Write LessonList spec**

Create `libs/web-courses/src/lib/components/lesson-list/lesson-list.component.spec.ts`:

```ts
import { CdkDragDrop } from '@angular/cdk/drag-drop';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import type { Lesson, LessonId, ModuleId } from '@learnwren/shared-data-models';

import { LessonListComponent } from './lesson-list.component';

function lesson(id: string, order: number): Lesson {
  return {
    id: id as LessonId,
    moduleId: 'mid-1' as ModuleId,
    title: id,
    order,
    createdAt: '2026-05-12T00:00:00.000Z' as Lesson['createdAt'],
    updatedAt: '2026-05-12T00:00:00.000Z' as Lesson['updatedAt'],
  };
}

describe('LessonListComponent', () => {
  function build(items: Lesson[]): ReturnType<typeof TestBed.createComponent<LessonListComponent>> {
    TestBed.configureTestingModule({ imports: [LessonListComponent] });
    const fixture = TestBed.createComponent(LessonListComponent);
    fixture.componentRef.setInput('lessons', items);
    fixture.detectChanges();
    return fixture;
  }

  it('renders an empty state when there are no lessons', () => {
    const fixture = build([]);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('No lessons yet.');
  });

  it('emits reorder with the new id order on drop', () => {
    const fixture = build([lesson('a', 0), lesson('b', 1), lesson('c', 2)]);
    const spy = vi.spyOn(fixture.componentInstance.reorder, 'emit');
    fixture.componentInstance.onDrop({
      previousIndex: 0,
      currentIndex: 2,
    } as CdkDragDrop<Lesson[]>);
    expect(spy).toHaveBeenCalledWith(['b', 'c', 'a']);
  });

  it('does not emit reorder when previousIndex === currentIndex', () => {
    const fixture = build([lesson('a', 0), lesson('b', 1)]);
    const spy = vi.spyOn(fixture.componentInstance.reorder, 'emit');
    fixture.componentInstance.onDrop({
      previousIndex: 1,
      currentIndex: 1,
    } as CdkDragDrop<Lesson[]>);
    expect(spy).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 5: Run tests — should pass**

Run: `pnpm nx test web-courses -- lesson`
Expected: PASS for all lesson-item + lesson-list cases.

- [ ] **Step 6: Commit**

```bash
git add libs/web-courses/src/lib/components/lesson-item libs/web-courses/src/lib/components/lesson-list
git commit -m "feat(web-courses): LessonItem and LessonList components with drag-drop"
```

---

## Task 25: ModuleItem + ModuleTree components (with drag-drop)

**Files:**
- Create: `libs/web-courses/src/lib/components/module-item/module-item.component.{ts,html}`
- Create: `libs/web-courses/src/lib/components/module-tree/module-tree.component.{ts,html}`
- Test: `libs/web-courses/src/lib/components/module-item/module-item.component.spec.ts`
- Test: `libs/web-courses/src/lib/components/module-tree/module-tree.component.spec.ts`

`ModuleItem` shows one module with its lessons and "Add Lesson" button. `ModuleTree` is a `cdkDropList` of module items.

- [ ] **Step 1: Implement ModuleItem**

Create `libs/web-courses/src/lib/components/module-item/module-item.component.ts`:

```ts
import { Component, EventEmitter, Output, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import type { Lesson, Module } from '@learnwren/shared-data-models';

import { LessonListComponent } from '../lesson-list/lesson-list.component';

@Component({
  selector: 'lib-module-item',
  standalone: true,
  imports: [FormsModule, LessonListComponent],
  templateUrl: './module-item.component.html',
})
export class ModuleItemComponent {
  readonly module = input.required<Module>();
  readonly lessons = input.required<Lesson[]>();
  @Output() readonly renameModule = new EventEmitter<string>();
  @Output() readonly deleteModule = new EventEmitter<void>();
  @Output() readonly addLesson = new EventEmitter<string>();
  @Output() readonly renameLesson = new EventEmitter<{ lessonId: string; title: string }>();
  @Output() readonly deleteLesson = new EventEmitter<string>();
  @Output() readonly reorderLessons = new EventEmitter<string[]>();

  readonly editing = signal(false);
  readonly draftTitle = signal('');
  readonly addingLesson = signal(false);
  readonly newLessonTitle = signal('');

  startEdit(): void {
    this.draftTitle.set(this.module().title);
    this.editing.set(true);
  }

  commit(): void {
    const next = this.draftTitle().trim();
    if (next.length > 0 && next !== this.module().title) {
      this.renameModule.emit(next);
    }
    this.editing.set(false);
  }

  cancel(): void {
    this.editing.set(false);
  }

  beginAddLesson(): void {
    this.newLessonTitle.set('');
    this.addingLesson.set(true);
  }

  commitAddLesson(): void {
    const t = this.newLessonTitle().trim();
    if (t.length > 0) {
      this.addLesson.emit(t);
    }
    this.addingLesson.set(false);
  }
}
```

Create `libs/web-courses/src/lib/components/module-item/module-item.component.html`:

```html
<section class="module-item" data-testid="module-item">
  <header>
    @if (editing()) {
      <input
        data-testid="module-rename-input"
        type="text"
        [ngModel]="draftTitle()"
        (ngModelChange)="draftTitle.set($event)"
        (blur)="commit()"
        (keydown.enter)="commit()"
        (keydown.escape)="cancel()"
        autofocus
      />
    } @else {
      <h2 data-testid="module-title" (click)="startEdit()">{{ module().title }}</h2>
    }
    <button data-testid="module-delete" type="button" (click)="deleteModule.emit()">Delete module</button>
  </header>

  <lib-lesson-list
    [lessons]="lessons()"
    (reorder)="reorderLessons.emit($event)"
    (renameLesson)="renameLesson.emit($event)"
    (deleteLesson)="deleteLesson.emit($event)"
  ></lib-lesson-list>

  @if (addingLesson()) {
    <input
      data-testid="add-lesson-input"
      type="text"
      [ngModel]="newLessonTitle()"
      (ngModelChange)="newLessonTitle.set($event)"
      (blur)="commitAddLesson()"
      (keydown.enter)="commitAddLesson()"
      placeholder="New lesson title"
      autofocus
    />
  } @else {
    <button data-testid="add-lesson" type="button" (click)="beginAddLesson()">Add lesson</button>
  }
</section>
```

- [ ] **Step 2: ModuleItem spec**

Create `libs/web-courses/src/lib/components/module-item/module-item.component.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import type { Module, ModuleId, CourseId } from '@learnwren/shared-data-models';

import { ModuleItemComponent } from './module-item.component';

const M: Module = {
  id: 'mid-1' as ModuleId,
  courseId: 'cid-1' as CourseId,
  title: 'M1',
  order: 0,
  createdAt: '2026-05-12T00:00:00.000Z' as Module['createdAt'],
  updatedAt: '2026-05-12T00:00:00.000Z' as Module['updatedAt'],
};

describe('ModuleItemComponent', () => {
  function build(): ReturnType<typeof TestBed.createComponent<ModuleItemComponent>> {
    TestBed.configureTestingModule({ imports: [ModuleItemComponent] });
    const fixture = TestBed.createComponent(ModuleItemComponent);
    fixture.componentRef.setInput('module', M);
    fixture.componentRef.setInput('lessons', []);
    fixture.detectChanges();
    return fixture;
  }

  it('renders the module title', () => {
    const fixture = build();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('M1');
  });

  it('emits renameModule on commit', () => {
    const fixture = build();
    const spy = vi.spyOn(fixture.componentInstance.renameModule, 'emit');
    fixture.componentInstance.startEdit();
    fixture.componentInstance.draftTitle.set('Renamed');
    fixture.componentInstance.commit();
    expect(spy).toHaveBeenCalledWith('Renamed');
  });

  it('emits addLesson when a new lesson title is committed', () => {
    const fixture = build();
    const spy = vi.spyOn(fixture.componentInstance.addLesson, 'emit');
    fixture.componentInstance.beginAddLesson();
    fixture.componentInstance.newLessonTitle.set('New lesson');
    fixture.componentInstance.commitAddLesson();
    expect(spy).toHaveBeenCalledWith('New lesson');
  });

  it('emits deleteModule when the button is clicked', () => {
    const fixture = build();
    const spy = vi.spyOn(fixture.componentInstance.deleteModule, 'emit');
    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('[data-testid="module-delete"]')!
      .click();
    expect(spy).toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Implement ModuleTree**

Create `libs/web-courses/src/lib/components/module-tree/module-tree.component.ts`:

```ts
import {
  CdkDragDrop,
  CdkDrag,
  CdkDropList,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
import { Component, EventEmitter, Output, input } from '@angular/core';

import type { Lesson, Module } from '@learnwren/shared-data-models';

import { ModuleItemComponent } from '../module-item/module-item.component';

export interface ModuleNode {
  module: Module;
  lessons: Lesson[];
}

@Component({
  selector: 'lib-module-tree',
  standalone: true,
  imports: [CdkDropList, CdkDrag, ModuleItemComponent],
  templateUrl: './module-tree.component.html',
})
export class ModuleTreeComponent {
  readonly nodes = input.required<ModuleNode[]>();

  @Output() readonly reorderModules = new EventEmitter<string[]>();
  @Output() readonly renameModule = new EventEmitter<{ moduleId: string; title: string }>();
  @Output() readonly deleteModule = new EventEmitter<string>();
  @Output() readonly addLesson = new EventEmitter<{ moduleId: string; title: string }>();
  @Output() readonly renameLesson = new EventEmitter<{
    moduleId: string;
    lessonId: string;
    title: string;
  }>();
  @Output() readonly deleteLesson = new EventEmitter<{ moduleId: string; lessonId: string }>();
  @Output() readonly reorderLessons = new EventEmitter<{ moduleId: string; lessonIds: string[] }>();

  onDrop(event: CdkDragDrop<ModuleNode[]>): void {
    if (event.previousIndex === event.currentIndex) return;
    const next = [...this.nodes()];
    moveItemInArray(next, event.previousIndex, event.currentIndex);
    this.reorderModules.emit(next.map((n) => n.module.id));
  }
}
```

Create `libs/web-courses/src/lib/components/module-tree/module-tree.component.html`:

```html
<div cdkDropList (cdkDropListDropped)="onDrop($event)" data-testid="module-tree">
  @for (node of nodes(); track node.module.id) {
    <div cdkDrag>
      <lib-module-item
        [module]="node.module"
        [lessons]="node.lessons"
        (renameModule)="renameModule.emit({ moduleId: node.module.id, title: $event })"
        (deleteModule)="deleteModule.emit(node.module.id)"
        (addLesson)="addLesson.emit({ moduleId: node.module.id, title: $event })"
        (renameLesson)="renameLesson.emit({ moduleId: node.module.id, lessonId: $event.lessonId, title: $event.title })"
        (deleteLesson)="deleteLesson.emit({ moduleId: node.module.id, lessonId: $event })"
        (reorderLessons)="reorderLessons.emit({ moduleId: node.module.id, lessonIds: $event })"
      ></lib-module-item>
    </div>
  } @empty {
    <p class="empty">No modules yet. Click "Add Module" to begin.</p>
  }
</div>
```

- [ ] **Step 4: ModuleTree spec**

Create `libs/web-courses/src/lib/components/module-tree/module-tree.component.spec.ts`:

```ts
import { CdkDragDrop } from '@angular/cdk/drag-drop';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import type { Module, ModuleId, CourseId } from '@learnwren/shared-data-models';

import { ModuleTreeComponent, type ModuleNode } from './module-tree.component';

function node(id: string): ModuleNode {
  const m: Module = {
    id: id as ModuleId,
    courseId: 'cid-1' as CourseId,
    title: id,
    order: 0,
    createdAt: '2026-05-12T00:00:00.000Z' as Module['createdAt'],
    updatedAt: '2026-05-12T00:00:00.000Z' as Module['updatedAt'],
  };
  return { module: m, lessons: [] };
}

describe('ModuleTreeComponent', () => {
  it('shows the empty state when there are no nodes', () => {
    TestBed.configureTestingModule({ imports: [ModuleTreeComponent] });
    const fixture = TestBed.createComponent(ModuleTreeComponent);
    fixture.componentRef.setInput('nodes', []);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('No modules yet');
  });

  it('emits reorderModules with the new id order on drop', () => {
    TestBed.configureTestingModule({ imports: [ModuleTreeComponent] });
    const fixture = TestBed.createComponent(ModuleTreeComponent);
    fixture.componentRef.setInput('nodes', [node('a'), node('b'), node('c')]);
    fixture.detectChanges();
    const spy = vi.spyOn(fixture.componentInstance.reorderModules, 'emit');
    fixture.componentInstance.onDrop({
      previousIndex: 2,
      currentIndex: 0,
    } as CdkDragDrop<ModuleNode[]>);
    expect(spy).toHaveBeenCalledWith(['c', 'a', 'b']);
  });
});
```

- [ ] **Step 5: Run tests — should pass**

Run: `pnpm nx test web-courses -- module`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add libs/web-courses/src/lib/components/module-item libs/web-courses/src/lib/components/module-tree
git commit -m "feat(web-courses): ModuleItem and ModuleTree components with drag-drop"
```

---

## Task 26: CourseMetaPanel + CourseEditor (assembly)

**Files:**
- Create: `libs/web-courses/src/lib/components/course-meta-panel/course-meta-panel.component.{ts,html}`
- Create: `libs/web-courses/src/lib/course-editor-page/course-editor-page.component.{ts,html}`
- Test: `libs/web-courses/src/lib/components/course-meta-panel/course-meta-panel.component.spec.ts`
- Test: `libs/web-courses/src/lib/course-editor-page/course-editor-page.component.spec.ts`

`CourseMetaPanel` exposes inline edits of the course's title and description. `CourseEditorPage` is the top-level editor that loads the hydrated tree and wires all child components to the `CoursesService`.

- [ ] **Step 1: Implement CourseMetaPanel**

Create `libs/web-courses/src/lib/components/course-meta-panel/course-meta-panel.component.ts`:

```ts
import { Component, EventEmitter, Output, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import type { Course } from '@learnwren/shared-data-models';

import type { UpdateCourseInput } from '../../courses.service';

@Component({
  selector: 'lib-course-meta-panel',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './course-meta-panel.component.html',
})
export class CourseMetaPanelComponent {
  readonly course = input.required<Course>();
  @Output() readonly update = new EventEmitter<UpdateCourseInput>();
  @Output() readonly deleteCourse = new EventEmitter<void>();

  readonly draftTitle = signal('');
  readonly draftDescription = signal('');

  commitTitle(): void {
    const next = this.draftTitle().trim();
    if (next.length === 0 || next === this.course().title) return;
    this.update.emit({ title: next });
  }

  commitDescription(): void {
    const next = this.draftDescription().trim();
    if (next.length === 0 || next === this.course().description) return;
    this.update.emit({ description: next });
  }

  // initialise drafts when course changes — simple approach: bind on focus
  syncDrafts(): void {
    this.draftTitle.set(this.course().title);
    this.draftDescription.set(this.course().description);
  }
}
```

Create `libs/web-courses/src/lib/components/course-meta-panel/course-meta-panel.component.html`:

```html
<section class="course-meta" data-testid="course-meta">
  <label>
    Title
    <input
      data-testid="course-title"
      type="text"
      [ngModel]="draftTitle() || course().title"
      (focus)="syncDrafts()"
      (ngModelChange)="draftTitle.set($event)"
      (blur)="commitTitle()"
      maxlength="100"
    />
  </label>

  <label>
    Description
    <textarea
      data-testid="course-description"
      [ngModel]="draftDescription() || course().description"
      (focus)="syncDrafts()"
      (ngModelChange)="draftDescription.set($event)"
      (blur)="commitDescription()"
      maxlength="500"
    ></textarea>
  </label>

  <button data-testid="delete-course" type="button" (click)="deleteCourse.emit()">
    Delete course
  </button>
</section>
```

- [ ] **Step 2: CourseMetaPanel spec**

Create `libs/web-courses/src/lib/components/course-meta-panel/course-meta-panel.component.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import type { Course, CourseId, UserId } from '@learnwren/shared-data-models';

import { CourseMetaPanelComponent } from './course-meta-panel.component';

const COURSE: Course = {
  id: 'cid-1' as CourseId,
  title: 'Original',
  description: 'D',
  instructorId: 'uid-1' as UserId,
  status: 'DRAFT',
  createdAt: '2026-05-12T00:00:00.000Z' as Course['createdAt'],
  updatedAt: '2026-05-12T00:00:00.000Z' as Course['updatedAt'],
};

describe('CourseMetaPanelComponent', () => {
  function build(): ReturnType<typeof TestBed.createComponent<CourseMetaPanelComponent>> {
    TestBed.configureTestingModule({ imports: [CourseMetaPanelComponent] });
    const fixture = TestBed.createComponent(CourseMetaPanelComponent);
    fixture.componentRef.setInput('course', COURSE);
    fixture.detectChanges();
    return fixture;
  }

  it('emits update with new title on blur after edit', () => {
    const fixture = build();
    const spy = vi.spyOn(fixture.componentInstance.update, 'emit');
    fixture.componentInstance.syncDrafts();
    fixture.componentInstance.draftTitle.set('New');
    fixture.componentInstance.commitTitle();
    expect(spy).toHaveBeenCalledWith({ title: 'New' });
  });

  it('does NOT emit update when title is unchanged', () => {
    const fixture = build();
    const spy = vi.spyOn(fixture.componentInstance.update, 'emit');
    fixture.componentInstance.syncDrafts();
    fixture.componentInstance.commitTitle();
    expect(spy).not.toHaveBeenCalled();
  });

  it('emits deleteCourse on button click', () => {
    const fixture = build();
    const spy = vi.spyOn(fixture.componentInstance.deleteCourse, 'emit');
    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('[data-testid="delete-course"]')!
      .click();
    expect(spy).toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Implement CourseEditorPage**

Create `libs/web-courses/src/lib/course-editor-page/course-editor-page.component.ts`:

```ts
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';

import type { Lesson, Module } from '@learnwren/shared-data-models';

import { ConfirmDialogComponent } from '../components/confirm-dialog/confirm-dialog.component';
import { CourseMetaPanelComponent } from '../components/course-meta-panel/course-meta-panel.component';
import { ModuleTreeComponent, type ModuleNode } from '../components/module-tree/module-tree.component';
import { CoursesService, type CourseTree, type UpdateCourseInput } from '../courses.service';

type PendingConfirm =
  | { kind: 'deleteCourse' }
  | { kind: 'deleteModule'; moduleId: string }
  | { kind: 'deleteLesson'; moduleId: string; lessonId: string };

@Component({
  selector: 'lib-course-editor-page',
  standalone: true,
  imports: [RouterLink, CourseMetaPanelComponent, ModuleTreeComponent, ConfirmDialogComponent],
  templateUrl: './course-editor-page.component.html',
})
export class CourseEditorPageComponent {
  private readonly service = inject(CoursesService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  private readonly paramMap = toSignal(this.route.paramMap);
  readonly cid = computed(() => this.paramMap()?.get('id') ?? '');
  readonly tree = signal<CourseTree | null>(null);
  readonly error = signal<string | null>(null);
  readonly pendingConfirm = signal<PendingConfirm | null>(null);

  readonly nodes = computed<ModuleNode[]>(() =>
    (this.tree()?.modules ?? []).map((m) => ({ module: m.module, lessons: m.lessons })),
  );

  constructor() {
    this.refresh();
  }

  async refresh(): Promise<void> {
    const cid = this.cid();
    if (!cid) return;
    try {
      this.tree.set(await this.service.getCourseTree(cid));
    } catch {
      this.error.set('Failed to load course.');
    }
  }

  async onUpdateCourse(patch: UpdateCourseInput): Promise<void> {
    try {
      await this.service.updateCourse(this.cid(), patch);
      await this.refresh();
    } catch {
      this.error.set('Failed to save changes — refresh to see current state.');
    }
  }

  requestDeleteCourse(): void {
    this.pendingConfirm.set({ kind: 'deleteCourse' });
  }

  requestDeleteModule(moduleId: string): void {
    this.pendingConfirm.set({ kind: 'deleteModule', moduleId });
  }

  requestDeleteLesson(args: { moduleId: string; lessonId: string }): void {
    this.pendingConfirm.set({ kind: 'deleteLesson', ...args });
  }

  async onConfirmClosed(confirmed: boolean): Promise<void> {
    const pending = this.pendingConfirm();
    this.pendingConfirm.set(null);
    if (!confirmed || !pending) return;
    try {
      if (pending.kind === 'deleteCourse') {
        await this.service.deleteCourse(this.cid());
        await this.router.navigateByUrl('/courses');
        return;
      }
      if (pending.kind === 'deleteModule') {
        await this.service.deleteModule(this.cid(), pending.moduleId);
      } else {
        await this.service.deleteLesson(this.cid(), pending.moduleId, pending.lessonId);
      }
      await this.refresh();
    } catch {
      this.error.set('Delete failed — refresh to see current state.');
    }
  }

  async addModule(): Promise<void> {
    const title = window.prompt('Module title');
    if (!title) return;
    try {
      await this.service.createModule(this.cid(), { title });
      await this.refresh();
    } catch {
      this.error.set('Failed to add module.');
    }
  }

  async onRenameModule(args: { moduleId: string; title: string }): Promise<void> {
    try {
      await this.service.updateModule(this.cid(), args.moduleId, { title: args.title });
      await this.refresh();
    } catch {
      this.error.set('Failed to rename module.');
    }
  }

  async onAddLesson(args: { moduleId: string; title: string }): Promise<void> {
    try {
      await this.service.createLesson(this.cid(), args.moduleId, { title: args.title });
      await this.refresh();
    } catch {
      this.error.set('Failed to add lesson.');
    }
  }

  async onRenameLesson(args: { moduleId: string; lessonId: string; title: string }): Promise<void> {
    try {
      await this.service.updateLesson(this.cid(), args.moduleId, args.lessonId, {
        title: args.title,
      });
      await this.refresh();
    } catch {
      this.error.set('Failed to rename lesson.');
    }
  }

  async onReorderModules(ids: string[]): Promise<void> {
    const snapshot = this.tree();
    if (!snapshot) return;
    // optimistic
    this.tree.set({
      course: snapshot.course,
      modules: ids
        .map((id) => snapshot.modules.find((n) => n.module.id === id))
        .filter((n): n is { module: Module; lessons: Lesson[] } => Boolean(n)),
    });
    try {
      await this.service.reorderModules(this.cid(), ids);
    } catch {
      this.tree.set(snapshot); // revert
      this.error.set('Reorder failed — reverted.');
      await this.refresh();
    }
  }

  async onReorderLessons(args: { moduleId: string; lessonIds: string[] }): Promise<void> {
    const snapshot = this.tree();
    if (!snapshot) return;
    // optimistic
    this.tree.set({
      course: snapshot.course,
      modules: snapshot.modules.map((n) => {
        if (n.module.id !== args.moduleId) return n;
        const newLessons = args.lessonIds
          .map((id) => n.lessons.find((l) => l.id === id))
          .filter((l): l is Lesson => Boolean(l));
        return { module: n.module, lessons: newLessons };
      }),
    });
    try {
      await this.service.reorderLessons(this.cid(), args.moduleId, args.lessonIds);
    } catch {
      this.tree.set(snapshot);
      this.error.set('Reorder failed — reverted.');
      await this.refresh();
    }
  }

  confirmMessage(): string {
    const p = this.pendingConfirm();
    if (!p) return '';
    if (p.kind === 'deleteCourse')
      return 'Permanently delete this course and all its modules and lessons. This action cannot be undone.';
    if (p.kind === 'deleteModule')
      return 'This will permanently remove this module and all its lessons. This action cannot be undone.';
    return 'Delete this lesson? This action cannot be undone.';
  }
}
```

Create `libs/web-courses/src/lib/course-editor-page/course-editor-page.component.html`:

```html
<header>
  <a routerLink="/courses">← My Courses</a>
</header>

@if (tree() === null) {
  <p>Loading…</p>
} @else {
  <lib-course-meta-panel
    [course]="tree()!.course"
    (update)="onUpdateCourse($event)"
    (deleteCourse)="requestDeleteCourse()"
  ></lib-course-meta-panel>

  <button data-testid="add-module" type="button" (click)="addModule()">Add module</button>

  <lib-module-tree
    [nodes]="nodes()"
    (reorderModules)="onReorderModules($event)"
    (renameModule)="onRenameModule($event)"
    (deleteModule)="requestDeleteModule($event)"
    (addLesson)="onAddLesson($event)"
    (renameLesson)="onRenameLesson($event)"
    (deleteLesson)="requestDeleteLesson($event)"
    (reorderLessons)="onReorderLessons($event)"
  ></lib-module-tree>
}

@if (error()) {
  <p class="error" data-testid="editor-error" role="alert">{{ error() }}</p>
}

@if (pendingConfirm()) {
  <lib-confirm-dialog
    [message]="confirmMessage()"
    (closed)="onConfirmClosed($event)"
  ></lib-confirm-dialog>
}
```

- [ ] **Step 4: CourseEditor spec — focused on key flows**

Create `libs/web-courses/src/lib/course-editor-page/course-editor-page.component.spec.ts`:

```ts
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';

import { CourseEditorPageComponent } from './course-editor-page.component';

function buildTree(): unknown {
  return {
    course: {
      id: 'cid-1',
      title: 'T',
      description: 'D',
      instructorId: 'uid-1',
      status: 'DRAFT',
      createdAt: '2026-05-12T00:00:00.000Z',
      updatedAt: '2026-05-12T00:00:00.000Z',
    },
    modules: [
      {
        module: {
          id: 'mid-1',
          courseId: 'cid-1',
          title: 'M1',
          order: 0,
          createdAt: '2026-05-12T00:00:00.000Z',
          updatedAt: '2026-05-12T00:00:00.000Z',
        },
        lessons: [],
      },
    ],
  };
}

describe('CourseEditorPageComponent', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [CourseEditorPageComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: of(new Map([['id', 'cid-1']]) as unknown as import('@angular/router').ParamMap),
          },
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  it('loads the course tree on init', async () => {
    const fixture = TestBed.createComponent(CourseEditorPageComponent);
    fixture.detectChanges();
    const req = http.expectOne('/api/courses/cid-1');
    expect(req.request.method).toBe('GET');
    req.flush(buildTree());
    await fixture.whenStable();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('M1');
  });

  it('opens confirm dialog when delete module is requested', async () => {
    const fixture = TestBed.createComponent(CourseEditorPageComponent);
    fixture.detectChanges();
    http.expectOne('/api/courses/cid-1').flush(buildTree());
    await fixture.whenStable();
    fixture.detectChanges();

    fixture.componentInstance.requestDeleteModule('mid-1');
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'This will permanently remove this module',
    );
  });

  it('cancelling the confirm dialog leaves state unchanged', async () => {
    const fixture = TestBed.createComponent(CourseEditorPageComponent);
    fixture.detectChanges();
    http.expectOne('/api/courses/cid-1').flush(buildTree());
    await fixture.whenStable();

    fixture.componentInstance.requestDeleteModule('mid-1');
    await fixture.componentInstance.onConfirmClosed(false);
    expect(fixture.componentInstance.pendingConfirm()).toBeNull();
    http.expectNone((req) => req.method === 'DELETE');
  });

  it('confirming deleteModule sends a DELETE then refreshes', async () => {
    const fixture = TestBed.createComponent(CourseEditorPageComponent);
    fixture.detectChanges();
    http.expectOne('/api/courses/cid-1').flush(buildTree());
    await fixture.whenStable();

    fixture.componentInstance.requestDeleteModule('mid-1');
    const closing = fixture.componentInstance.onConfirmClosed(true);

    const del = http.expectOne('/api/courses/cid-1/modules/mid-1');
    expect(del.request.method).toBe('DELETE');
    del.flush(null, { status: 204, statusText: 'No Content' });

    const refresh = http.expectOne('/api/courses/cid-1');
    refresh.flush(buildTree());
    await closing;
  });

  it('onReorderModules makes the PUT request', async () => {
    const fixture = TestBed.createComponent(CourseEditorPageComponent);
    fixture.detectChanges();
    http.expectOne('/api/courses/cid-1').flush(buildTree());
    await fixture.whenStable();

    const pending = fixture.componentInstance.onReorderModules(['mid-1']);
    const req = http.expectOne('/api/courses/cid-1/modules/order');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ ids: ['mid-1'] });
    req.flush([]);
    await pending;
  });
});
```

- [ ] **Step 5: Run tests — should pass**

Run: `pnpm nx test web-courses -- course-meta-panel course-editor-page`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add libs/web-courses/src/lib/components/course-meta-panel libs/web-courses/src/lib/course-editor-page
git commit -m "feat(web-courses): CourseMetaPanel + CourseEditorPage assembly"
```

---

## Task 27: Wire web-courses routes and barrel exports

**Files:**
- Create: `libs/web-courses/src/lib/courses.routes.ts`
- Modify: `libs/web-courses/src/index.ts`
- Modify: `apps/web/src/app/app.routes.ts`

- [ ] **Step 1: Define the lib routes**

Create `libs/web-courses/src/lib/courses.routes.ts`:

```ts
import type { Route } from '@angular/router';

import { instructorRoleGuard } from './instructor-role.guard';

export const coursesRoutes: Route[] = [
  {
    path: 'courses',
    canMatch: [instructorRoleGuard],
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () =>
          import('./courses-list-page/courses-list-page.component').then(
            (m) => m.CoursesListPageComponent,
          ),
      },
      {
        path: 'new',
        loadComponent: () =>
          import('./course-create-page/course-create-page.component').then(
            (m) => m.CourseCreatePageComponent,
          ),
      },
      {
        path: ':id/edit',
        loadComponent: () =>
          import('./course-editor-page/course-editor-page.component').then(
            (m) => m.CourseEditorPageComponent,
          ),
      },
    ],
  },
];
```

- [ ] **Step 2: Replace the lib barrel**

Replace `libs/web-courses/src/index.ts` with:

```ts
export { coursesRoutes } from './lib/courses.routes';
export { instructorRoleGuard } from './lib/instructor-role.guard';
export { CoursesService } from './lib/courses.service';
export type { CourseTree, CreateCourseInput, UpdateCourseInput } from './lib/courses.service';
```

Delete any leftover scaffolded files from Task 18 (e.g., `libs/web-courses/src/lib/web-courses.component.ts` if it was generated):

```bash
rm -f libs/web-courses/src/lib/web-courses.component.ts libs/web-courses/src/lib/web-courses.component.spec.ts libs/web-courses/src/lib/web-courses.component.html
```

- [ ] **Step 3: Wire into app routes**

Open `apps/web/src/app/app.routes.ts`. Add the import and spread `coursesRoutes` into `appRoutes`:

```ts
import { Route } from '@angular/router';

import { authGuard } from '@learnwren/web-auth';
import { coursesRoutes } from '@learnwren/web-courses';

export const appRoutes: Route[] = [
  // ... existing routes (login, register, etc.) unchanged
  {
    path: 'dashboard',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./dashboard/dashboard.component').then((m) => m.DashboardComponent),
  },
  ...coursesRoutes,
  { path: '', pathMatch: 'full', redirectTo: '/login' },
];
```

(Keep the catch-all redirect at the end. The `coursesRoutes` array is inserted before it.)

- [ ] **Step 4: Build the web app**

Run: `pnpm nx build web`
Expected: PASS.

- [ ] **Step 5: Smoke-start the web app**

Run: `pnpm nx serve web` and open `http://localhost:4200/courses` in a browser. Expected: redirect to `/` (because no user is logged in / the guard runs). This is the correct gating behavior.

Stop the server (`Ctrl+C`).

- [ ] **Step 6: Commit**

```bash
git add libs/web-courses/src apps/web/src/app/app.routes.ts
git commit -m "feat(web-courses): routes + barrel exports; wire into app.routes"
```

---

## Task 28: web-e2e — instructor editor walk-through

**Files:**
- Create: `apps/web-e2e/src/courses.spec.ts`

The Playwright config for `web-e2e` already boots the web app at `:4200`. The API also needs to be running (`pnpm nx serve api`) along with the Firebase emulator (`pnpm emulators`). We use Admin SDK fixtures to seed the instructor user.

- [ ] **Step 1: Create the e2e spec**

Create `apps/web-e2e/src/courses.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import * as admin from 'firebase-admin';

if (admin.apps.length === 0) {
  process.env['FIREBASE_AUTH_EMULATOR_HOST'] = '127.0.0.1:9099';
  process.env['FIRESTORE_EMULATOR_HOST'] = '127.0.0.1:8080';
  admin.initializeApp({ projectId: 'demo-learnwren' });
}

const API_BASE = 'http://localhost:3333/api';

async function registerAndPromoteInstructor(): Promise<{ email: string; password: string }> {
  const email = `web-e2e-${Date.now()}@example.com`;
  const password = 'Aa1!aaaaaaaa';

  // Register via API (sets up the users/{uid} doc with role STUDENT)
  const reg = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, displayName: 'I' }),
  });
  expect(reg.status).toBe(201);
  const { uid } = (await reg.json()) as { uid: string };

  // Promote via Admin SDK
  await admin.auth().updateUser(uid, { emailVerified: true });
  await admin.auth().setCustomUserClaims(uid, { role: 'INSTRUCTOR' });
  await admin.firestore().collection('users').doc(uid).update({ role: 'INSTRUCTOR' });

  return { email, password };
}

test('instructor can create a course, add a module + lesson, rename, delete', async ({ page }) => {
  const { email, password } = await registerAndPromoteInstructor();

  // Log in via the web login page
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: /sign in|log in/i }).click();

  // Navigate to courses
  await page.goto('/courses');
  await expect(page.getByTestId('create-course')).toBeVisible();

  // Create a course
  await page.getByTestId('create-course').click();
  await page.getByTestId('title').fill('Web-e2e Course');
  await page.getByTestId('description').fill('Short.');
  await page.getByTestId('submit').click();

  // Editor loads
  await expect(page.getByTestId('course-meta')).toBeVisible({ timeout: 10_000 });

  // Add a module via the prompt — Playwright handles it via dialog event
  page.once('dialog', async (dialog) => {
    await dialog.accept('Module One');
  });
  await page.getByTestId('add-module').click();

  // Module appears
  await expect(page.getByTestId('module-title')).toHaveText('Module One', { timeout: 5_000 });

  // Add a lesson
  await page.getByTestId('add-lesson').click();
  await page.getByTestId('add-lesson-input').fill('Lesson One');
  await page.getByTestId('add-lesson-input').press('Enter');
  await expect(page.getByTestId('lesson-title')).toHaveText('Lesson One');

  // Delete the lesson (with confirmation)
  await page.getByTestId('lesson-delete').click();
  await page.getByTestId('confirm').click();
  await expect(page.getByTestId('lesson-title')).toHaveCount(0);

  // Delete the module
  await page.getByTestId('module-delete').click();
  await page.getByTestId('confirm').click();
  await expect(page.getByTestId('module-item')).toHaveCount(0);

  // Reload and confirm persistence
  await page.reload();
  await expect(page.getByTestId('course-meta')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('module-item')).toHaveCount(0);
});

test('STUDENT is redirected away from /courses', async ({ page, request }) => {
  const email = `student-${Date.now()}@example.com`;
  const password = 'Aa1!aaaaaaaa';
  const reg = await request.post(`${API_BASE}/auth/register`, {
    data: { email, password, displayName: 'S' },
  });
  expect(reg.status()).toBe(201);
  const { uid } = (await reg.json()) as { uid: string };
  await admin.auth().updateUser(uid, { emailVerified: true });
  // Still STUDENT — no promotion

  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: /sign in|log in/i }).click();

  await page.goto('/courses');
  await expect(page).not.toHaveURL(/\/courses/);
});
```

- [ ] **Step 2: Run the e2e suite**

Run (in three shells):

```bash
# shell 1
pnpm emulators
# shell 2 — wait until emulators are listening
pnpm nx serve api
# shell 3 — wait until API is listening
pnpm nx e2e web-e2e -- --grep "instructor can create|STUDENT is redirected"
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web-e2e/src/courses.spec.ts
git commit -m "test(web-e2e): instructor editor walk-through + STUDENT redirect"
```

---

## Task 29: Ops tool — `promote-to-instructor.ts`

**Files:**
- Create: `tools/promote-to-instructor.ts`
- Modify: `package.json`

This tool follows the same pattern as the existing `tools/migrate-auth-2026-05-cleanup-unverified.ts` — a single `tsx` script with no companion unit-test file (it lives outside the Nx project graph). Correctness is verified by the smoke run in Step 5 against the Firebase emulator.

- [ ] **Step 1: Implement the tool**

Create `tools/promote-to-instructor.ts`:

```ts
#!/usr/bin/env tsx
/**
 * tools/promote-to-instructor.ts
 *
 * Promote an existing, email-verified user to the INSTRUCTOR role. Sets the
 * Firebase Auth custom claim `role: 'INSTRUCTOR'` and the Firestore
 * `users/{uid}.role` field.
 *
 * Usage:
 *   pnpm tools:promote-to-instructor <email>
 *
 * Requires: FIREBASE_SERVICE_ACCOUNT_JSON_PATH + LEARNWREN_API_FIREBASE_PROJECT_ID
 * for prod, or running against the emulator with FIREBASE_AUTH_EMULATOR_HOST +
 * FIRESTORE_EMULATOR_HOST exported.
 */

import * as admin from 'firebase-admin';

type AuthLike = Pick<admin.auth.Auth, 'getUserByEmail' | 'setCustomUserClaims'>;
type FirestoreLike = Pick<admin.firestore.Firestore, 'collection'>;

export async function promoteToInstructor(
  email: string,
  auth: AuthLike,
  firestore: FirestoreLike,
): Promise<void> {
  const user = await auth.getUserByEmail(email);
  if (!user.emailVerified) {
    throw new Error(
      `Refusing to promote ${email}: the account is not email-verified. ` +
        'Have the user verify their email first.',
    );
  }

  await auth.setCustomUserClaims(user.uid, { role: 'INSTRUCTOR' });
  await firestore.collection('users').doc(user.uid).update({ role: 'INSTRUCTOR' });

  console.log(`[promote] Promoted ${email} (uid=${user.uid}) to INSTRUCTOR.`);
  console.log(
    '[promote] User must sign out and sign back in for the new role to take effect.',
  );
}

async function main(): Promise<void> {
  const email = process.argv[2];
  if (!email) {
    console.error('Usage: pnpm tools:promote-to-instructor <email>');
    process.exit(2);
  }

  const projectId =
    process.env['LEARNWREN_API_FIREBASE_PROJECT_ID'] ?? 'demo-learnwren';
  const credentialPath = process.env['FIREBASE_SERVICE_ACCOUNT_JSON_PATH'];

  if (admin.apps.length === 0) {
    if (credentialPath) {
      admin.initializeApp({
        projectId,
        credential: admin.credential.cert(credentialPath),
      });
    } else {
      admin.initializeApp({ projectId });
    }
  }

  try {
    await promoteToInstructor(email, admin.auth(), admin.firestore());
  } catch (err) {
    console.error(`[promote] Failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[promote] fatal:', err);
  process.exit(1);
});
```

- [ ] **Step 2: Add the package.json script**

Open `package.json` and add to the `"scripts"` object:

```json
"tools:promote-to-instructor": "tsx tools/promote-to-instructor.ts",
```

(Place it alphabetically near other `tools:*` scripts; if there are none, group it with the other operational scripts like `emulators` or `secrets:*`.)

- [ ] **Step 3: Smoke-run against the emulator**

With the emulators running (`pnpm emulators`), register a user via the API:

```bash
curl -sS -X POST http://localhost:3333/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"smoke-instructor@example.com","password":"Aa1!aaaaaaaa","displayName":"Smoke"}'
```

Mark the user verified via the Admin SDK (the emulator's UI also has a "Mark as verified" action):

```bash
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
LEARNWREN_API_FIREBASE_PROJECT_ID=demo-learnwren \
node -e "const a=require('firebase-admin');a.initializeApp({projectId:'demo-learnwren'});a.auth().getUserByEmail('smoke-instructor@example.com').then(u=>a.auth().updateUser(u.uid,{emailVerified:true})).then(()=>console.log('verified'))"
```

Then run the promote tool:

```bash
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
LEARNWREN_API_FIREBASE_PROJECT_ID=demo-learnwren \
pnpm tools:promote-to-instructor smoke-instructor@example.com
```

Expected output: two `[promote]` log lines — the first naming the uid, the second the sign-out instruction.

Also verify the safety check by running against an unverified email — expected: a `Refusing to promote ...` error message and a non-zero exit code.

- [ ] **Step 4: Commit**

```bash
git add tools/promote-to-instructor.ts package.json
git commit -m "feat(tools): promote-to-instructor script with verified-only safety check"
```

---

## Task 30: Stryker config for `api-courses` + CRAP scripts

**Files:**
- Create: `stryker.api-courses.config.mjs`
- Modify: `package.json`

- [ ] **Step 1: Create the Stryker config**

Create `stryker.api-courses.config.mjs`:

```js
// Stryker config scoped to libs/api-courses — first slice of EP-02.
//
// Excluded from mutation:
// - courses.repository.ts — thin Firestore adapter, verified by api-e2e.
// - *.module.ts, dto/**, types/**, errors/** — DI wiring, type-only code, exception classes.
// - courses.exception-filter.ts — covered by unit tests but mutation noise is high
//   (parseFieldErrors trims to first word; mutants that change the trim behaviour
//   are equivalent for the body-shape contract).
// - index.ts — barrel re-exports.
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  packageManager: 'pnpm',
  testRunner: 'vitest',
  vitest: {
    configFile: 'libs/api-courses/vitest.config.mts',
  },
  mutate: [
    'libs/api-courses/src/lib/**/*.ts',
    '!libs/api-courses/src/lib/**/*.spec.ts',
    '!libs/api-courses/src/lib/**/*.test.ts',
    '!libs/api-courses/src/lib/courses.repository.ts',
    '!libs/api-courses/src/lib/courses.module.ts',
    '!libs/api-courses/src/lib/courses.exception-filter.ts',
    '!libs/api-courses/src/lib/dto/**',
    '!libs/api-courses/src/lib/types/**',
    '!libs/api-courses/src/lib/errors/**',
    '!libs/api-courses/src/index.ts',
  ],
  reporters: ['progress', 'clear-text', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/api-courses/mutation.html' },
  jsonReporter: { fileName: 'reports/mutation/api-courses/mutation.json' },
  thresholds: { high: 90, low: 75, break: null },
  coverageAnalysis: 'perTest',
  concurrency: 4,
  timeoutMS: 15000,
  tempDirName: '.stryker-tmp',
  cleanTempDir: 'always',
};
```

- [ ] **Step 2: Add the mutate script**

Open `package.json` and update the `"scripts"` section:

Replace:

```json
"mutate:api-auth": "stryker run stryker.api-auth.config.mjs",
"mutate:report": "node tools/mutation/report.mjs",
"mutate": "pnpm mutate:api-auth && pnpm mutate:report",
```

with:

```json
"mutate:api-auth": "stryker run stryker.api-auth.config.mjs",
"mutate:api-courses": "stryker run stryker.api-courses.config.mjs",
"mutate:report": "node tools/mutation/report.mjs",
"mutate": "pnpm mutate:api-auth && pnpm mutate:api-courses && pnpm mutate:report",
```

Also update the CRAP coverage projects list:

Replace:

```json
"crap:coverage": "nx run-many -t test --coverage --coverage.reportOnFailure=true --projects=api-auth,api-firebase,web-auth,shared-data-models,api --skip-nx-cache --parallel=1 || true",
```

with:

```json
"crap:coverage": "nx run-many -t test --coverage --coverage.reportOnFailure=true --projects=api-auth,api-courses,api-firebase,web-auth,web-courses,shared-data-models,api --skip-nx-cache --parallel=1 || true",
```

- [ ] **Step 3: Run the mutation suite for api-courses**

Run: `pnpm mutate:api-courses`
Expected: completes successfully. Inspect the score from the console output. If below 85%, look at `reports/mutation/api-courses/mutation.html` for surviving mutants and either tighten tests or document equivalents in a follow-up commit. The spec's acceptance bar is ≥85% effective.

- [ ] **Step 4: Run CRAP**

Run: `pnpm crap`
Expected: report generated under `reports/crap/`; `api-courses` and `web-courses` appear in the table.

- [ ] **Step 5: Commit**

```bash
git add stryker.api-courses.config.mjs package.json
git commit -m "chore(quality): add Stryker config for api-courses; include new libs in CRAP"
```

---

## Task 31: Update README status banner

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Find and update the status banner**

Open `README.md`. Locate the current status banner (added in commit `29220ef` for the auth-hardening slice) and replace its text with:

```markdown
> **Status**: Auth hardening complete; course authoring (EP-02 US-02-01..03) shipped. Publish (US-02-04) and cover image upload deferred to the EP-03 video slice.
```

If the README has a "Recent activity" / "Recent milestones" section, append:

```markdown
- **2026-05-12** — Course authoring (EP-02 US-02-01..03): `libs/api-courses` REST surface, `libs/web-courses` drag-and-drop editor, `tools/promote-to-instructor.ts` ops script. Publish deferred.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs(readme): course authoring slice complete; publish deferred"
```

---

## Final verification

Before declaring the plan complete, run the full workspace bar:

- [ ] `pnpm lint` — PASS
- [ ] `pnpm typecheck` — PASS
- [ ] `pnpm test` — PASS for all projects, including `api-courses` and `web-courses`
- [ ] `pnpm build` — PASS
- [ ] `pnpm emulators` (shell A) + `pnpm nx serve api` (shell B) + `pnpm e2e` (shell C) — PASS for both api-e2e and web-e2e
- [ ] `pnpm mutate:api-courses` — score ≥ 85% effective; document equivalents in `reports/mutation/api-courses/equivalents.md` if any
- [ ] `pnpm crap` — `api-courses` and `web-courses` appear in the report
- [ ] Manual run-through against the dev Firebase project (per spec §8):
  - Register a fresh user (lands as STUDENT)
  - Run `pnpm tools:promote-to-instructor <email>`
  - Confirm a second STUDENT account hits 403 on `POST /api/courses` and is redirected away from `/courses/**`
  - Log back in as the promoted instructor, walk the full editor: create course → add modules → rename → drag-reorder → add lessons → rename → drag-reorder → delete lesson → delete module → reload, confirm tree persists

Once all of the above pass:

- [ ] Final commit (if any housekeeping):

```bash
git status
# Inspect, stage anything left, then commit if needed.
```

- [ ] Push the branch and open the PR for review.
