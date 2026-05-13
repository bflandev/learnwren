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
