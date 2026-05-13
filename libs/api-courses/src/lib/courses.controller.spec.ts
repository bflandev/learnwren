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
