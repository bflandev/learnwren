import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type {
  Course,
  CourseCategory,
  CourseDifficulty,
  CourseTree,
  Lesson,
  Module,
  PublishEligibility,
} from '@learnwren/shared-data-models';

export type { CourseTree } from '@learnwren/shared-data-models';

const BASE = '/api/courses';
const OPTS = { withCredentials: true } as const;

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

@Injectable({ providedIn: 'root' })
export class CoursesService {
  private readonly http = inject(HttpClient);

  createCourse(input: CreateCourseInput): Promise<Course> {
    return firstValueFrom(this.http.post<Course>(BASE, input, OPTS));
  }

  listCourses(): Promise<Course[]> {
    return firstValueFrom(this.http.get<Course[]>(BASE, OPTS));
  }

  getCourseTree(cid: string): Promise<CourseTree> {
    return firstValueFrom(this.http.get<CourseTree>(`${BASE}/${cid}`, OPTS));
  }

  updateCourse(cid: string, patch: UpdateCourseInput): Promise<void> {
    return firstValueFrom(this.http.patch<void>(`${BASE}/${cid}`, patch, OPTS));
  }

  deleteCourse(cid: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${BASE}/${cid}`, OPTS));
  }

  createModule(cid: string, input: { title: string }): Promise<Module> {
    return firstValueFrom(this.http.post<Module>(`${BASE}/${cid}/modules`, input, OPTS));
  }

  updateModule(cid: string, mid: string, patch: { title: string }): Promise<void> {
    return firstValueFrom(this.http.patch<void>(`${BASE}/${cid}/modules/${mid}`, patch, OPTS));
  }

  deleteModule(cid: string, mid: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${BASE}/${cid}/modules/${mid}`, OPTS));
  }

  reorderModules(cid: string, ids: string[]): Promise<Module[]> {
    return firstValueFrom(this.http.put<Module[]>(`${BASE}/${cid}/modules/order`, { ids }, OPTS));
  }

  createLesson(
    cid: string,
    mid: string,
    input: { title: string; description?: string },
  ): Promise<Lesson> {
    return firstValueFrom(this.http.post<Lesson>(`${BASE}/${cid}/modules/${mid}/lessons`, input, OPTS));
  }

  updateLesson(
    cid: string,
    mid: string,
    lid: string,
    patch: { title?: string; description?: string },
  ): Promise<void> {
    return firstValueFrom(this.http.patch<void>(`${BASE}/${cid}/modules/${mid}/lessons/${lid}`, patch, OPTS));
  }

  deleteLesson(cid: string, mid: string, lid: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${BASE}/${cid}/modules/${mid}/lessons/${lid}`, OPTS));
  }

  reorderLessons(cid: string, mid: string, ids: string[]): Promise<Lesson[]> {
    return firstValueFrom(this.http.put<Lesson[]>(`${BASE}/${cid}/modules/${mid}/lessons/order`, { ids }, OPTS));
  }

  // ────────────────────────── Slice D — publish gate ──────────────────────────

  getPublishEligibility(cid: string): Promise<PublishEligibility> {
    return firstValueFrom(
      this.http.get<PublishEligibility>(`${BASE}/${cid}/publish-eligibility`, OPTS),
    );
  }

  publishCourse(cid: string): Promise<Course> {
    return firstValueFrom(this.http.post<Course>(`${BASE}/${cid}/publish`, null, OPTS));
  }

  unpublishCourse(cid: string): Promise<Course> {
    return firstValueFrom(this.http.post<Course>(`${BASE}/${cid}/unpublish`, null, OPTS));
  }

  archiveCourse(cid: string): Promise<Course> {
    return firstValueFrom(this.http.post<Course>(`${BASE}/${cid}/archive`, null, OPTS));
  }

  restoreCourse(cid: string): Promise<Course> {
    return firstValueFrom(this.http.post<Course>(`${BASE}/${cid}/restore`, null, OPTS));
  }
}
