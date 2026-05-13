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
