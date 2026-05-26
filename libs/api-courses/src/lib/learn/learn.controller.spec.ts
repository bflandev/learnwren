import type { ExecutionContext, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import axios from 'axios';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { FirebaseSessionGuard } from '@learnwren/api-auth';
import { FIREBASE_AUTH, FIRESTORE } from '@learnwren/api-firebase';
import type {
  Course,
  CourseId,
  ISODateString,
  Lesson,
  LessonId,
  LessonView,
  ModuleId,
  UserId,
} from '@learnwren/shared-data-models';

import { InvalidPositionException } from './errors/learn.exception';
import { LessonEnrollmentGuard } from './guards/lesson-enrollment.guard';
import { LessonEnrollmentOrOwnerGuard } from './guards/lesson-enrollment-or-owner.guard';
import { LearnController } from './learn.controller';
import { LearnExceptionFilter } from './learn.exception-filter';
import { LearnService } from './learn.service';
import type { LessonScopedRequest } from './types/lesson-scoped-request';

const CID = 'course-1' as CourseId;
const LID = 'lesson-1' as LessonId;
const MID = 'module-1' as ModuleId;

const COURSE: Course = {
  id: CID,
  instructorId: 'instructor-1' as Course['instructorId'],
  title: 'Test Course',
  status: 'PUBLISHED',
  modules: [],
  createdAt: '2026-01-01T00:00:00Z' as Course['createdAt'],
  updatedAt: '2026-01-01T00:00:00Z' as Course['updatedAt'],
};

const LESSON: Lesson = {
  id: LID,
  moduleId: MID,
  title: 'Test Lesson',
  description: 'A description',
  videoId: undefined,
  createdAt: '2026-01-01T00:00:00Z' as Lesson['createdAt'],
  updatedAt: '2026-01-01T00:00:00Z' as Lesson['updatedAt'],
};

const LESSON_VIEW: LessonView = {
  course: { id: CID, title: 'Test Course', status: 'PUBLISHED' },
  lesson: {
    id: LID,
    moduleId: MID,
    title: 'Test Lesson',
    description: 'A description',
    videoId: null,
    videoState: null,
  },
  progress: null,
  materials: [],
};

const USER_ID = 'student-1' as UserId;

function makeReq(overrides: Partial<LessonScopedRequest> = {}): LessonScopedRequest {
  return {
    course: COURSE,
    lesson: LESSON,
    user: { uid: USER_ID, email: 'student@test.com', role: 'STUDENT', emailVerified: true },
    params: { cid: CID, lid: LID },
    ...overrides,
  } as LessonScopedRequest;
}

async function buildController(svc: Partial<LearnService>): Promise<LearnController> {
  const mod = await Test.createTestingModule({
    controllers: [LearnController],
    providers: [
      { provide: LearnService, useValue: svc },
      { provide: FIRESTORE, useValue: {} },
      { provide: FIREBASE_AUTH, useValue: {} },
    ],
  })
    .overrideGuard(FirebaseSessionGuard)
    .useValue({ canActivate: () => true })
    .overrideGuard(LessonEnrollmentOrOwnerGuard)
    .useValue({ canActivate: () => true })
    .overrideGuard(LessonEnrollmentGuard)
    .useValue({ canActivate: () => true })
    .compile();
  return mod.get(LearnController);
}

// ─── HTTP-level harness for guard-integration tests ────────────────────────

type CanActivateFn = (ctx: ExecutionContext) => boolean | Promise<boolean>;

/**
 * A guard that passes and attaches the fixture course/lesson/user onto the request.
 * Mirrors what the real guards do when they grant access.
 */
function makePassingGuard(course: Course, lesson: Lesson): { canActivate: CanActivateFn } {
  return {
    canActivate: (ctx: ExecutionContext) => {
      const req = ctx.switchToHttp().getRequest<LessonScopedRequest>();
      req.course = course;
      req.lesson = lesson;
      req.user = {
        uid: USER_ID,
        email: 'student@test.com',
        role: 'STUDENT',
        emailVerified: true,
      };
      return true;
    },
  };
}

/**
 * Builds a full NestApplication (HTTP) with all guards overridden.
 * The session and enrollment-or-owner guards attach fixture data by default (passing);
 * callers can override any guard to test rejection scenarios.
 */
async function buildApp(opts: {
  svc: Partial<LearnService>;
  sessionGuard?: { canActivate: CanActivateFn };
  enrollmentOrOwnerGuard?: { canActivate: CanActivateFn };
  enrollmentGuard?: { canActivate: CanActivateFn };
}): Promise<INestApplication> {
  const passing = makePassingGuard(COURSE, LESSON);
  // Session guard just marks req.user (for simplicity, the passing guard already does that)
  const sessionPassthrough = {
    canActivate: (ctx: ExecutionContext) => {
      const req = ctx.switchToHttp().getRequest<LessonScopedRequest>();
      req.user = {
        uid: USER_ID,
        email: 'student@test.com',
        role: 'STUDENT',
        emailVerified: true,
      };
      return true;
    },
  };

  const mod = await Test.createTestingModule({
    controllers: [LearnController],
    providers: [
      { provide: LearnService, useValue: opts.svc },
      { provide: LearnExceptionFilter, useClass: LearnExceptionFilter },
      { provide: FIRESTORE, useValue: {} },
      { provide: FIREBASE_AUTH, useValue: {} },
    ],
  })
    .overrideGuard(FirebaseSessionGuard)
    .useValue(opts.sessionGuard ?? sessionPassthrough)
    .overrideGuard(LessonEnrollmentOrOwnerGuard)
    .useValue(opts.enrollmentOrOwnerGuard ?? passing)
    .overrideGuard(LessonEnrollmentGuard)
    .useValue(opts.enrollmentGuard ?? passing)
    .compile();

  const app = mod.createNestApplication();
  app.useGlobalFilters(new LearnExceptionFilter());
  await app.listen(0); // random available port
  return app;
}

/** GET url via axios, return { status, body }. Throws are swallowed (axios 4xx). */
async function httpGet(
  app: INestApplication,
  path: string,
): Promise<{ status: number; body: unknown }> {
  const port = (app.getHttpServer().address() as { port: number }).port;
  try {
    const res = await axios.get(`http://localhost:${port}${path}`);
    return { status: res.status, body: res.data };
  } catch (err: unknown) {
    if (axios.isAxiosError(err) && err.response) {
      return { status: err.response.status, body: err.response.data };
    }
    throw err;
  }
}

/** POST url via axios, return { status, body }. */
async function httpPost(
  app: INestApplication,
  path: string,
): Promise<{ status: number; body: unknown }> {
  const port = (app.getHttpServer().address() as { port: number }).port;
  try {
    const res = await axios.post(`http://localhost:${port}${path}`, {});
    return { status: res.status, body: res.data };
  } catch (err: unknown) {
    if (axios.isAxiosError(err) && err.response) {
      return { status: err.response.status, body: err.response.data };
    }
    throw err;
  }
}

// ─── Direct controller tests (GET) ─────────────────────────────────────────

describe('LearnController', () => {
  let ctrl: LearnController;
  let svc: { getLessonView: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    svc = { getLessonView: vi.fn().mockResolvedValue(LESSON_VIEW) };
    ctrl = await buildController(svc as unknown as LearnService);
  });

  it('calls getLessonView with req.course and req.lesson and returns the result', async () => {
    const req = makeReq();
    const result = await ctrl.getLesson(req);
    expect(svc.getLessonView).toHaveBeenCalledWith(USER_ID, COURSE, LESSON);
    expect(result).toBe(LESSON_VIEW);
  });

  it('throws when req.course is missing (guard bypass scenario)', async () => {
    const req = makeReq({ course: undefined });
    await expect(ctrl.getLesson(req)).rejects.toThrow(
      'LearnController: guard did not attach course/lesson/user',
    );
    expect(svc.getLessonView).not.toHaveBeenCalled();
  });

  it('throws when req.lesson is missing (guard bypass scenario)', async () => {
    const req = makeReq({ lesson: undefined });
    await expect(ctrl.getLesson(req)).rejects.toThrow(
      'LearnController: guard did not attach course/lesson/user',
    );
    expect(svc.getLessonView).not.toHaveBeenCalled();
  });
});

// ─── Direct controller tests (POST) ────────────────────────────────────────

describe('LearnController.markComplete (direct call)', () => {
  const COMPLETED_AT = '2026-05-25T12:00:00.000Z' as ISODateString;
  let ctrl: LearnController;
  let svc: {
    getLessonView: ReturnType<typeof vi.fn>;
    markLessonComplete: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    svc = {
      getLessonView: vi.fn().mockResolvedValue(LESSON_VIEW),
      markLessonComplete: vi.fn().mockResolvedValue({ completedAt: COMPLETED_AT }),
    };
    ctrl = await buildController(svc as unknown as LearnService);
  });

  it('calls markLessonComplete with userId, course, lesson and returns { completedAt }', async () => {
    const req = makeReq();
    const result = await ctrl.markComplete(req, {});
    expect(svc.markLessonComplete).toHaveBeenCalledWith(USER_ID, COURSE, LESSON);
    expect(result).toEqual({ completedAt: COMPLETED_AT });
  });

  it('is idempotent: returns same completedAt on repeated calls', async () => {
    const req = makeReq();
    const first = await ctrl.markComplete(req, {});
    const second = await ctrl.markComplete(req, {});
    expect(first).toEqual(second);
    expect(svc.markLessonComplete).toHaveBeenCalledTimes(2);
  });

  it('throws when req.course is missing (guard bypass scenario)', async () => {
    const req = makeReq({ course: undefined });
    await expect(ctrl.markComplete(req, {})).rejects.toThrow(
      'LearnController: guard did not attach course/lesson/user',
    );
    expect(svc.markLessonComplete).not.toHaveBeenCalled();
  });

  it('throws when req.lesson is missing (guard bypass scenario)', async () => {
    const req = makeReq({ lesson: undefined });
    await expect(ctrl.markComplete(req, {})).rejects.toThrow(
      'LearnController: guard did not attach course/lesson/user',
    );
    expect(svc.markLessonComplete).not.toHaveBeenCalled();
  });
});

// ─── HTTP integration: POST guard enforcement ───────────────────────────────

describe('POST /learn/courses/:cid/lessons/:lid/complete (HTTP guard integration)', () => {
  const COMPLETED_AT = '2026-05-25T12:00:00.000Z' as ISODateString;

  it('returns 200 with { completedAt } for an enrolled student (happy path)', async () => {
    const svc = {
      getLessonView: vi.fn().mockResolvedValue(LESSON_VIEW),
      markLessonComplete: vi.fn().mockResolvedValue({ completedAt: COMPLETED_AT }),
    };
    const app = await buildApp({ svc: svc as unknown as LearnService });
    try {
      const { status, body } = await httpPost(
        app,
        `/learn/courses/${CID}/lessons/${LID}/complete`,
      );
      expect(status).toBe(200);
      expect((body as { completedAt: string }).completedAt).toBe(COMPLETED_AT);
    } finally {
      await app.close();
    }
  });

  it('is idempotent: two calls return the same completedAt', async () => {
    const svc = {
      getLessonView: vi.fn().mockResolvedValue(LESSON_VIEW),
      markLessonComplete: vi.fn().mockResolvedValue({ completedAt: COMPLETED_AT }),
    };
    const app = await buildApp({ svc: svc as unknown as LearnService });
    try {
      const first = await httpPost(app, `/learn/courses/${CID}/lessons/${LID}/complete`);
      const second = await httpPost(app, `/learn/courses/${CID}/lessons/${LID}/complete`);
      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect(first.body).toEqual(second.body);
    } finally {
      await app.close();
    }
  });

  it('returns 403 NOT_ENROLLED_LESSON when LessonEnrollmentGuard rejects', async () => {
    const { NotEnrolledLessonException } = await import('./errors/learn.exception');
    const svc = {
      getLessonView: vi.fn(),
      markLessonComplete: vi.fn(),
    };
    const app = await buildApp({
      svc: svc as unknown as LearnService,
      enrollmentGuard: {
        canActivate: () => {
          throw new NotEnrolledLessonException();
        },
      },
    });
    try {
      const { status, body } = await httpPost(
        app,
        `/learn/courses/${CID}/lessons/${LID}/complete`,
      );
      expect(status).toBe(403);
      expect((body as { error: { code: string } }).error.code).toBe('NOT_ENROLLED_LESSON');
      expect(svc.markLessonComplete).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('GET route still returns 200 via LessonEnrollmentOrOwnerGuard (guard split verified)', async () => {
    const svc = {
      getLessonView: vi.fn().mockResolvedValue(LESSON_VIEW),
      markLessonComplete: vi.fn(),
    };
    // LessonEnrollmentGuard rejects — but GET only uses LessonEnrollmentOrOwnerGuard (which passes)
    const app = await buildApp({
      svc: svc as unknown as LearnService,
      enrollmentGuard: {
        canActivate: () => {
          throw new Error('LessonEnrollmentGuard should not be invoked for GET');
        },
      },
    });
    try {
      const { status } = await httpGet(app, `/learn/courses/${CID}/lessons/${LID}`);
      expect(status).toBe(200);
    } finally {
      await app.close();
    }
  });
});

// ─── GET /learn progress field shape ───────────────────────────────────────

describe('GET /learn/courses/:cid/lessons/:lid progress field', () => {
  it('progress is null for the course owner (owner has no enrollment row)', async () => {
    const ownerView: LessonView = { ...LESSON_VIEW, progress: null };
    const svc = {
      getLessonView: vi.fn().mockResolvedValue(ownerView),
      markLessonComplete: vi.fn(),
    };
    const req = makeReq({
      user: { uid: COURSE.instructorId, email: 'owner@test.com', role: 'INSTRUCTOR', emailVerified: true },
    });
    const ctrl = await buildController(svc as unknown as LearnService);
    const result = await ctrl.getLesson(req);
    expect(result.progress).toBeNull();
  });

  it('progress has { completedAt } for an enrolled student who has completed the lesson', async () => {
    const completedView: LessonView = {
      ...LESSON_VIEW,
      progress: { completedAt: '2026-05-20T00:00:00.000Z' as ISODateString },
    };
    const svc = {
      getLessonView: vi.fn().mockResolvedValue(completedView),
      markLessonComplete: vi.fn(),
    };
    const ctrl = await buildController(svc as unknown as LearnService);
    const req = makeReq();
    const result = await ctrl.getLesson(req);
    expect(result.progress).toEqual({ completedAt: '2026-05-20T00:00:00.000Z' });
  });

  it('progress has { completedAt: null } for an enrolled student who has NOT yet completed', async () => {
    const notCompletedView: LessonView = {
      ...LESSON_VIEW,
      progress: { completedAt: null },
    };
    const svc = {
      getLessonView: vi.fn().mockResolvedValue(notCompletedView),
      markLessonComplete: vi.fn(),
    };
    const ctrl = await buildController(svc as unknown as LearnService);
    const req = makeReq();
    const result = await ctrl.getLesson(req);
    expect(result.progress).toEqual({ completedAt: null });
  });
});

// ─── Direct controller tests (POST /position) ──────────────────────────────

describe('LearnController.savePosition', () => {
  let ctrl: LearnController;
  let svc: {
    getLessonView: ReturnType<typeof vi.fn>;
    markLessonComplete: ReturnType<typeof vi.fn>;
    savePosition: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    svc = {
      getLessonView: vi.fn().mockResolvedValue(LESSON_VIEW),
      markLessonComplete: vi.fn(),
      savePosition: vi.fn(async () => ({ lastWatchedSeconds: 42 })),
    };
    ctrl = await buildController(svc as unknown as LearnService);
  });

  it('returns 200 with the stored value on a valid POST', async () => {
    const req = makeReq();
    const result = await ctrl.savePosition(req, { seconds: 42 });
    expect(result).toEqual({ lastWatchedSeconds: 42 });
    expect(svc.savePosition).toHaveBeenCalledWith(USER_ID, COURSE, LESSON, 42);
  });

  it('throws InvalidPositionException when seconds is missing', async () => {
    const req = makeReq();
    await expect(ctrl.savePosition(req, {} as never)).rejects.toBeInstanceOf(
      InvalidPositionException,
    );
    expect(svc.savePosition).not.toHaveBeenCalled();
  });

  it('throws InvalidPositionException when seconds is negative', async () => {
    const req = makeReq();
    await expect(ctrl.savePosition(req, { seconds: -1 })).rejects.toBeInstanceOf(
      InvalidPositionException,
    );
    expect(svc.savePosition).not.toHaveBeenCalled();
  });

  it('throws InvalidPositionException when seconds is NaN', async () => {
    const req = makeReq();
    await expect(ctrl.savePosition(req, { seconds: Number.NaN })).rejects.toBeInstanceOf(
      InvalidPositionException,
    );
    expect(svc.savePosition).not.toHaveBeenCalled();
  });

  it('throws InvalidPositionException when seconds is Infinity', async () => {
    const req = makeReq();
    await expect(
      ctrl.savePosition(req, { seconds: Number.POSITIVE_INFINITY }),
    ).rejects.toBeInstanceOf(InvalidPositionException);
    expect(svc.savePosition).not.toHaveBeenCalled();
  });

  it('throws InvalidPositionException when seconds is not a number', async () => {
    const req = makeReq();
    await expect(
      ctrl.savePosition(req, { seconds: '42' as unknown as number }),
    ).rejects.toBeInstanceOf(InvalidPositionException);
    expect(svc.savePosition).not.toHaveBeenCalled();
  });
});
