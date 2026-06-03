# EP-07 Slice C: New-Module Notification — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a course owner email all active enrollees, once per module, when a new module is added to a published course — via an explicit "Notify students" action in the course editor.

**Architecture:** A new owner-guarded `POST /api/courses/:cid/modules/:mid/notify` endpoint in a dedicated `api-courses/notifications/` submodule (mirroring `roster/` and `analytics/`). The service validates (published course, module exists, ≥1 lesson, not already notified), fans out best-effort emails to active enrollees through the existing `EmailTransport` seam, stamps `Module.studentsNotifiedAt`, and returns `{ notifiedCount }`. The web editor adds a per-module "Notify students" button that flips to a "notified" label once stamped. Email-only; no in-app notifications, opt-out, queue, or retries.

**Tech Stack:** Nx monorepo (pnpm), NestJS 11 + Firestore (api-courses, api-auth), Angular 21 standalone/OnPush/signals (web-courses), vitest unit tests, Playwright api-e2e, Stryker mutation.

---

## Worktree & conventions (read before starting)

- **All work happens in the worktree** `/Volumes/Artie-Storage/github-repos/learnwren-ep07-slice-c` (branch `feat/ep07-slice-c-new-module-notification`). **Prefix every shell command** with `cd /Volumes/Artie-Storage/github-repos/learnwren-ep07-slice-c && …` — a single upfront `cd` does NOT persist across a subagent's separate Bash calls.
- `node_modules` in the worktree is a **symlink** to the parent; it shows as untracked. **Never `git add -A`** — stage explicit paths only.
- **Every commit message ends with this trailer:**
  ```
  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  ```
- **vitest masks tsc errors.** After any shared-type or interface change, run `pnpm nx build <lib>` (not just `test`) — a build is the real type gate.
- vitest config uses `globals: true` for api-courses/api-auth, so `describe/it/expect/vi` are available without import in those libs; the existing specs still import them explicitly — match each file's existing style when appending.

---

## File Structure

**Create:**
- `libs/shared-data-models/src/lib/notify.ts` — `NotifyModuleResult` response type.
- `libs/api-courses/src/lib/notifications/notifications.service.ts` — validate + fan-out + stamp.
- `libs/api-courses/src/lib/notifications/notifications.service.spec.ts`
- `libs/api-courses/src/lib/notifications/notifications.controller.ts` — `POST :cid/modules/:mid/notify`.
- `libs/api-courses/src/lib/notifications/notifications.controller.spec.ts`
- `apps/api-e2e/src/notifications.e2e-spec.ts`
- `libs/web-courses/src/lib/notifications/notifications.service.ts` — HTTP wrapper.
- `libs/web-courses/src/lib/notifications/notifications.service.spec.ts`

**Modify:**
- `libs/shared-data-models/src/lib/module.ts` — add optional `studentsNotifiedAt`.
- `libs/shared-data-models/src/index.ts` — `export * from './lib/notify'`.
- `libs/api-courses/src/lib/errors/courses-error.codes.ts` — 3 new codes.
- `libs/api-courses/src/lib/errors/courses.exception.ts` — 3 new exceptions.
- `libs/api-courses/src/lib/errors/courses.exception.spec.ts` — assert the 3 (create if missing).
- `libs/api-auth/src/lib/email-transport/email-transport.ts` — `NewModuleEmailInput` + interface method.
- `libs/api-auth/src/lib/email-transport/console-email-transport.ts` — `'new-module'` kind + method.
- `libs/api-auth/src/lib/email-transport/console-email-transport.spec.ts` — assert the new method.
- `libs/api-auth/src/lib/email-transport/smtp-email-transport.ts` — method.
- `libs/api-auth/src/index.ts` — export `NewModuleEmailInput`.
- `libs/api-auth/src/lib/auth.controller.ts` — widen `_test/last-email` kind union.
- `libs/api-courses/src/lib/courses.module.ts` — register controller + service.
- `libs/web-courses/src/lib/components/module-item/module-item.component.ts` + `.html` — button + inputs/output.
- `libs/web-courses/src/lib/components/module-item/module-item.component.spec.ts`
- `libs/web-courses/src/lib/components/module-tree/module-tree.component.ts` + `.html` — forward input/output.
- `libs/web-courses/src/lib/course-editor-page/course-editor-page.component.ts` + `.html` — handler + notice banner.
- `libs/web-courses/src/lib/course-editor-page/course-editor-page.component.spec.ts`
- `README.md`, `docs/USER_GUIDE.md`.

**Reuse as-is (do NOT recreate — these already exist):** `CoursesRepository.getModule`, `CoursesRepository.listLessonsByModule` (non-txn), `CoursesRepository.updateModule` (stamps `updatedAt` + the patch — use it for `studentsNotifiedAt`), `EnrollmentRepository.listActiveByCourse`, `CourseOwnerGuard`, `CoursesExceptionFilter`, `ModuleNotFoundException`/`CourseNotFoundException`/`NotCourseOwnerException`, `EMAIL_TRANSPORT` (exported by `AuthModule`, already imported by `CoursesModule`).

---

## Task 1: Shared types — `studentsNotifiedAt` + `NotifyModuleResult`

**Files:**
- Modify: `libs/shared-data-models/src/lib/module.ts`
- Create: `libs/shared-data-models/src/lib/notify.ts`
- Modify: `libs/shared-data-models/src/index.ts`

- [ ] **Step 1: Add the optional stamp to `Module`.** Edit `libs/shared-data-models/src/lib/module.ts` to add one field (keep it OPTIONAL — a required field silently breaks api-courses tsc):

```typescript
import type { CourseId, ISODateString, ModuleId } from './common';

export interface Module {
  id: ModuleId;
  courseId: CourseId;
  title: string;
  order: number;
  studentsNotifiedAt?: ISODateString; // slice C — set once when active enrollees are emailed about this module
  createdAt: ISODateString;
  updatedAt: ISODateString;
}
```

- [ ] **Step 2: Create the response type.** Create `libs/shared-data-models/src/lib/notify.ts`:

```typescript
/** Response of POST /api/courses/:cid/modules/:mid/notify — owner-only new-module notification. */
export interface NotifyModuleResult {
  notifiedCount: number;
}
```

- [ ] **Step 3: Export it from the barrel.** In `libs/shared-data-models/src/index.ts`, add a line next to the other `export *` lines:

```typescript
export * from './lib/notify';
```

- [ ] **Step 4: Build to verify types.**

Run: `cd /Volumes/Artie-Storage/github-repos/learnwren-ep07-slice-c && pnpm nx build shared-data-models`
Expected: build succeeds.

- [ ] **Step 5: Commit.**

```bash
cd /Volumes/Artie-Storage/github-repos/learnwren-ep07-slice-c && \
git add libs/shared-data-models/src/lib/module.ts libs/shared-data-models/src/lib/notify.ts libs/shared-data-models/src/index.ts && \
git commit -m "feat(shared-data-models): add Module.studentsNotifiedAt + NotifyModuleResult

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: api-courses notification exceptions

**Files:**
- Modify: `libs/api-courses/src/lib/errors/courses-error.codes.ts`
- Modify: `libs/api-courses/src/lib/errors/courses.exception.ts`
- Test: `libs/api-courses/src/lib/errors/courses.exception.spec.ts`

- [ ] **Step 1: Write the failing test.** In `libs/api-courses/src/lib/errors/courses.exception.spec.ts` (create the file if it does not exist, with `import { describe, expect, it } from 'vitest';` and the import below at the top), append:

```typescript
import {
  CourseNotPublishedForNotifyException,
  ModuleAlreadyNotifiedException,
  ModuleHasNoLessonsException,
} from './courses.exception';

describe('Slice C notification exceptions', () => {
  it('CourseNotPublishedForNotifyException → COURSE_NOT_PUBLISHED_FOR_NOTIFY / 409', () => {
    const e = new CourseNotPublishedForNotifyException();
    expect(e.code).toBe('COURSE_NOT_PUBLISHED_FOR_NOTIFY');
    expect(e.status).toBe(409);
  });
  it('ModuleHasNoLessonsException → MODULE_HAS_NO_LESSONS / 409', () => {
    const e = new ModuleHasNoLessonsException();
    expect(e.code).toBe('MODULE_HAS_NO_LESSONS');
    expect(e.status).toBe(409);
  });
  it('ModuleAlreadyNotifiedException → MODULE_ALREADY_NOTIFIED / 409', () => {
    const e = new ModuleAlreadyNotifiedException();
    expect(e.code).toBe('MODULE_ALREADY_NOTIFIED');
    expect(e.status).toBe(409);
  });
});
```

- [ ] **Step 2: Run it to verify it fails.**

Run: `cd /Volumes/Artie-Storage/github-repos/learnwren-ep07-slice-c && pnpm nx test api-courses -- src/lib/errors/courses.exception.spec.ts`
Expected: FAIL — the three exception classes / codes do not exist yet.

- [ ] **Step 3: Add the codes.** In `libs/api-courses/src/lib/errors/courses-error.codes.ts`, add three members to the `CoursesErrorCode` union (a closed union — tsc fails if a code is used but not listed):

```typescript
  | 'COURSE_NOT_PUBLISHED_FOR_NOTIFY'
  | 'MODULE_HAS_NO_LESSONS'
  | 'MODULE_ALREADY_NOTIFIED'
```

- [ ] **Step 4: Add the exception classes.** In `libs/api-courses/src/lib/errors/courses.exception.ts`, append (mirroring the existing subclasses that call `super(code, message, status)`):

```typescript
export class CourseNotPublishedForNotifyException extends CoursesException {
  constructor() {
    super(
      'COURSE_NOT_PUBLISHED_FOR_NOTIFY',
      'Only a published course can notify its enrolled students.',
      409,
    );
  }
}

export class ModuleHasNoLessonsException extends CoursesException {
  constructor() {
    super(
      'MODULE_HAS_NO_LESSONS',
      'A module must have at least one lesson before students are notified.',
      409,
    );
  }
}

export class ModuleAlreadyNotifiedException extends CoursesException {
  constructor() {
    super('MODULE_ALREADY_NOTIFIED', 'Students have already been notified about this module.', 409);
  }
}
```

- [ ] **Step 5: Run the test to verify it passes.**

Run: `cd /Volumes/Artie-Storage/github-repos/learnwren-ep07-slice-c && pnpm nx test api-courses -- src/lib/errors/courses.exception.spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
cd /Volumes/Artie-Storage/github-repos/learnwren-ep07-slice-c && \
git add libs/api-courses/src/lib/errors/courses-error.codes.ts libs/api-courses/src/lib/errors/courses.exception.ts libs/api-courses/src/lib/errors/courses.exception.spec.ts && \
git commit -m "feat(api-courses): add Slice C new-module notification exceptions

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: EmailTransport seam — `sendNewModuleEmail`

**Files:**
- Modify: `libs/api-auth/src/lib/email-transport/email-transport.ts`
- Modify: `libs/api-auth/src/lib/email-transport/console-email-transport.ts`
- Test: `libs/api-auth/src/lib/email-transport/console-email-transport.spec.ts`
- Modify: `libs/api-auth/src/lib/email-transport/smtp-email-transport.ts`
- Modify: `libs/api-auth/src/index.ts`
- Modify: `libs/api-auth/src/lib/auth.controller.ts`

- [ ] **Step 1: Write the failing console-transport test.** In `libs/api-auth/src/lib/email-transport/console-email-transport.spec.ts`, append (match the file's existing import style):

```typescript
describe('ConsoleEmailTransport.sendNewModuleEmail', () => {
  it('records a new-module email in the outbox with the course URL', async () => {
    const t = new ConsoleEmailTransport();
    await t.sendNewModuleEmail({
      to: 'ada@example.com',
      studentName: 'Ada',
      courseTitle: 'Intro to Wren',
      moduleTitle: 'Module 1',
      courseUrl: 'http://localhost:4200/catalog/c1',
    });
    const entry = t.lastSentTo('ada@example.com', 'new-module');
    expect(entry).toBeDefined();
    expect(entry?.kind).toBe('new-module');
    expect(entry?.url).toBe('http://localhost:4200/catalog/c1');
  });
});
```

- [ ] **Step 2: Run it to verify it fails.**

Run: `cd /Volumes/Artie-Storage/github-repos/learnwren-ep07-slice-c && pnpm nx test api-auth -- console-email-transport.spec`
Expected: FAIL — `sendNewModuleEmail` / the `'new-module'` kind do not exist.

- [ ] **Step 3: Extend the interface.** In `libs/api-auth/src/lib/email-transport/email-transport.ts`, add the input type (near the other `*EmailInput` types) and the method (in the `EmailTransport` interface):

```typescript
export interface NewModuleEmailInput {
  to: string;
  studentName: string;
  courseTitle: string;
  moduleTitle: string;
  courseUrl: string;
}
```

```typescript
  sendNewModuleEmail(input: NewModuleEmailInput): Promise<void>;
```

- [ ] **Step 4: Implement in the console adapter.** In `libs/api-auth/src/lib/email-transport/console-email-transport.ts`: (a) add `NewModuleEmailInput` to the top `import type { … } from './email-transport'`; (b) add `| 'new-module'` to the `OutboxEntry.kind` union; (c) add the method:

```typescript
  async sendNewModuleEmail(input: NewModuleEmailInput): Promise<void> {
    this.logger.log(`[new-module-email] to=${input.to} url=${input.courseUrl}`);
    this.append({ kind: 'new-module', to: input.to, url: input.courseUrl, sentAt: new Date() });
  }
```

- [ ] **Step 5: Implement in the SMTP adapter.** In `libs/api-auth/src/lib/email-transport/smtp-email-transport.ts`: add `NewModuleEmailInput` to the top import, then add (mirroring `sendPasswordResetEmail`'s try/catch + logging):

```typescript
  async sendNewModuleEmail(input: NewModuleEmailInput): Promise<void> {
    const text =
      `Hi ${input.studentName},\n\n` +
      `A new module — "${input.moduleTitle}" — was added to "${input.courseTitle}".\n\n` +
      `Continue learning here:\n\n` +
      `${input.courseUrl}\n\n` +
      `Happy learning,\nThe Learn Wren team`;

    try {
      await this.transporter.sendMail({
        from: this.config.from,
        to: input.to,
        subject: `New module in "${input.courseTitle}"`,
        text,
      });
      this.logger.log(`[new-module-email] sent to=${input.to}`);
    } catch (err) {
      this.logger.error(`[new-module-email] send failed to=${input.to}: ${String(err)}`);
      throw err;
    }
  }
```

(No new SMTP spec — `email-transport/**` is excluded from api-auth mutation, and its spec can't import nodemailer under vitest. tsc enforces that both adapters implement the interface.)

- [ ] **Step 6: Export the input type.** In `libs/api-auth/src/index.ts`, add `type NewModuleEmailInput` to the existing email-transport re-export block:

```typescript
export {
  EMAIL_TRANSPORT,
  type EmailTransport,
  type EmailChangeVerificationEmailInput,
  type NewModuleEmailInput,
} from './lib/email-transport/email-transport';
```

- [ ] **Step 7: Widen the test-outbox endpoint** so the api-e2e can assert the email. In `libs/api-auth/src/lib/auth.controller.ts`, add `| 'new-module'` to the `@Query('kind')` union of the `_test/last-email` handler:

```typescript
  async lastTestEmail(
    @Query('to') to: string,
    @Query('kind')
    kind: 'unlock' | 'verification' | 'password-reset' | 'email-change' | 'password-changed' | 'new-module',
  ): Promise<{ url: string; sentAt: string }> {
```

- [ ] **Step 8: Run the test to verify it passes + build.**

Run: `cd /Volumes/Artie-Storage/github-repos/learnwren-ep07-slice-c && pnpm nx test api-auth -- console-email-transport.spec && pnpm nx build api-auth`
Expected: PASS, build succeeds (confirms both adapters satisfy the widened interface).

- [ ] **Step 9: Commit.**

```bash
cd /Volumes/Artie-Storage/github-repos/learnwren-ep07-slice-c && \
git add libs/api-auth/src/lib/email-transport/email-transport.ts libs/api-auth/src/lib/email-transport/console-email-transport.ts libs/api-auth/src/lib/email-transport/console-email-transport.spec.ts libs/api-auth/src/lib/email-transport/smtp-email-transport.ts libs/api-auth/src/index.ts libs/api-auth/src/lib/auth.controller.ts && \
git commit -m "feat(api-auth): add sendNewModuleEmail to the EmailTransport seam

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: `NotificationsService` (api-courses)

**Files:**
- Create: `libs/api-courses/src/lib/notifications/notifications.service.ts`
- Test: `libs/api-courses/src/lib/notifications/notifications.service.spec.ts`

- [ ] **Step 1: Write the failing test.** Create `libs/api-courses/src/lib/notifications/notifications.service.spec.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  Course, CourseId, Enrollment, ISODateString, Lesson, Module, ModuleId, UserId,
} from '@learnwren/shared-data-models';

import {
  CourseNotPublishedForNotifyException,
  ModuleAlreadyNotifiedException,
  ModuleHasNoLessonsException,
  ModuleNotFoundException,
} from '../errors/courses.exception';
import { NotificationsService } from './notifications.service';

const CID = 'course-1' as CourseId;
const MID = 'module-1' as ModuleId;
const T0 = '2026-01-01T00:00:00.000Z' as ISODateString;

function course(overrides: Partial<Course> = {}): Course {
  return {
    id: CID, title: 'Intro to Wren', description: '', instructorId: 'owner' as UserId,
    status: 'PUBLISHED', createdAt: T0, updatedAt: T0, ...overrides,
  } as Course;
}
function moduleDoc(overrides: Partial<Module> = {}): Module {
  return { id: MID, courseId: CID, title: 'Module One', order: 0, createdAt: T0, updatedAt: T0, ...overrides };
}
function lesson(id: string): Lesson {
  return { id: id as never, moduleId: MID, title: id, order: 0, createdAt: T0, updatedAt: T0 } as Lesson;
}
function enrollment(userId: string): Enrollment {
  return { userId: userId as UserId, courseId: CID, status: 'ACTIVE', progress: [], createdAt: T0 } as Enrollment;
}

describe('NotificationsService', () => {
  const users: Record<string, { displayName?: string; email?: string } | null> = {
    u1: { displayName: 'Ada', email: 'ada@example.com' },
    u2: { displayName: 'Bo', email: 'bo@example.com' },
    u3: { displayName: 'No Email', email: '' },
  };

  let courses: {
    getModule: ReturnType<typeof vi.fn>;
    listLessonsByModule: ReturnType<typeof vi.fn>;
    updateModule: ReturnType<typeof vi.fn>;
  };
  let enrollments: { listActiveByCourse: ReturnType<typeof vi.fn> };
  let firestore: { collection: ReturnType<typeof vi.fn> };
  let email: { sendNewModuleEmail: ReturnType<typeof vi.fn> };
  let service: NotificationsService;

  beforeEach(() => {
    courses = {
      getModule: vi.fn().mockResolvedValue(moduleDoc()),
      listLessonsByModule: vi.fn().mockResolvedValue([lesson('l1')]),
      updateModule: vi.fn().mockResolvedValue(undefined),
    };
    enrollments = { listActiveByCourse: vi.fn().mockResolvedValue([enrollment('u1'), enrollment('u2')]) };
    firestore = {
      collection: vi.fn().mockReturnValue({
        doc: vi.fn((uid: string) => ({
          get: vi.fn().mockResolvedValue({ exists: users[uid] != null, data: () => users[uid] }),
        })),
      }),
    };
    email = { sendNewModuleEmail: vi.fn().mockResolvedValue(undefined) };
    service = new NotificationsService(courses as never, enrollments as never, firestore as never, email as never);
  });

  it('emails each active enrollee and returns the sent count', async () => {
    const result = await service.notifyNewModule(course(), MID);
    expect(email.sendNewModuleEmail).toHaveBeenCalledTimes(2);
    expect(email.sendNewModuleEmail).toHaveBeenCalledWith({
      to: 'ada@example.com', studentName: 'Ada', courseTitle: 'Intro to Wren',
      moduleTitle: 'Module One', courseUrl: 'http://localhost:4200/catalog/course-1',
    });
    expect(result).toEqual({ notifiedCount: 2 });
  });

  it('stamps studentsNotifiedAt on the module', async () => {
    await service.notifyNewModule(course(), MID);
    expect(courses.updateModule).toHaveBeenCalledWith(CID, MID, { studentsNotifiedAt: expect.any(String) });
  });

  it('rejects when the course is not published and sends nothing', async () => {
    await expect(service.notifyNewModule(course({ status: 'DRAFT' }), MID))
      .rejects.toBeInstanceOf(CourseNotPublishedForNotifyException);
    expect(email.sendNewModuleEmail).not.toHaveBeenCalled();
  });

  it('rejects when the module does not exist', async () => {
    courses.getModule.mockResolvedValue(null);
    await expect(service.notifyNewModule(course(), MID)).rejects.toBeInstanceOf(ModuleNotFoundException);
  });

  it('rejects (and does not stamp) when the module was already notified', async () => {
    courses.getModule.mockResolvedValue(moduleDoc({ studentsNotifiedAt: T0 }));
    await expect(service.notifyNewModule(course(), MID)).rejects.toBeInstanceOf(ModuleAlreadyNotifiedException);
    expect(courses.updateModule).not.toHaveBeenCalled();
  });

  it('rejects when the module has no lessons', async () => {
    courses.listLessonsByModule.mockResolvedValue([]);
    await expect(service.notifyNewModule(course(), MID)).rejects.toBeInstanceOf(ModuleHasNoLessonsException);
    expect(email.sendNewModuleEmail).not.toHaveBeenCalled();
  });

  it('skips enrollees with no email address', async () => {
    enrollments.listActiveByCourse.mockResolvedValue([enrollment('u1'), enrollment('u3')]);
    const result = await service.notifyNewModule(course(), MID);
    expect(email.sendNewModuleEmail).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ notifiedCount: 1 });
  });

  it('is best-effort: a failed send is counted out, the rest send, and the stamp is still written', async () => {
    email.sendNewModuleEmail.mockRejectedValueOnce(new Error('smtp down')).mockResolvedValueOnce(undefined);
    const result = await service.notifyNewModule(course(), MID);
    expect(result).toEqual({ notifiedCount: 1 });
    expect(courses.updateModule).toHaveBeenCalledWith(CID, MID, { studentsNotifiedAt: expect.any(String) });
  });
});
```

- [ ] **Step 2: Run it to verify it fails.**

Run: `cd /Volumes/Artie-Storage/github-repos/learnwren-ep07-slice-c && pnpm nx test api-courses -- src/lib/notifications/notifications.service.spec.ts`
Expected: FAIL — `notifications.service.ts` does not exist.

- [ ] **Step 3: Implement the service.** Create `libs/api-courses/src/lib/notifications/notifications.service.ts`:

```typescript
import { Inject, Injectable, Logger } from '@nestjs/common';

import { EMAIL_TRANSPORT, type EmailTransport } from '@learnwren/api-auth';
import { FIRESTORE, type FirestoreHandle } from '@learnwren/api-firebase';
import type { Course, ISODateString, ModuleId, NotifyModuleResult, User, UserId } from '@learnwren/shared-data-models';

import { CoursesRepository } from '../courses.repository';
import { EnrollmentRepository } from '../enrollment/enrollment.repository';
import {
  CourseNotPublishedForNotifyException,
  ModuleAlreadyNotifiedException,
  ModuleHasNoLessonsException,
  ModuleNotFoundException,
} from '../errors/courses.exception';

const USERS = 'users';
const FALLBACK_NAME = 'Student';

interface Recipient {
  email: string;
  displayName: string;
}

function nowIso(): ISODateString {
  return new Date().toISOString() as ISODateString;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger('NotificationsService');

  constructor(
    private readonly courses: CoursesRepository,
    private readonly enrollments: EnrollmentRepository,
    @Inject(FIRESTORE) private readonly firestore: FirestoreHandle,
    @Inject(EMAIL_TRANSPORT) private readonly email: EmailTransport,
  ) {}

  /**
   * Announce a newly-added module to a published course's active enrollees
   * (US-07-03). Owner authorization is enforced by CourseOwnerGuard upstream;
   * `course` is the guard-loaded doc. One-shot per module (idempotent via the
   * studentsNotifiedAt stamp); best-effort per-recipient email — a failed send
   * is logged, never fatal, and the module is stamped at-most-once.
   */
  async notifyNewModule(course: Course, mid: ModuleId): Promise<NotifyModuleResult> {
    if (course.status !== 'PUBLISHED') {
      throw new CourseNotPublishedForNotifyException();
    }

    const moduleDoc = await this.courses.getModule(course.id, mid);
    if (!moduleDoc) {
      throw new ModuleNotFoundException();
    }
    if (moduleDoc.studentsNotifiedAt) {
      throw new ModuleAlreadyNotifiedException();
    }

    const lessons = await this.courses.listLessonsByModule(course.id, mid);
    if (lessons.length === 0) {
      throw new ModuleHasNoLessonsException();
    }

    const enrollments = await this.enrollments.listActiveByCourse(course.id);
    const recipients = await this.loadRecipients(enrollments.map((e) => e.userId));
    const deliverable = recipients.filter((r) => r.email !== '');

    const courseUrl = this.continueUrl(`/catalog/${course.id}`);
    const settled = await Promise.allSettled(
      deliverable.map((r) =>
        this.email.sendNewModuleEmail({
          to: r.email,
          studentName: r.displayName,
          courseTitle: course.title,
          moduleTitle: moduleDoc.title,
          courseUrl,
        }),
      ),
    );

    let notifiedCount = 0;
    for (const result of settled) {
      if (result.status === 'fulfilled') {
        notifiedCount += 1;
      } else {
        this.logger.error(
          `[new-module-notify] send failed cid=${course.id} mid=${mid}: ${String(result.reason)}`,
        );
      }
    }

    await this.courses.updateModule(course.id, mid, { studentsNotifiedAt: nowIso() });
    return { notifiedCount };
  }

  /** Batch-read name + email from users/{uid} (owner-guarded path only). */
  private async loadRecipients(uids: UserId[]): Promise<Recipient[]> {
    const unique = [...new Set(uids)];
    return Promise.all(
      unique.map(async (uid): Promise<Recipient> => {
        const snap = await this.firestore.collection(USERS).doc(uid).get();
        const data = snap.exists ? (snap.data() as User) : undefined;
        return { email: data?.email ?? '', displayName: data?.displayName ?? FALLBACK_NAME };
      }),
    );
  }

  private continueUrl(path: string): string {
    const base = process.env['LEARNWREN_PUBLIC_URL'] ?? 'http://localhost:4200';
    return `${base}${path}`;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes.**

Run: `cd /Volumes/Artie-Storage/github-repos/learnwren-ep07-slice-c && pnpm nx test api-courses -- src/lib/notifications/notifications.service.spec.ts`
Expected: PASS (all 8 cases).

- [ ] **Step 5: Commit.**

```bash
cd /Volumes/Artie-Storage/github-repos/learnwren-ep07-slice-c && \
git add libs/api-courses/src/lib/notifications/notifications.service.ts libs/api-courses/src/lib/notifications/notifications.service.spec.ts && \
git commit -m "feat(api-courses): NotificationsService for new-module notification

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: `NotificationsController` + module wiring

**Files:**
- Create: `libs/api-courses/src/lib/notifications/notifications.controller.ts`
- Test: `libs/api-courses/src/lib/notifications/notifications.controller.spec.ts`
- Modify: `libs/api-courses/src/lib/courses.module.ts`

- [ ] **Step 1: Write the failing test.** Create `libs/api-courses/src/lib/notifications/notifications.controller.spec.ts`:

```typescript
import { describe, expect, it, vi } from 'vitest';

import type { Course, CourseId, ModuleId } from '@learnwren/shared-data-models';

import type { CourseScopedRequest } from '../types/loaded-course';
import { NotificationsController } from './notifications.controller';

const course = { id: 'c1' as CourseId, title: 'C' } as Course;
const MID = 'm1' as ModuleId;

describe('NotificationsController', () => {
  it('delegates to the service with the guard-loaded course and the module id', async () => {
    const service = { notifyNewModule: vi.fn().mockResolvedValue({ notifiedCount: 3 }) };
    const controller = new NotificationsController(service as never);
    const req = { user: { uid: 'owner' }, course } as CourseScopedRequest;
    const result = await controller.notify(req, MID);
    expect(service.notifyNewModule).toHaveBeenCalledWith(course, MID);
    expect(result).toEqual({ notifiedCount: 3 });
  });

  it('rejects if the owner guard did not attach the course', async () => {
    const service = { notifyNewModule: vi.fn() };
    const controller = new NotificationsController(service as never);
    const req = { user: { uid: 'owner' } } as CourseScopedRequest;
    await expect(controller.notify(req, MID)).rejects.toThrow();
    expect(service.notifyNewModule).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to verify it fails.**

Run: `cd /Volumes/Artie-Storage/github-repos/learnwren-ep07-slice-c && pnpm nx test api-courses -- src/lib/notifications/notifications.controller.spec.ts`
Expected: FAIL — controller does not exist.

- [ ] **Step 3: Implement the controller.** Create `libs/api-courses/src/lib/notifications/notifications.controller.ts` (mirrors `roster.controller.ts`; `@HttpCode(200)` makes the action return 200, not Nest's default POST 201):

```typescript
import { Controller, HttpCode, Param, Post, Req, UseFilters, UseGuards } from '@nestjs/common';

import { FirebaseSessionGuard } from '@learnwren/api-auth';
import type { ModuleId, NotifyModuleResult } from '@learnwren/shared-data-models';

import { CourseOwnerGuard } from '../course-owner.guard';
import { CoursesExceptionFilter } from '../courses.exception-filter';
import type { CourseScopedRequest } from '../types/loaded-course';
import { NotificationsService } from './notifications.service';

/**
 * Owner-only new-module notification (US-07-03). `CourseOwnerGuard` loads and
 * authorizes the course (404 missing / 403 not-owner) and attaches it to the
 * request; the session guard supplies the authenticated user (401 otherwise).
 */
@Controller('courses')
@UseFilters(CoursesExceptionFilter)
@UseGuards(FirebaseSessionGuard)
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @Post(':cid/modules/:mid/notify')
  @HttpCode(200)
  @UseGuards(CourseOwnerGuard)
  notify(@Req() req: CourseScopedRequest, @Param('mid') mid: ModuleId): Promise<NotifyModuleResult> {
    if (!req.course) {
      return Promise.reject(
        new Error('NotificationsController: CourseOwnerGuard did not attach course'),
      );
    }
    return this.service.notifyNewModule(req.course, mid);
  }
}
```

- [ ] **Step 4: Register in the module.** In `libs/api-courses/src/lib/courses.module.ts`: add the imports at the top, add `NotificationsController` to the `controllers: [...]` array, and add `NotificationsService` to the `providers: [...]` array:

```typescript
import { NotificationsController } from './notifications/notifications.controller';
import { NotificationsService } from './notifications/notifications.service';
```

(`AuthModule` is already in `imports` and exports `EMAIL_TRANSPORT`; `CoursesRepository`, `EnrollmentRepository`, `CourseOwnerGuard` are already providers — no other wiring needed.)

- [ ] **Step 5: Run tests + build.**

Run: `cd /Volumes/Artie-Storage/github-repos/learnwren-ep07-slice-c && pnpm nx test api-courses -- src/lib/notifications/notifications.controller.spec.ts && pnpm nx build api-courses`
Expected: PASS + build succeeds.

- [ ] **Step 6: Commit.**

```bash
cd /Volumes/Artie-Storage/github-repos/learnwren-ep07-slice-c && \
git add libs/api-courses/src/lib/notifications/notifications.controller.ts libs/api-courses/src/lib/notifications/notifications.controller.spec.ts libs/api-courses/src/lib/courses.module.ts && \
git commit -m "feat(api-courses): notify endpoint + module wiring

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: api-e2e — notification flow

**Files:**
- Create: `apps/api-e2e/src/notifications.e2e-spec.ts`

> **Run prerequisites (worktree + emulator caveats):** Playwright launches `node dist/apps/api/main.js` and **reuses an existing :3333 server when not CI** — so a stale api server from `main` or another worktree would mask your changes. Before running: (1) `pnpm emulators` must be running; (2) build the api in THIS worktree; (3) ensure no stale :3333 server. `LEARNWREN_EMAIL_TRANSPORT=console` and `LEARNWREN_TEST_OUTBOX_ENABLED=1` are already set by `apps/api-e2e/playwright.config.ts`.

- [ ] **Step 1: Write the e2e spec.** Create `apps/api-e2e/src/notifications.e2e-spec.ts`:

```typescript
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

function uniqueId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

async function seedCourseWithModule(
  instructorId: string,
  opts: { status?: 'PUBLISHED' | 'DRAFT'; withLesson?: boolean } = {},
): Promise<{ cid: string; mid: string }> {
  const status = opts.status ?? 'PUBLISHED';
  const withLesson = opts.withLesson ?? true;
  const cid = uniqueId('notify-e2e');
  const mid = `${cid}-m1`;
  const now = new Date().toISOString();
  const db = admin.firestore();
  await db.collection('courses').doc(cid).set({
    id: cid, title: 'Notify e2e course', description: 'course', instructorId,
    status, enrollmentCount: 0, ...(status === 'PUBLISHED' ? { publishedAt: now } : {}),
    createdAt: now, updatedAt: now,
  });
  await db.collection('courses').doc(cid).collection('modules').doc(mid).set({
    id: mid, courseId: cid, title: 'New Module', order: 0, createdAt: now, updatedAt: now,
  });
  if (withLesson) {
    const lid = `${mid}-l1`;
    await db.collection('courses').doc(cid).collection('modules').doc(mid).collection('lessons').doc(lid).set({
      id: lid, moduleId: mid, title: 'Lesson 1', order: 0, createdAt: now, updatedAt: now,
    });
  }
  return { cid, mid };
}

test('owner notifies enrolled students; the module is stamped and the student is emailed', async ({ request }) => {
  const instructor = await registerAndPromoteInstructor(request);
  const student = await registerStudent(request);
  const { cid, mid } = await seedCourseWithModule(instructor.uid);
  await request.post(`${API_BASE}/enrollments`, {
    headers: { cookie: student.cookieHeader },
    data: { courseId: cid },
  });

  const res = await request.post(`${API_BASE}/courses/${cid}/modules/${mid}/notify`, {
    headers: { cookie: instructor.cookieHeader },
  });
  expect(res.status()).toBe(200);
  expect((await res.json()).notifiedCount).toBe(1);

  const moduleSnap = await admin
    .firestore().collection('courses').doc(cid).collection('modules').doc(mid).get();
  expect(moduleSnap.data()?.['studentsNotifiedAt']).toBeTruthy();

  const studentEmail = (await admin.firestore().collection('users').doc(student.uid).get()).data()?.['email'] as string;
  const outbox = await request.get(
    `${API_BASE}/auth/_test/last-email?to=${encodeURIComponent(studentEmail)}&kind=new-module`,
  );
  expect(outbox.status()).toBe(200);
});

test('a non-owner instructor is forbidden', async ({ request }) => {
  const owner = await registerAndPromoteInstructor(request);
  const stranger = await registerAndPromoteInstructor(request);
  const { cid, mid } = await seedCourseWithModule(owner.uid);
  const res = await request.post(`${API_BASE}/courses/${cid}/modules/${mid}/notify`, {
    headers: { cookie: stranger.cookieHeader },
  });
  expect(res.status()).toBe(403);
});

test('an unauthenticated request is rejected', async ({ request }) => {
  const owner = await registerAndPromoteInstructor(request);
  const { cid, mid } = await seedCourseWithModule(owner.uid);
  await withAnonRequest(async (anon) => {
    const res = await anon.post(`${API_BASE}/courses/${cid}/modules/${mid}/notify`);
    expect(res.status()).toBe(401);
  });
});

test('notifying a module with no lessons is rejected', async ({ request }) => {
  const owner = await registerAndPromoteInstructor(request);
  const { cid, mid } = await seedCourseWithModule(owner.uid, { withLesson: false });
  const res = await request.post(`${API_BASE}/courses/${cid}/modules/${mid}/notify`, {
    headers: { cookie: owner.cookieHeader },
  });
  expect(res.status()).toBe(409);
  expect((await res.json()).code).toBe('MODULE_HAS_NO_LESSONS');
});

test('notifying a draft course is rejected', async ({ request }) => {
  const owner = await registerAndPromoteInstructor(request);
  const { cid, mid } = await seedCourseWithModule(owner.uid, { status: 'DRAFT' });
  const res = await request.post(`${API_BASE}/courses/${cid}/modules/${mid}/notify`, {
    headers: { cookie: owner.cookieHeader },
  });
  expect(res.status()).toBe(409);
  expect((await res.json()).code).toBe('COURSE_NOT_PUBLISHED_FOR_NOTIFY');
});

test('notifying twice is rejected as already-notified', async ({ request }) => {
  const owner = await registerAndPromoteInstructor(request);
  const { cid, mid } = await seedCourseWithModule(owner.uid);
  const first = await request.post(`${API_BASE}/courses/${cid}/modules/${mid}/notify`, {
    headers: { cookie: owner.cookieHeader },
  });
  expect(first.status()).toBe(200);
  const second = await request.post(`${API_BASE}/courses/${cid}/modules/${mid}/notify`, {
    headers: { cookie: owner.cookieHeader },
  });
  expect(second.status()).toBe(409);
  expect((await second.json()).code).toBe('MODULE_ALREADY_NOTIFIED');
});
```

- [ ] **Step 2: Build the api and run the suite.**

Run (emulators already running in another terminal via `pnpm emulators`):
```bash
cd /Volumes/Artie-Storage/github-repos/learnwren-ep07-slice-c && \
( lsof -ti tcp:3333 | xargs kill 2>/dev/null || true ) && \
pnpm nx build api && \
pnpm nx e2e api-e2e -- src/notifications.e2e-spec.ts
```
Expected: 6 tests PASS. (If Playwright reports it reused a server, re-run after the `kill` above so it launches the freshly-built `dist/apps/api/main.js`.)

- [ ] **Step 3: Commit.**

```bash
cd /Volumes/Artie-Storage/github-repos/learnwren-ep07-slice-c && \
git add apps/api-e2e/src/notifications.e2e-spec.ts && \
git commit -m "test(api-e2e): new-module notification flow

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Web `NotificationsService` (HTTP wrapper)

**Files:**
- Create: `libs/web-courses/src/lib/notifications/notifications.service.ts`
- Test: `libs/web-courses/src/lib/notifications/notifications.service.spec.ts`

- [ ] **Step 1: Write the failing test.** Create `libs/web-courses/src/lib/notifications/notifications.service.spec.ts`:

```typescript
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { NotificationsService } from './notifications.service';

function setup() {
  TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
  return { http: TestBed.inject(HttpTestingController), service: TestBed.inject(NotificationsService) };
}

describe('web NotificationsService', () => {
  it('POSTs to the notify endpoint with credentials and returns the result', async () => {
    const { http, service } = setup();
    const promise = service.notifyModule('c1', 'm1');
    const req = http.expectOne('/api/courses/c1/modules/m1/notify');
    expect(req.request.method).toBe('POST');
    expect(req.request.withCredentials).toBe(true);
    req.flush({ notifiedCount: 4 });
    expect(await promise).toEqual({ notifiedCount: 4 });
  });
});
```

- [ ] **Step 2: Run it to verify it fails.**

Run: `cd /Volumes/Artie-Storage/github-repos/learnwren-ep07-slice-c && pnpm nx test web-courses -- src/lib/notifications/notifications.service.spec.ts`
Expected: FAIL — service does not exist.

- [ ] **Step 3: Implement the service.** Create `libs/web-courses/src/lib/notifications/notifications.service.ts` (mirrors `roster/roster.service.ts`; parameterless POST sends a `null` body like `publishCourse`):

```typescript
import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { NotifyModuleResult } from '@learnwren/shared-data-models';

const OPTS = { withCredentials: true } as const;

@Injectable({ providedIn: 'root' })
export class NotificationsService {
  private readonly http = inject(HttpClient);

  notifyModule(cid: string, mid: string): Promise<NotifyModuleResult> {
    return firstValueFrom(
      this.http.post<NotifyModuleResult>(`/api/courses/${cid}/modules/${mid}/notify`, null, OPTS),
    );
  }
}
```

- [ ] **Step 4: Run the test to verify it passes.**

Run: `cd /Volumes/Artie-Storage/github-repos/learnwren-ep07-slice-c && pnpm nx test web-courses -- src/lib/notifications/notifications.service.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
cd /Volumes/Artie-Storage/github-repos/learnwren-ep07-slice-c && \
git add libs/web-courses/src/lib/notifications/notifications.service.ts libs/web-courses/src/lib/notifications/notifications.service.spec.ts && \
git commit -m "feat(web-courses): NotificationsService HTTP wrapper

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Per-module "Notify students" button (module-item + module-tree)

**Files:**
- Modify: `libs/web-courses/src/lib/components/module-item/module-item.component.ts` + `.html`
- Test: `libs/web-courses/src/lib/components/module-item/module-item.component.spec.ts`
- Modify: `libs/web-courses/src/lib/components/module-tree/module-tree.component.ts` + `.html`

- [ ] **Step 1: Write the failing button test.** In `libs/web-courses/src/lib/components/module-item/module-item.component.spec.ts` (append; if the file does not exist, create it with the imports shown):

```typescript
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Lesson, Module } from '@learnwren/shared-data-models';

import { ModuleItemComponent } from './module-item.component';

const T0 = '2026-01-01T00:00:00.000Z';
function mod(overrides: Partial<Module> = {}): Module {
  return { id: 'm1' as never, courseId: 'c1' as never, title: 'Module One', order: 0,
    createdAt: T0 as never, updatedAt: T0 as never, ...overrides };
}
const lessons: Lesson[] = [
  { id: 'l1' as never, moduleId: 'm1' as never, title: 'L1', order: 0, createdAt: T0 as never, updatedAt: T0 as never },
];

function setup(inputs: { module?: Module; lessons?: Lesson[]; coursePublished?: boolean } = {}) {
  TestBed.configureTestingModule({ imports: [ModuleItemComponent] });
  const fixture = TestBed.createComponent(ModuleItemComponent);
  fixture.componentRef.setInput('module', inputs.module ?? mod());
  fixture.componentRef.setInput('lessons', inputs.lessons ?? lessons);
  fixture.componentRef.setInput('courseId', 'c1');
  fixture.componentRef.setInput('coursePublished', inputs.coursePublished ?? false);
  fixture.detectChanges();
  return fixture;
}

describe('ModuleItemComponent — notify button', () => {
  let q: (sel: string) => Element | null;
  beforeEach(() => { /* no-op; q bound per test via fixture */ });

  it('shows "Notify students" when published, has lessons, and not yet notified', () => {
    const f = setup({ coursePublished: true });
    q = (s) => (f.nativeElement as HTMLElement).querySelector(s);
    expect(q('[data-testid="module-notify"]')).toBeTruthy();
    expect(q('[data-testid="module-notified"]')).toBeFalsy();
  });

  it('hides the button on a draft course', () => {
    const f = setup({ coursePublished: false });
    expect((f.nativeElement as HTMLElement).querySelector('[data-testid="module-notify"]')).toBeFalsy();
  });

  it('hides the button when the module has no lessons', () => {
    const f = setup({ coursePublished: true, lessons: [] });
    expect((f.nativeElement as HTMLElement).querySelector('[data-testid="module-notify"]')).toBeFalsy();
  });

  it('shows the "notified" label and hides the button once notified', () => {
    const f = setup({ coursePublished: true, module: mod({ studentsNotifiedAt: T0 as never }) });
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="module-notify"]')).toBeFalsy();
    expect(el.querySelector('[data-testid="module-notified"]')).toBeTruthy();
  });

  it('emits notifyModule when the button is clicked', () => {
    const f = setup({ coursePublished: true });
    const emitted = vi.fn();
    f.componentInstance.notifyModule.subscribe(emitted);
    (f.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('[data-testid="module-notify"]')!.click();
    expect(emitted).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to verify it fails.**

Run: `cd /Volumes/Artie-Storage/github-repos/learnwren-ep07-slice-c && pnpm nx test web-courses -- src/lib/components/module-item/module-item.component.spec.ts`
Expected: FAIL — `coursePublished` input / `notifyModule` output / button do not exist.

- [ ] **Step 3: Add inputs/outputs to `module-item.component.ts`.** Add `computed` to the `@angular/core` import and `DatePipe` to the `@angular/common`-sourced imports list; add to the `@Component({ imports: [...] })` array `DatePipe`; and add these members to the class:

```typescript
  readonly coursePublished = input<boolean>(false);
  readonly notifyModule = output<void>();

  readonly alreadyNotified = computed(() => this.module().studentsNotifiedAt != null);
  readonly canNotify = computed(
    () => this.coursePublished() && this.lessons().length > 0 && !this.alreadyNotified(),
  );
```

(`input`, `output`, `signal` are already imported in this file; add `computed`. Import `DatePipe` via `import { DatePipe } from '@angular/common';`.)

- [ ] **Step 4: Add the button to `module-item.component.html`.** In the `<header>` (beside the "Delete module" button), add:

```html
    @if (canNotify()) {
      <button
        lwButton
        variant="ghost"
        data-testid="module-notify"
        type="button"
        (click)="notifyModule.emit()"
      >
        Notify students
      </button>
    } @else if (coursePublished() && alreadyNotified()) {
      <span class="text-xs text-ink-3" data-testid="module-notified">
        Students notified {{ module().studentsNotifiedAt | date: 'mediumDate' }}
      </span>
    }
```

- [ ] **Step 5: Run the module-item test to verify it passes.**

Run: `cd /Volumes/Artie-Storage/github-repos/learnwren-ep07-slice-c && pnpm nx test web-courses -- src/lib/components/module-item/module-item.component.spec.ts`
Expected: PASS (5 cases).

- [ ] **Step 6: Forward through `module-tree`.** In `libs/web-courses/src/lib/components/module-tree/module-tree.component.ts`, add to the class:

```typescript
  readonly coursePublished = input<boolean>(false);
  readonly notifyModule = output<string>();
```

In `libs/web-courses/src/lib/components/module-tree/module-tree.component.html`, add two bindings to the `<lib-module-item …>` element:

```html
        [coursePublished]="coursePublished()"
        (notifyModule)="notifyModule.emit(node.module.id)"
```

- [ ] **Step 7: Build to confirm the template + types compile.**

Run: `cd /Volumes/Artie-Storage/github-repos/learnwren-ep07-slice-c && pnpm nx build web-courses`
Expected: build succeeds.

- [ ] **Step 8: Commit.**

```bash
cd /Volumes/Artie-Storage/github-repos/learnwren-ep07-slice-c && \
git add libs/web-courses/src/lib/components/module-item/module-item.component.ts libs/web-courses/src/lib/components/module-item/module-item.component.html libs/web-courses/src/lib/components/module-item/module-item.component.spec.ts libs/web-courses/src/lib/components/module-tree/module-tree.component.ts libs/web-courses/src/lib/components/module-tree/module-tree.component.html && \
git commit -m "feat(web-courses): per-module Notify students button

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Wire the notify action into the course editor

**Files:**
- Modify: `libs/web-courses/src/lib/course-editor-page/course-editor-page.component.ts` + `.html`
- Test: `libs/web-courses/src/lib/course-editor-page/course-editor-page.component.spec.ts`

- [ ] **Step 1: Write the failing handler tests.** In `libs/web-courses/src/lib/course-editor-page/course-editor-page.component.spec.ts`, add a `NotificationsService` mock to the existing TestBed setup and add two tests. If the existing spec mocks `CoursesService`, reuse that mock and ensure its `getCourseTree` resolves (so the constructor's `refresh()` settles without HTTP). Add to the `providers` array:

```typescript
// at top of the spec:
import { NotificationsService } from '../notifications/notifications.service';
// in setup: declare and provide the mock
const notifications = { notifyModule: vi.fn() };
// providers: [ ..., { provide: NotificationsService, useValue: notifications } ]
```

```typescript
it('onNotifyModule notifies and shows a confirmation message', async () => {
  notifications.notifyModule.mockResolvedValue({ notifiedCount: 5 });
  await fixture.componentInstance.onNotifyModule('m1');
  expect(notifications.notifyModule).toHaveBeenCalledWith('course-1', 'm1');
  expect(fixture.componentInstance.notice()).toContain('Notified 5 students');
});

it('onNotifyModule shows an error when the call fails', async () => {
  notifications.notifyModule.mockRejectedValue(new Error('boom'));
  await fixture.componentInstance.onNotifyModule('m1');
  expect(fixture.componentInstance.error()).toBeTruthy();
});
```

(The `ActivatedRoute` stub already provides `id=course-1`, so `cid()` resolves to `course-1`. If the existing spec uses a real `CoursesService` + `HttpTestingController`, instead mock `CoursesService.getCourseTree` for these two tests so `refresh()` does not issue an unflushed request.)

- [ ] **Step 2: Run to verify it fails.**

Run: `cd /Volumes/Artie-Storage/github-repos/learnwren-ep07-slice-c && pnpm nx test web-courses -- src/lib/course-editor-page/course-editor-page.component.spec.ts`
Expected: FAIL — `onNotifyModule` / `notice` do not exist.

- [ ] **Step 3: Implement the handler.** In `course-editor-page.component.ts`: import and inject the service, add a `notice` signal, and add the handler:

```typescript
import { NotificationsService } from '../notifications/notifications.service';
// ...
  private readonly notifications = inject(NotificationsService);
  readonly notice = signal<string | null>(null);
// ...
  async onNotifyModule(moduleId: string): Promise<void> {
    this.error.set(null);
    this.notice.set(null);
    try {
      const { notifiedCount } = await this.notifications.notifyModule(this.cid(), moduleId);
      this.notice.set(`Notified ${notifiedCount} student${notifiedCount === 1 ? '' : 's'}.`);
      await this.refresh();
    } catch {
      this.error.set('Failed to notify students.');
    }
  }
```

- [ ] **Step 4: Wire the template.** In `course-editor-page.component.html`: on the `<lib-module-tree …>` element add two bindings, and add a success-notice banner next to the existing `error` banner:

```html
        [coursePublished]="tree()?.course?.status === 'PUBLISHED'"
        (notifyModule)="onNotifyModule($event)"
```

```html
  @if (notice()) {
    <p class="mt-4 text-sm text-good" data-testid="editor-notice" role="status">
      {{ notice() }}
    </p>
  }
```

- [ ] **Step 5: Run tests + build.**

Run: `cd /Volumes/Artie-Storage/github-repos/learnwren-ep07-slice-c && pnpm nx test web-courses -- src/lib/course-editor-page/course-editor-page.component.spec.ts && pnpm nx build web-courses`
Expected: PASS + build succeeds.

- [ ] **Step 6: Commit.**

```bash
cd /Volumes/Artie-Storage/github-repos/learnwren-ep07-slice-c && \
git add libs/web-courses/src/lib/course-editor-page/course-editor-page.component.ts libs/web-courses/src/lib/course-editor-page/course-editor-page.component.html libs/web-courses/src/lib/course-editor-page/course-editor-page.component.spec.ts && \
git commit -m "feat(web-courses): wire notify action into the course editor

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Docs — README + USER_GUIDE

**Files:**
- Modify: `README.md`
- Modify: `docs/USER_GUIDE.md`

- [ ] **Step 1: Add the Slice C bullet to `README.md`.** Immediately after the EP-07 Slice B bullet, add:

```markdown
> - **EP-07 Slice C: New-module notification (US-07-03)** — a course owner clicks **Notify students** on a module in the course editor to email every active enrollee that a new module is available, with a link to the course (`/catalog/:id`). Owner-only, one-shot per module (`POST /api/courses/:cid/modules/:mid/notify`, `CourseOwnerGuard`), gated to a published course with at least one lesson; the module is stamped `studentsNotifiedAt` so the action cannot repeat. Best-effort email through the shared `EmailTransport` seam (console in dev, SMTP in prod). No in-app notifications, no student opt-out, no retries/queue (deferred). **EP-07 (Instructor Dashboard) is complete with this slice.**
```

- [ ] **Step 2: Update the Slice B bullet's trailing sentence.** In the Slice B bullet, change the closing "Only Slice C (new-module notification) remains in EP-07." to "New-module notification (US-07-03) shipped in Slice C."

- [ ] **Step 3: Add a USER_GUIDE note.** In `docs/USER_GUIDE.md`, under the instructor course-management section, add a short subsection:

```markdown
### Notifying students of a new module

When you add a new module to a **published** course, enrolled students are not told automatically. Once the module has at least one lesson and is ready, click **Notify students** on that module in the course editor to email every active enrollee a short note with a link to the course. This can be done **once per module** — after notifying, the button is replaced with "Students notified ⟨date⟩". Minor edits (renaming, editing lessons, replacing a video, updating materials) never email students.
```

- [ ] **Step 4: Commit.**

```bash
cd /Volumes/Artie-Storage/github-repos/learnwren-ep07-slice-c && \
git add README.md docs/USER_GUIDE.md && \
git commit -m "docs(ep07): record Slice C new-module notification

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: Full verification gate + mutation

**Files:** none (verification only; optional config tweak).

- [ ] **Step 1: Run the unified gate** (lint + test + typecheck + build for the touched libs, then build the deployable api):

```bash
cd /Volumes/Artie-Storage/github-repos/learnwren-ep07-slice-c && \
pnpm nx sync && \
pnpm nx run-many -t lint test typecheck build -p shared-data-models api-courses api-auth web-courses && \
pnpm nx build api
```
Expected: all green.

- [ ] **Step 2: Mutation — api-courses (scoped to the new notify files).** Use ONE comma-separated `--mutate` (never include `*.spec.ts`):

```bash
cd /Volumes/Artie-Storage/github-repos/learnwren-ep07-slice-c && \
pnpm exec stryker run stryker.api-courses.config.mjs --mutate "libs/api-courses/src/lib/notifications/notifications.service.ts,libs/api-courses/src/lib/notifications/notifications.controller.ts,libs/api-courses/src/lib/errors/courses.exception.ts"
```
Expected: ≥ 80% adjusted on the new files. If survivors remain (e.g. the `notifiedCount` increment, the `email !== ''` filter, the `status !== 'PUBLISHED'` comparison), add an assertion that pins the exact behaviour and re-run.

- [ ] **Step 3: Mutation — web-courses.**

```bash
cd /Volumes/Artie-Storage/github-repos/learnwren-ep07-slice-c && \
pnpm exec stryker run stryker.web-courses.config.mjs --mutate "libs/web-courses/src/lib/notifications/notifications.service.ts,libs/web-courses/src/lib/components/module-item/module-item.component.ts"
```
Expected: ≥ 80% adjusted. Kill string/boolean survivors on `canNotify`/`alreadyNotified` and the URL by asserting the exact button-visibility matrix (already covered in Task 8) and the POST URL (Task 7). (`email-transport/**` is excluded from api-auth mutation by design — no api-auth mutation run is needed for the new email method.)

- [ ] **Step 4: Manual smoke (optional but recommended).** With `pnpm emulators` + `pnpm start` running: register an instructor, create + publish a course, add a module with a lesson, enrol a second account, then click **Notify students** — confirm the toast/notice "Notified 1 student." and the console-transport `[new-module-email]` log line, and that the button flips to "Students notified ⟨date⟩".

- [ ] **Step 5 (optional): add a `mutate:web-courses` npm script** for parity with the other libs (web-courses currently has none) in `package.json`: `"mutate:web-courses": "stryker run stryker.web-courses.config.mjs"`. Commit separately if added.

---

## After the plan

When all tasks pass and the gate is green, use **superpowers:finishing-a-development-branch** to land `feat/ep07-slice-c-new-module-notification` onto `main` via a local `--no-ff` merge (the user's standing preference), then remove the worktree. The EP-07 closing memory should be updated to record Slice C shipped and EP-07 complete.

## Self-review notes (for the implementer)

- **`updateModule` also bumps `updatedAt`** on every call — that is acceptable here (announcing a module is a legitimate "touch"). Do NOT add a new repo method; `updateModule(cid, mid, { studentsNotifiedAt })` is the stamp.
- **`getModule` and `listLessonsByModule` already exist** on `CoursesRepository` — reuse them; do not recreate.
- **Keep `studentsNotifiedAt` optional** on `Module` — a required field breaks api-courses tsc silently under vitest.
- **The stamp is at-most-once:** it is written even if some sends fail and even if there are zero deliverable recipients (one-shot per module is the documented behaviour). The already-notified guard is what makes the action idempotent.
