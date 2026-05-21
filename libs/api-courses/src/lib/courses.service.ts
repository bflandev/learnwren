import { forwardRef, Inject, Injectable } from '@nestjs/common';

import type {
  Course,
  CourseCategory,
  CourseDifficulty,
  CourseId,
  ISODateString,
  Lesson,
  LessonId,
  Module,
  ModuleId,
  UserId,
} from '@learnwren/shared-data-models';

import { CoursesRepository } from './courses.repository';
import {
  CourseNotFoundException,
  LessonNotFoundException,
  ModuleNotFoundException,
  StaleReorderException,
} from './errors/courses.exception';
import type { CourseTree } from './types/loaded-course';
import { VideoService } from './video/video.service';

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
  constructor(
    private readonly repo: CoursesRepository,
    // forwardRef resolves the CoursesModule ↔ VideoModule runtime cycle.
    @Inject(forwardRef(() => VideoService))
    private readonly videoSvc: VideoService,
  ) {}

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
    await this.videoSvc.deleteForLesson(lid);
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
}

function assertReorderSetMatches(currentIds: string[], proposedIds: string[]): void {
  if (currentIds.length !== proposedIds.length) throw new StaleReorderException();
  const current = new Set(currentIds);
  const proposed = new Set(proposedIds);
  if (current.size !== proposed.size) throw new StaleReorderException();
  for (const id of proposed) {
    if (!current.has(id)) throw new StaleReorderException();
  }
}
