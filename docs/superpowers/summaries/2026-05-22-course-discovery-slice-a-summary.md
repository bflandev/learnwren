# Course Discovery (Slice A) — Implementation Summary

**Date:** 2026-05-22
**Spec:** `docs/superpowers/specs/2026-05-22-course-discovery-slice-a-design.md`
**Plan:** `docs/superpowers/plans/2026-05-22-course-discovery-slice-a.md`

Wires UC-05-01 (browse the course catalogue), UC-05-02 (search for courses), and UC-05-03 (view a course detail page) end to end. A new `catalog/` submodule inside `libs/api-courses` exposes the platform's first three unauthenticated `GET` endpoints over `PUBLISHED` courses; a new `libs/web-catalog` Angular library renders the catalogue, search, and detail pages; the `apps/web` shell switches from auth-gated to route-keyed header rendering so guests see a header and a global search bar. `/` now redirects to `/catalog`. Merged to `main` as `f4bee65`.

## What shipped

### Shared (`libs/shared-data-models`)

- `src/lib/catalog.ts` — read-model types `CourseSummary`, `CourseCatalogPage`, `CatalogModuleOutline`, `CourseCatalogDetail`, plus `CATALOG_SORT_OPTIONS = ['NEWEST','ALPHABETICAL']` and `CATALOG_PAGE_SIZE = 20`. Re-exported from `src/index.ts`.

### NestJS (`libs/api-courses/src/lib/catalog/`)

- `catalog.controller.ts` — `@Controller('catalog')` + `@UseFilters(CoursesExceptionFilter)`, no `@UseGuards`. Three routes (`list`, `search`, `detail`); `/search` declared before `/:cid`.
- `catalog.service.ts` — Approach A orchestrator. `listCatalogue` filters by `category`/`difficulty`, sorts by `NEWEST` (publishedAt desc) or `ALPHABETICAL` (case-insensitive `localeCompare`), and paginates. `search` does case-insensitive `includes` on title/description with title-match outranking description-match. `getCourseDetail` rejects missing / `DRAFT` / `ARCHIVED` with the same `COURSE_NOT_FOUND` 404.
- `instructor-directory.ts` — `InstructorDirectory.displayNamesFor(uids)` dedupes ids and reads each `users/{uid}` in parallel via the `api-firebase` handle; falls back to `"Instructor"` when the doc is missing.
- `parse-course-id.pipe.ts` — `ParseCourseIdPipe` validates the `:cid` path segment against `/^[A-Za-z0-9_-]{1,64}$/`, throwing `CourseNotFoundException` (404) on rejection so the public endpoint cannot be fuzzed against arbitrary Firestore document paths. **Not in the plan**; see "Plan deviations".
- `dto/catalog-query.dto.ts`, `dto/catalog-search.dto.ts` — `class-validator` DTOs (`page ≥ 1`, sort/category/difficulty constrained to the shared unions, `q` non-empty + ≤ 100 chars + `\S` match).
- `courses.repository.ts` — added `listPublished()` (single `where('status','==','PUBLISHED')` query).
- `courses.module.ts` — registers `CatalogController`, `CatalogService`, `InstructorDirectory`.

### Angular (`libs/web-catalog`)

New Nx Angular library, standalone, `scope:web`, vitest-analog test setup. Depends on `shared-data-models` and `web-ui`.

- `catalog.service.ts` — Promise-returning HTTP wrapper: `getCatalogue(params)`, `search(q, page?)`, `getCourseDetail(id)`.
- `catalog.routes.ts` — exports `catalogRoutes` lazy-loading the three pages (`/catalog`, `/catalog/:id`, `/search`).
- `components/course-card/` — `lib-course-card` (cover-image placeholder via `LwCoverComponent`, title, instructor name, optional difficulty pill, whole-card `RouterLink` to `/catalog/:id`).
- `components/module-outline/` — titles-only module → lesson tree; renders "No lessons yet" for an empty outline.
- `components/course-search-bar/` — header text input; submit navigates to `/search?q=<trimmed>` or `/catalog` for blank.
- `components/catalog-filter-bar/` — category / difficulty / sort dropdowns emitting a typed `CatalogFilterChange`.
- `catalog-page/` — URL-query-param-bound (`category`, `difficulty`, `sort`, `page`); renders no-courses, no-match, error, and grid-with-pagination states.
- `search-results-page/` — reads `q` + `page` from the query string, redirects blank `q` to `/catalog`, renders no-results-with-`/catalog`-link, error, and grid-with-pagination states.
- `course-detail-page/` — fetches `/api/catalog/:id`, renders title, hero cover, description, longDescription, difficulty/category/lesson-count pills, and the module outline. Renders "Course not found" + `/catalog` link on 404. No Enrol CTA (Slice B).

### `apps/web` shell

- `app/shell/is-auth-route.ts` — pure helper matching `/login`, `/register`, `/forgot-password`, `/auth/unlock` (prefix, query-string-stripped).
- `app.ts`, `app.html` — header is now route-keyed via `showHeader = computed(() => !isAuthRoute(url()))`. Header renders `LwWordmarkComponent`, "Browse courses", `CourseSearchBarComponent`, `ThemeToggleComponent`, and either Log in / Register (guest) or Dashboard / My Courses (instructor) / initials avatar (authenticated).
- `app.routes.ts` — spreads `...catalogRoutes`; the fallback `''` route now `redirectTo: '/catalog'` (was `/login`).

### Tests

- `libs/api-courses` — colocated specs for `catalog.service`, `catalog.controller`, `instructor-directory`, `parse-course-id.pipe`, both DTOs, and the new `listPublished` describe block in `courses.repository.spec.ts`.
- `libs/web-catalog` — colocated specs for `catalog.service`, all three page components (including URL-query-param binding, empty-`q` redirect, 404 state, error state), and each leaf component.
- `apps/web/src/app/shell/is-auth-route.spec.ts` plus a rewritten `app.spec.ts` covering guest header, hidden header on `/login`, instructor `My Courses` link, and initials avatar.
- `apps/api-e2e/src/catalog.e2e-spec.ts` — Admin-SDK-seeded courses; covers 200/400/404 for all three endpoints and the `DRAFT` / `ARCHIVED` exclusion invariant. CI-safe (no GCP credentials needed).
- `apps/web-e2e/src/catalog.spec.ts` plus an updated `home.spec.ts` redirect assertion.

### Documentation

- `README.md` — replaces the EP-05 deferred line, adds the EP-05 Slice A endpoint table, and lists `web-catalog` in the libraries table + `libs/` tree.

## Plan deviations worth knowing about

- **`ParseCourseIdPipe` added.** The plan wired `@Param('cid') cid: CourseId` directly. The shipped controller threads the param through a `ParseCourseIdPipe` that requires `[A-Za-z0-9_-]{1,64}` and throws `CourseNotFoundException` (404, not 400) on rejection. Hardens the platform's first unauthenticated endpoint against being used as a free Firestore document-path probe and avoids leaking that a different validation path succeeded.
- **`web-auth` tsconfig reference added separately.** `chore(web-catalog): add web-auth tsconfig reference` (`85b34c6`) landed after the merge to fix project-references compilation that surfaced when downstream slices imported across the libs. Not strictly a deviation from this slice's plan — flagging it because it sits in the same area.
- **No `firestore.indexes.json` change** (matches the spec — single-field equality is auto-indexed) and **no Firestore rules change** (Admin SDK bypasses rules).

## Verification outcome

- Unit tests: green across `shared-data-models`, `api-courses`, `web-catalog`, and `web` per the per-task plan checkboxes (each task's "Run test to verify it passes" step ran `pnpm nx test <project>`).
- Lint, typecheck, build: green per Task 16 (`pnpm lint && pnpm typecheck && pnpm test && pnpm build`).
- `pnpm nx e2e api-e2e` — the new `catalog.e2e-spec.ts` runs against the Firebase emulators with no GCP credentials and is CI-safe (the EP-02 video-suite quarantine does not apply).
- `pnpm nx e2e web-e2e` — guest journey covers home redirect, header + search bar visible, search to a no-results page, and the unknown-course-id 404 page.
- No live production-mode operations required for this slice (no rules deploy, no new env vars).

## Follow-ups not in scope

Per the spec's Non-Goals:

- **Enrol / Unenrol (UC-05-04, UC-05-05).** EP-05 Slice B — shipped subsequently as `cd2d456`.
- **`Most Popular` sort (UC-05-01).** Requires the `Enrollment` model; landed with Slice B (`d6168d5 feat(api-courses): POPULAR catalogue sort by enrollmentCount`).
- **Instructor biography on the detail page.** Deferred until UC-01-03 (Manage User Profile).
- **Cover images.** Already deferred platform-wide; cards and detail page render the `LwCoverComponent` placeholder.
- **Full-text / fuzzy search, ranking beyond title-vs-description, external search index.** Out of scope per `CLAUDE.md`.
- **Firestore-native cursor pagination.** Slice paginates in memory; the `page`-based contract is identical to a cursor implementation, so the swap stays non-breaking.

Memory-tracked non-blocking follow-ups carried out of Slice A (per the EP-05 Slice A memory note): the catalogue web pages do not protect against a stale-response race when query params change rapidly, and `InstructorDirectory` issues N parallel `users/{uid}` reads rather than batching via Firestore `getAll`. Both are contained behind the existing `CatalogService` / `InstructorDirectory` interfaces and can be optimised without an API change.
