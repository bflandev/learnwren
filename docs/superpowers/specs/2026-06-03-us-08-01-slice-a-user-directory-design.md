> [!NOTE] DOCUMENT STATUS: DRAFT

# US-08-01 Slice A — User Directory (read-only)

**User story:** [US-08-01 — Manage User Accounts](../../epics/08-platform-administration.md#us-08-01-manage-user-accounts)

**Date:** 2026-06-03

**Follows:** [US-08-03 — Review Instructor Applications](./2026-05-29-us-08-03-review-instructor-applications-design.md), which established the **first administrator surface** — the `web-admin` lib, `AdminRoleGuard` (api) / `adminRoleGuard` (web), the ADMIN nav gate, the per-feature exception-filter pattern, and the `tools:promote-to-admin` CLI. This slice builds directly on those seams.

**Scope note:** US-08-01 lives in **EP-08 (Platform Administration)**, which CLAUDE.md lists as post-MVP. There is no fully-dressed `UC-08-01` use-case file (the `docs/use-cases/` set stops at EP-06); this design works from the epic's acceptance criteria. Authoring a matching `UC-08-01` use case is **deferred** and noted as a follow-up.

This is **Slice A of four**. US-08-01 has five acceptance criteria spanning read, role mutation, account suspension, and GDPR-grade deletion. The agreed decomposition is:

- **Slice A (this spec) — User directory, read-only:** AC1 (searchable, paginated list) + AC2 (user detail: profile, role, registration date, enrollment history).
- **Slice B — Role management:** AC3 (promote Student→Instructor / demote Instructor→Student).
- **Slice C — Suspend / reactivate:** AC4 (block login without delete).
- **Slice D — Delete + anonymise:** AC5 (permanent delete with data-protection anonymisation).

Slices B/C/D each get their own spec → plan → implementation cycle.

---

## 1. Goal & Acceptance Criteria

> **As an** Administrator, **I want to** manage all user accounts on the platform **so that** I can maintain a safe and functional community.

Slice A delivers the first two of the five ACs from [EP-08](../../epics/08-platform-administration.md#us-08-01-manage-user-accounts):

- **AC1** — The admin panel displays a **searchable, paginated** list of all registered users.
- **AC2** — An Administrator can **view a user's profile, role, registration date, and enrollment history**.

The detail view additionally shows, for instructors, the **courses they have authored** — added context that pre-stages the Slice D delete conversation (deleting an instructor with published courses is consequential).

The remaining three ACs are **out of scope for this slice** and explicitly deferred (see §11):

- AC3 promote/demote → **Slice B**
- AC4 suspend (block login, no delete) → **Slice C** — note there is **no `status`/`disabled` field on the `User` model today** (`user.ts` has none), so that slice carries a model change.
- AC5 permanent delete + anonymise → **Slice D**

---

## 2. Scope

**In scope:**

- A new ADMIN-only **`GET /api/admin/users`** — searchable, paginated directory of all users.
- A new ADMIN-only **`GET /api/admin/users/:uid`** — one user's full detail, joined with their enrollment history and authored courses.
- Two new pages in `web-admin`: **`admin/users`** (directory) and **`admin/users/:uid`** (detail), guarded by the existing `adminRoleGuard`.
- A **`Users`** ADMIN-gated nav link in the app shell (see §6.4 for the nav-scaling caveat).

**Deliberate scope cuts (YAGNI / read-only boundary):**

- **No mutations.** No promote/demote/suspend/delete from this surface — those are Slices B/C/D. Every endpoint here is a `GET`.
- **Substring search via an in-memory scan behind a hard cap** (not a search index). Documented limitation (§4.5); a real search service is the future path.
- **No sort/filter facets, no column sorting, no role-filter.** Default ordering only. Deferred.
- **No admin dashboard/landing page.** That is US-08-04 territory; this slice adds one flat nav link and records the nav-consolidation follow-up (§6.4, §11).
- **No per-enrollment progress %** in the detail view — status + enrolled date only (progress requires the course's lesson count; out of scope for a read-only directory).

---

## 3. Confirmed Design Decisions

These were resolved interactively, then a 6-agent codebase verification pass (`/workflows`, 2026-06-03) confirmed the seams and surfaced the corrections folded into §4–§9. The headline corrections are flagged **[verified-correction]** so the reviewer can see what changed from the initial sketch.

1. **Search + pagination → server-side in-memory substring filter behind a hard cap.** The API reads users from Firestore up to a cap, filters by case-insensitive **substring** on `displayName` OR `email`, sorts, and returns the requested page slice. Best search UX, simplest code, fine for a self-hosted community. Mirrors the established `listPublished` catalogue pattern (`courses.repository.ts` — in-memory filter behind `MAX_CATALOG_SCAN`).
2. **Detail view → separate route `/admin/users/:uid`** backed by `GET /api/admin/users/:uid`. Clean REST shape and the natural home for the future Slice B/C/D action buttons.
3. **Detail content → enrollment history + authored courses.** Enrollment history lists the user's enrollments (**ACTIVE and WITHDRAWN** — it is "history"); the authored-courses section appears only for users who own courses. **[verified-correction]** AC2 says "enrollment history", so WITHDRAWN enrollments are included with a status badge, not silently dropped.
4. **Code placement → new `users/` submodule in `libs/api-profile` + extend `web-admin`.** Consistent with the US-08-03 precedent (admin API lives in api-profile; admin UI lives in web-admin). **No new cross-lib dependency on api-courses** — the admin service reads the `enrollments` and `courses` collections directly (read-only reporting; see Decision 5).
5. **Direct Firestore reads, encapsulated in an `AdminUsersRepository`.** **[verified-correction]** The design originally implied reusing the existing user reader. It can't: `readStoredUserProfiles` (`api-firebase/user-profile.reader.ts`) returns only `{ displayName, email, photoUrl, biography }` — **no `role`, no `createdAt`** — and reads only by a known list of uids, not a whole-collection scan. The admin directory needs both `role`/`createdAt` and a collection scan. The existing US-08-03 admin service **already reads `users/{uid}` directly** (`admin-instructor-application.service.ts` → `collection('users').doc(uid).get()`), so the user doc is already a documented admin read path. We encapsulate the new direct reads (collection scan + by-uid detail + enrollment/authored queries) in an `AdminUsersRepository` inside the `users/` submodule, and update the now-inaccurate "the ONLY place the API reads the users collection" comment on `readStoredUserProfiles` to carve out admin reporting as a deliberate exception.
6. **Deterministic capped read.** **[verified-correction]** The Firestore scan uses `.orderBy(documentId()).limit(CAP + 1)` so the capped subset is **stable and reproducible** and overflow is detectable. Without an `orderBy`, the 5000-doc subset would be arbitrary and the alphabetical first page could omit users who fell outside an unordered read.

---

## 4. API & data design

### 4.1 Placement & wiring

New submodule `libs/api-profile/src/lib/users/`:

- `AdminUsersController` — `@Controller('admin/users')`, `@UseFilters(AdminUsersExceptionFilter)`, `@UseGuards(FirebaseSessionGuard, AdminRoleGuard)` (guard order is load-bearing: `FirebaseSessionGuard` first to populate `req.user` from the verified session cookie, then `AdminRoleGuard` reads `req.user.role`).
- `AdminUsersService` — orchestrates list/detail; depends on `AdminUsersRepository`. Injects nothing from api-courses.
- `AdminUsersRepository` — the **only** holder of direct Firestore access for this feature; injects `FIRESTORE` from `@learnwren/api-firebase`. No `FIREBASE_AUTH` and no `EMAIL_TRANSPORT` needed (read-only, no emails).
- `AdminUsersExceptionFilter` — `@Catch(AdminUsersException, AuthException, HttpException)` with body `handleException(host, exception, this.logger)`. The **`AuthException` entry is load-bearing**: it lets the `AdminRoleGuard`'s `InsufficientRoleException` reach this filter and render **403** (via `handleException`'s domain-shaped branch) instead of falling through to a global **500**.

Register in `libs/api-profile/src/lib/profile.module.ts` (the single module for the whole lib): add `AdminUsersController` to `controllers`; add `AdminUsersService`, `AdminUsersRepository`, and `AdminUsersExceptionFilter` to `providers` (the filter is a provider only so Nest can construct it for DI; it is bound per-controller via `@UseFilters`). `AuthModule` is already imported and supplies the guards; `api-firebase` supplies `FIRESTORE`. **No new module providers required.**

### 4.2 `GET /api/admin/users` — directory

Query params (all optional): `search` (string), `page` (1-based, default `1`), `pageSize` (default `20`, clamped to a sane max e.g. `100`).

Algorithm:

1. `AdminUsersRepository.scanUsers()` reads `collection('users').orderBy(documentId()).limit(CAP + 1).get()` where `CAP = 5000`. `capped = snapshot.size > CAP`; if capped, discard the extra doc and work with the first `CAP`.
2. Map each doc to `AdminUserListRow`. Apply a **defined fallback** for a missing/empty `displayName` (see §4.4).
3. If `search` is non-empty (trimmed), filter to rows where `displayName` **or** `email` contains the query, **case-insensitive substring** (`value.toLowerCase().includes(query.toLowerCase())`).
4. Sort by `displayName` ascending, **case-insensitive**, with `email` as a strict tiebreak (see §4.4 for the exact comparator).
5. `total = filtered.length` (after search, before paging). Slice `[(page-1)*pageSize, page*pageSize]`.
6. Return `AdminUserListResponse`.

### 4.3 `GET /api/admin/users/:uid` — detail

1. `AdminUsersRepository.getUserDoc(uid)` → the raw `users/{uid}` doc. Missing ⇒ throw `AdminUsersException(USER_NOT_FOUND)` (→ 404).
2. **Enrollment history:** `collection('enrollments').where('userId','==',uid).get()` — a **new single-field query** (no enrollment-by-userId query exists today; single-field equality is auto-indexed, so **no `firestore.indexes.json` change**). Include **all statuses** (ACTIVE + WITHDRAWN). For each, read the course title.
   - **[verified-correction] Dangling enrollments are a real, confirmed case** (course delete is recursive and leaves enrollment docs orphaned — see `enrollment.repository.ts` comment "If the course was deleted while the student was enrolled…"). So: read course titles in **parallel** (`Promise.all`), and render a missing course as `courseTitle: '(course deleted)'`. **Never 404 the whole detail page because one referenced course is gone.**
   - Sort enrollments newest-first by `enrolledAt` (`Enrollment.createdAt`).
3. **Authored courses:** `collection('courses').where('instructorId','==',uid).get()` — **no `orderBy`** (single-field, no composite index needed), sorted in memory by `title`. **[verified-correction]** Avoiding `orderBy` here sidesteps a composite-index requirement; note the repo already has two un-declared composite-needing course queries that pass only because the emulator auto-creates indexes — do not assume `firestore.indexes.json` is authoritative.
4. Return `AdminUserDetail`.

No course is read twice across the two lists: a user cannot enrol in their own course (`CannotEnrollOwnCourseException`), so their enrollments and authored courses are disjoint by construction.

### 4.4 Sort comparator & display fallback **[verified-correction]**

- **Comparator:** `a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' })`; on equal, tiebreak `a.email.localeCompare(b.email)`. Email is unique per user (Firebase Auth), so the comparator never returns 0 for two distinct users — the sort is deterministic regardless of the underlying `Array.sort` stability.
- **Missing-name fallback:** the persisted `User.displayName` is non-optional, but a raw doc could carry an empty/missing value. Before sorting, the row's sort key uses `displayName.trim()`; if empty, it falls back to the user's `email` as the sort key, and the **displayed** label renders `'(no display name)'`. This guarantees `localeCompare` never receives `undefined` and blank-name users land predictably (interleaved by email).

### 4.5 `capped` contract — stated explicitly **[verified-correction]**

`capped` reflects **the raw `users` collection exceeding the 5000-doc cap**, decoupled from `search` and `total`. Two non-obvious truths the UI must honour:

- `search='zzz'` returning **0 users with `capped: true`** is a valid response — the UI shows "No matching users" **and** a "results may be incomplete (5000-user scan limit reached)" banner simultaneously; they are not contradictory.
- `capped: false` after a filter does **not** mean "you saw everyone matching" — it only means the collection itself fit under the cap.

**Documented limitation:** substring search can **never** be pushed into Firestore (no `contains`/`ilike`), so unlike the catalogue scan, a future cursor migration would *not* fix search — that needs a secondary index (search service or a lowercased prefix array). The endpoint is ADMIN-only behind two guards, so the DoS surface that justified the catalogue's tighter 500 cap does not apply; 5000 is reasonable. Mirror the catalogue's "replace with a cursor-paginated query when this grows" comment.

Also: "all registered users" means users with a `users/{uid}` Firestore doc (written at registration). A Firebase-Auth account without a `users` doc is invisible here — acceptable, stated for completeness.

### 4.6 Shared types — new `libs/shared-data-models/src/lib/admin-user.ts`

```ts
import type { CourseId, ISODateString, UserId } from './common';
import type { UserRole } from './user';
import type { CourseStatus } from './course';
import type { EnrollmentStatus } from './enrollment';

/** One row of the admin user directory (GET /api/admin/users). */
export interface AdminUserListRow {
  id: UserId;
  displayName: string;   // '(no display name)' fallback applied server-side
  email: string;
  role: UserRole;
  createdAt: ISODateString;
}

export interface AdminUserListResponse {
  users: AdminUserListRow[];
  total: number;     // count after search filter, before paging
  page: number;
  pageSize: number;
  capped: boolean;   // true if the users collection exceeded the 5000 scan cap
}

/** One enrollment in a user's history (any status). */
export interface AdminUserEnrollmentRow {
  courseId: CourseId;
  courseTitle: string;       // '(course deleted)' when the course no longer exists
  status: EnrollmentStatus;  // ACTIVE | WITHDRAWN
  enrolledAt: ISODateString; // Enrollment.createdAt
}

/** One course authored by the user (instructors only). */
export interface AdminAuthoredCourseRow {
  courseId: CourseId;
  title: string;
  status: CourseStatus;      // DRAFT | PUBLISHED | ARCHIVED
}

/** Full detail (GET /api/admin/users/:uid). */
export interface AdminUserDetail {
  id: UserId;
  displayName: string;
  email: string;
  biography: string;
  photoUrl?: string;
  role: UserRole;
  createdAt: ISODateString;
  updatedAt: ISODateString;
  enrollments: AdminUserEnrollmentRow[];       // newest first
  authoredCourses: AdminAuthoredCourseRow[];   // empty unless they authored some
}
```

Wire into the barrel: append `export * from './lib/admin-user';` to `libs/shared-data-models/src/index.ts`.

### 4.7 Error codes — in `api-error.ts` **[verified-correction]**

Per the house convention, error codes live in `libs/shared-data-models/src/lib/api-error.ts` (the single cross-stack source of truth that both API exceptions and web narrowing match on), **not** as a standalone const. Add, mirroring `CoursesErrorCode`:

```ts
/** Authoritative admin-users-domain error codes. */
export type AdminUsersErrorCode = 'USER_NOT_FOUND' | 'INTERNAL';

/** Codes a web client may receive from an admin-users endpoint (domain + guard codes). */
export type AdminUsersApiErrorCode = AdminUsersErrorCode | 'INSUFFICIENT_ROLE' | 'UNAUTHENTICATED';

export type AdminUsersApiErrorBody = ApiErrorBody<AdminUsersApiErrorCode>;
```

(Grep confirmed **no existing `USER_NOT_FOUND` / `AdminUsers*` / `admin/users` symbol** in the repo — this is greenfield, no collision.)

`AdminUsersException` (in `users/errors/`) extends `Error` with `public readonly code: AdminUsersErrorCode`, `message`, `public readonly status: number`, optional `details?: Record<string, unknown>` — the `{ code, status }` shape `handleException`'s `isDomainShaped()` routes. `USER_NOT_FOUND` → status `404`.

### 4.8 API contract summary

Base `/api/admin/users` — `@UseGuards(FirebaseSessionGuard, AdminRoleGuard)`.

| Method & path | Behaviour | Errors |
|---|---|---|
| `GET /?search=&page=&pageSize=` | Cap-bounded scan → substring filter on name/email → sort → page slice. | `INSUFFICIENT_ROLE`→403, `UNAUTHENTICATED`→401 (via guards) |
| `GET /:uid` | Profile + role + registration date + enrollment history (all statuses) + authored courses. | `USER_NOT_FOUND`→404; guard codes as above |

---

## 5. Web UI — extend `web-admin`

Both pages are added as children of the existing `admin` parent route in `libs/web-admin/src/lib/admin.routes.ts`. The parent already carries `canActivate: [adminRoleGuard]`, so the children are **auto-guarded** — do not re-add the guard, and do not touch `apps/web/src/app/app.routes.ts` (which already spreads `...adminRoutes`). New lazy children:

```ts
{ path: 'users', loadComponent: () => import('./admin-users-page/admin-users-page.component').then(m => m.AdminUsersPageComponent) },
{ path: 'users/:uid', loadComponent: () => import('./admin-user-detail-page/admin-user-detail-page.component').then(m => m.AdminUserDetailPageComponent) },
```

(Lazy children are referenced by `loadComponent`, so the page components do **not** need to be exported from `web-admin/src/index.ts` — only `adminRoutes` is.)

### 5.1 `AdminUsersService` — thin Promise HTTP wrapper

`@Injectable({ providedIn: 'root' })`, `inject(HttpClient)`, module-level `const BASE = '/api/admin/users'`, methods return `Promise<T>` via `firstValueFrom(...)`, shared types from `@learnwren/shared-data-models`. Per the codebase's web-service pattern, **state lives in the component (signals), not the service.**

```ts
list(search: string, page: number, pageSize: number): Promise<AdminUserListResponse>
getDetail(uid: string): Promise<AdminUserDetail>
```

### 5.2 `AdminUsersPageComponent` (`admin/users`)

Standalone, `OnPush`, signal state (mirrors `AdminInstructorApplicationsPageComponent`):

- Signals: `users`, `total`, `page`, `pageSize`, `search`, `capped`, `loading`, `error`.
- Debounced search box (≈300 ms) that resets to page 1 and reloads.
- Table columns: name, email, role badge, joined date; each row links to `users/:uid`. **No avatar in the list** (it keeps `AdminUserListRow` free of `photoUrl` and avoids the `lw-avatar` required-input landmine — the avatar appears only on the detail page, §5.3).
- Pagination: prev/next + "page X of Y" (derive page count from `total`/`pageSize`); disable prev on page 1 and next on the last page.
- Empty state: "No matching users." / "No users." Capped banner when `capped` (rendered independently of the empty state, per §4.5).
- `data-testid` hooks on the row, search box, pagination controls, empty state, and capped banner.

### 5.3 `AdminUserDetailPageComponent` (`admin/users/:uid`)

Standalone, `OnPush`, signal state. Reads `:uid` via `ActivatedRoute` (use `paramMap` subscription, not a one-shot snapshot — consistent with the learn-page route-param fix). Renders:

- Header: `<lw-avatar>` (`[userId]`, `[displayName]`, `[photoUrl]`), name, email, role badge.
- Profile: biography (or a muted "No biography." when empty), registration date (`createdAt`).
- **Enrollments** section — table of course title, status badge, enrolled date; **hidden when empty**.
- **Authored courses** section — table of title + status badge; **hidden when empty**.
- Back link to `admin/users`.
- `USER_NOT_FOUND` → an inline "User not found." state (narrow on `err.error.error.code === 'USER_NOT_FOUND'`); other errors → generic error state.

### 5.4 Nav

Add a `Users` link inside the existing ADMIN gate in `apps/web/src/app/app.html`:

```html
@if (auth.currentUser()?.role === 'ADMIN') {
  <a routerLink="/admin/instructor-applications" class="lw-btn lw-btn-ghost">Admin</a>
  <a routerLink="/admin/users" class="lw-btn lw-btn-ghost">Users</a>
}
```

**[verified-correction] Nav-scaling caveat:** the verifier flagged that a growing set of flat header links will crowd the shell as US-08-02/03/04 land. For Slice A we keep the approved single flat `Users` link (smallest change, YAGNI), and record a **follow-up (§11)**: consolidate the admin entries into an admin sub-navigation / landing page when the third admin page arrives.

---

## 6. Testing (TDD, mutation-conscious)

Red → green per unit. `api-profile` and `web-admin` have no Stryker config, so write mutation-conscious assertions up front rather than promising a mutation run.

- **`AdminUsersRepository`** — `scanUsers` issues `orderBy(documentId()).limit(5001)`, maps fields, sets `capped` when size > 5000 and drops the overflow doc; `getUserDoc` returns null/throws on missing; enrollment-by-userId query shape; authored-by-instructor query shape; parallel title reads; missing-course title fallback.
- **`AdminUsersService.list`** — substring match hits **both** name and email, case-insensitive; default sort comparator (incl. case-insensitive ordering and email tiebreak); missing-name fallback ordering; `total` is post-filter/pre-page; page slicing; `capped` passthrough.
- **`AdminUsersService.getDetail`** — join shape; enrollments include WITHDRAWN and are newest-first; `(course deleted)` fallback does not throw/404; authored-courses sorted; `USER_NOT_FOUND` on missing user.
- **`AdminUsersExceptionFilter`** — `USER_NOT_FOUND`→404; `InsufficientRoleException`→403 (the AuthException branch); generic `HttpException` passthrough.
- **Web `AdminUsersService`** — calls correct URLs with query params; returns typed bodies.
- **`AdminUsersPageComponent`** — load, render rows, debounced search reload, pagination prev/next + disabled-edge states, empty state, capped banner (incl. the empty+capped combination), row navigation.
- **`AdminUserDetailPageComponent`** — render with/without each section, `(course deleted)` row, registration date, `USER_NOT_FOUND` inline state, route-param change re-loads.
- **`api-e2e`** (`apps/api-e2e`, emulator-backed): ADMIN (via `registerAndPromoteAdmin` from `_helpers/auth.ts`) lists users, searches by substring, opens a detail showing an enrolled course + an authored course; a non-admin (student session) gets **403**. Seed users/courses/enrollments by following the `catalog`/`roster` spec pattern (direct `admin.firestore()` writes + real `registerStudent`/`registerAndPromoteInstructor` + `POST /api/enrollments`); unique random id suffixes (shared emulator state).
- **`web-e2e`** (`apps/web-e2e`, **hermetic**, mirror `admin-instructor-applications.spec.ts`): stub `**/api/auth/me` with an ADMIN role stub + stub the list/detail endpoints via `page.route`; assert directory render, search, row→detail navigation. Non-ADMIN: swap the me-stub to `role: 'STUDENT'` and assert redirect to `/dashboard` (the `adminRoleGuard`). Do **not** model on the emulator-backed `roster-analytics.spec.ts`.

**Build gate [verified-correction]:** adding to shared-data-models can silently break `api-courses`/`api-profile` tsc while vitest still passes. The new types are purely additive (new file + additive unions), so risk is low, but run an actual `nx build`/typecheck gate across affected projects, not just unit tests.

---

## 7. Files touched (implementation map)

**New (api):** `libs/api-profile/src/lib/users/admin-users.controller.ts`, `admin-users.service.ts`, `admin-users.repository.ts`, `admin-users.exception-filter.ts`, `errors/admin-users.exception.ts` (+ specs).
**New (shared):** `libs/shared-data-models/src/lib/admin-user.ts` (+ spec).
**New (web):** `libs/web-admin/src/lib/admin-users.service.ts`, `admin-users-page/` (component + html + spec), `admin-user-detail-page/` (component + html + spec).
**New (e2e):** `apps/api-e2e/src/admin-users.e2e-spec.ts`, `apps/web-e2e/src/admin-users.spec.ts`.
**Edited:** `libs/shared-data-models/src/index.ts` (barrel), `libs/shared-data-models/src/lib/api-error.ts` (codes), `libs/api-profile/src/lib/profile.module.ts` (register controller/providers), `libs/web-admin/src/lib/admin.routes.ts` (two children), `apps/web/src/app/app.html` (nav link), `libs/api-firebase/src/lib/user-profile.reader.ts` (update the "ONLY place" comment to carve out admin reporting).

---

## 8. Risks & mitigations

- **Non-deterministic capped page** → fixed by the deterministic `orderBy(documentId()).limit(5001)` read (§3.6, §4.2).
- **Dangling enrollments 404-ing the detail page** → fixed by parallel title reads + `(course deleted)` fallback, never throwing on a missing course (§4.3).
- **Composite-index surprise on authored courses** → avoided by querying without `orderBy` and sorting in memory (§4.3).
- **Second user-collection reader contradicting the "ONLY place" comment** → resolved by encapsulating in `AdminUsersRepository` and updating that comment; consistent with the existing admin-instructor-application direct read (§3.5).
- **Shared-type tsc breakage masked by vitest** → mitigated by additive-only changes + an explicit build gate (§6).

---

## 9. Deferred / Follow-ups

- **Slice B** — promote Student→Instructor / demote Instructor→Student (AC3). Will reuse `promoteUserToInstructor`; demotion (revoke custom claim + `users/{uid}.role`) is new.
- **Slice C** — suspend / reactivate (AC4); requires a new account-status mechanism (likely the Firebase Auth `disabled` flag) and a `User` model change (no `status` field today).
- **Slice D** — permanent delete + anonymisation (AC5); GDPR semantics across users, enrollments, applications, owned courses, storage, and the Auth record.
- **Self-reference / last-admin guard** — harmless in this read-only slice (an admin sees their own row), but **Slices B/C/D must prevent an admin from demoting/suspending/deleting their own account or the last remaining admin**. Recorded now so the mutation slices inherit the constraint.
- **Admin nav consolidation** — replace flat header links with an admin sub-nav / landing page once a third admin page lands (§5.4).
- **Search index** — substring search cannot move server-side without one; the in-memory cap is the MVP compromise.
- **Sort/filter facets, column sorting, role filter, per-enrollment progress %** — deferred.
- **Author a fully-dressed `UC-08-01` use case** to match repo conventions (use-cases currently stop at EP-06).
- **Update `README.md`** (authoritative feature record) and the spec-drift report when this ships.
