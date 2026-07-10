import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  CategoryId,
  Course,
  CourseCategory,
  CourseId,
  ISODateString,
  Lesson,
  LessonId,
  Module,
  ModuleId,
  UserId,
} from '@learnwren/shared-data-models';

import { CategoryNotFoundException } from './categories/categories.exception';
import type { CategoriesRepository } from './categories/categories.repository';
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

function buildVideoSvcFake() {
  return {
    deleteForLesson: vi.fn(async () => undefined),
  };
}

function buildMaterialsSvcFake() {
  return {
    deleteForLesson: vi.fn(async () => undefined),
  };
}

function buildCoverSvcFake() {
  return {
    removeCover: vi.fn(async () => ({ updatedAt: FIXED_DATE })),
  };
}

function buildEnrollmentRepoFake() {
  return {
    deleteAllForCourse: vi.fn(async () => undefined),
  };
}

/** Every category exists by default; individual tests override `get`. */
function buildCategoriesRepoFake() {
  return {
    get: vi.fn(async (id: CategoryId) => ({
      id,
      name: 'Any',
      createdAt: FIXED_DATE,
      updatedAt: FIXED_DATE,
    })),
  };
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
  let categoriesRepo: ReturnType<typeof buildCategoriesRepoFake>;
  let service: CoursesService;

  beforeEach(() => {
    repo = buildRepoFake();
    categoriesRepo = buildCategoriesRepoFake();
    let counter = 0;
    repo.newId.mockImplementation(() => `id-${++counter}`);
    service = new CoursesService(
      repo as unknown as CoursesRepository,
      buildVideoSvcFake() as never,
      buildMaterialsSvcFake() as never,
      buildCoverSvcFake() as never,
      buildEnrollmentRepoFake() as never,
      categoriesRepo as unknown as CategoriesRepository,
    );
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
      // nowIso() must stamp both timestamps with a real ISO instant — a
      // BlockStatement mutant emptying nowIso would leave them undefined.
      expect(out.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      expect(out.updatedAt).toBe(out.createdAt);
      expect(out.enrollmentCount).toBe(0);
      expect(repo.createCourse).toHaveBeenCalledWith(out);
    });

    it('includes optional fields when supplied', async () => {
      const out = await service.createCourse(INSTRUCTOR_UID, {
        title: 'T',
        description: 'D',
        longDescription: 'LD',
        category: 'PROGRAMMING' as CourseCategory,
        difficulty: 'BEGINNER',
      });
      expect(out.longDescription).toBe('LD');
      expect(out.category).toBe('PROGRAMMING');
      expect(out.difficulty).toBe('BEGINNER');
      expect(categoriesRepo.get).toHaveBeenCalledWith('PROGRAMMING');
    });

    it('rejects an unknown category without writing the course (US-08-02)', async () => {
      categoriesRepo.get.mockResolvedValue(null);

      await expect(
        service.createCourse(INSTRUCTOR_UID, {
          title: 'T',
          description: 'D',
          category: 'NOPE' as CourseCategory,
        }),
      ).rejects.toBeInstanceOf(CategoryNotFoundException);
      expect(repo.createCourse).not.toHaveBeenCalled();
    });

    it('skips category validation when no category is supplied', async () => {
      await service.createCourse(INSTRUCTOR_UID, { title: 'T', description: 'D' });
      expect(categoriesRepo.get).not.toHaveBeenCalled();
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
    beforeEach(() => {
      repo.getCourse.mockResolvedValue(makeCourse());
    });

    it('forwards the patch to the repository unchanged', async () => {
      await service.updateCourse('cid-1' as CourseId, { title: 'New' });
      expect(repo.updateCourse).toHaveBeenCalledWith('cid-1', { title: 'New' });
    });

    it('forwards a multi-field patch', async () => {
      await service.updateCourse('cid-1' as CourseId, {
        title: 'X',
        description: 'Y',
        category: 'DESIGN' as CourseCategory,
      });
      expect(repo.updateCourse).toHaveBeenCalledWith('cid-1', {
        title: 'X',
        description: 'Y',
        category: 'DESIGN',
      });
      expect(categoriesRepo.get).toHaveBeenCalledWith('DESIGN');
    });

    it('rejects an unknown category without writing (US-08-02)', async () => {
      categoriesRepo.get.mockResolvedValue(null);
      await expect(
        service.updateCourse('cid-1' as CourseId, { category: 'NOPE' as CourseCategory }),
      ).rejects.toBeInstanceOf(CategoryNotFoundException);
      expect(repo.updateCourse).not.toHaveBeenCalled();
    });

    it('skips category validation when the patch has no category', async () => {
      await service.updateCourse('cid-1' as CourseId, { title: 'New' });
      expect(categoriesRepo.get).not.toHaveBeenCalled();
    });

    it('throws CourseNotFoundException when the course is gone', async () => {
      // Regression: previously delegated straight to repo.updateCourse, so a
      // PATCH racing a concurrent delete surfaced a raw Firestore NOT_FOUND
      // as 500 instead of a structured 404.
      repo.getCourse.mockResolvedValue(null);
      await expect(
        service.updateCourse('gone' as CourseId, { title: 'X' }),
      ).rejects.toBeInstanceOf(CourseNotFoundException);
      expect(repo.updateCourse).not.toHaveBeenCalled();
    });
  });

  describe('deleteCourse', () => {
    it('invokes recursive delete', async () => {
      await service.deleteCourse('cid-1' as CourseId);
      expect(repo.deleteCourseRecursive).toHaveBeenCalledWith('cid-1');
    });

    // ─── cascade tests ──────────────────────────────────────────────────────

    function makeLesson(id: string, mid: string): Lesson {
      return {
        id: id as LessonId,
        moduleId: mid as ModuleId,
        title: id,
        order: 0,
        createdAt: FIXED_DATE,
        updatedAt: FIXED_DATE,
      };
    }

    function makeModule(id: string): Module {
      return {
        id: id as ModuleId,
        courseId: 'cid-1' as CourseId,
        title: id,
        order: 0,
        createdAt: FIXED_DATE,
        updatedAt: FIXED_DATE,
      };
    }

    function buildFullService() {
      const videoSvc = buildVideoSvcFake();
      const materialsSvc = buildMaterialsSvcFake();
      const coverSvc = { removeCover: vi.fn(async () => ({ updatedAt: FIXED_DATE })) };
      const enrollmentRepo = { deleteAllForCourse: vi.fn(async () => undefined) };
      const fullRepo = buildRepoFake();

      // 2 modules, 2 lessons each
      const mods: Module[] = [makeModule('mid-1'), makeModule('mid-2')];
      const lessonsM1: Lesson[] = [makeLesson('lid-a', 'mid-1'), makeLesson('lid-b', 'mid-1')];
      const lessonsM2: Lesson[] = [makeLesson('lid-c', 'mid-2'), makeLesson('lid-d', 'mid-2')];
      fullRepo.listModulesByCourse.mockResolvedValue(mods);
      fullRepo.listLessonsByModule.mockImplementation(async (_cid, mid) =>
        mid === 'mid-1' ? lessonsM1 : lessonsM2,
      );
      fullRepo.deleteCourseRecursive.mockResolvedValue(undefined);

      const svc = new CoursesService(
        fullRepo as unknown as CoursesRepository,
        videoSvc as never,
        materialsSvc as never,
        coverSvc as never,
        enrollmentRepo as never,
      );
      return { svc, videoSvc, materialsSvc, coverSvc, enrollmentRepo, fullRepo };
    }

    it('calls deleteForLesson on BOTH video and materials services for ALL 4 lessons', async () => {
      const { svc, videoSvc, materialsSvc } = buildFullService();
      await svc.deleteCourse('cid-1' as CourseId);

      for (const lid of ['lid-a', 'lid-b', 'lid-c', 'lid-d']) {
        expect(videoSvc.deleteForLesson).toHaveBeenCalledWith(lid);
        expect(materialsSvc.deleteForLesson).toHaveBeenCalledWith(lid);
      }
      expect(videoSvc.deleteForLesson).toHaveBeenCalledTimes(4);
      expect(materialsSvc.deleteForLesson).toHaveBeenCalledTimes(4);
    });

    it('calls enrollmentRepo.deleteAllForCourse with the course id', async () => {
      const { svc, enrollmentRepo } = buildFullService();
      await svc.deleteCourse('cid-1' as CourseId);
      expect(enrollmentRepo.deleteAllForCourse).toHaveBeenCalledWith('cid-1');
    });

    it('calls coverSvc.removeCover with the course id', async () => {
      const { svc, coverSvc } = buildFullService();
      await svc.deleteCourse('cid-1' as CourseId);
      expect(coverSvc.removeCover).toHaveBeenCalledWith('cid-1');
    });

    it('calls deleteCourseRecursive LAST — after all cascade steps', async () => {
      const { svc, videoSvc, materialsSvc, coverSvc, enrollmentRepo, fullRepo } = buildFullService();
      await svc.deleteCourse('cid-1' as CourseId);

      const deleteCourseCallOrder = fullRepo.deleteCourseRecursive.mock.invocationCallOrder[0] as number;
      const lastVideoCallOrder = Math.max(
        ...(videoSvc.deleteForLesson as unknown as { mock: { invocationCallOrder: number[] } })
          .mock.invocationCallOrder,
      );
      const lastMaterialsCallOrder = Math.max(
        ...(materialsSvc.deleteForLesson as unknown as { mock: { invocationCallOrder: number[] } })
          .mock.invocationCallOrder,
      );
      const enrollmentCallOrder = (enrollmentRepo.deleteAllForCourse as unknown as { mock: { invocationCallOrder: number[] } })
        .mock.invocationCallOrder[0] as number;
      const coverCallOrder = (coverSvc.removeCover as unknown as { mock: { invocationCallOrder: number[] } })
        .mock.invocationCallOrder[0] as number;

      expect(deleteCourseCallOrder).toBeGreaterThan(lastVideoCallOrder);
      expect(deleteCourseCallOrder).toBeGreaterThan(lastMaterialsCallOrder);
      expect(deleteCourseCallOrder).toBeGreaterThan(enrollmentCallOrder);
      expect(deleteCourseCallOrder).toBeGreaterThan(coverCallOrder);
    });

    it('does NOT call deleteCourseRecursive when videoSvc.deleteForLesson rejects (retryable)', async () => {
      const { fullRepo, materialsSvc, coverSvc, enrollmentRepo } = buildFullService();
      const failingVideoSvc = { deleteForLesson: vi.fn().mockRejectedValue(new Error('storage down')) };
      const svc = new CoursesService(
        fullRepo as unknown as CoursesRepository,
        failingVideoSvc as never,
        materialsSvc as never,
        coverSvc as never,
        enrollmentRepo as never,
      );
      fullRepo.listModulesByCourse.mockResolvedValue([makeModule('mid-1')]);
      fullRepo.listLessonsByModule.mockResolvedValue([makeLesson('lid-a', 'mid-1')]);

      await expect(svc.deleteCourse('cid-1' as CourseId)).rejects.toThrow('storage down');
      expect(fullRepo.deleteCourseRecursive).not.toHaveBeenCalled();
    });

    it('cover missing does NOT fail the delete — removeCover rejection is best-effort', async () => {
      const { svc, coverSvc, fullRepo } = buildFullService();
      // Simulate a "no cover" scenario — deleteObject on a missing file resolves (idempotent)
      // and the cover service's removeCover should also be best-effort.
      // Override to reject (simulating unexpected storage error on a missing cover).
      (coverSvc.removeCover as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('not found'));

      // Should NOT throw — best-effort cover removal
      await svc.deleteCourse('cid-1' as CourseId);
      expect(fullRepo.deleteCourseRecursive).toHaveBeenCalledWith('cid-1');
    });
  });
});

describe('CoursesService — module operations', () => {
  let repo: RepoFake;
  let service: CoursesService;
  const CID = 'cid-1' as CourseId;

  beforeEach(() => {
    repo = buildRepoFake();
    let counter = 0;
    repo.newId.mockImplementation(() => `id-${++counter}`);
    service = new CoursesService(
      repo as unknown as CoursesRepository,
      buildVideoSvcFake() as never,
      buildMaterialsSvcFake() as never,
      buildCoverSvcFake() as never,
      buildEnrollmentRepoFake() as never,
    );
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
    function makeModuleDoc(id = 'mid-1'): Module {
      return {
        id: id as ModuleId,
        courseId: CID,
        title: 'M',
        order: 0,
        createdAt: FIXED_DATE,
        updatedAt: FIXED_DATE,
      };
    }

    function makeLesson(id: string, mid = 'mid-1'): Lesson {
      return {
        id: id as LessonId,
        moduleId: mid as ModuleId,
        title: id,
        order: 0,
        createdAt: FIXED_DATE,
        updatedAt: FIXED_DATE,
      };
    }

    it('checks existence then recursive-deletes (module with no lessons)', async () => {
      repo.getModule.mockResolvedValue(makeModuleDoc());
      repo.listLessonsByModule.mockResolvedValue([]);
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

    // ─── cascade tests ──────────────────────────────────────────────────────

    function buildCascadeService() {
      const videoSvc = buildVideoSvcFake();
      const materialsSvc = buildMaterialsSvcFake();
      const fullRepo = buildRepoFake();

      // 2 lessons in the module
      const lessons: Lesson[] = [makeLesson('lid-a'), makeLesson('lid-b')];
      fullRepo.getModule.mockResolvedValue(makeModuleDoc());
      fullRepo.listLessonsByModule.mockResolvedValue(lessons);
      fullRepo.deleteModuleRecursive.mockResolvedValue(undefined);

      const svc = new CoursesService(
        fullRepo as unknown as CoursesRepository,
        videoSvc as never,
        materialsSvc as never,
        buildCoverSvcFake() as never,
        buildEnrollmentRepoFake() as never,
      );
      return { svc, videoSvc, materialsSvc, fullRepo };
    }

    it('calls deleteForLesson on BOTH video and materials services for ALL lessons in the module', async () => {
      const { svc, videoSvc, materialsSvc } = buildCascadeService();
      await svc.deleteModule(CID, 'mid-1' as ModuleId);

      for (const lid of ['lid-a', 'lid-b']) {
        expect(videoSvc.deleteForLesson).toHaveBeenCalledWith(lid);
        expect(materialsSvc.deleteForLesson).toHaveBeenCalledWith(lid);
      }
      expect(videoSvc.deleteForLesson).toHaveBeenCalledTimes(2);
      expect(materialsSvc.deleteForLesson).toHaveBeenCalledTimes(2);
    });

    it('calls deleteModuleRecursive LAST — after all per-lesson cascade steps', async () => {
      const { svc, videoSvc, materialsSvc, fullRepo } = buildCascadeService();
      await svc.deleteModule(CID, 'mid-1' as ModuleId);

      const deleteModuleCallOrder = fullRepo.deleteModuleRecursive.mock.invocationCallOrder[0] as number;
      const lastVideoCallOrder = Math.max(
        ...(videoSvc.deleteForLesson as unknown as { mock: { invocationCallOrder: number[] } })
          .mock.invocationCallOrder,
      );
      const lastMaterialsCallOrder = Math.max(
        ...(materialsSvc.deleteForLesson as unknown as { mock: { invocationCallOrder: number[] } })
          .mock.invocationCallOrder,
      );

      expect(deleteModuleCallOrder).toBeGreaterThan(lastVideoCallOrder);
      expect(deleteModuleCallOrder).toBeGreaterThan(lastMaterialsCallOrder);
    });

    it('does NOT call deleteModuleRecursive when videoSvc.deleteForLesson rejects (retryable)', async () => {
      const { fullRepo, materialsSvc } = buildCascadeService();
      const failingVideoSvc = { deleteForLesson: vi.fn().mockRejectedValue(new Error('storage down')) };
      const svc = new CoursesService(
        fullRepo as unknown as CoursesRepository,
        failingVideoSvc as never,
        materialsSvc as never,
        buildCoverSvcFake() as never,
        buildEnrollmentRepoFake() as never,
      );

      await expect(svc.deleteModule(CID, 'mid-1' as ModuleId)).rejects.toThrow('storage down');
      expect(fullRepo.deleteModuleRecursive).not.toHaveBeenCalled();
    });

    it('missing module still 404s without any cascade calls', async () => {
      const { fullRepo, videoSvc, materialsSvc } = buildCascadeService();
      fullRepo.getModule.mockResolvedValue(null);
      const svc = new CoursesService(
        fullRepo as unknown as CoursesRepository,
        videoSvc as never,
        materialsSvc as never,
        buildCoverSvcFake() as never,
        buildEnrollmentRepoFake() as never,
      );

      const { ModuleNotFoundException } = await import('./errors/courses.exception');
      await expect(svc.deleteModule(CID, 'nope' as ModuleId)).rejects.toBeInstanceOf(
        ModuleNotFoundException,
      );
      expect(videoSvc.deleteForLesson).not.toHaveBeenCalled();
      expect(materialsSvc.deleteForLesson).not.toHaveBeenCalled();
      expect(fullRepo.deleteModuleRecursive).not.toHaveBeenCalled();
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

    it('places modules in the requested order by id, preserving each doc\'s other fields', async () => {
      const mod1 = m('mid-1', 0);
      const mod2 = m('mid-2', 1);
      const mod3 = m('mid-3', 2);
      mod1.title = 'Module Alpha';
      mod2.title = 'Module Beta';
      mod3.title = 'Module Gamma';
      repo.listModulesByCourse.mockResolvedValue([mod1, mod2, mod3]);
      repo.writeModuleOrder.mockResolvedValue(undefined);

      const result = await service.reorderModules(CID, ['mid-3', 'mid-1', 'mid-2'] as ModuleId[]);

      expect(result[0].id).toBe('mid-3');
      expect(result[0].title).toBe('Module Gamma');
      expect(result[0].order).toBe(0);
      expect(result[1].id).toBe('mid-1');
      expect(result[1].title).toBe('Module Alpha');
      expect(result[1].order).toBe(1);
      expect(result[2].id).toBe('mid-2');
      expect(result[2].title).toBe('Module Beta');
      expect(result[2].order).toBe(2);
    });

    it('throws StaleReorderException when proposed list is shorter than current', async () => {
      repo.listModulesByCourse.mockResolvedValue([m('a', 0), m('b', 1), m('c', 2)]);
      const { StaleReorderException } = await import('./errors/courses.exception');
      await expect(
        service.reorderModules(CID, ['a', 'b'] as ModuleId[]),
      ).rejects.toBeInstanceOf(StaleReorderException);
      expect(repo.writeModuleOrder).not.toHaveBeenCalled();
    });

    it('throws StaleReorderException when proposed list is longer than current', async () => {
      repo.listModulesByCourse.mockResolvedValue([m('a', 0), m('b', 1)]);
      const { StaleReorderException } = await import('./errors/courses.exception');
      await expect(
        service.reorderModules(CID, ['a', 'b', 'c'] as ModuleId[]),
      ).rejects.toBeInstanceOf(StaleReorderException);
      expect(repo.writeModuleOrder).not.toHaveBeenCalled();
    });

    it('throws StaleReorderException when proposed is longer via a duplicate (set sizes still match)', async () => {
      // current=2, proposed=3 but one id is duplicated → both as Sets have
      // size 2, so only the `length` check catches it. Pins that check; a
      // ConditionalExpression mutant skipping it would let the reorder through.
      repo.listModulesByCourse.mockResolvedValue([m('a', 0), m('b', 1)]);
      const { StaleReorderException } = await import('./errors/courses.exception');
      await expect(
        service.reorderModules(CID, ['a', 'b', 'b'] as ModuleId[]),
      ).rejects.toBeInstanceOf(StaleReorderException);
      expect(repo.writeModuleOrder).not.toHaveBeenCalled();
    });

    it('throws StaleReorderException when proposed list contains an id not in current (same length)', async () => {
      repo.listModulesByCourse.mockResolvedValue([m('a', 0), m('b', 1), m('c', 2)]);
      const { StaleReorderException } = await import('./errors/courses.exception');
      await expect(
        service.reorderModules(CID, ['a', 'b', 'z'] as ModuleId[]),
      ).rejects.toBeInstanceOf(StaleReorderException);
      expect(repo.writeModuleOrder).not.toHaveBeenCalled();
    });

    // pre-existing tests kept for cross-coverage
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

    it('rejects same-length duplicate payload via the set-size check', async () => {
      // Pins the case where the `length` check is satisfied (3 vs 3) but
      // proposedIds collapses to a smaller Set than currentIds. Without the
      // `current.size !== proposed.size` line, a payload like ["a","a","b"]
      // against ["a","b","c"] would silently double-write "a" and drop "c".
      repo.listModulesByCourse.mockResolvedValue([m('a', 0), m('b', 1), m('c', 2)]);
      const { StaleReorderException } = await import('./errors/courses.exception');
      await expect(
        service.reorderModules(CID, ['a', 'a', 'b'] as ModuleId[]),
      ).rejects.toBeInstanceOf(StaleReorderException);
      expect(repo.writeModuleOrder).not.toHaveBeenCalled();
    });
  });
});

describe('CoursesService — lesson operations', () => {
  let repo: RepoFake;
  let service: CoursesService;
  const CID = 'cid-1' as CourseId;
  const MID = 'mid-1' as ModuleId;

  beforeEach(() => {
    repo = buildRepoFake();
    let counter = 0;
    repo.newId.mockImplementation(() => `id-${++counter}`);
    service = new CoursesService(
      repo as unknown as CoursesRepository,
      buildVideoSvcFake() as never,
      buildMaterialsSvcFake() as never,
      buildCoverSvcFake() as never,
      buildEnrollmentRepoFake() as never,
    );
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

    it('omitting description does not pass a description key to the repository', async () => {
      repo.appendLesson.mockImplementation(async (cid, mid, seed) => ({
        ...seed,
        order: 0,
        createdAt: FIXED_DATE,
        updatedAt: FIXED_DATE,
      }));
      await service.createLesson(CID, MID, { title: 'No-desc lesson' });
      const [, , seed] = repo.appendLesson.mock.calls[0] as [unknown, unknown, Record<string, unknown>];
      expect(Object.prototype.hasOwnProperty.call(seed, 'description')).toBe(false);
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

    it('cascades to VideoService.deleteForLesson before deleting the lesson doc', async () => {
      const videoSvc = buildVideoSvcFake();
      const svc = new CoursesService(repo as unknown as CoursesRepository, videoSvc as never, buildMaterialsSvcFake() as never, buildCoverSvcFake() as never, buildEnrollmentRepoFake() as never);
      repo.getLesson.mockResolvedValue({
        id: 'lid-1' as LessonId,
        moduleId: MID,
        title: 'L',
        order: 0,
        createdAt: FIXED_DATE,
        updatedAt: FIXED_DATE,
      });
      await svc.deleteLesson(CID, MID, 'lid-1' as LessonId);
      expect(videoSvc.deleteForLesson).toHaveBeenCalledWith('lid-1');
      expect(repo.deleteLesson).toHaveBeenCalledWith(CID, MID, 'lid-1');

      // Verify ordering: deleteForLesson must be called before deleteLesson.
      const dflCallIdx = (videoSvc.deleteForLesson as unknown as { mock: { invocationCallOrder: number[] } })
        .mock.invocationCallOrder[0];
      const dlCallIdx = repo.deleteLesson.mock.invocationCallOrder[0];
      expect(dflCallIdx).toBeLessThan(dlCallIdx);
    });

    it('cascades to MaterialsService.deleteForLesson before deleting the lesson doc', async () => {
      const videoSvc = buildVideoSvcFake();
      const materialsSvc = buildMaterialsSvcFake();
      const svc = new CoursesService(
        repo as unknown as CoursesRepository,
        videoSvc as never,
        materialsSvc as never,
        buildCoverSvcFake() as never,
        buildEnrollmentRepoFake() as never,
      );
      repo.getLesson.mockResolvedValue({
        id: 'lid-1' as LessonId,
        moduleId: MID,
        title: 'L',
        order: 0,
        createdAt: FIXED_DATE,
        updatedAt: FIXED_DATE,
      });
      await svc.deleteLesson(CID, MID, 'lid-1' as LessonId);
      expect(materialsSvc.deleteForLesson).toHaveBeenCalledWith('lid-1');

      const mflCallIdx = (
        materialsSvc.deleteForLesson as unknown as { mock: { invocationCallOrder: number[] } }
      ).mock.invocationCallOrder[0];
      const dlCallIdx = repo.deleteLesson.mock.invocationCallOrder[0];
      expect(mflCallIdx).toBeLessThan(dlCallIdx);
    });

    it('does not delete the lesson doc when deleteForLesson rejects', async () => {
      const videoSvc = {
        deleteForLesson: vi.fn().mockRejectedValue(new Error('storage down')),
      };
      const svc = new CoursesService(repo as unknown as CoursesRepository, videoSvc as never, buildMaterialsSvcFake() as never, buildCoverSvcFake() as never, buildEnrollmentRepoFake() as never);
      repo.getLesson.mockResolvedValue({
        id: 'lid-1' as LessonId,
        moduleId: MID,
        title: 'L',
        order: 0,
        createdAt: FIXED_DATE,
        updatedAt: FIXED_DATE,
      });
      await expect(
        svc.deleteLesson(CID, MID, 'lid-1' as LessonId),
      ).rejects.toThrow('storage down');
      expect(repo.deleteLesson).not.toHaveBeenCalled();
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

    it('places lessons in the requested order by id, preserving each doc\'s other fields', async () => {
      const lesson1 = l('lid-1', 0);
      const lesson2 = l('lid-2', 1);
      const lesson3 = l('lid-3', 2);
      lesson1.title = 'Lesson Alpha';
      lesson2.title = 'Lesson Beta';
      lesson3.title = 'Lesson Gamma';
      repo.listLessonsByModule.mockResolvedValue([lesson1, lesson2, lesson3]);
      repo.writeLessonOrder.mockResolvedValue(undefined);

      const result = await service.reorderLessons(CID, MID, ['lid-3', 'lid-1', 'lid-2'] as LessonId[]);

      expect(result[0].id).toBe('lid-3');
      expect(result[0].title).toBe('Lesson Gamma');
      expect(result[0].order).toBe(0);
      expect(result[1].id).toBe('lid-1');
      expect(result[1].title).toBe('Lesson Alpha');
      expect(result[1].order).toBe(1);
      expect(result[2].id).toBe('lid-2');
      expect(result[2].title).toBe('Lesson Beta');
      expect(result[2].order).toBe(2);
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
