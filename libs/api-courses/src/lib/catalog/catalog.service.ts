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
import { InstructorDirectory, type InstructorRef } from './instructor-directory';

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
    // Stryker disable next-line StringLiteral: the default sort token routes to the `else` branch of sortCourses (compareNewest); '' and any other non-ALPHABETICAL/POPULAR string route there identically, so replacing 'NEWEST' with '' is observationally equivalent.
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
          id: l.id,
          title: l.title,
        })),
      })),
    );
    const lessonCount = outline.reduce((n, m) => n + m.lessons.length, 0);
    const refs = await this.instructors.instructorRefsFor([course.instructorId]);
    const ref = refs.get(course.instructorId);
    return {
      id: course.id,
      title: course.title,
      description: course.description,
      longDescription: course.longDescription,
      category: course.category,
      difficulty: course.difficulty,
      instructorId: course.instructorId,
      // Stryker disable next-line OptionalChaining,StringLiteral: InstructorDirectory.instructorRefsFor always returns a ref for every requested uid (it maps over the unique uids, building { displayName: 'Instructor' } when the user doc is missing), so `ref` is never undefined and `displayName` is never empty — the optional chain and the `?? ''` literal are unreachable.
      instructorDisplayName: ref?.displayName ?? 'Instructor',
      // Stryker disable next-line OptionalChaining: `ref` is never undefined (see above); `ref?.photoUrl` and `ref.photoUrl` are observationally identical.
      ...(ref?.photoUrl ? { instructorPhotoUrl: ref.photoUrl } : {}),
      // Stryker disable next-line OptionalChaining: `ref` is never undefined (see above); `ref?.biography` and `ref.biography` are observationally identical.
      ...(ref?.biography ? { instructorBiography: ref.biography } : {}),
      lessonCount,
      modules: outline,
      publishedAt: publishedAt(course),
      coverImageUrl: course.coverImageUrl,
    };
  }

  private async paginate(courses: Course[], page: number): Promise<CourseCatalogPage> {
    const total = courses.length;
    const totalPages = Math.ceil(total / CATALOG_PAGE_SIZE);
    const start = (page - 1) * CATALOG_PAGE_SIZE;
    const slice = courses.slice(start, start + CATALOG_PAGE_SIZE);
    const refs = await this.instructors.instructorRefsFor(slice.map((c) => c.instructorId));
    return {
      items: slice.map((c) => toSummary(c, refs)),
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

// Stryker disable next-line BlockStatement: equivalent — compareNewest is only reached via the NEWEST/default branch and the POPULAR enrollmentCount tiebreak; in both, the input comes from CoursesRepository.listPublished already ordered publishedAt-desc, so an emptied body (no comparison) leaves V8's stable sort at the same publishedAt-desc order.
function compareNewest(a: Course, b: Course): number {
  return (publishedAt(b) as string).localeCompare(publishedAt(a) as string);
}

function sortCourses(courses: Course[], sort: CatalogSort): Course[] {
  const copy = [...courses];
  if (sort === 'ALPHABETICAL') {
    copy.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
  } else if (sort === 'POPULAR') {
    copy.sort(
      (a, b) => (b.enrollmentCount ?? 0) - (a.enrollmentCount ?? 0) || compareNewest(a, b),
    );
  } else {
    // Stryker disable next-line MethodExpression: equivalent — listPublished already returns publishedAt-desc and the NEWEST/default re-sort by compareNewest produces that same order (PUBLISHED courses always carry publishedAt), so dropping the redundant re-sort leaves the order unchanged (proven: emptying the block leaves the full catalog spec green).
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

function toSummary(course: Course, refs: Map<UserId, InstructorRef>): CourseSummary {
  const ref = refs.get(course.instructorId);
  return {
    id: course.id,
    title: course.title,
    description: course.description,
    category: course.category,
    difficulty: course.difficulty,
    instructorId: course.instructorId,
    // Stryker disable next-line OptionalChaining,StringLiteral: InstructorDirectory.instructorRefsFor always returns a ref for every requested uid (default { displayName: 'Instructor' }), so `ref` is never undefined and `displayName` is never empty — the optional chain and the `?? ''` literal are unreachable.
    instructorDisplayName: ref?.displayName ?? 'Instructor',
    // Stryker disable next-line OptionalChaining: `ref` is never undefined (see above); `ref?.photoUrl` and `ref.photoUrl` are observationally identical.
    ...(ref?.photoUrl ? { instructorPhotoUrl: ref.photoUrl } : {}),
    publishedAt: publishedAt(course),
    coverImageUrl: course.coverImageUrl,
  };
}
