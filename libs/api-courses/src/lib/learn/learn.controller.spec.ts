import { Test } from '@nestjs/testing';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { FirebaseSessionGuard } from '@learnwren/api-auth';
import { FIREBASE_AUTH, FIRESTORE } from '@learnwren/api-firebase';
import type {
  Course,
  CourseId,
  Lesson,
  LessonId,
  LessonView,
  ModuleId,
} from '@learnwren/shared-data-models';

import { LessonEnrollmentOrOwnerGuard } from './guards/lesson-enrollment-or-owner.guard';
import { LearnController } from './learn.controller';
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
};

function makeReq(overrides: Partial<LessonScopedRequest> = {}): LessonScopedRequest {
  return {
    course: COURSE,
    lesson: LESSON,
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
    .compile();
  return mod.get(LearnController);
}

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
    expect(svc.getLessonView).toHaveBeenCalledWith(COURSE, LESSON);
    expect(result).toBe(LESSON_VIEW);
  });

  it('throws when req.course is missing (guard bypass scenario)', async () => {
    const req = makeReq({ course: undefined });
    await expect(ctrl.getLesson(req)).rejects.toThrow(
      'LearnController: guard did not attach course/lesson',
    );
    expect(svc.getLessonView).not.toHaveBeenCalled();
  });

  it('throws when req.lesson is missing (guard bypass scenario)', async () => {
    const req = makeReq({ lesson: undefined });
    await expect(ctrl.getLesson(req)).rejects.toThrow(
      'LearnController: guard did not attach course/lesson',
    );
    expect(svc.getLessonView).not.toHaveBeenCalled();
  });
});
