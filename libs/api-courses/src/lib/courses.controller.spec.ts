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

import { InstructorRoleGuard } from '@learnwren/api-auth';

import { CourseOwnerGuard } from './course-owner.guard';
import { CoursesController } from './courses.controller';
import { CoursesRepository } from './courses.repository';
import { CoursesService } from './courses.service';
import { PublishService } from './publish/publish.service';
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
      {
        provide: PublishService,
        useValue: {
          computeEligibility: vi.fn(),
          publish: vi.fn(),
          unpublish: vi.fn(),
          archive: vi.fn(),
          restore: vi.fn(),
        },
      },
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
    expect(result).toEqual({ ok: true });
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
    const result = await controller.updateModule(CID, MID, { title: 'New' });
    expect(service.updateModule).toHaveBeenCalledWith(CID, MID, { title: 'New' });
    expect(result).toEqual({ ok: true });
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
    const result = await controller.updateLesson(CID, MID, LID, { title: 'New' });
    expect(service.updateLesson).toHaveBeenCalledWith(CID, MID, LID, { title: 'New' });
    expect(result).toEqual({ ok: true });
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

describe('CoursesController — slice D routes', () => {
  let controller: CoursesController;
  let publishSvc: {
    computeEligibility: ReturnType<typeof vi.fn>;
    publish: ReturnType<typeof vi.fn>;
    unpublish: ReturnType<typeof vi.fn>;
    archive: ReturnType<typeof vi.fn>;
    restore: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    publishSvc = {
      computeEligibility: vi.fn(),
      publish: vi.fn(),
      unpublish: vi.fn(),
      archive: vi.fn(),
      restore: vi.fn(),
    };
    controller = new CoursesController({} as never, publishSvc as never);
  });

  it('GET /publish-eligibility returns the service result', async () => {
    const out = { eligible: true, reasons: [] };
    publishSvc.computeEligibility.mockResolvedValue(out);
    const r = await controller.getPublishEligibility('c1' as CourseId);
    expect(r).toBe(out);
    expect(publishSvc.computeEligibility).toHaveBeenCalledWith('c1');
  });

  it('POST /publish returns updated course', async () => {
    const updated = { id: 'c1', status: 'PUBLISHED' } as Course;
    publishSvc.publish.mockResolvedValue(updated);
    const r = await controller.publishCourse('c1' as CourseId);
    expect(r).toBe(updated);
    expect(publishSvc.publish).toHaveBeenCalledWith('c1');
  });

  it('POST /unpublish returns updated course', async () => {
    const updated = { id: 'c1', status: 'DRAFT' } as Course;
    publishSvc.unpublish.mockResolvedValue(updated);
    expect(await controller.unpublishCourse('c1' as CourseId)).toBe(updated);
  });

  it('POST /archive returns updated course', async () => {
    const updated = { id: 'c1', status: 'ARCHIVED' } as Course;
    publishSvc.archive.mockResolvedValue(updated);
    expect(await controller.archiveCourse('c1' as CourseId)).toBe(updated);
  });

  it('POST /restore returns updated course', async () => {
    const updated = { id: 'c1', status: 'DRAFT' } as Course;
    publishSvc.restore.mockResolvedValue(updated);
    expect(await controller.restoreCourse('c1' as CourseId)).toBe(updated);
  });
});
