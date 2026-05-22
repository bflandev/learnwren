# Course Discovery — EP-05 Slice A Design Spec

> [!NOTE]
> **DOCUMENT STATUS: DRAFT**
> This document is a living specification and is subject to change. All content is considered provisional until formally approved by project stakeholders.

**Status:** Draft (2026-05-22)
**Scope:** First implementation slice of EP-05 (Course Discovery and Enrollment). Delivers the read-only discovery surface end-to-end — **UC-05-01 (Browse the Course Catalogue)**, **UC-05-02 (Search for Courses)**, and **UC-05-03 (View a Course Detail Page)**. Adds a `catalog` read-model to `shared-data-models`, a `catalog/` submodule in `libs/api-courses` exposing the platform's **first public (unauthenticated) API surface**, a new `libs/web-catalog` Angular library, and a contained change to the `apps/web` shell so a guest sees a header. Enrolment (UC-05-04 / UC-05-05) is a named follow-up — **Slice B**.

This spec sits on top of:

- `2026-05-12-course-authoring-design.md` (EP-02 — `Course → Module → Lesson` hierarchy, `CoursesController`, `CoursesService`, `CoursesRepository`, `CoursesExceptionFilter`, the courses error envelope).
- `2026-05-20-publish-gate-slice-d-design.md` (EP-03 slice D — the `Course.status` state machine; `'PUBLISHED'` is the catalogue's sole visibility gate; `Course.publishedAt` is set on each `DRAFT → PUBLISHED` transition).
- `2026-05-20-merge-api-video-into-api-courses-design.md` (established the `video/` / `materials/` / `publish/` submodule convention inside `libs/api-courses` that `catalog/` follows).
- `2026-05-22-design-system-adoption-design.md` and `2026-05-22-instructor-ui-design.md` (the `web-ui` design-system library — `lw-*` token classes, `LwWordmarkComponent`, `ThemeToggleComponent` — that all new discovery UI consumes).

It reuses the existing `CoursesExceptionFilter` + error envelope, the `api-firebase` Firestore handle, the signal-based Angular service pattern (`AuthService`, `CoursesService`), and the slice-A/B/C/D testing posture. It introduces **one new library** (`web-catalog`) with **three new Nx graph edges** (`web-catalog → shared-data-models`, `web-catalog → web-ui`, `apps/web → web-catalog`), **no new env vars**, **no Firestore rules changes**, and **no new Firestore indexes**.

## Goal

A fresh clone, after `pnpm install` and `pnpm secrets:render`, running `pnpm emulators` + `pnpm start`, must satisfy:

- An **unauthenticated visitor** opening `http://localhost:4200/` lands on the course catalogue (`/catalog`) — no redirect to `/login`.
- The catalogue shows every `PUBLISHED` course as a card (cover-image placeholder, title, instructor display name, difficulty), 20 per page, with working pagination.
- The visitor can filter the catalogue by category and by difficulty, and sort by **Newest** or **Alphabetical**; filters/sort/page are reflected in the URL query string.
- Applying filters that match nothing shows: "No courses match your filters. Try adjusting your search criteria."
- The visitor can type a keyword into a header search bar present on every non-auth page, submit it, and land on `/search?q=…` showing a relevance-ranked, paginated list of `PUBLISHED` courses whose title or description contains the keyword (case-insensitive).
- A search with no matches shows: "No courses found for your search. Try different keywords or browse the catalogue." with a link to `/catalog`. Submitting an empty query routes to `/catalog`.
- Clicking a course card opens `/catalog/:id` showing the title, cover-image placeholder, description and long description, instructor display name, difficulty, total lesson count, and the module/lesson outline (titles only — no video, no materials).
- Requesting `/catalog/:id` for a `DRAFT`, `ARCHIVED`, or non-existent course renders a "Course not found" page with a link back to the catalogue.
- All three discovery endpoints (`GET /api/catalog`, `GET /api/catalog/search`, `GET /api/catalog/:cid`) return `200` **with no session cookie present**. `DRAFT` and `ARCHIVED` courses never appear in any of the three.
- An authenticated user (student or instructor) sees the same catalogue, plus the existing header nav (Dashboard, and My Courses for instructors); an instructor's authoring flow under `/courses/**` is unchanged.
- All prior-spec quality gates pass: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm e2e`. No regression in `api-auth`, `api-courses` (existing submodules), `web-auth`, `web-courses`, or `web-video`.

## Non-Goals

Each is owned by a named subsequent slice or epic:

- **Enrol / Unenrol (UC-05-04, UC-05-05).** EP-05 Slice B. The course detail page in this slice renders course information only — **no "Enrol" / "Continue Learning" call-to-action**. The CTA, the `Enrollment` write model, and the detail page's enrolled-vs-unenrolled branching all land in Slice B.
- **"Most Popular" sort (UC-05-01).** Slice B. It ranks by enrolment count, which does not exist until the `Enrollment` model ships. Slice A offers **Newest** and **Alphabetical** only.
- **Instructor biography (UC-05-03).** The detail page shows the instructor's **display name only**. A `biography` field requires UC-01-03 (Manage User Profile) — unbuilt — to have any way to populate it. Deferred until UC-01-03, the same precedent as the deferred cover image.
- **Cover images.** Already deferred platform-wide. Cards and the detail page render a styled placeholder.
- **Full-text / fuzzy search, search ranking beyond a title-vs-description heuristic, and an external search index** (Algolia / Typesense). Out of scope; an architecture change of that size would require its own spec per `CLAUDE.md`.
- **Firestore-native cursor pagination.** This slice paginates in memory (see Architecture). The `page`-based API contract is identical to a cursor implementation, so this is a non-breaking future optimisation, not a redesign.

## Use cases delivered

| ID | Use case | Delivered behaviour |
| :-- | :-- | :-- |
| UC-05-01 | Browse the Course Catalogue | `/catalog` — paginated `PUBLISHED`-course grid; category + difficulty filters; Newest / Alphabetical sort; filter/sort/no-match extensions. "Most Popular" sort deferred (Slice B). |
| UC-05-02 | Search for Courses | Header search bar on every non-auth page → `/search?q=…`; case-insensitive title/description substring match; relevance-ranked; no-results and empty-query extensions. |
| UC-05-03 | View a Course Detail Page | `/catalog/:id` — full course info + module/lesson outline; 404 extension for unpublished/missing. Enrol CTA deferred (Slice B); instructor bio deferred (UC-01-03). |

## Architecture overview

```
Guest / Student / Instructor
        │  (no session cookie required)
        ▼
apps/web  ──────────────────────────────────────────────┐
  app shell: route-keyed header + global search bar      │
  /catalog, /catalog/:id, /search  ─────────────────┐    │
                                                    ▼    │
  libs/web-catalog                                       │
    CatalogService (signal-based) ──── HTTP ────────┐    │
    CatalogPage / SearchResultsPage / CourseDetail   │   │
    CourseCard, CourseSearchBar, CatalogFilterBar    │   │
                                                     ▼   │
  GET /api/catalog            (public)                   │
  GET /api/catalog/search     (public)                   │
  GET /api/catalog/:cid       (public)                   │
        │                                                │
        ▼                                                │
  libs/api-courses · catalog/                            │
    CatalogController  (NO @UseGuards)                    │
    CatalogService     (Approach A: in-memory)            │
        │            │                                   │
        ▼            ▼                                   │
  CoursesRepository  users/{uid}  (read-only,             │
  .listPublished()   display-name lookup via api-firebase)│
        │                                                │
        ▼                                                │
  Firestore (Admin SDK) — courses / modules / lessons / users
```

**Approach A — in-memory filter / sort / search / paginate.** `CoursesRepository.listPublished()` issues a single Firestore query — `courses.where('status', '==', 'PUBLISHED')` — and `CatalogService` does all filtering, sorting, relevance ranking, and pagination in process. Rationale:

- Search **must** be in-memory regardless — Firestore has no substring or full-text matching — so catalogue and search share one code path instead of two.
- The only Firestore predicate is a single equality on `status`, which is covered by Firestore's automatic single-field index. **No composite index, no `firestore.indexes.json` change.**
- For a small self-hosted community the published-course count is small; re-reading it per request is negligible.
- The `page`-based response contract (`CourseCatalogPage`) is identical to what a cursor implementation would expose, so swapping `listPublished()` internals for cursor queries later is a contained, non-breaking change behind the same `CatalogService` interface.

## Data models — `libs/shared-data-models`

New file `src/lib/catalog.ts`, re-exported from `src/index.ts`. These are **read-model** types, deliberately distinct from `Course` and `CourseTree` so the public surface can never leak draft state, video keys, storage paths, or material metadata.

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

Notes:

- `instructorDisplayName` is **resolved at read time** from `users/{instructorId}.displayName` — not denormalised onto the course document. Display names rarely change (UC-01-03 profile editing is unbuilt), and read-time resolution avoids a backfill and a write-fan-out. Resolution is batched and scoped to the page being returned (≤ 20 user reads per catalogue request).
- `CourseCatalogDetail.modules` carries **titles only** — no module or lesson IDs, no video data, no materials. UC-05-03 step 2: "module and lesson titles, but not the video content." There is nothing for a guest to navigate into until the student learning experience (EP-06).

## API layer — `libs/api-courses/src/lib/catalog/`

A new `catalog/` submodule, following the `video/` / `materials/` / `publish/` convention. Registered in the existing `CoursesModule` (`CatalogController` in `controllers`, `CatalogService` in `providers`). No new Nx edges — `api-courses` already depends on `shared-data-models` and `api-firebase`, and the catalog submodule needs nothing from `api-auth` (it is unguarded).

### Endpoints

`CatalogController` is decorated `@Controller('catalog')` and `@UseFilters(CoursesExceptionFilter)` — and carries **no `@UseGuards`**. This is the platform's first unauthenticated API surface; it is read-only and only ever returns `PUBLISHED` data.

| Method | Path | Query | Returns | Failure |
| :-- | :-- | :-- | :-- | :-- |
| `GET` | `/api/catalog` | `page` (int ≥ 1, default 1), `sort` (`NEWEST` \| `ALPHABETICAL`, default `NEWEST`), `category?` (`CourseCategory`), `difficulty?` (`CourseDifficulty`) | `200 CourseCatalogPage` | `400` on invalid `page` / `sort` / `category` / `difficulty` |
| `GET` | `/api/catalog/search` | `q` (string, required, non-empty after trim, ≤ 100 chars), `page` (int ≥ 1, default 1) | `200 CourseCatalogPage` (relevance-ranked) | `400` on missing/empty/over-length `q` |
| `GET` | `/api/catalog/:cid` | — | `200 CourseCatalogDetail` | `404 COURSE_NOT_FOUND` if missing **or** `status !== 'PUBLISHED'` |

Route declaration order places `/catalog/search` **before** `/catalog/:cid` so the literal segment is never captured as a course id.

DTOs (`catalog/dto/`) use `class-validator`, consistent with existing DTOs: `CatalogQueryDto` (`page`, `sort`, `category`, `difficulty`) and `CatalogSearchDto` (`q`, `page`). `page` is coerced and validated `≥ 1`; `sort` is constrained to `CATALOG_SORT_OPTIONS`; `category` / `difficulty` to the respective `shared-data-models` unions.

### `CatalogService`

The orchestrator for Approach A.

- **`listCatalogue(query: CatalogQueryDto): Promise<CourseCatalogPage>`**
  1. `repo.listPublished()` → all `PUBLISHED` `Course` docs.
  2. Filter by `category` and `difficulty` when present (exact match).
  3. Sort: `NEWEST` → `publishedAt` descending; `ALPHABETICAL` → `title` ascending, case-insensitive (locale compare).
  4. Paginate: `pageSize = CATALOG_PAGE_SIZE`; slice `[(page-1)*pageSize, page*pageSize)`. A `page` past the end yields empty `items` with truthful `total` / `totalPages` — **not** an error.
  5. Resolve instructor display names for the sliced page only (see below), map to `CourseSummary`, return the `CourseCatalogPage`.

- **`search(query: CatalogSearchDto): Promise<CourseCatalogPage>`**
  1. `repo.listPublished()`.
  2. Keep courses whose `title` or `description` contains the trimmed, lower-cased `q` (case-insensitive `includes`).
  3. Rank by relevance: a `title` match outranks a `description`-only match; ties break by `publishedAt` descending.
  4. Paginate as above, resolve names, return `CourseCatalogPage`.

- **`getCourseDetail(cid: CourseId): Promise<CourseCatalogDetail>`**
  1. Load `courses/{cid}`. Missing → throw the courses exception with `COURSE_NOT_FOUND` (`404`).
  2. `status !== 'PUBLISHED'` → throw the **same** `COURSE_NOT_FOUND` (`404`). A `DRAFT` / `ARCHIVED` course is indistinguishable from a missing one to a guest — draft existence is never leaked.
  3. Load modules + lessons in display order (reusing the existing `CoursesRepository` tree-loading the instructor `getCourseTree` already uses), mapping to `CatalogModuleOutline` (titles only). `lessonCount` = sum of lessons across modules.
  4. Resolve `instructorDisplayName`, assemble and return `CourseCatalogDetail`.

**Instructor display-name resolution.** A private `CatalogService` helper takes the unique `instructorId`s of the courses being returned and batch-reads `users/{uid}` via the `api-firebase` Firestore handle (`getAll`). This is a deliberate, read-only cross-collection access: `api-courses` already trusts `Course.instructorId`; reading the matching `users` document for a display name adds no new trust boundary and no `api-auth` dependency. A missing user document falls back to the literal `"Instructor"`.

### Repository

One new method on the existing `CoursesRepository`:

```ts
/** Every course with status PUBLISHED. The catalogue's only Firestore query. */
listPublished(): Promise<Course[]>;
// coursesCollection.where('status', '==', 'PUBLISHED').get()
```

Module/lesson loading for `getCourseDetail` reuses the repository methods that already back `CoursesService.getCourseTree` — no new tree-loading code.

### Firestore rules & indexes

- **Rules:** unchanged. Catalogue reads run through the API on the Admin SDK, which bypasses security rules; `courses` / `modules` / `lessons` stay deny-all from the client.
- **Indexes:** none added. The single `where('status','==','PUBLISHED')` equality is served by Firestore's automatic single-field index.

## Web layer — new `libs/web-catalog` library

Generated with the Nx Angular library generator (standalone, no `NgModule`), consistent with `web-video` / `web-auth`. Depends on `shared-data-models` and `web-ui`. Exports its routes and the search-bar component from `src/index.ts`.

### `CatalogService` (Angular)

Signal-based, injected `HttpClient`, consistent with `AuthService` / `web-courses` `CoursesService`. Methods: `getCatalogue(params)`, `search(q, page)`, `getCourseDetail(id)` — each returning the corresponding `shared-data-models` type. These are public endpoints; the existing auth interceptor's `withCredentials` is harmless on them.

### Pages (lazy-loaded standalone components, all public)

| Route | Component | Behaviour |
| :-- | :-- | :-- |
| `/catalog` | `CatalogPageComponent` | Card grid + `CatalogFilterBarComponent` (category dropdown, difficulty dropdown, sort dropdown) + pagination controls. Filter / sort / page are bound to **URL query params** (`category`, `difficulty`, `sort`, `page`) so the view is shareable and back-button-correct. Renders the no-courses, no-match, and load-error states. |
| `/search` | `SearchResultsPageComponent` | Reads the `q` (and `page`) query param; empty/blank `q` → redirect to `/catalog`. Calls `CatalogService.search`, renders the same `CourseCardComponent` grid relevance-ranked, with pagination. Renders the no-results state (message + `/catalog` link) and the load-error state. |
| `/catalog/:id` | `CourseDetailPageComponent` | Calls `CatalogService.getCourseDetail`. Renders title, cover-image placeholder, `description` + `longDescription`, instructor display name, difficulty, lesson count, and the `ModuleOutlineComponent`. **No Enrol CTA** (Slice B). On `404`, renders the "Course not found" state with a `/catalog` link. |

### Components

- **`CourseCardComponent`** — cover-image placeholder, title, instructor display name, difficulty badge. Reused by the catalogue and search grids. A whole-card link to `/catalog/:id`.
- **`CourseSearchBarComponent`** — a text input that, on submit, navigates to `/search?q=…` (trimmed); blank input navigates to `/catalog`. Exported from `web-catalog`'s `index.ts` so the `apps/web` header can host it.
- **`CatalogFilterBarComponent`** — the category / difficulty / sort dropdowns; emits changes the catalogue page writes into the URL.
- **`ModuleOutlineComponent`** — renders `CatalogModuleOutline[]` as a titles-only module/lesson tree.

All components use the `web-ui` `lw-*` token classes and design-system primitives — same posture as the instructor-UI restyle.

### Routing

`web-catalog` exports `catalogRoutes`:

```ts
export const catalogRoutes: Route[] = [
  { path: 'catalog', loadComponent: () => import(...).then(m => m.CatalogPageComponent) },
  { path: 'catalog/:id', loadComponent: () => import(...).then(m => m.CourseDetailPageComponent) },
  { path: 'search', loadComponent: () => import(...).then(m => m.SearchResultsPageComponent) },
];
```

`apps/web/src/app/app.routes.ts` adds `...catalogRoutes` and changes the fallback route from `{ path: '', pathMatch: 'full', redirectTo: '/login' }` to `redirectTo: '/catalog'`. No collision with the instructor `coursesRoutes` (`/courses/**`); `catalog` is matched before `catalog/:id` by declaration order; `search` is its own top-level path.

## App shell change — `apps/web`

Today `app.html` renders the header **only when `auth.isAuthenticated()`**; unauthenticated users get a bare centered layout (the login / register cards). For a public catalogue a guest must see a header — with the wordmark, a Browse link, the global search bar, and Log in / Register actions.

The change is contained to `apps/web/src/app/app.ts` + `app.html` (and `app.spec.ts`) — **no `web-auth` changes**:

- The layout split changes from **auth-state-keyed** to **route-keyed**. `App` gains an `isAuthRoute()` signal derived from the router URL: `true` when the URL is under `/login`, `/register`, `/forgot-password`, or `/auth/unlock` (a prefix match — `/register/confirm` is covered by `/register`).
- `isAuthRoute()` → the existing centered headerless layout (auth pages render exactly as they do today). Otherwise → header + scrolling `<main>`.
- The header renders for **everyone** on non-auth routes. Its content branches on `auth.isAuthenticated()`:
  - **Guest:** wordmark (→ `/catalog`), a "Browse courses" link (→ `/catalog`), `CourseSearchBarComponent`, `ThemeToggleComponent`, and **Log in** / **Register** buttons.
  - **Authenticated:** the same wordmark + Browse link + search bar + theme toggle, plus the existing Dashboard link, the instructor-only My Courses link, and the initials avatar.
- `apps/web` adds a dependency on `web-catalog` (for `CourseSearchBarComponent`) — the same app-imports-lib direction as its existing `web-auth` / `web-courses` / `web-ui` imports.

This makes the search bar "accessible from any page" (UC-05-02) for every non-auth route, for guests and authenticated users alike.

## Error handling & edge cases

| Situation | Use case | Behaviour |
| :-- | :-- | :-- |
| No `PUBLISHED` courses exist | UC-05-01 | Catalogue renders a general empty state. |
| Filters match nothing | UC-05-01 ext 2d | "No courses match your filters. Try adjusting your search criteria." |
| Search returns nothing | UC-05-02 ext 4a | "No courses found for your search. Try different keywords or browse the catalogue." + link to `/catalog`. |
| Empty / blank search query | UC-05-02 ext 1a | Web redirects to `/catalog`; the API is never called with an empty `q` (and returns `400` if it is, called directly). |
| Course missing / `DRAFT` / `ARCHIVED` | UC-05-03 ext 1a | `GET /api/catalog/:cid` → `404 COURSE_NOT_FOUND`; detail page renders "Course not found" + `/catalog` link. |
| Course unpublished between catalogue load and detail click | UC-05-03 ext 1a | Identical `404` path — no special handling. |
| `page` past the last page | — | API returns empty `items` with truthful `total` / `totalPages`; UI shows the empty state and pagination clamps. |
| Invalid `page` / `sort` / `category` / `difficulty` | — | API `400` via `class-validator` + `CoursesExceptionFilter`; the UI guards its own controls so this is reachable only by hand-edited URLs, which fall back to defaults. |
| Instructor `users/{uid}` document missing | — | `instructorDisplayName` falls back to `"Instructor"`. |
| API / network failure on any page | — | Each page renders an error state with a retry affordance, consistent with existing pages. |

**Invariant — catalogue visibility.** `DRAFT` and `ARCHIVED` courses never appear in the catalogue, search results, or a detail page. Enforced in exactly two places: `CoursesRepository.listPublished()` (the `status == 'PUBLISHED'` query) and the `getCourseDetail` status check.

**Error envelope.** Catalog endpoints reuse `CoursesExceptionFilter` and the existing courses error-code envelope — the same `{ error: { code, message } }` shape as the rest of the API. `COURSE_NOT_FOUND` is added to the courses error-code set if not already present.

## Testing

Follows the established posture — colocated `*.spec.ts`, Vitest for units, the `libs/api-courses/src/lib/testing/fake-firestore.ts` helper, Playwright for E2E.

**API unit tests**

- `CatalogService` — category/difficulty filtering, `NEWEST` and `ALPHABETICAL` sorting, search substring matching (case-insensitivity), relevance ranking (title vs description), pagination maths (including past-the-end and empty), `getCourseDetail` 404 logic for missing / `DRAFT` / `ARCHIVED`, lesson counting, instructor-name resolution + `"Instructor"` fallback.
- `CatalogController` — route wiring and the `/search`-before-`/:cid` ordering.
- `CatalogQueryDto` / `CatalogSearchDto` — `class-validator` acceptance and rejection cases.
- `CoursesRepository.listPublished()` — returns only `PUBLISHED`, excludes `DRAFT` / `ARCHIVED`.

**Web unit tests**

- Angular `CatalogService` — request shaping and response typing for all three endpoints.
- `CatalogPageComponent`, `SearchResultsPageComponent`, `CourseDetailPageComponent` — happy path, every empty/error state, URL-query-param binding (catalogue), empty-`q` redirect (search), `404` state (detail).
- `CourseCardComponent`, `CourseSearchBarComponent`, `CatalogFilterBarComponent`, `ModuleOutlineComponent`.
- `App` shell — the `isAuthRoute()` split renders the header on `/catalog` and omits it on `/login`.

**`api-e2e` (Playwright)** — a new spec:

- `GET /api/catalog` → `200`, pagination, category + difficulty filters, both sorts — **with no session cookie**.
- `GET /api/catalog/search` → `200` relevance-ranked; `400` on empty `q`.
- `GET /api/catalog/:cid` → `200` for a published course; `404` for a draft, an archived, and a non-existent course.
- `DRAFT` / `ARCHIVED` courses are absent from catalogue and search.

**`web-e2e` (Playwright)** — a guest journey: open `/` → catalogue → filter → sort → paginate → search from the header → open a course detail page → hit a `404` for an unpublished course; the header and search bar are visible to the guest throughout.

## File manifest

**New**

- `libs/shared-data-models/src/lib/catalog.ts` (+ `catalog.spec.ts`)
- `libs/api-courses/src/lib/catalog/catalog.controller.ts` (+ `.spec.ts`)
- `libs/api-courses/src/lib/catalog/catalog.service.ts` (+ `.spec.ts`)
- `libs/api-courses/src/lib/catalog/dto/catalog-query.dto.ts`, `catalog-search.dto.ts` (+ `dto.spec.ts`)
- `libs/web-catalog/**` — new Nx library: `catalog.service.ts`, `catalog.routes.ts`, the three page components, `CourseCardComponent`, `CourseSearchBarComponent`, `CatalogFilterBarComponent`, `ModuleOutlineComponent`, `test-setup.ts`, `index.ts` (+ colocated `*.spec.ts`)
- `apps/api-e2e/src/api/catalog.spec.ts`
- `apps/web-e2e/src/catalog.spec.ts`

**Changed**

- `libs/shared-data-models/src/index.ts` — export `catalog.ts`
- `libs/api-courses/src/lib/courses.repository.ts` — add `listPublished()`
- `libs/api-courses/src/lib/courses.module.ts` — register `CatalogController` + `CatalogService`
- `libs/api-courses/src/lib/errors/courses-error.codes.ts` — add `COURSE_NOT_FOUND` if absent
- `apps/web/src/app/app.routes.ts` — add `...catalogRoutes`; `'' → /catalog`
- `apps/web/src/app/app.ts`, `app.html`, `app.spec.ts` — route-keyed header; host the search bar; guest nav
- `apps/web/project.json` / tsconfig references — the `web-catalog` dependency, as Nx wiring requires
- `README.md` — record the EP-05 Slice A surface and endpoints

## Implementation sequencing (for the plan)

A natural bottom-up order, each step independently testable:

1. `shared-data-models` — `catalog.ts` types.
2. `api-courses` — `CoursesRepository.listPublished()`, then `CatalogService`, then `CatalogController` + DTOs, then module registration; `api-e2e` spec.
3. `web-catalog` — scaffold the library, `CatalogService`, the leaf components, then the three pages and `catalog.routes.ts`.
4. `apps/web` — wire `catalogRoutes`, the route-keyed shell, the header search bar; `web-e2e` spec.
5. `README.md` update; full quality-gate run.
