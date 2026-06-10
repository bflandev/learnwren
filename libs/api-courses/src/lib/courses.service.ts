import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';

import { nowIso } from '@learnwren/shared-data-models';
import type {
  Course,
  CourseCategory,
  CourseDifficulty,
  CourseId,
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
} from './errors/courses.exception';
import { assertReorderSetMatches } from './reorder.util';
import type { CourseTree } from './types/loaded-course';
import { MaterialsService } from './materials/materials.service';
import { VideoService } from './video/video.service';
import { CoverImageService } from './cover/cover-image.service';
import { EnrollmentRepository } from './enrollment/enrollment.repository';

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

@Injectable()
export class CoursesService {
  private readonly logger = new Logger('CoursesService');

  constructor(
    private readonly repo: CoursesRepository,
    // forwardRef resolves the CoursesModule ↔ VideoModule runtime cycle.
    @Inject(forwardRef(() => VideoService))
    private readonly videoSvc: VideoService,
    // forwardRef resolves the CoursesModule ↔ MaterialsModule runtime cycle.
    @Inject(forwardRef(() => MaterialsService))
    private readonly materialsSvc: MaterialsService,
    private readonly coverSvc: CoverImageService,
    private readonly enrollmentRepo: EnrollmentRepository,
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
      enrollmentCount: 0,
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
    // Match the updateModule/updateLesson pattern: pre-check existence so a
    // PATCH to a since-deleted course (the race between CourseOwnerGuard's
    // read and this write) surfaces a structured 404 instead of a raw
    // Firestore NOT_FOUND that the exception filter falls through as 500.
    const existing = await this.repo.getCourse(cid);
    if (!existing) throw new CourseNotFoundException();
    await this.repo.updateCourse(cid, patch);
  }

  /**
   * Full cascade delete for a course. Children are destroyed first; the course
   * doc (the retry gate) is removed last so a failed mid-cascade request can be
   * retried safely — all steps are idempotent.
   *
   * Order:
   *   1. Video + materials cascade for every lesson across all modules.
   *   2. Cover image (best-effort — a missing cover must not abort the delete).
   *   3. Enrollment docs for all students.
   *   4. repo.deleteCourseRecursive — modules/lessons/course doc in Firestore.
   */
  async deleteCourse(cid: CourseId): Promise<void> {
    // Step 1: enumerate all modules + lessons, then cascade per lesson.
    const modules = await this.repo.listModulesByCourse(cid);
    for (const mod of modules) {
      const lessons = await this.repo.listLessonsByModule(cid, mod.id);
      for (const lesson of lessons) {
        await this.videoSvc.deleteForLesson(lesson.id);
        await this.materialsSvc.deleteForLesson(lesson.id);
      }
    }

    // Step 2: cover image — best-effort (a course may never have had a cover).
    await this.coverSvc.removeCover(cid).catch((err: unknown) => {
      this.logger.warn(
        `removeCover best-effort ignored for course ${cid}: ${(err as Error).message}`,
      );
    });

    // Step 3: delete all enrollment docs (ACTIVE + WITHDRAWN) for this course.
    await this.enrollmentRepo.deleteAllForCourse(cid);

    // Step 4: recursive Firestore delete — course doc + modules/lessons subcollections.
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
    await this.materialsSvc.deleteForLesson(lid);
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
