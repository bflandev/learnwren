import { Injectable } from '@nestjs/common';

import {
  CATALOG_PAGE_SIZE,
  type CatalogSort,
  type Course,
  type CourseCatalogDetail,
  type CourseCatalogPage,
  type CourseCategory,
  type CourseDifficulty,
  type CourseId,
  type CourseSummary,
  type ISODateString,
  type UserId,
} from '@learnwren/shared-data-models';

import { CoursesRepository } from '../courses.repository';
import { CourseNotFoundException } from '../errors/courses.exception';
import { InstructorDirectory } from './instructor-directory';

export interface CatalogQuery {
  page?: number;
  sort?: CatalogSort;
  category?: CourseCategory;
  difficulty?: CourseDifficulty;
}

export interface CatalogSearchQuery {
  q: string;
  page?: number;
}

@Injectable()
export class CatalogService {
  constructor(
    private readonly repo: CoursesRepository,
    private readonly instructors: InstructorDirectory,
  ) {}

  async listCatalogue(query: CatalogQuery): Promise<CourseCatalogPage> {
    let courses = await this.repo.listPublished();
    if (query.category) {
      courses = courses.filter((c) => c.category === query.category);
    }
    if (query.difficulty) {
      courses = courses.filter((c) => c.difficulty === query.difficulty);
    }
    courses = sortCourses(courses, query.sort ?? 'NEWEST');
    return this.paginate(courses, query.page ?? 1);
  }

  async search(query: CatalogSearchQuery): Promise<CourseCatalogPage> {
    const q = query.q.trim().toLowerCase();
    const courses = await this.repo.listPublished();
    const ranked = courses
      .map((c) => ({ c, score: relevanceScore(c, q) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || compareNewest(a.c, b.c))
      .map((x) => x.c);
    return this.paginate(ranked, query.page ?? 1);
  }

  async getCourseDetail(cid: CourseId): Promise<CourseCatalogDetail> {
    const course = await this.repo.getCourse(cid);
    if (!course || course.status !== 'PUBLISHED') {
      throw new CourseNotFoundException();
    }
    const modules = await this.repo.listModulesByCourse(cid);
    const outline = await Promise.all(
      modules.map(async (m) => ({
        title: m.title,
        lessons: (await this.repo.listLessonsByModule(cid, m.id)).map((l) => ({
          title: l.title,
        })),
      })),
    );
    const lessonCount = outline.reduce((n, m) => n + m.lessons.length, 0);
    const names = await this.instructors.displayNamesFor([course.instructorId]);
    return {
      id: course.id,
      title: course.title,
      description: course.description,
      longDescription: course.longDescription,
      category: course.category,
      difficulty: course.difficulty,
      instructorDisplayName: names.get(course.instructorId) ?? 'Instructor',
      lessonCount,
      modules: outline,
      publishedAt: publishedAt(course),
    };
  }

  private async paginate(courses: Course[], page: number): Promise<CourseCatalogPage> {
    const total = courses.length;
    const totalPages = Math.ceil(total / CATALOG_PAGE_SIZE);
    const start = (page - 1) * CATALOG_PAGE_SIZE;
    const slice = courses.slice(start, start + CATALOG_PAGE_SIZE);
    const names = await this.instructors.displayNamesFor(slice.map((c) => c.instructorId));
    return {
      items: slice.map((c) => toSummary(c, names)),
      page,
      pageSize: CATALOG_PAGE_SIZE,
      total,
      totalPages,
    };
  }
}

/** PUBLISHED courses always carry publishedAt; createdAt is a defensive fallback. */
function publishedAt(c: Course): ISODateString {
  return c.publishedAt ?? c.createdAt;
}

function compareNewest(a: Course, b: Course): number {
  return (publishedAt(b) as string).localeCompare(publishedAt(a) as string);
}

function sortCourses(courses: Course[], sort: CatalogSort): Course[] {
  const copy = [...courses];
  if (sort === 'ALPHABETICAL') {
    copy.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
  } else {
    copy.sort(compareNewest);
  }
  return copy;
}

/** Title match outranks a description-only match. */
function relevanceScore(course: Course, q: string): number {
  if (course.title.toLowerCase().includes(q)) return 2;
  if (course.description.toLowerCase().includes(q)) return 1;
  return 0;
}

function toSummary(course: Course, names: Map<UserId, string>): CourseSummary {
  return {
    id: course.id,
    title: course.title,
    description: course.description,
    category: course.category,
    difficulty: course.difficulty,
    instructorDisplayName: names.get(course.instructorId) ?? 'Instructor',
    publishedAt: publishedAt(course),
  };
}
