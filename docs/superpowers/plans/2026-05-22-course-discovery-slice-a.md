# Course Discovery (EP-05 Slice A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the read-only course discovery surface — a public catalogue, keyword search, and course-detail page over `PUBLISHED` courses.

**Architecture:** A new unauthenticated `catalog/` submodule in `libs/api-courses` exposes three `GET` endpoints; a `CatalogService` loads all `PUBLISHED` courses with one Firestore query and does filter/sort/search/pagination in memory ("Approach A"). A new `libs/web-catalog` Angular library renders three pages. The `apps/web` shell switches from auth-keyed to route-keyed header rendering so guests see a header with a global search bar.

**Tech Stack:** NestJS 11 + `class-validator` DTOs (api), Firestore via the Admin SDK, Angular 21 standalone components with signals (web), Vitest unit tests, Playwright E2E.

**Spec:** `docs/superpowers/specs/2026-05-22-course-discovery-slice-a-design.md`

**Conventions baked into this plan:**
- Every `git commit` message ends with the trailer line shown in each commit step. Keep it.
- Unit tests run with `pnpm nx test <project>`; the project's whole suite runs — find the new test in the output.
- This plan is on branch `feat/ep-05-slice-a-course-discovery` (already created; the design spec is its first commit).

---

## Task 1: Catalog read-model types in `shared-data-models`

**Files:**
- Create: `libs/shared-data-models/src/lib/catalog.ts`
- Create (test): `libs/shared-data-models/src/lib/catalog.spec.ts`
- Modify: `libs/shared-data-models/src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `libs/shared-data-models/src/lib/catalog.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { CATALOG_PAGE_SIZE, CATALOG_SORT_OPTIONS } from '../index';

describe('catalog read-model', () => {
  it('exposes the two Slice A sort options (POPULAR deferred to Slice B)', () => {
    expect(CATALOG_SORT_OPTIONS).toEqual(['NEWEST', 'ALPHABETICAL']);
  });

  it('fixes the catalogue page size at 20', () => {
    expect(CATALOG_PAGE_SIZE).toBe(20);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test shared-data-models`
Expected: FAIL — `CATALOG_PAGE_SIZE` / `CATALOG_SORT_OPTIONS` are not exported.

- [ ] **Step 3: Create `catalog.ts`**

Create `libs/shared-data-models/src/lib/catalog.ts`:

```ts
import type { CourseId, ISODateString } from './common';
import type { CourseCategory, CourseDifficulty } from './course';

/**
 * One card in the catalogue or a search-results list. Carries only fields
 * stored on the course document plus the instructor's resolved display name.
 * Deliberately excludes lessonCount — computing it per card would require an
 * N-course fan-out into the lessons subcollection.
 */
export interface CourseSummary {
  id: CourseId;
  title: string;
  description: string;
  category?: CourseCategory;
  difficulty?: CourseDifficulty;
  instructorDisplayName: string;
  publishedAt: ISODateString;
}

/** Paginated envelope shared by the catalogue and search responses. */
export interface CourseCatalogPage {
  items: CourseSummary[];
  page: number; // 1-based
  pageSize: number; // constant — CATALOG_PAGE_SIZE
  total: number; // total courses matching the query, before pagination
  totalPages: number; // ceil(total / pageSize); 0 when total is 0
}

/** Catalogue sort options. POPULAR (by enrolment count) is deferred to Slice B. */
export const CATALOG_SORT_OPTIONS = ['NEWEST', 'ALPHABETICAL'] as const;
export type CatalogSort = (typeof CATALOG_SORT_OPTIONS)[number];

/** Courses shown per page. UC-05-01 requires "at least 20 per page". */
export const CATALOG_PAGE_SIZE = 20;

/** A module in the public course outline — titles only, no IDs, no content. */
export interface CatalogModuleOutline {
  title: string;
  lessons: { title: string }[];
}

/** The full public course detail page payload. */
export interface CourseCatalogDetail {
  id: CourseId;
  title: string;
  description: string;
  longDescription?: string;
  category?: CourseCategory;
  difficulty?: CourseDifficulty;
  instructorDisplayName: string;
  lessonCount: number;
  modules: CatalogModuleOutline[];
  publishedAt: ISODateString;
}
```

- [ ] **Step 4: Export it from the barrel**

In `libs/shared-data-models/src/index.ts`, add the line after `export * from './lib/publish';`:

```ts
export * from './lib/catalog';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm nx test shared-data-models`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add libs/shared-data-models/src/lib/catalog.ts libs/shared-data-models/src/lib/catalog.spec.ts libs/shared-data-models/src/index.ts
git commit -m "$(cat <<'EOF'
feat(shared-data-models): add catalog read-model types

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `CoursesRepository.listPublished()`

The catalogue's only Firestore query — every course with `status === 'PUBLISHED'`.

**Files:**
- Modify: `libs/api-courses/src/lib/courses.repository.ts`
- Modify (test): `libs/api-courses/src/lib/courses.repository.spec.ts`

- [ ] **Step 1: Write the failing test**

In `libs/api-courses/src/lib/courses.repository.spec.ts`, add this `describe` block at the end of the top-level `describe` body (the file already imports `createFakeFirestore` and constructs a `CoursesRepository`; match its existing setup — construct the repo with a seeded fake Firestore):

```ts
describe('listPublished', () => {
  it('returns only courses whose status is PUBLISHED', async () => {
    const firestore = createFakeFirestore({
      'courses/c-draft': { id: 'c-draft', title: 'Draft', status: 'DRAFT' },
      'courses/c-pub-1': { id: 'c-pub-1', title: 'Pub One', status: 'PUBLISHED' },
      'courses/c-pub-2': { id: 'c-pub-2', title: 'Pub Two', status: 'PUBLISHED' },
      'courses/c-arch': { id: 'c-arch', title: 'Archived', status: 'ARCHIVED' },
    });
    const repo = new CoursesRepository(firestore as never);

    const result = await repo.listPublished();

    expect(result.map((c) => c.id).sort()).toEqual(['c-pub-1', 'c-pub-2']);
  });

  it('returns an empty array when no course is published', async () => {
    const firestore = createFakeFirestore({
      'courses/c-draft': { id: 'c-draft', title: 'Draft', status: 'DRAFT' },
    });
    const repo = new CoursesRepository(firestore as never);

    expect(await repo.listPublished()).toEqual([]);
  });
});
```

> If `courses.repository.spec.ts` constructs the repo differently (e.g. via a helper), match that helper instead — keep the two test cases identical.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test api-courses`
Expected: FAIL — `repo.listPublished` is not a function.

- [ ] **Step 3: Add the method**

In `libs/api-courses/src/lib/courses.repository.ts`, add this method to the `CoursesRepository` class, immediately after `listCoursesByInstructor`:

```ts
/** Every course with status PUBLISHED. The catalogue's only Firestore query. */
async listPublished(): Promise<Course[]> {
  const snap = await this.firestore
    .collection(COURSES)
    .where('status', '==', 'PUBLISHED')
    .get();
  return snap.docs.map((d) => d.data() as Course);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm nx test api-courses`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/api-courses/src/lib/courses.repository.ts libs/api-courses/src/lib/courses.repository.spec.ts
git commit -m "$(cat <<'EOF'
feat(api-courses): add CoursesRepository.listPublished

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `InstructorDirectory` — resolve instructor display names

A small, focused unit that batch-reads `users/{uid}` documents. Isolates the one cross-collection read.

**Files:**
- Create: `libs/api-courses/src/lib/catalog/instructor-directory.ts`
- Create (test): `libs/api-courses/src/lib/catalog/instructor-directory.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `libs/api-courses/src/lib/catalog/instructor-directory.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';

import type { UserId } from '@learnwren/shared-data-models';

import { createFakeFirestore } from '../testing/fake-firestore';
import { InstructorDirectory } from './instructor-directory';

describe('InstructorDirectory', () => {
  it('resolves display names for the given user ids', async () => {
    const firestore = createFakeFirestore({
      'users/u-1': { id: 'u-1', displayName: 'Ada Lovelace' },
      'users/u-2': { id: 'u-2', displayName: 'Grace Hopper' },
    });
    const directory = new InstructorDirectory(firestore as never);

    const names = await directory.displayNamesFor(['u-1', 'u-2'] as UserId[]);

    expect(names.get('u-1' as UserId)).toBe('Ada Lovelace');
    expect(names.get('u-2' as UserId)).toBe('Grace Hopper');
  });

  it('falls back to "Instructor" when a user document is missing', async () => {
    const firestore = createFakeFirestore({});
    const directory = new InstructorDirectory(firestore as never);

    const names = await directory.displayNamesFor(['u-ghost'] as UserId[]);

    expect(names.get('u-ghost' as UserId)).toBe('Instructor');
  });

  it('deduplicates ids and reads each user at most once', async () => {
    const firestore = createFakeFirestore({
      'users/u-1': { id: 'u-1', displayName: 'Ada Lovelace' },
    });
    const directory = new InstructorDirectory(firestore as never);

    const names = await directory.displayNamesFor(['u-1', 'u-1'] as UserId[]);

    expect(names.size).toBe(1);
    expect(names.get('u-1' as UserId)).toBe('Ada Lovelace');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test api-courses`
Expected: FAIL — cannot find `./instructor-directory`.

- [ ] **Step 3: Implement `InstructorDirectory`**

Create `libs/api-courses/src/lib/catalog/instructor-directory.ts`:

```ts
import { Inject, Injectable } from '@nestjs/common';

import { FIRESTORE, type FirestoreHandle } from '@learnwren/api-firebase';
import type { User, UserId } from '@learnwren/shared-data-models';

const USERS = 'users';
const FALLBACK_NAME = 'Instructor';

/**
 * Read-only lookup of instructor display names from the `users` collection.
 * The only place the catalogue reaches outside the `courses` collection.
 */
@Injectable()
export class InstructorDirectory {
  constructor(@Inject(FIRESTORE) private readonly firestore: FirestoreHandle) {}

  /**
   * Resolve a display name for each id. Deduplicates ids, reads the matching
   * `users/{uid}` documents in parallel, and falls back to "Instructor" for
   * any id with no user document.
   */
  async displayNamesFor(uids: UserId[]): Promise<Map<UserId, string>> {
    const unique = [...new Set(uids)];
    const entries = await Promise.all(
      unique.map(async (uid): Promise<[UserId, string]> => {
        const snap = await this.firestore.collection(USERS).doc(uid).get();
        const data = snap.exists ? (snap.data() as User) : undefined;
        return [uid, data?.displayName ?? FALLBACK_NAME];
      }),
    );
    return new Map(entries);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm nx test api-courses`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/api-courses/src/lib/catalog/instructor-directory.ts libs/api-courses/src/lib/catalog/instructor-directory.spec.ts
git commit -m "$(cat <<'EOF'
feat(api-courses): add InstructorDirectory name lookup

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Catalog query DTOs

**Files:**
- Create: `libs/api-courses/src/lib/catalog/dto/catalog-query.dto.ts`
- Create: `libs/api-courses/src/lib/catalog/dto/catalog-search.dto.ts`
- Create (test): `libs/api-courses/src/lib/catalog/dto/dto.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `libs/api-courses/src/lib/catalog/dto/dto.spec.ts`:

```ts
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { CatalogQueryDto } from './catalog-query.dto';
import { CatalogSearchDto } from './catalog-search.dto';

describe('CatalogQueryDto', () => {
  it('accepts an empty query (all fields optional)', () => {
    const dto = plainToInstance(CatalogQueryDto, {});
    expect(validateSync(dto)).toHaveLength(0);
  });

  it('coerces the page string to a number', () => {
    const dto = plainToInstance(CatalogQueryDto, { page: '3' });
    expect(validateSync(dto)).toHaveLength(0);
    expect(dto.page).toBe(3);
  });

  it('rejects page below 1', () => {
    const dto = plainToInstance(CatalogQueryDto, { page: '0' });
    expect(validateSync(dto).length).toBeGreaterThan(0);
  });

  it('rejects an unknown sort value', () => {
    const dto = plainToInstance(CatalogQueryDto, { sort: 'POPULAR' });
    expect(validateSync(dto).length).toBeGreaterThan(0);
  });

  it('rejects an unknown category', () => {
    const dto = plainToInstance(CatalogQueryDto, { category: 'COOKING' });
    expect(validateSync(dto).length).toBeGreaterThan(0);
  });
});

describe('CatalogSearchDto', () => {
  it('accepts a non-empty query', () => {
    const dto = plainToInstance(CatalogSearchDto, { q: 'typescript' });
    expect(validateSync(dto)).toHaveLength(0);
  });

  it('rejects a missing query', () => {
    const dto = plainToInstance(CatalogSearchDto, {});
    expect(validateSync(dto).length).toBeGreaterThan(0);
  });

  it('rejects an empty query', () => {
    const dto = plainToInstance(CatalogSearchDto, { q: '' });
    expect(validateSync(dto).length).toBeGreaterThan(0);
  });

  it('rejects a whitespace-only query', () => {
    const dto = plainToInstance(CatalogSearchDto, { q: '   ' });
    expect(validateSync(dto).length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test api-courses`
Expected: FAIL — cannot find `./catalog-query.dto`.

- [ ] **Step 3: Create `CatalogQueryDto`**

Create `libs/api-courses/src/lib/catalog/dto/catalog-query.dto.ts`:

```ts
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Min } from 'class-validator';

import {
  CATALOG_SORT_OPTIONS,
  COURSE_CATEGORIES,
  COURSE_DIFFICULTIES,
  type CatalogSort,
  type CourseCategory,
  type CourseDifficulty,
} from '@learnwren/shared-data-models';

export class CatalogQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @IsIn(CATALOG_SORT_OPTIONS as readonly string[])
  sort?: CatalogSort;

  @IsOptional()
  @IsIn(COURSE_CATEGORIES as readonly string[])
  category?: CourseCategory;

  @IsOptional()
  @IsIn(COURSE_DIFFICULTIES as readonly string[])
  difficulty?: CourseDifficulty;
}
```

- [ ] **Step 4: Create `CatalogSearchDto`**

Create `libs/api-courses/src/lib/catalog/dto/catalog-search.dto.ts`:

```ts
import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';

export class CatalogSearchDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Matches(/\S/, { message: 'q must not be blank' })
  q!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm nx test api-courses`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add libs/api-courses/src/lib/catalog/dto
git commit -m "$(cat <<'EOF'
feat(api-courses): add catalog query DTOs

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: `CatalogService`

The Approach-A orchestrator: filter, sort, search, paginate, and detail-page assembly — all in memory.

**Files:**
- Create: `libs/api-courses/src/lib/catalog/catalog.service.ts`
- Create (test): `libs/api-courses/src/lib/catalog/catalog.service.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `libs/api-courses/src/lib/catalog/catalog.service.spec.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';

import type {
  Course,
  CourseId,
  ISODateString,
  UserId,
} from '@learnwren/shared-data-models';

import { CoursesException } from '../errors/courses.exception';
import { createFakeFirestore } from '../testing/fake-firestore';
import { CoursesRepository } from '../courses.repository';
import { InstructorDirectory } from './instructor-directory';
import { CatalogService } from './catalog.service';

function course(over: Partial<Course> & Pick<Course, 'id'>): Course {
  return {
    title: over.id,
    description: 'desc',
    instructorId: 'u-1' as UserId,
    status: 'PUBLISHED',
    publishedAt: '2026-01-01T00:00:00.000Z' as ISODateString,
    createdAt: '2026-01-01T00:00:00.000Z' as ISODateString,
    updatedAt: '2026-01-01T00:00:00.000Z' as ISODateString,
    ...over,
  } as Course;
}

/** Build a CatalogService over a fake Firestore seeded with course docs. */
function makeService(
  courses: Course[],
  users: Record<string, Record<string, unknown>> = {},
): CatalogService {
  const seed: Record<string, Record<string, unknown>> = { ...users };
  for (const c of courses) seed[`courses/${c.id}`] = { ...c } as Record<string, unknown>;
  const firestore = createFakeFirestore(seed);
  const repo = new CoursesRepository(firestore as never);
  const directory = new InstructorDirectory(firestore as never);
  return new CatalogService(repo, directory);
}

describe('CatalogService.listCatalogue', () => {
  it('returns only published courses with pagination metadata', async () => {
    const svc = makeService([
      course({ id: 'c-1' as CourseId }),
      course({ id: 'c-2' as CourseId }),
      course({ id: 'c-draft' as CourseId, status: 'DRAFT' }),
    ]);

    const page = await svc.listCatalogue({});

    expect(page.total).toBe(2);
    expect(page.page).toBe(1);
    expect(page.pageSize).toBe(20);
    expect(page.totalPages).toBe(1);
    expect(page.items.map((i) => i.id).sort()).toEqual(['c-1', 'c-2']);
  });

  it('filters by category and difficulty', async () => {
    const svc = makeService([
      course({ id: 'c-prog-beg' as CourseId, category: 'PROGRAMMING', difficulty: 'BEGINNER' }),
      course({ id: 'c-prog-adv' as CourseId, category: 'PROGRAMMING', difficulty: 'ADVANCED' }),
      course({ id: 'c-design' as CourseId, category: 'DESIGN', difficulty: 'BEGINNER' }),
    ]);

    const byCategory = await svc.listCatalogue({ category: 'PROGRAMMING' });
    expect(byCategory.items.map((i) => i.id).sort()).toEqual(['c-prog-adv', 'c-prog-beg']);

    const byBoth = await svc.listCatalogue({ category: 'PROGRAMMING', difficulty: 'BEGINNER' });
    expect(byBoth.items.map((i) => i.id)).toEqual(['c-prog-beg']);
  });

  it('sorts NEWEST by publishedAt descending', async () => {
    const svc = makeService([
      course({ id: 'old' as CourseId, publishedAt: '2026-01-01T00:00:00.000Z' as ISODateString }),
      course({ id: 'new' as CourseId, publishedAt: '2026-03-01T00:00:00.000Z' as ISODateString }),
    ]);

    const page = await svc.listCatalogue({ sort: 'NEWEST' });

    expect(page.items.map((i) => i.id)).toEqual(['new', 'old']);
  });

  it('sorts ALPHABETICAL by title case-insensitively', async () => {
    const svc = makeService([
      course({ id: 'c-b' as CourseId, title: 'banana' }),
      course({ id: 'c-a' as CourseId, title: 'Apple' }),
    ]);

    const page = await svc.listCatalogue({ sort: 'ALPHABETICAL' });

    expect(page.items.map((i) => i.title)).toEqual(['Apple', 'banana']);
  });

  it('paginates with 20 items per page', async () => {
    const courses = Array.from({ length: 25 }, (_, i) =>
      course({ id: `c-${String(i).padStart(2, '0')}` as CourseId }),
    );
    const svc = makeService(courses);

    const p1 = await svc.listCatalogue({ page: 1 });
    expect(p1.items).toHaveLength(20);
    expect(p1.totalPages).toBe(2);

    const p2 = await svc.listCatalogue({ page: 2 });
    expect(p2.items).toHaveLength(5);
  });

  it('returns an empty page (not an error) past the last page', async () => {
    const svc = makeService([course({ id: 'c-1' as CourseId })]);

    const page = await svc.listCatalogue({ page: 99 });

    expect(page.items).toEqual([]);
    expect(page.total).toBe(1);
  });

  it('resolves the instructor display name onto each summary', async () => {
    const svc = makeService([course({ id: 'c-1' as CourseId, instructorId: 'u-1' as UserId })], {
      'users/u-1': { id: 'u-1', displayName: 'Ada Lovelace' },
    });

    const page = await svc.listCatalogue({});

    expect(page.items[0]?.instructorDisplayName).toBe('Ada Lovelace');
  });
});

describe('CatalogService.search', () => {
  it('matches title and description case-insensitively', async () => {
    const svc = makeService([
      course({ id: 'c-1' as CourseId, title: 'Learn TypeScript', description: 'd' }),
      course({ id: 'c-2' as CourseId, title: 'Cooking', description: 'about typescript too' }),
      course({ id: 'c-3' as CourseId, title: 'Gardening', description: 'plants' }),
    ]);

    const page = await svc.search({ q: 'TYPESCRIPT' });

    expect(page.items.map((i) => i.id).sort()).toEqual(['c-1', 'c-2']);
  });

  it('ranks a title match above a description-only match', async () => {
    const svc = makeService([
      course({ id: 'desc-only' as CourseId, title: 'Cooking', description: 'uses rust' }),
      course({ id: 'title-hit' as CourseId, title: 'Rust Basics', description: 'd' }),
    ]);

    const page = await svc.search({ q: 'rust' });

    expect(page.items.map((i) => i.id)).toEqual(['title-hit', 'desc-only']);
  });

  it('excludes non-published courses from search results', async () => {
    const svc = makeService([
      course({ id: 'c-draft' as CourseId, title: 'Rust draft', status: 'DRAFT' }),
    ]);

    const page = await svc.search({ q: 'rust' });

    expect(page.items).toEqual([]);
  });
});

describe('CatalogService.getCourseDetail', () => {
  it('assembles the detail payload with the module outline and lesson count', async () => {
    const firestore = createFakeFirestore({
      'courses/c-1': {
        id: 'c-1',
        title: 'Course One',
        description: 'short',
        longDescription: 'long',
        instructorId: 'u-1',
        status: 'PUBLISHED',
        publishedAt: '2026-01-01T00:00:00.000Z',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      'courses/c-1/modules/m-1': { id: 'm-1', title: 'Module 1', order: 0 },
      'courses/c-1/modules/m-1/lessons/l-1': { id: 'l-1', title: 'Lesson 1', order: 0 },
      'courses/c-1/modules/m-1/lessons/l-2': { id: 'l-2', title: 'Lesson 2', order: 1 },
      'users/u-1': { id: 'u-1', displayName: 'Ada Lovelace' },
    });
    const svc = new CatalogService(
      new CoursesRepository(firestore as never),
      new InstructorDirectory(firestore as never),
    );

    const detail = await svc.getCourseDetail('c-1' as CourseId);

    expect(detail.title).toBe('Course One');
    expect(detail.instructorDisplayName).toBe('Ada Lovelace');
    expect(detail.lessonCount).toBe(2);
    expect(detail.modules).toEqual([
      { title: 'Module 1', lessons: [{ title: 'Lesson 1' }, { title: 'Lesson 2' }] },
    ]);
  });

  it('throws COURSE_NOT_FOUND for a missing course', async () => {
    const svc = makeService([]);
    await expect(svc.getCourseDetail('c-ghost' as CourseId)).rejects.toMatchObject({
      code: 'COURSE_NOT_FOUND',
      status: 404,
    });
  });

  it('throws COURSE_NOT_FOUND for a DRAFT course (no draft leak)', async () => {
    const svc = makeService([course({ id: 'c-draft' as CourseId, status: 'DRAFT' })]);
    await expect(svc.getCourseDetail('c-draft' as CourseId)).rejects.toBeInstanceOf(
      CoursesException,
    );
  });

  it('throws COURSE_NOT_FOUND for an ARCHIVED course', async () => {
    const svc = makeService([course({ id: 'c-arch' as CourseId, status: 'ARCHIVED' })]);
    await expect(svc.getCourseDetail('c-arch' as CourseId)).rejects.toMatchObject({
      code: 'COURSE_NOT_FOUND',
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test api-courses`
Expected: FAIL — cannot find `./catalog.service`.

- [ ] **Step 3: Implement `CatalogService`**

Create `libs/api-courses/src/lib/catalog/catalog.service.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm nx test api-courses`
Expected: PASS — all `CatalogService` describe blocks green.

- [ ] **Step 5: Commit**

```bash
git add libs/api-courses/src/lib/catalog/catalog.service.ts libs/api-courses/src/lib/catalog/catalog.service.spec.ts
git commit -m "$(cat <<'EOF'
feat(api-courses): add CatalogService (in-memory filter/sort/search)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: `CatalogController` + `CoursesModule` wiring

The platform's first unauthenticated endpoint group.

**Files:**
- Create: `libs/api-courses/src/lib/catalog/catalog.controller.ts`
- Create (test): `libs/api-courses/src/lib/catalog/catalog.controller.spec.ts`
- Modify: `libs/api-courses/src/lib/courses.module.ts`

- [ ] **Step 1: Write the failing test**

Create `libs/api-courses/src/lib/catalog/catalog.controller.spec.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CourseCatalogDetail, CourseCatalogPage, CourseId } from '@learnwren/shared-data-models';

import { CatalogController } from './catalog.controller';
import type { CatalogService } from './catalog.service';

const emptyPage: CourseCatalogPage = {
  items: [],
  page: 1,
  pageSize: 20,
  total: 0,
  totalPages: 0,
};

describe('CatalogController', () => {
  let svc: { listCatalogue: ReturnType<typeof vi.fn>; search: ReturnType<typeof vi.fn>; getCourseDetail: ReturnType<typeof vi.fn> };
  let controller: CatalogController;

  beforeEach(() => {
    svc = {
      listCatalogue: vi.fn().mockResolvedValue(emptyPage),
      search: vi.fn().mockResolvedValue(emptyPage),
      getCourseDetail: vi.fn(),
    };
    controller = new CatalogController(svc as unknown as CatalogService);
  });

  it('delegates GET /catalog to listCatalogue', async () => {
    const result = await controller.list({ page: 2, sort: 'NEWEST' });
    expect(svc.listCatalogue).toHaveBeenCalledWith({ page: 2, sort: 'NEWEST' });
    expect(result).toBe(emptyPage);
  });

  it('delegates GET /catalog/search to search', async () => {
    await controller.search({ q: 'rust', page: 1 });
    expect(svc.search).toHaveBeenCalledWith({ q: 'rust', page: 1 });
  });

  it('delegates GET /catalog/:cid to getCourseDetail', async () => {
    const detail = { id: 'c-1' } as CourseCatalogDetail;
    svc.getCourseDetail.mockResolvedValue(detail);
    const result = await controller.detail('c-1' as CourseId);
    expect(svc.getCourseDetail).toHaveBeenCalledWith('c-1');
    expect(result).toBe(detail);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test api-courses`
Expected: FAIL — cannot find `./catalog.controller`.

- [ ] **Step 3: Implement `CatalogController`**

Create `libs/api-courses/src/lib/catalog/catalog.controller.ts`:

```ts
import { Controller, Get, Param, Query, UseFilters } from '@nestjs/common';

import type {
  CourseCatalogDetail,
  CourseCatalogPage,
  CourseId,
} from '@learnwren/shared-data-models';

import { CoursesExceptionFilter } from '../courses.exception-filter';
import { CatalogQueryDto } from './dto/catalog-query.dto';
import { CatalogSearchDto } from './dto/catalog-search.dto';
import { CatalogService } from './catalog.service';

/**
 * Public, unauthenticated course discovery. No `@UseGuards` — read-only and
 * only ever returns PUBLISHED data. `search` is declared before `:cid` so the
 * literal segment is never captured as a course id.
 */
@Controller('catalog')
@UseFilters(CoursesExceptionFilter)
export class CatalogController {
  constructor(private readonly svc: CatalogService) {}

  @Get()
  list(@Query() query: CatalogQueryDto): Promise<CourseCatalogPage> {
    return this.svc.listCatalogue(query);
  }

  @Get('search')
  search(@Query() query: CatalogSearchDto): Promise<CourseCatalogPage> {
    return this.svc.search(query);
  }

  @Get(':cid')
  detail(@Param('cid') cid: CourseId): Promise<CourseCatalogDetail> {
    return this.svc.getCourseDetail(cid);
  }
}
```

- [ ] **Step 4: Register in `CoursesModule`**

In `libs/api-courses/src/lib/courses.module.ts`, add the imports and register the three new providers. The final file:

```ts
import { forwardRef, Module } from '@nestjs/common';

import { AuthModule } from '@learnwren/api-auth';

import { CatalogController } from './catalog/catalog.controller';
import { CatalogService } from './catalog/catalog.service';
import { InstructorDirectory } from './catalog/instructor-directory';
import { CourseOwnerGuard } from './course-owner.guard';
import { CoursesController } from './courses.controller';
import { CoursesExceptionFilter } from './courses.exception-filter';
import { CoursesRepository } from './courses.repository';
import { CoursesService } from './courses.service';
import { PublishService } from './publish/publish.service';
import { MaterialsModule } from './materials/materials.module';
import { VideoModule } from './video/video.module';

// VideoModule ↔ CoursesModule are mutually dependent (CoursesService cascades
// deletes into VideoService; VideoController injects CoursesRepository).
// MaterialsModule ↔ CoursesModule are mutually dependent (CoursesService cascades
// deletes into MaterialsService; MaterialsController injects CoursesRepository).
// NestJS resolves both cycles with forwardRef.
@Module({
  imports: [AuthModule, forwardRef(() => VideoModule), forwardRef(() => MaterialsModule)],
  controllers: [CoursesController, CatalogController],
  providers: [
    CoursesService,
    CoursesRepository,
    CoursesExceptionFilter,
    CourseOwnerGuard,
    PublishService,
    CatalogService,
    InstructorDirectory,
  ],
  exports: [CoursesRepository, CourseOwnerGuard],
})
export class CoursesModule {}
```

- [ ] **Step 5: Run tests + typecheck to verify**

Run: `pnpm nx test api-courses`
Expected: PASS.
Run: `pnpm nx typecheck api-courses`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add libs/api-courses/src/lib/catalog/catalog.controller.ts libs/api-courses/src/lib/catalog/catalog.controller.spec.ts libs/api-courses/src/lib/courses.module.ts
git commit -m "$(cat <<'EOF'
feat(api-courses): add public CatalogController and wire CoursesModule

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: `api-e2e` catalog spec

End-to-end coverage against the running emulator. Seeds course documents directly via the Admin SDK (the publish flow's eligibility gate is irrelevant to discovery).

**Prerequisite:** `pnpm emulators` and `pnpm start:api` must be running in separate terminals.

**Files:**
- Create: `apps/api-e2e/src/catalog.e2e-spec.ts`

- [ ] **Step 1: Write the spec**

Create `apps/api-e2e/src/catalog.e2e-spec.ts`:

```ts
// NOTE: Run `pnpm emulators` and `pnpm start:api` before executing this suite.
import { expect, test } from '@playwright/test';
import * as admin from 'firebase-admin';

import { API_BASE, initAdmin } from './_helpers/auth';

initAdmin();

/** Seed a course document straight into Firestore at the given status. */
async function seedCourse(
  suffix: string,
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED',
  over: Record<string, unknown> = {},
): Promise<string> {
  const id = `cat-e2e-${status}-${suffix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const now = new Date().toISOString();
  await admin
    .firestore()
    .collection('courses')
    .doc(id)
    .set({
      id,
      title: `Catalog ${suffix}`,
      description: 'catalog e2e course',
      instructorId: 'cat-e2e-instructor',
      status,
      publishedAt: now,
      createdAt: now,
      updatedAt: now,
      ...over,
    });
  return id;
}

test('GET /catalog returns published courses with no session cookie', async ({ request }) => {
  const published = await seedCourse('list', 'PUBLISHED');
  await seedCourse('list', 'DRAFT');

  const res = await request.get(`${API_BASE}/catalog`);
  expect(res.status()).toBe(200);
  const body = await res.json();

  expect(body.pageSize).toBe(20);
  expect(typeof body.total).toBe('number');
  const ids: string[] = body.items.map((i: { id: string }) => i.id);
  expect(ids).toContain(published);
});

test('GET /catalog excludes DRAFT and ARCHIVED courses', async ({ request }) => {
  const draft = await seedCourse('hidden', 'DRAFT');
  const archived = await seedCourse('hidden', 'ARCHIVED');

  const res = await request.get(`${API_BASE}/catalog`);
  const ids: string[] = (await res.json()).items.map((i: { id: string }) => i.id);

  expect(ids).not.toContain(draft);
  expect(ids).not.toContain(archived);
});

test('GET /catalog filters by category', async ({ request }) => {
  const prog = await seedCourse('prog', 'PUBLISHED', { category: 'PROGRAMMING' });
  await seedCourse('design', 'PUBLISHED', { category: 'DESIGN' });

  const res = await request.get(`${API_BASE}/catalog?category=PROGRAMMING`);
  const items: { id: string; category?: string }[] = (await res.json()).items;

  expect(items.some((i) => i.id === prog)).toBe(true);
  expect(items.every((i) => i.category === 'PROGRAMMING')).toBe(true);
});

test('GET /catalog rejects an invalid sort with 400', async ({ request }) => {
  const res = await request.get(`${API_BASE}/catalog?sort=POPULAR`);
  expect(res.status()).toBe(400);
});

test('GET /catalog/search matches the keyword and returns 200', async ({ request }) => {
  const id = await seedCourse('search', 'PUBLISHED', {
    title: `Quokka Studies ${Date.now()}`,
  });
  const match = await request.get(`${API_BASE}/catalog/search?q=quokka`);
  expect(match.status()).toBe(200);
  const ids: string[] = (await match.json()).items.map((i: { id: string }) => i.id);
  expect(ids).toContain(id);
});

test('GET /catalog/search rejects an empty query with 400', async ({ request }) => {
  const res = await request.get(`${API_BASE}/catalog/search?q=`);
  expect(res.status()).toBe(400);
});

test('GET /catalog/:cid returns detail for a published course', async ({ request }) => {
  const id = await seedCourse('detail', 'PUBLISHED');
  await admin
    .firestore()
    .collection('courses')
    .doc(id)
    .collection('modules')
    .doc('m-1')
    .set({ id: 'm-1', title: 'Module 1', order: 0 });
  await admin
    .firestore()
    .collection('courses')
    .doc(id)
    .collection('modules')
    .doc('m-1')
    .collection('lessons')
    .doc('l-1')
    .set({ id: 'l-1', title: 'Lesson 1', order: 0 });

  const res = await request.get(`${API_BASE}/catalog/${id}`);
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.id).toBe(id);
  expect(body.lessonCount).toBe(1);
  expect(body.modules[0].lessons[0].title).toBe('Lesson 1');
});

test('GET /catalog/:cid returns 404 for a draft course', async ({ request }) => {
  const draft = await seedCourse('detail', 'DRAFT');
  const res = await request.get(`${API_BASE}/catalog/${draft}`);
  expect(res.status()).toBe(404);
  expect((await res.json()).error.code).toBe('COURSE_NOT_FOUND');
});

test('GET /catalog/:cid returns 404 for a non-existent course', async ({ request }) => {
  const res = await request.get(`${API_BASE}/catalog/cat-e2e-nonexistent`);
  expect(res.status()).toBe(404);
});
```

- [ ] **Step 2: Run the suite to verify it passes**

Run: `pnpm nx e2e api-e2e`
Expected: the new `catalog.e2e-spec.ts` tests PASS; no regression in existing suites.

- [ ] **Step 3: Commit**

```bash
git add apps/api-e2e/src/catalog.e2e-spec.ts
git commit -m "$(cat <<'EOF'
test(api-e2e): cover the public catalog endpoints

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Scaffold `web-catalog` library + Angular `CatalogService`

**Files:**
- Create: `libs/web-catalog/**` (via generator)
- Create: `libs/web-catalog/src/lib/catalog.service.ts`
- Create (test): `libs/web-catalog/src/lib/catalog.service.spec.ts`
- Replace: `libs/web-catalog/src/index.ts`

- [ ] **Step 1: Scaffold the library**

Invoke the `nx-generate` skill to scaffold an Angular library named `web-catalog` at `libs/web-catalog`, configured to match `libs/web-courses`: Vitest unit-test runner, ESLint, `lib` selector prefix, tag `scope:web`, standalone components, no build target.

Equivalent direct command:

```bash
pnpm nx g @nx/angular:library web-catalog \
  --directory=libs/web-catalog \
  --unitTestRunner=vitest \
  --linter=eslint \
  --prefix=lib \
  --tags=scope:web \
  --standalone \
  --skipTests
```

- [ ] **Step 2: Verify and normalise the generated library**

Confirm the generated `libs/web-catalog` mirrors `libs/web-courses`:
- `libs/web-catalog/vite.config.mts` exists; set `test.name` to `'web-catalog'` and `cacheDir`/`coverage.reportsDirectory` to use `libs/web-catalog`.
- `libs/web-catalog/src/test-setup.ts` exists with the `@analogjs/vitest-angular` setup (copy `libs/web-courses/src/test-setup.ts` verbatim if missing).
- `tsconfig.base.json` now has a `@learnwren/web-catalog` path entry.

Delete any sample component the generator created under `libs/web-catalog/src/lib/` (e.g. a `web-catalog` component and its spec) — this library's components are created in later tasks.

- [ ] **Step 3: Write the failing test for the Angular `CatalogService`**

Create `libs/web-catalog/src/lib/catalog.service.spec.ts`:

```ts
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { CatalogService } from './catalog.service';

describe('CatalogService', () => {
  let service: CatalogService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(CatalogService);
    http = TestBed.inject(HttpTestingController);
  });

  it('GET /api/catalog with filter and sort query params', async () => {
    const promise = service.getCatalogue({ page: 2, sort: 'NEWEST', category: 'PROGRAMMING' });
    const req = http.expectOne(
      (r) => r.url === '/api/catalog' && r.params.get('page') === '2',
    );
    expect(req.request.params.get('sort')).toBe('NEWEST');
    expect(req.request.params.get('category')).toBe('PROGRAMMING');
    req.flush({ items: [], page: 2, pageSize: 20, total: 0, totalPages: 0 });
    await promise;
  });

  it('GET /api/catalog/search with the q param', async () => {
    const promise = service.search('rust', 1);
    const req = http.expectOne((r) => r.url === '/api/catalog/search');
    expect(req.request.params.get('q')).toBe('rust');
    req.flush({ items: [], page: 1, pageSize: 20, total: 0, totalPages: 0 });
    await promise;
  });

  it('GET /api/catalog/:id for course detail', async () => {
    const promise = service.getCourseDetail('c-1');
    http.expectOne('/api/catalog/c-1').flush({ id: 'c-1' });
    await promise;
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `pnpm nx test web-catalog`
Expected: FAIL — cannot find `./catalog.service`.

- [ ] **Step 5: Implement the Angular `CatalogService`**

Create `libs/web-catalog/src/lib/catalog.service.ts`:

```ts
import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type {
  CatalogSort,
  CourseCatalogDetail,
  CourseCatalogPage,
  CourseCategory,
  CourseDifficulty,
} from '@learnwren/shared-data-models';

export interface CatalogQueryParams {
  page?: number;
  sort?: CatalogSort;
  category?: CourseCategory;
  difficulty?: CourseDifficulty;
}

@Injectable({ providedIn: 'root' })
export class CatalogService {
  private readonly http = inject(HttpClient);

  getCatalogue(params: CatalogQueryParams): Promise<CourseCatalogPage> {
    let httpParams = new HttpParams();
    if (params.page) httpParams = httpParams.set('page', params.page);
    if (params.sort) httpParams = httpParams.set('sort', params.sort);
    if (params.category) httpParams = httpParams.set('category', params.category);
    if (params.difficulty) httpParams = httpParams.set('difficulty', params.difficulty);
    return firstValueFrom(
      this.http.get<CourseCatalogPage>('/api/catalog', { params: httpParams }),
    );
  }

  search(q: string, page?: number): Promise<CourseCatalogPage> {
    let httpParams = new HttpParams().set('q', q);
    if (page) httpParams = httpParams.set('page', page);
    return firstValueFrom(
      this.http.get<CourseCatalogPage>('/api/catalog/search', { params: httpParams }),
    );
  }

  getCourseDetail(id: string): Promise<CourseCatalogDetail> {
    return firstValueFrom(this.http.get<CourseCatalogDetail>(`/api/catalog/${id}`));
  }
}
```

- [ ] **Step 6: Replace the barrel `index.ts`**

Overwrite `libs/web-catalog/src/index.ts`:

```ts
export { CatalogService } from './lib/catalog.service';
export type { CatalogQueryParams } from './lib/catalog.service';
```

> `catalogRoutes` and `CourseSearchBarComponent` exports are added in later tasks.

- [ ] **Step 7: Run test to verify it passes**

Run: `pnpm nx test web-catalog`
Expected: PASS.

- [ ] **Step 8: Commit**

Run `git status` first — the generator updates `tsconfig.base.json` (path mapping) and may add a reference to a workspace-root `tsconfig.json`. Stage the new library plus every file the generator changed:

```bash
git add libs/web-catalog tsconfig.base.json tsconfig.json
git commit -m "$(cat <<'EOF'
feat(web-catalog): scaffold library and Angular CatalogService

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

> `git add tsconfig.json` is a no-op if the generator did not touch the root file.

---

## Task 9: `CourseCardComponent` + `ModuleOutlineComponent`

Two presentational components.

**Files:**
- Create: `libs/web-catalog/src/lib/components/course-card/course-card.component.ts`
- Create: `libs/web-catalog/src/lib/components/course-card/course-card.component.html`
- Create (test): `libs/web-catalog/src/lib/components/course-card/course-card.component.spec.ts`
- Create: `libs/web-catalog/src/lib/components/module-outline/module-outline.component.ts`
- Create: `libs/web-catalog/src/lib/components/module-outline/module-outline.component.html`
- Create (test): `libs/web-catalog/src/lib/components/module-outline/module-outline.component.spec.ts`

- [ ] **Step 1: Write the failing test for `CourseCardComponent`**

Create `libs/web-catalog/src/lib/components/course-card/course-card.component.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';

import type { CourseSummary } from '@learnwren/shared-data-models';

import { CourseCardComponent } from './course-card.component';

const summary: CourseSummary = {
  id: 'c-1',
  title: 'Learn Rust',
  description: 'A short course',
  difficulty: 'BEGINNER',
  instructorDisplayName: 'Ada Lovelace',
  publishedAt: '2026-01-01T00:00:00.000Z' as CourseSummary['publishedAt'],
};

describe('CourseCardComponent', () => {
  function render(course: CourseSummary): HTMLElement {
    TestBed.configureTestingModule({
      imports: [CourseCardComponent],
      providers: [provideRouter([])],
    });
    const fixture = TestBed.createComponent(CourseCardComponent);
    fixture.componentRef.setInput('course', course);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('renders the title, instructor name and difficulty', () => {
    const el = render(summary);
    const text = el.textContent ?? '';
    expect(text).toContain('Learn Rust');
    expect(text).toContain('Ada Lovelace');
    expect(text).toContain('BEGINNER');
  });

  it('links to the course detail page', () => {
    const el = render(summary);
    const anchor = el.querySelector<HTMLAnchorElement>('a');
    expect(anchor?.getAttribute('href')).toBe('/catalog/c-1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test web-catalog`
Expected: FAIL — cannot find `./course-card.component`.

- [ ] **Step 3: Implement `CourseCardComponent`**

Create `libs/web-catalog/src/lib/components/course-card/course-card.component.ts`:

```ts
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import type { CourseSummary } from '@learnwren/shared-data-models';
import { LwCardComponent, LwCoverComponent, LwPillComponent } from '@learnwren/web-ui';

@Component({
  selector: 'lib-course-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, LwCardComponent, LwCoverComponent, LwPillComponent],
  templateUrl: './course-card.component.html',
})
export class CourseCardComponent {
  readonly course = input.required<CourseSummary>();
}
```

Create `libs/web-catalog/src/lib/components/course-card/course-card.component.html`:

```html
<a [routerLink]="['/catalog', course().id]" class="block no-underline">
  <lw-card class="overflow-hidden">
    <lw-cover [glyph]="course().title.charAt(0)" [height]="96" />
    <div class="flex flex-col items-start gap-2 p-4">
      <h3 class="text-base text-ink">{{ course().title }}</h3>
      <p class="text-sm text-ink-2">{{ course().instructorDisplayName }}</p>
      @if (course().difficulty) {
        <lw-pill tone="default">{{ course().difficulty }}</lw-pill>
      }
    </div>
  </lw-card>
</a>
```

- [ ] **Step 4: Write the failing test for `ModuleOutlineComponent`**

Create `libs/web-catalog/src/lib/components/module-outline/module-outline.component.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import type { CatalogModuleOutline } from '@learnwren/shared-data-models';

import { ModuleOutlineComponent } from './module-outline.component';

describe('ModuleOutlineComponent', () => {
  function render(modules: CatalogModuleOutline[]): HTMLElement {
    TestBed.configureTestingModule({ imports: [ModuleOutlineComponent] });
    const fixture = TestBed.createComponent(ModuleOutlineComponent);
    fixture.componentRef.setInput('modules', modules);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('renders module titles and their lesson titles', () => {
    const el = render([
      { title: 'Getting Started', lessons: [{ title: 'Intro' }, { title: 'Setup' }] },
    ]);
    const text = el.textContent ?? '';
    expect(text).toContain('Getting Started');
    expect(text).toContain('Intro');
    expect(text).toContain('Setup');
  });

  it('renders an empty-outline message when there are no modules', () => {
    const el = render([]);
    expect(el.textContent ?? '').toContain('No lessons yet');
  });
});
```

- [ ] **Step 5: Run test to verify it fails**

Run: `pnpm nx test web-catalog`
Expected: FAIL — cannot find `./module-outline.component`.

- [ ] **Step 6: Implement `ModuleOutlineComponent`**

Create `libs/web-catalog/src/lib/components/module-outline/module-outline.component.ts`:

```ts
import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import type { CatalogModuleOutline } from '@learnwren/shared-data-models';

@Component({
  selector: 'lib-module-outline',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './module-outline.component.html',
})
export class ModuleOutlineComponent {
  readonly modules = input.required<CatalogModuleOutline[]>();
}
```

Create `libs/web-catalog/src/lib/components/module-outline/module-outline.component.html`:

```html
@if (modules().length === 0) {
  <p class="text-sm text-ink-3">No lessons yet.</p>
} @else {
  <ol class="flex list-none flex-col gap-4 p-0">
    @for (module of modules(); track $index) {
      <li>
        <h3 class="mb-2 text-base text-ink">{{ module.title }}</h3>
        <ul class="flex list-none flex-col gap-1 p-0 pl-4">
          @for (lesson of module.lessons; track $index) {
            <li class="text-sm text-ink-2">{{ lesson.title }}</li>
          }
        </ul>
      </li>
    }
  </ol>
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `pnpm nx test web-catalog`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add libs/web-catalog/src/lib/components/course-card libs/web-catalog/src/lib/components/module-outline
git commit -m "$(cat <<'EOF'
feat(web-catalog): add course-card and module-outline components

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: `CourseSearchBarComponent` + `CatalogFilterBarComponent`

Two interactive components.

**Files:**
- Create: `libs/web-catalog/src/lib/components/course-search-bar/course-search-bar.component.ts`
- Create: `libs/web-catalog/src/lib/components/course-search-bar/course-search-bar.component.html`
- Create (test): `libs/web-catalog/src/lib/components/course-search-bar/course-search-bar.component.spec.ts`
- Create: `libs/web-catalog/src/lib/components/catalog-filter-bar/catalog-filter-bar.component.ts`
- Create: `libs/web-catalog/src/lib/components/catalog-filter-bar/catalog-filter-bar.component.html`
- Create (test): `libs/web-catalog/src/lib/components/catalog-filter-bar/catalog-filter-bar.component.spec.ts`
- Modify: `libs/web-catalog/src/index.ts`

- [ ] **Step 1: Write the failing test for `CourseSearchBarComponent`**

Create `libs/web-catalog/src/lib/components/course-search-bar/course-search-bar.component.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CourseSearchBarComponent } from './course-search-bar.component';

describe('CourseSearchBarComponent', () => {
  let navigate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [CourseSearchBarComponent],
      providers: [provideRouter([])],
    });
    navigate = vi.fn();
    vi.spyOn(TestBed.inject(Router), 'navigate').mockImplementation(navigate);
  });

  it('navigates to /search with the query on submit', () => {
    const fixture = TestBed.createComponent(CourseSearchBarComponent);
    fixture.detectChanges();
    fixture.componentInstance.query.set('  rust  ');
    fixture.componentInstance.submit();
    expect(navigate).toHaveBeenCalledWith(['/search'], { queryParams: { q: 'rust' } });
  });

  it('navigates to /catalog when the query is blank', () => {
    const fixture = TestBed.createComponent(CourseSearchBarComponent);
    fixture.detectChanges();
    fixture.componentInstance.query.set('   ');
    fixture.componentInstance.submit();
    expect(navigate).toHaveBeenCalledWith(['/catalog']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test web-catalog`
Expected: FAIL — cannot find `./course-search-bar.component`.

- [ ] **Step 3: Implement `CourseSearchBarComponent`**

Create `libs/web-catalog/src/lib/components/course-search-bar/course-search-bar.component.ts`:

```ts
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { LwInputDirective } from '@learnwren/web-ui';

@Component({
  selector: 'lib-course-search-bar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, LwInputDirective],
  templateUrl: './course-search-bar.component.html',
})
export class CourseSearchBarComponent {
  private readonly router = inject(Router);
  readonly query = signal('');

  submit(): void {
    const q = this.query().trim();
    if (q) {
      void this.router.navigate(['/search'], { queryParams: { q } });
    } else {
      void this.router.navigate(['/catalog']);
    }
  }
}
```

Create `libs/web-catalog/src/lib/components/course-search-bar/course-search-bar.component.html`:

```html
<form class="w-44 sm:w-60" (ngSubmit)="submit()">
  <input
    type="search"
    name="catalog-search"
    placeholder="Search courses"
    aria-label="Search courses"
    lwInput
    [ngModel]="query()"
    (ngModelChange)="query.set($event)"
  />
</form>
```

- [ ] **Step 4: Write the failing test for `CatalogFilterBarComponent`**

Create `libs/web-catalog/src/lib/components/catalog-filter-bar/catalog-filter-bar.component.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { CatalogFilterBarComponent } from './catalog-filter-bar.component';

describe('CatalogFilterBarComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [CatalogFilterBarComponent] });
  });

  it('emits a category change when the category select changes', () => {
    const fixture = TestBed.createComponent(CatalogFilterBarComponent);
    fixture.detectChanges();
    let emitted: unknown;
    fixture.componentInstance.filterChange.subscribe((c) => (emitted = c));

    fixture.componentInstance.onCategoryChange('PROGRAMMING');

    expect(emitted).toEqual({ category: 'PROGRAMMING' });
  });

  it('emits an empty category when the "all" option is selected', () => {
    const fixture = TestBed.createComponent(CatalogFilterBarComponent);
    fixture.detectChanges();
    let emitted: unknown;
    fixture.componentInstance.filterChange.subscribe((c) => (emitted = c));

    fixture.componentInstance.onCategoryChange('');

    expect(emitted).toEqual({ category: undefined });
  });

  it('emits a sort change when the sort select changes', () => {
    const fixture = TestBed.createComponent(CatalogFilterBarComponent);
    fixture.detectChanges();
    let emitted: unknown;
    fixture.componentInstance.filterChange.subscribe((c) => (emitted = c));

    fixture.componentInstance.onSortChange('ALPHABETICAL');

    expect(emitted).toEqual({ sort: 'ALPHABETICAL' });
  });
});
```

- [ ] **Step 5: Run test to verify it fails**

Run: `pnpm nx test web-catalog`
Expected: FAIL — cannot find `./catalog-filter-bar.component`.

- [ ] **Step 6: Implement `CatalogFilterBarComponent`**

Create `libs/web-catalog/src/lib/components/catalog-filter-bar/catalog-filter-bar.component.ts`:

```ts
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import {
  CATALOG_SORT_OPTIONS,
  COURSE_CATEGORIES,
  COURSE_DIFFICULTIES,
  type CatalogSort,
  type CourseCategory,
  type CourseDifficulty,
} from '@learnwren/shared-data-models';

export interface CatalogFilterChange {
  category?: CourseCategory;
  difficulty?: CourseDifficulty;
  sort?: CatalogSort;
}

@Component({
  selector: 'lib-catalog-filter-bar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './catalog-filter-bar.component.html',
})
export class CatalogFilterBarComponent {
  readonly category = input<CourseCategory | undefined>(undefined);
  readonly difficulty = input<CourseDifficulty | undefined>(undefined);
  readonly sort = input<CatalogSort>('NEWEST');

  readonly filterChange = output<CatalogFilterChange>();

  readonly categories = COURSE_CATEGORIES;
  readonly difficulties = COURSE_DIFFICULTIES;
  readonly sorts = CATALOG_SORT_OPTIONS;

  onCategoryChange(value: string): void {
    this.filterChange.emit({ category: (value || undefined) as CourseCategory | undefined });
  }

  onDifficultyChange(value: string): void {
    this.filterChange.emit({
      difficulty: (value || undefined) as CourseDifficulty | undefined,
    });
  }

  onSortChange(value: string): void {
    this.filterChange.emit({ sort: value as CatalogSort });
  }
}
```

Create `libs/web-catalog/src/lib/components/catalog-filter-bar/catalog-filter-bar.component.html`:

```html
<div class="flex flex-wrap items-center gap-3">
  <label class="flex items-center gap-2 text-sm text-ink-2">
    Category
    <select
      class="rounded border border-line bg-bg px-3 py-2 text-ink outline-none focus:border-ochre"
      [value]="category() ?? ''"
      (change)="onCategoryChange($any($event.target).value)"
    >
      <option value="">All</option>
      @for (c of categories; track c) {
        <option [value]="c">{{ c }}</option>
      }
    </select>
  </label>

  <label class="flex items-center gap-2 text-sm text-ink-2">
    Difficulty
    <select
      class="rounded border border-line bg-bg px-3 py-2 text-ink outline-none focus:border-ochre"
      [value]="difficulty() ?? ''"
      (change)="onDifficultyChange($any($event.target).value)"
    >
      <option value="">All</option>
      @for (d of difficulties; track d) {
        <option [value]="d">{{ d }}</option>
      }
    </select>
  </label>

  <label class="flex items-center gap-2 text-sm text-ink-2">
    Sort
    <select
      class="rounded border border-line bg-bg px-3 py-2 text-ink outline-none focus:border-ochre"
      [value]="sort()"
      (change)="onSortChange($any($event.target).value)"
    >
      @for (s of sorts; track s) {
        <option [value]="s">{{ s }}</option>
      }
    </select>
  </label>
</div>
```

- [ ] **Step 7: Export the search bar from the barrel**

Overwrite `libs/web-catalog/src/index.ts`:

```ts
export { CatalogService } from './lib/catalog.service';
export type { CatalogQueryParams } from './lib/catalog.service';
export { CourseSearchBarComponent } from './lib/components/course-search-bar/course-search-bar.component';
```

> `catalogRoutes` is added to the barrel in Task 11.

- [ ] **Step 8: Run tests to verify they pass**

Run: `pnpm nx test web-catalog`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add libs/web-catalog/src/lib/components/course-search-bar libs/web-catalog/src/lib/components/catalog-filter-bar libs/web-catalog/src/index.ts
git commit -m "$(cat <<'EOF'
feat(web-catalog): add search-bar and filter-bar components

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: `CatalogPageComponent` + `catalogRoutes`

The catalogue page: a card grid driven by URL query params.

**Files:**
- Create: `libs/web-catalog/src/lib/catalog-page/catalog-page.component.ts`
- Create: `libs/web-catalog/src/lib/catalog-page/catalog-page.component.html`
- Create (test): `libs/web-catalog/src/lib/catalog-page/catalog-page.component.spec.ts`
- Create: `libs/web-catalog/src/lib/catalog.routes.ts`
- Modify: `libs/web-catalog/src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `libs/web-catalog/src/lib/catalog-page/catalog-page.component.spec.ts`:

```ts
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';

import type { CourseCatalogPage } from '@learnwren/shared-data-models';

import { CatalogPageComponent } from './catalog-page.component';

function page(over: Partial<CourseCatalogPage> = {}): CourseCatalogPage {
  return { items: [], page: 1, pageSize: 20, total: 0, totalPages: 0, ...over };
}

describe('CatalogPageComponent', () => {
  let http: HttpTestingController;
  let router: Router;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [CatalogPageComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        // A real route makes /catalog navigable so query params reach the
        // root ActivatedRoute the directly-created component injects.
        provideRouter([{ path: 'catalog', component: CatalogPageComponent }]),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
  });

  it('renders course cards from the catalogue response', async () => {
    await router.navigate(['/catalog']);
    const fixture = TestBed.createComponent(CatalogPageComponent);
    fixture.detectChanges();
    http.expectOne((r) => r.url === '/api/catalog').flush(
      page({
        total: 1,
        totalPages: 1,
        items: [
          {
            id: 'c-1',
            title: 'Learn Rust',
            description: 'd',
            instructorDisplayName: 'Ada',
            publishedAt: '2026-01-01T00:00:00.000Z' as never,
          },
        ],
      }),
    );
    await fixture.whenStable();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Learn Rust');
  });

  it('renders the empty-catalogue state when there are no courses', async () => {
    await router.navigate(['/catalog']);
    const fixture = TestBed.createComponent(CatalogPageComponent);
    fixture.detectChanges();
    http.expectOne((r) => r.url === '/api/catalog').flush(page());
    await fixture.whenStable();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('No courses');
  });

  it('renders the no-match state when filters return nothing', async () => {
    await router.navigate(['/catalog'], { queryParams: { category: 'DESIGN' } });
    const fixture = TestBed.createComponent(CatalogPageComponent);
    fixture.detectChanges();
    http.expectOne((r) => r.url === '/api/catalog').flush(page());
    await fixture.whenStable();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'No courses match your filters',
    );
  });

  it('renders an error state when the request fails', async () => {
    await router.navigate(['/catalog']);
    const fixture = TestBed.createComponent(CatalogPageComponent);
    fixture.detectChanges();
    http
      .expectOne((r) => r.url === '/api/catalog')
      .flush('boom', { status: 500, statusText: 'Server Error' });
    await fixture.whenStable();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Something went wrong');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test web-catalog`
Expected: FAIL — cannot find `./catalog-page.component`.

- [ ] **Step 3: Implement `CatalogPageComponent`**

Create `libs/web-catalog/src/lib/catalog-page/catalog-page.component.ts`:

```ts
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, type ParamMap, Router } from '@angular/router';

import type {
  CatalogSort,
  CourseCatalogPage,
  CourseCategory,
  CourseDifficulty,
} from '@learnwren/shared-data-models';

import { CatalogService } from '../catalog.service';
import {
  CatalogFilterBarComponent,
  type CatalogFilterChange,
} from '../components/catalog-filter-bar/catalog-filter-bar.component';
import { CourseCardComponent } from '../components/course-card/course-card.component';

@Component({
  selector: 'lib-catalog-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CourseCardComponent, CatalogFilterBarComponent],
  templateUrl: './catalog-page.component.html',
})
export class CatalogPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly service = inject(CatalogService);

  readonly result = signal<CourseCatalogPage | null>(null);
  readonly error = signal(false);
  readonly category = signal<CourseCategory | undefined>(undefined);
  readonly difficulty = signal<CourseDifficulty | undefined>(undefined);
  readonly sort = signal<CatalogSort>('NEWEST');
  readonly filtersActive = signal(false);

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      void this.load(params);
    });
  }

  private async load(params: ParamMap): Promise<void> {
    const category = (params.get('category') as CourseCategory | null) ?? undefined;
    const difficulty = (params.get('difficulty') as CourseDifficulty | null) ?? undefined;
    const sort = (params.get('sort') as CatalogSort | null) ?? 'NEWEST';
    const page = Number(params.get('page')) || 1;

    this.category.set(category);
    this.difficulty.set(difficulty);
    this.sort.set(sort);
    this.filtersActive.set(category !== undefined || difficulty !== undefined);
    this.result.set(null);
    this.error.set(false);

    try {
      this.result.set(await this.service.getCatalogue({ page, sort, category, difficulty }));
    } catch {
      this.error.set(true);
    }
  }

  onFilterChange(change: CatalogFilterChange): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { ...change, page: 1 },
      queryParamsHandling: 'merge',
    });
  }

  goToPage(page: number): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { page },
      queryParamsHandling: 'merge',
    });
  }
}
```

Create `libs/web-catalog/src/lib/catalog-page/catalog-page.component.html`:

```html
<div class="mx-auto w-full max-w-5xl p-6">
  <header class="mb-6 flex flex-col gap-4">
    <h1 class="text-2xl text-ink">Course catalogue</h1>
    <lib-catalog-filter-bar
      [category]="category()"
      [difficulty]="difficulty()"
      [sort]="sort()"
      (filterChange)="onFilterChange($event)"
    />
  </header>

  @if (error()) {
    <p class="text-sm text-ink-2">Something went wrong loading the catalogue. Please try again.</p>
  } @else if (result() === null) {
    <p class="text-sm text-ink-3">Loading…</p>
  } @else if (result()!.items.length === 0) {
    <p class="text-ink-2">
      @if (filtersActive()) {
        No courses match your filters. Try adjusting your search criteria.
      } @else {
        No courses are available yet.
      }
    </p>
  } @else {
    <ul class="grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
      @for (course of result()!.items; track course.id) {
        <li><lib-course-card [course]="course" /></li>
      }
    </ul>

    @if (result()!.totalPages > 1) {
      <nav class="mt-6 flex items-center justify-center gap-3" aria-label="Pagination">
        <button
          type="button"
          class="lw-btn lw-btn-ghost"
          [disabled]="result()!.page <= 1"
          (click)="goToPage(result()!.page - 1)"
        >
          Previous
        </button>
        <span class="text-sm text-ink-2"
          >Page {{ result()!.page }} of {{ result()!.totalPages }}</span
        >
        <button
          type="button"
          class="lw-btn lw-btn-ghost"
          [disabled]="result()!.page >= result()!.totalPages"
          (click)="goToPage(result()!.page + 1)"
        >
          Next
        </button>
      </nav>
    }
  }
</div>
```

- [ ] **Step 4: Create `catalog.routes.ts`**

Create `libs/web-catalog/src/lib/catalog.routes.ts`:

```ts
import type { Route } from '@angular/router';

export const catalogRoutes: Route[] = [
  {
    path: 'catalog',
    loadComponent: () =>
      import('./catalog-page/catalog-page.component').then((m) => m.CatalogPageComponent),
  },
  {
    path: 'catalog/:id',
    loadComponent: () =>
      import('./course-detail-page/course-detail-page.component').then(
        (m) => m.CourseDetailPageComponent,
      ),
  },
  {
    path: 'search',
    loadComponent: () =>
      import('./search-results-page/search-results-page.component').then(
        (m) => m.SearchResultsPageComponent,
      ),
  },
];
```

> `catalog.routes.ts` references the detail and search page components created in Tasks 12–13. The `import()` calls are lazy, so the file compiles now; `pnpm nx typecheck web-catalog` will only fully resolve them after Tasks 12 and 13. The barrel export below is added now.

- [ ] **Step 5: Export `catalogRoutes` from the barrel**

Overwrite `libs/web-catalog/src/index.ts`:

```ts
export { catalogRoutes } from './lib/catalog.routes';
export { CatalogService } from './lib/catalog.service';
export type { CatalogQueryParams } from './lib/catalog.service';
export { CourseSearchBarComponent } from './lib/components/course-search-bar/course-search-bar.component';
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm nx test web-catalog`
Expected: PASS — the `CatalogPageComponent` tests are green.

- [ ] **Step 7: Commit**

```bash
git add libs/web-catalog/src/lib/catalog-page libs/web-catalog/src/lib/catalog.routes.ts libs/web-catalog/src/index.ts
git commit -m "$(cat <<'EOF'
feat(web-catalog): add catalogue page and routes

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: `SearchResultsPageComponent`

**Files:**
- Create: `libs/web-catalog/src/lib/search-results-page/search-results-page.component.ts`
- Create: `libs/web-catalog/src/lib/search-results-page/search-results-page.component.html`
- Create (test): `libs/web-catalog/src/lib/search-results-page/search-results-page.component.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `libs/web-catalog/src/lib/search-results-page/search-results-page.component.spec.ts`:

```ts
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';

import { SearchResultsPageComponent } from './search-results-page.component';

describe('SearchResultsPageComponent', () => {
  let http: HttpTestingController;
  let router: Router;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [SearchResultsPageComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([
          { path: 'search', component: SearchResultsPageComponent },
          { path: 'catalog', component: SearchResultsPageComponent },
        ]),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
  });

  it('renders search results for the query', async () => {
    await router.navigate(['/search'], { queryParams: { q: 'rust' } });
    const fixture = TestBed.createComponent(SearchResultsPageComponent);
    fixture.detectChanges();
    const req = http.expectOne((r) => r.url === '/api/catalog/search');
    expect(req.request.params.get('q')).toBe('rust');
    req.flush({
      items: [
        {
          id: 'c-1',
          title: 'Rust Basics',
          description: 'd',
          instructorDisplayName: 'Ada',
          publishedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
    });
    await fixture.whenStable();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Rust Basics');
  });

  it('renders the no-results state with a catalogue link', async () => {
    await router.navigate(['/search'], { queryParams: { q: 'zzzznope' } });
    const fixture = TestBed.createComponent(SearchResultsPageComponent);
    fixture.detectChanges();
    http
      .expectOne((r) => r.url === '/api/catalog/search')
      .flush({ items: [], page: 1, pageSize: 20, total: 0, totalPages: 0 });
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('No courses found for your search');
    expect(el.querySelector('a[href="/catalog"]')).not.toBeNull();
  });

  it('redirects to /catalog when the query is blank', async () => {
    await router.navigate(['/search'], { queryParams: { q: '   ' } });
    const fixture = TestBed.createComponent(SearchResultsPageComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    http.expectNone((r) => r.url === '/api/catalog/search');
    expect(router.url).toContain('/catalog');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test web-catalog`
Expected: FAIL — cannot find `./search-results-page.component`.

- [ ] **Step 3: Implement `SearchResultsPageComponent`**

Create `libs/web-catalog/src/lib/search-results-page/search-results-page.component.ts`:

```ts
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, type ParamMap, Router } from '@angular/router';

import type { CourseCatalogPage } from '@learnwren/shared-data-models';

import { CatalogService } from '../catalog.service';
import { CourseCardComponent } from '../components/course-card/course-card.component';

@Component({
  selector: 'lib-search-results-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CourseCardComponent],
  templateUrl: './search-results-page.component.html',
})
export class SearchResultsPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly service = inject(CatalogService);

  readonly query = signal('');
  readonly result = signal<CourseCatalogPage | null>(null);
  readonly error = signal(false);

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      void this.load(params);
    });
  }

  private async load(params: ParamMap): Promise<void> {
    const q = (params.get('q') ?? '').trim();
    if (!q) {
      void this.router.navigate(['/catalog']);
      return;
    }
    const page = Number(params.get('page')) || 1;
    this.query.set(q);
    this.result.set(null);
    this.error.set(false);
    try {
      this.result.set(await this.service.search(q, page));
    } catch {
      this.error.set(true);
    }
  }

  goToPage(page: number): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { page },
      queryParamsHandling: 'merge',
    });
  }
}
```

Create `libs/web-catalog/src/lib/search-results-page/search-results-page.component.html`:

```html
<div class="mx-auto w-full max-w-5xl p-6">
  <h1 class="mb-6 text-2xl text-ink">Search results for "{{ query() }}"</h1>

  @if (error()) {
    <p class="text-sm text-ink-2">Something went wrong with your search. Please try again.</p>
  } @else if (result() === null) {
    <p class="text-sm text-ink-3">Loading…</p>
  } @else if (result()!.items.length === 0) {
    <p class="text-ink-2">
      No courses found for your search. Try different keywords or
      <a href="/catalog" class="underline">browse the catalogue</a>.
    </p>
  } @else {
    <ul class="grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
      @for (course of result()!.items; track course.id) {
        <li><lib-course-card [course]="course" /></li>
      }
    </ul>

    @if (result()!.totalPages > 1) {
      <nav class="mt-6 flex items-center justify-center gap-3" aria-label="Pagination">
        <button
          type="button"
          class="lw-btn lw-btn-ghost"
          [disabled]="result()!.page <= 1"
          (click)="goToPage(result()!.page - 1)"
        >
          Previous
        </button>
        <span class="text-sm text-ink-2"
          >Page {{ result()!.page }} of {{ result()!.totalPages }}</span
        >
        <button
          type="button"
          class="lw-btn lw-btn-ghost"
          [disabled]="result()!.page >= result()!.totalPages"
          (click)="goToPage(result()!.page + 1)"
        >
          Next
        </button>
      </nav>
    }
  }
</div>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm nx test web-catalog`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/web-catalog/src/lib/search-results-page
git commit -m "$(cat <<'EOF'
feat(web-catalog): add search results page

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: `CourseDetailPageComponent`

**Files:**
- Create: `libs/web-catalog/src/lib/course-detail-page/course-detail-page.component.ts`
- Create: `libs/web-catalog/src/lib/course-detail-page/course-detail-page.component.html`
- Create (test): `libs/web-catalog/src/lib/course-detail-page/course-detail-page.component.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `libs/web-catalog/src/lib/course-detail-page/course-detail-page.component.spec.ts`:

```ts
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, type ParamMap } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { describe, expect, it } from 'vitest';

import { CourseDetailPageComponent } from './course-detail-page.component';

// The detail page reads the `:id` route parameter. A controllable fake
// ActivatedRoute is the simplest deterministic way to supply it — the
// component injects nothing else from the router (no RouterLink).
function setup(id: string | null): HttpTestingController {
  const paramMap = new BehaviorSubject<ParamMap>(
    convertToParamMap(id === null ? {} : { id }),
  );
  TestBed.configureTestingModule({
    imports: [CourseDetailPageComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: ActivatedRoute, useValue: { paramMap: paramMap.asObservable() } },
    ],
  });
  return TestBed.inject(HttpTestingController);
}

describe('CourseDetailPageComponent', () => {
  it('renders the course detail with the module outline', async () => {
    const http = setup('c-1');
    const fixture = TestBed.createComponent(CourseDetailPageComponent);
    fixture.detectChanges();
    http.expectOne('/api/catalog/c-1').flush({
      id: 'c-1',
      title: 'Learn Rust',
      description: 'short',
      longDescription: 'the long description',
      instructorDisplayName: 'Ada Lovelace',
      difficulty: 'BEGINNER',
      lessonCount: 2,
      modules: [{ title: 'Module 1', lessons: [{ title: 'Intro' }, { title: 'Setup' }] }],
      publishedAt: '2026-01-01T00:00:00.000Z',
    });
    await fixture.whenStable();
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Learn Rust');
    expect(text).toContain('Ada Lovelace');
    expect(text).toContain('the long description');
    expect(text).toContain('Intro');
    expect(text).toContain('2 lessons');
  });

  it('renders the not-found state on a 404', async () => {
    const http = setup('c-missing');
    const fixture = TestBed.createComponent(CourseDetailPageComponent);
    fixture.detectChanges();
    http
      .expectOne('/api/catalog/c-missing')
      .flush({ error: { code: 'COURSE_NOT_FOUND' } }, { status: 404, statusText: 'Not Found' });
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Course not found');
    expect(el.querySelector('a[href="/catalog"]')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test web-catalog`
Expected: FAIL — cannot find `./course-detail-page.component`.

- [ ] **Step 3: Implement `CourseDetailPageComponent`**

Create `libs/web-catalog/src/lib/course-detail-page/course-detail-page.component.ts`:

```ts
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, type ParamMap } from '@angular/router';

import type { CourseCatalogDetail } from '@learnwren/shared-data-models';
import { LwCoverComponent, LwPillComponent } from '@learnwren/web-ui';

import { CatalogService } from '../catalog.service';
import { ModuleOutlineComponent } from '../components/module-outline/module-outline.component';

@Component({
  selector: 'lib-course-detail-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LwCoverComponent, LwPillComponent, ModuleOutlineComponent],
  templateUrl: './course-detail-page.component.html',
})
export class CourseDetailPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly service = inject(CatalogService);

  readonly course = signal<CourseCatalogDetail | null>(null);
  readonly notFound = signal(false);

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      void this.load(params);
    });
  }

  private async load(params: ParamMap): Promise<void> {
    const id = params.get('id');
    this.course.set(null);
    this.notFound.set(false);
    if (!id) {
      this.notFound.set(true);
      return;
    }
    try {
      this.course.set(await this.service.getCourseDetail(id));
    } catch {
      this.notFound.set(true);
    }
  }
}
```

Create `libs/web-catalog/src/lib/course-detail-page/course-detail-page.component.html`:

```html
<div class="mx-auto w-full max-w-3xl p-6">
  @if (notFound()) {
    <div class="text-center">
      <h1 class="mb-2 text-2xl text-ink">Course not found</h1>
      <p class="text-ink-2">
        This course is not available. <a href="/catalog" class="underline">Browse the catalogue</a>.
      </p>
    </div>
  } @else if (course() === null) {
    <p class="text-sm text-ink-3">Loading…</p>
  } @else {
    <article class="flex flex-col gap-6">
      <lw-cover [glyph]="course()!.title.charAt(0)" [height]="160" />

      <header class="flex flex-col gap-3">
        <h1 class="text-3xl text-ink">{{ course()!.title }}</h1>
        <p class="text-ink-2">By {{ course()!.instructorDisplayName }}</p>
        <div class="flex flex-wrap gap-2">
          @if (course()!.difficulty) {
            <lw-pill tone="default">{{ course()!.difficulty }}</lw-pill>
          }
          @if (course()!.category) {
            <lw-pill tone="default">{{ course()!.category }}</lw-pill>
          }
          <lw-pill tone="default">{{ course()!.lessonCount }} lessons</lw-pill>
        </div>
      </header>

      <p class="text-ink">{{ course()!.description }}</p>
      @if (course()!.longDescription) {
        <p class="whitespace-pre-line text-ink-2">{{ course()!.longDescription }}</p>
      }

      <section>
        <h2 class="mb-3 text-xl text-ink">Course content</h2>
        <lib-module-outline [modules]="course()!.modules" />
      </section>
    </article>
  }
</div>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm nx test web-catalog`
Expected: PASS.

- [ ] **Step 5: Sync project references and typecheck the library**

`web-catalog`'s components import `@learnwren/shared-data-models` and `@learnwren/web-ui`; `pnpm nx sync` writes the matching `tsconfig` project references (the same "sync TS project references" step seen in the repo's history for `web-courses`/`web-video`).

Run: `pnpm nx sync`
Then run: `pnpm nx typecheck web-catalog`
Expected: typecheck PASSES — `catalog.routes.ts`'s lazy imports for all three pages now resolve.

- [ ] **Step 6: Commit**

```bash
git add libs/web-catalog
git commit -m "$(cat <<'EOF'
feat(web-catalog): add course detail page

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: Wire `catalogRoutes` into `apps/web` + route-keyed shell

Makes `/catalog` the default route and gives guests a header with the global search bar.

**Files:**
- Create: `apps/web/src/app/shell/is-auth-route.ts`
- Create (test): `apps/web/src/app/shell/is-auth-route.spec.ts`
- Modify: `apps/web/src/app/app.routes.ts`
- Modify: `apps/web/src/app/app.ts`
- Modify: `apps/web/src/app/app.html`
- Modify: `apps/web/src/app/app.spec.ts`

- [ ] **Step 1: Write the failing test for the pure `isAuthRoute` helper**

Create `apps/web/src/app/shell/is-auth-route.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { isAuthRoute } from './is-auth-route';

describe('isAuthRoute', () => {
  it('is true for the auth pages', () => {
    expect(isAuthRoute('/login')).toBe(true);
    expect(isAuthRoute('/register')).toBe(true);
    expect(isAuthRoute('/register/confirm')).toBe(true);
    expect(isAuthRoute('/forgot-password')).toBe(true);
    expect(isAuthRoute('/auth/unlock')).toBe(true);
  });

  it('ignores query strings', () => {
    expect(isAuthRoute('/login?redirect=%2Fdashboard')).toBe(true);
  });

  it('is false for discovery and app routes', () => {
    expect(isAuthRoute('/catalog')).toBe(false);
    expect(isAuthRoute('/catalog/c-1')).toBe(false);
    expect(isAuthRoute('/search?q=rust')).toBe(false);
    expect(isAuthRoute('/dashboard')).toBe(false);
    expect(isAuthRoute('/courses')).toBe(false);
    expect(isAuthRoute('/')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test web`
Expected: FAIL — cannot find `./is-auth-route`.

- [ ] **Step 3: Implement the pure helper**

Create `apps/web/src/app/shell/is-auth-route.ts`:

```ts
/** URL path prefixes whose pages render without the app header. */
const AUTH_ROUTE_PREFIXES = ['/login', '/register', '/forgot-password', '/auth/unlock'];

/**
 * True when `url` belongs to an authentication page (login, register, etc.).
 * Those pages keep the centered, headerless layout; every other route gets
 * the app header. Query strings are ignored.
 */
export function isAuthRoute(url: string): boolean {
  const path = url.split('?')[0] ?? '';
  return AUTH_ROUTE_PREFIXES.some((prefix) => path === prefix || path.startsWith(prefix + '/'));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm nx test web`
Expected: the `isAuthRoute` tests PASS (the existing `app.spec.ts` tests still pass for now — they are updated in Step 8).

- [ ] **Step 5: Add `catalogRoutes` to `app.routes.ts`**

Overwrite `apps/web/src/app/app.routes.ts`:

```ts
import { Route } from '@angular/router';

import {
  authGuard,
  ForgotPasswordPageComponent,
  LoginPageComponent,
  RegisterConfirmPageComponent,
  RegisterPageComponent,
  UnlockPageComponent,
} from '@learnwren/web-auth';
import { catalogRoutes } from '@learnwren/web-catalog';
import { coursesRoutes } from '@learnwren/web-courses';

export const appRoutes: Route[] = [
  {
    path: 'login',
    component: LoginPageComponent,
  },
  {
    path: 'register',
    component: RegisterPageComponent,
  },
  {
    path: 'register/confirm',
    component: RegisterConfirmPageComponent,
  },
  {
    path: 'forgot-password',
    component: ForgotPasswordPageComponent,
  },
  {
    path: 'auth/unlock',
    component: UnlockPageComponent,
  },
  {
    path: 'dashboard',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./dashboard/dashboard.component').then((m) => m.DashboardComponent),
  },
  ...catalogRoutes,
  ...coursesRoutes,
  { path: '', pathMatch: 'full', redirectTo: '/catalog' },
];
```

- [ ] **Step 6: Update the `App` component**

Overwrite `apps/web/src/app/app.ts`:

```ts
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter, map, startWith } from 'rxjs';

import { AuthService } from '@learnwren/web-auth';
import { CourseSearchBarComponent } from '@learnwren/web-catalog';
import { LwWordmarkComponent, ThemeToggleComponent } from '@learnwren/web-ui';

import { isAuthRoute } from './shell/is-auth-route';

@Component({
  selector: 'app-root',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterOutlet,
    RouterLink,
    LwWordmarkComponent,
    ThemeToggleComponent,
    CourseSearchBarComponent,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
      startWith(this.router.url),
    ),
    { initialValue: this.router.url },
  );

  protected readonly showHeader = computed(() => !isAuthRoute(this.url()));

  protected readonly initials = computed(() => {
    const name = this.auth.currentUser()?.displayName ?? '';
    return name
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
  });
}
```

- [ ] **Step 7: Update `app.html`**

Overwrite `apps/web/src/app/app.html`:

```html
@if (showHeader()) {
  <header class="sticky top-0 z-10 flex items-center gap-6 border-b border-line bg-bg px-6 py-3.5">
    <a routerLink="/catalog"><lw-wordmark [size]="20" /></a>
    <nav class="flex gap-1">
      <a routerLink="/catalog" class="lw-btn lw-btn-ghost">Browse courses</a>
      @if (auth.isAuthenticated()) {
        <a routerLink="/dashboard" class="lw-btn lw-btn-ghost">Dashboard</a>
        @if (auth.currentUser()?.role === 'INSTRUCTOR') {
          <a routerLink="/courses" class="lw-btn lw-btn-ghost">My Courses</a>
        }
      }
    </nav>
    <span class="flex-1"></span>
    <lib-course-search-bar />
    <lw-theme-toggle />
    @if (auth.isAuthenticated()) {
      <span
        role="img"
        class="grid h-8 w-8 place-items-center rounded-full bg-ochre font-serif text-sm italic text-ochre-ink"
        [attr.aria-label]="'Signed in as ' + (auth.currentUser()?.displayName ?? '')"
        >{{ initials() }}</span
      >
    } @else {
      <a routerLink="/login" class="lw-btn lw-btn-ghost">Log in</a>
      <a routerLink="/register" class="lw-btn lw-btn-primary">Register</a>
    }
  </header>
  <main class="bg-bg text-ink">
    <router-outlet />
  </main>
} @else {
  <main class="flex min-h-screen flex-col items-center justify-center bg-bg text-ink">
    <router-outlet />
  </main>
}
```

- [ ] **Step 8: Update `app.spec.ts`**

The header is no longer auth-gated — it shows on every non-auth route. Overwrite `apps/web/src/app/app.spec.ts`:

```ts
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';

import { AuthService } from '@learnwren/web-auth';

import { App } from './app';

@Component({ selector: 'app-stub', standalone: true, template: '' })
class StubComponent {}

function configure(user: { displayName: string; role?: string } | null): void {
  const currentUser = signal(user);
  const fakeAuth = {
    currentUser,
    isAuthenticated: () => currentUser() != null,
  };
  TestBed.configureTestingModule({
    imports: [App],
    providers: [
      provideRouter([
        { path: 'login', component: StubComponent },
        { path: 'catalog', component: StubComponent },
      ]),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: AuthService, useValue: fakeAuth },
    ],
  });
}

describe('App', () => {
  it('renders the router outlet', () => {
    configure(null);
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('router-outlet')).not.toBeNull();
  });

  it('shows the header for a guest on a non-auth route', async () => {
    configure(null);
    await TestBed.inject(Router).navigateByUrl('/catalog');
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const header: HTMLElement | null = fixture.nativeElement.querySelector('header');
    expect(header).not.toBeNull();
    expect(header!.querySelector('lib-course-search-bar')).not.toBeNull();
  });

  it('shows Log in / Register for a guest', async () => {
    configure(null);
    await TestBed.inject(Router).navigateByUrl('/catalog');
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('a[routerLink="/login"]')).not.toBeNull();
    expect(el.querySelector('a[routerLink="/register"]')).not.toBeNull();
  });

  it('hides the header on an auth route', async () => {
    configure(null);
    await TestBed.inject(Router).navigateByUrl('/login');
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('header')).toBeNull();
  });

  it('renders the user initials in the avatar when authenticated', async () => {
    configure({ displayName: 'Etta Wren' });
    await TestBed.inject(Router).navigateByUrl('/catalog');
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('EW');
  });

  it('shows the My Courses nav link for an instructor', async () => {
    configure({ displayName: 'Etta Wren', role: 'INSTRUCTOR' });
    await TestBed.inject(Router).navigateByUrl('/catalog');
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('a[routerLink="/courses"]'),
    ).not.toBeNull();
  });

  it('hides the My Courses nav link for a student', async () => {
    configure({ displayName: 'Etta Wren', role: 'STUDENT' });
    await TestBed.inject(Router).navigateByUrl('/catalog');
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('a[routerLink="/courses"]'),
    ).toBeNull();
  });
});
```

- [ ] **Step 9: Sync TypeScript project references**

`apps/web` now depends on `web-catalog`. Run:

```bash
pnpm nx sync
```

Expected: `apps/web/tsconfig.app.json` (and any other affected `tsconfig`s) gain a reference to `libs/web-catalog`.

- [ ] **Step 10: Verify the web project**

Run: `pnpm nx test web`
Expected: PASS — `is-auth-route` and the updated `App` tests are green.
Run: `pnpm nx typecheck web`
Expected: PASS.

- [ ] **Step 11: Commit**

First check what `pnpm nx sync` changed: `git status`. Then:

```bash
git add apps/web
git commit -m "$(cat <<'EOF'
feat(web): make /catalog the home route and show a guest header

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

> `pnpm nx sync` rewrites `tsconfig` `references`. The `apps/web/tsconfig*.json` changes are covered by `git add apps/web`. If `git status` shows other modified `tsconfig*.json` files (e.g. a workspace-root `tsconfig.json`), stage those too before committing.

---

## Task 15: `web-e2e` catalog spec

A guest discovery journey through the running app.

**Prerequisite:** `pnpm emulators` and `pnpm start` must be running.

**Files:**
- Create: `apps/web-e2e/src/catalog.spec.ts`
- Modify: `apps/web-e2e/src/home.spec.ts`

- [ ] **Step 1: Update the home redirect test**

The root path now redirects to `/catalog`, not `/login`. Overwrite `apps/web-e2e/src/home.spec.ts`:

```ts
import { expect, test } from '@playwright/test';

test('the root path redirects to the course catalogue', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/catalog$/);
  await expect(page.getByRole('heading', { name: 'Course catalogue' })).toBeVisible();
});
```

- [ ] **Step 2: Write the catalog guest-journey spec**

Create `apps/web-e2e/src/catalog.spec.ts`:

```ts
import { expect, test } from '@playwright/test';

test('a guest sees the catalogue with a header and search bar', async ({ page }) => {
  await page.goto('/catalog');
  await expect(page.getByRole('heading', { name: 'Course catalogue' })).toBeVisible();
  await expect(page.locator('header')).toBeVisible();
  await expect(page.getByPlaceholder('Search courses')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Log in' })).toBeVisible();
});

test('a guest can search from the header and reach a results page', async ({ page }) => {
  await page.goto('/catalog');
  await page.getByPlaceholder('Search courses').fill('zzzznomatch');
  await page.getByPlaceholder('Search courses').press('Enter');
  await expect(page).toHaveURL(/\/search\?q=zzzznomatch/);
  await expect(page.getByText('No courses found for your search')).toBeVisible();
});

test('an unknown course id renders the not-found page', async ({ page }) => {
  await page.goto('/catalog/does-not-exist');
  await expect(page.getByRole('heading', { name: 'Course not found' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Browse the catalogue' })).toBeVisible();
});
```

- [ ] **Step 3: Run the suite to verify it passes**

Run: `pnpm nx e2e web-e2e`
Expected: the new `catalog.spec.ts` and updated `home.spec.ts` PASS; no regression in other suites.

- [ ] **Step 4: Commit**

```bash
git add apps/web-e2e/src/catalog.spec.ts apps/web-e2e/src/home.spec.ts
git commit -m "$(cat <<'EOF'
test(web-e2e): cover the guest course-discovery journey

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 16: README update + full verification

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update `README.md`**

In the `PROJECT STATUS` callout, change the EP-05 line. Replace:

```
> Catalogue (EP-05) and enrolled-student playback (EP-06) remain deferred. Instructor dashboard and platform administration remain in post-MVP planning.
```

with:

```
> **EP-05 Slice A (Course Discovery) complete:** a public, unauthenticated catalogue of PUBLISHED courses with category/difficulty filters, Newest/Alphabetical sort, and pagination; keyword search over course titles and descriptions; and a public course-detail page. `/` now opens the catalogue. Enrolment (EP-05 Slice B — UC-05-04/05) and enrolled-student playback (EP-06) remain deferred. Instructor dashboard and platform administration remain in post-MVP planning.
```

Then add a new endpoint table after the EP-04 materials table:

```
The API endpoints exposed by EP-05 Slice A (course discovery — all public, no session cookie):

| Method | Path | Purpose |
| :--- | :--- | :--- |
| `GET` | `/api/catalog` | Paginated list of PUBLISHED courses; `page`, `sort`, `category`, `difficulty` query params. |
| `GET` | `/api/catalog/search` | Relevance-ranked search of PUBLISHED courses by title/description; `q`, `page` query params. |
| `GET` | `/api/catalog/:cid` | Public course detail (structure + instructor name); 404 for missing/unpublished. |
```

Also add `web-catalog` to the libraries table and the `libs/` tree in the Monorepo Layout section, matching the style of the existing `web-courses` / `web-video` rows:

```
| `web-catalog` | Library | Angular standalone components for public course discovery (catalogue, search, course detail) |
```

- [ ] **Step 2: Run the full quality gates**

Run each and confirm it passes:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Expected: all green. With `pnpm emulators` + `pnpm start` running, also run:

```bash
pnpm nx e2e api-e2e
pnpm nx e2e web-e2e
```

Expected: all green.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "$(cat <<'EOF'
docs: record EP-05 Slice A course discovery in the README

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Final review**

Confirm against the spec's "Goal" checklist (`docs/superpowers/specs/2026-05-22-course-discovery-slice-a-design.md`): guest opens `/` → catalogue; filter/sort/paginate work; header search → `/search`; course-detail with outline; 404 for draft/missing; all three endpoints answer with no session cookie; `DRAFT`/`ARCHIVED` never appear. Then hand the branch off for review (the `superpowers:finishing-a-development-branch` skill).

---

## Notes for the implementer

- **TS project references / `nx sync`.** When a project gains a dependency on another workspace library, `pnpm nx sync` updates the `tsconfig` `references`. Task 14 runs it once for `apps/web → web-catalog`. If `pnpm nx typecheck` complains about an unresolved `@learnwren/*` import earlier, run `pnpm nx sync` and retry.
- **Single-test runs.** `pnpm nx test <project>` runs the whole project suite. To narrow it while iterating, append a filename filter, e.g. `pnpm nx test api-courses -- catalog`.
- **E2E prerequisites.** `api-e2e` needs `pnpm emulators` + `pnpm start:api`; `web-e2e` needs `pnpm emulators` + `pnpm start`. The catalog `api-e2e` seeds Firestore directly via the Admin SDK — no GCP credentials, so it is CI-safe (unlike the quarantined video suites).
- **No new Firestore indexes or rules.** The only query is `where('status','==','PUBLISHED')` (auto-indexed). Catalog reads use the Admin SDK, which bypasses security rules.
- **Approach A is intentional.** Filtering/sorting/searching/paginating happen in memory in `CatalogService`. The `page`-based API contract is identical to a future Firestore-cursor implementation, so that optimisation stays open without an API change.
