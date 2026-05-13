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
