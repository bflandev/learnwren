> [!NOTE] DOCUMENT STATUS: DRAFT

# US-08-01 Slice B — Role Management (promote / demote)

**User story:** [US-08-01 — Manage User Accounts](../../epics/08-platform-administration.md#us-08-01-manage-user-accounts)

**Date:** 2026-06-03

**Follows:** [US-08-01 Slice A — User Directory (read-only)](./2026-06-03-us-08-01-slice-a-user-directory-design.md), which established the `users/` submodule in `libs/api-profile` (`AdminUsersController` / `AdminUsersService` / `AdminUsersRepository` / `AdminUsersExceptionFilter`), the `admin/users` + `admin/users/:uid` pages in `web-admin`, the `AdminUsersErrorCode` union, and the deterministic capped scan. This slice adds the **first mutation** to that surface and builds directly on those seams. The earlier [US-08-03 — Review Instructor Applications](./2026-05-29-us-08-03-review-instructor-applications-design.md) contributed the reusable `promoteUserToInstructor` effect and the admin mutation-UI pattern that this slice reuses.

**Scope note:** US-08-01 lives in **EP-08 (Platform Administration)**, which CLAUDE.md lists as post-MVP. There is no fully-dressed `UC-08-01` use-case file (the `docs/use-cases/` set stops at EP-06); this design works from the epic's acceptance criteria. Authoring a matching `UC-08-01` use case remains **deferred** (carried from Slice A).

This is **Slice B of four**. US-08-01 has five acceptance criteria; the agreed decomposition is:

- **Slice A (shipped) — User directory, read-only:** AC1 (searchable, paginated list) + AC2 (user detail: profile, role, registration date, enrollment history).
- **Slice B (this spec) — Role management:** AC3 (promote Student→Instructor / demote Instructor→Student).
- **Slice C — Suspend / reactivate:** AC4 (block login without delete) — carries a `User` model change (no `status`/`disabled` field today).
- **Slice D — Delete + anonymise:** AC5 (permanent delete with data-protection anonymisation).

Slices C/D each get their own spec → plan → implementation cycle.

---

## 1. Goal & Acceptance Criteria

> **As an** Administrator, **I want to** manage all user accounts on the platform **so that** I can maintain a safe and functional community.

Slice B delivers the third of the five ACs from [EP-08](../../epics/08-platform-administration.md#us-08-01-manage-user-accounts):

- **AC3** — An Administrator can **promote a Student to Instructor, or demote an Instructor to Student.**

The two transitions in scope are exactly:

- `STUDENT → INSTRUCTOR` (promote)
- `INSTRUCTOR → STUDENT` (demote)

The `ADMIN` role is **never a source or target** of either transition. This is load-bearing for safety (see §3.4): because an administrator's own persisted role is `ADMIN`, they cannot promote or demote their own account — nor any other admin's — and no separate self-guard is required for this slice.

The remaining ACs are **out of scope** and deferred (see §9): AC4 suspend → Slice C; AC5 delete + anonymise → Slice D.

---

## 2. Scope

**In scope:**

- A new ADMIN-only **`POST /api/admin/users/:uid/promote`** — `STUDENT → INSTRUCTOR`.
- A new ADMIN-only **`POST /api/admin/users/:uid/demote`** — `INSTRUCTOR → STUDENT`, which **revokes the user's refresh tokens** so the privilege is removed immediately.
- Promote / Demote action affordances on the **existing** `admin/users/:uid` detail page (role-driven; inline confirm on demote).
- A new lean response type `AdminUserRoleResponse { id, role }`; a new `INVALID_ROLE_TRANSITION` error code (→ 409).

**Deliberate scope cuts (settled interactively):**

- **Demotion leaves authored courses untouched.** A demoted instructor's courses stay in Firestore exactly as-is (published courses keep playing for enrolled students); the user simply loses authoring access (the existing `InstructorRoleGuard` blocks authoring routes once their session reflects `STUDENT`). Simplest, fully reversible by re-promoting. The detail page already lists the user's authored courses, so the admin sees the consequence before acting. (Alternatives considered and rejected: *block demotion when courses exist* dead-ends the admin because there is no course-transfer feature; *archive their courses on demote* is harder to reverse and disrupts enrolled students.)
- **No email notifications.** A direct admin promote/demote is not an application decision, so the existing `sendInstructorApplicationApprovedEmail`/`...DeclinedEmail` templates are semantically wrong here (the user may never have applied), and there is no demote template. A dedicated role-change email is a future follow-up (§9).
- **No list-page actions.** Mutations live only on the detail page (deliberate friction: the admin sees the full user context before acting). The list stays read-only.
- **No bulk actions, no audit log, no reason capture.** Single-user, single-action only. Deferred.
- **No new self/last-admin guard mechanism.** For this slice the transition validation subsumes it (§3.4). The explicit self/last-admin guard is restated as a **hard requirement for Slices C/D**, where suspend/delete *can* target an `ADMIN` account.

---

## 3. Confirmed Design Decisions

1. **API shape → two explicit POST verbs** (`/:uid/promote`, `/:uid/demote`), not a single `PATCH /role`. Mirrors the established `approve`/`decline` precedent on `AdminInstructorApplicationController` exactly (same controller base, guards, filter), keeps each transition's allowed source role self-documenting, and keeps the typed errors crisp. A `PATCH /role` would diverge from precedent and (per the house "DTOs are type-guards-only" rule, see [[feedback_nest_validationpipe_dto_short_circuit]]) would push role-value validation into the service anyway with no real gain.
2. **Demotion semantics → allow, leave courses untouched.** Always succeeds (subject to the transition check); authored courses are not modified. Reversible by re-promoting.
3. **Demotion takes effect immediately → `revokeRefreshTokens(uid)`.** The `FirebaseSessionGuard` already verifies session cookies with `verifySessionCookie(cookie, true)` (`checkRevoked = true`), so revoking forces the next request to fail and the user to re-authenticate, picking up `STUDENT`. This is the correct posture for *removing* a privilege. **Promotion does not revoke** — forcing a logout to *grant* a privilege is needlessly disruptive, and it matches the existing non-revoking `promoteUserToInstructor` path. A promoted user gains Instructor capability on their next token refresh / login.
4. **Transition validation subsumes the self/last-admin guard for this slice.** The service reads the user's **true persisted role** (`users/{uid}.role`, via `AdminUsersRepository.getUser`) and rejects any source role that is not the expected one. Since an admin's persisted role is `ADMIN` — neither a valid promote-source (`STUDENT`) nor demote-source (`INSTRUCTOR`) — an admin cannot act on their own account or any other admin's. No `req.user.uid` comparison is needed. (Slices C/D, which can target `ADMIN` accounts, must add an explicit self/last-admin guard.)
5. **Reuse the shared `promoteUserToInstructor` effect for promote.** It already sets the custom claim, writes `users/{uid}.role`, and incidentally resolves any `PENDING` instructor application to `APPROVED` (a correct, no-email side effect for a user who is now an instructor). Demotion is admin-only and gets a **new** sibling effect, `demoteInstructorToStudent`.
6. **Read-only repository stays read-only; mutations go through a new service + Nest-free helpers.** A new `AdminUserRoleService` (injects `FIRESTORE` + `FIREBASE_AUTH`) owns the orchestration; the actual claim/Firestore/revoke effects live in Nest-free pure helpers (`promoteUserToInstructor` in place; new `demoteInstructorToStudent`) so they stay unit-testable against fakes and could back a future CLI. `AdminUsersService` (read) is untouched and keeps no auth handle.

---

## 4. API & data design

### 4.1 Placement & wiring

Extend the existing `libs/api-profile/src/lib/users/` submodule — **no new lib, no new module.**

- **`AdminUserRoleService`** (new) — `@Injectable()`, injects `@Inject(FIRESTORE)` and `@Inject(FIREBASE_AUTH)` from `@learnwren/api-firebase`, plus `AdminUsersRepository` (to read the current role via `getUser`). Methods `promote(uid)` and `demote(uid)`. Both 404 on a missing user and 409 on a wrong-source role; otherwise apply the effect and return `AdminUserRoleResponse`.
- **`role-mutation.ts`** (new, in `users/`) — exports the Nest-free `demoteInstructorToStudent(uid, auth, firestore)` helper with structural `DemotionAuthLike` / `DemotionFirestoreLike` interfaces (mirroring the `PromotionAuthLike` / `PromotionFirestoreLike` style in `instructor-application/instructor-promotion.ts`). Promotion's helper stays in `instructor-application/` (shared by the CLI + the application-approve service + this service); demotion is admin-only, so its helper lives with the admin-users feature.
- **`AdminUsersController`** (edited) — add `@Post(':uid/promote')` and `@Post(':uid/demote')`, injecting `AdminUserRoleService` alongside the existing `AdminUsersService`. The controller already carries `@UseFilters(AdminUsersExceptionFilter)` and `@UseGuards(FirebaseSessionGuard, AdminRoleGuard)` (guard order load-bearing: session first to populate `req.user`, then role). No `@Req()`/`req.user.uid` needed (Decision 4).
- **`AdminUsersExceptionFilter`** — unchanged. Its `@Catch(AdminUsersException, AuthException, HttpException)` already routes the new `InvalidRoleTransitionException` (an `AdminUsersException`) through `handleException` → 409.

Register in `libs/api-profile/src/lib/profile.module.ts`: add `AdminUserRoleService` to `providers`. `AuthModule` (already imported) supplies the guards and `FIREBASE_AUTH`; `api-firebase` supplies `FIRESTORE`. **No new module imports.**

### 4.2 `POST /api/admin/users/:uid/promote`

1. `repo.getUser(uid)` → null ⇒ throw `UserNotFoundException` (404).
2. If `current.role !== 'STUDENT'` ⇒ throw `InvalidRoleTransitionException({ currentRole: current.role, attempted: 'INSTRUCTOR' })` (409). (Rejects `INSTRUCTOR` and `ADMIN` sources alike.)
3. `await promoteUserToInstructor(uid, this.auth, this.firestore, nowIso())` — sets `{ role: 'INSTRUCTOR' }` claim, writes `users/{uid}.role`, resolves any PENDING application.
4. Return `{ id: uid, role: 'INSTRUCTOR' }`.

### 4.3 `POST /api/admin/users/:uid/demote`

1. `repo.getUser(uid)` → null ⇒ `UserNotFoundException` (404).
2. If `current.role !== 'INSTRUCTOR'` ⇒ `InvalidRoleTransitionException({ currentRole: current.role, attempted: 'STUDENT' })` (409). (Rejects `STUDENT` and `ADMIN` sources alike.)
3. `await demoteInstructorToStudent(uid, this.auth, this.firestore)` — sets `{ role: 'STUDENT' }` claim, writes `users/{uid}.role = 'STUDENT'`, and `revokeRefreshTokens(uid)`.
4. Authored courses and the `instructorApplications/{uid}` doc are **not** touched.
5. Return `{ id: uid, role: 'STUDENT' }`.

`demoteInstructorToStudent` (pure, structural handles):

```ts
export interface DemotionAuthLike {
  setCustomUserClaims(uid: string, claims: object | null): Promise<unknown>;
  revokeRefreshTokens(uid: string): Promise<unknown>;
}

export interface DemotionFirestoreLike {
  collection(path: string): {
    doc(id: string): { update(data: Record<string, unknown>): Promise<unknown> };
  };
}

export async function demoteInstructorToStudent(
  uid: UserId,
  auth: DemotionAuthLike,
  firestore: DemotionFirestoreLike,
): Promise<void> {
  await auth.setCustomUserClaims(uid, { role: 'STUDENT' });
  await firestore.collection('users').doc(uid).update({ role: 'STUDENT' });
  await auth.revokeRefreshTokens(uid);
}
```

### 4.4 Shared types — `libs/shared-data-models/src/lib/admin-user.ts`

Append the lean role-change response (avoids re-joining enrollments/courses just to echo a role):

```ts
/** Result of an admin role change (POST .../promote | .../demote). */
export interface AdminUserRoleResponse {
  id: UserId;
  role: UserRole;
}
```

(`UserId`, `UserRole` are already imported in this file.) No barrel change needed — `admin-user.ts` is already exported from `libs/shared-data-models/src/index.ts`.

### 4.5 Error codes — `libs/shared-data-models/src/lib/api-error.ts`

Add `INVALID_ROLE_TRANSITION` to the existing union (additive):

```ts
export type AdminUsersErrorCode = 'USER_NOT_FOUND' | 'INVALID_ROLE_TRANSITION' | 'INTERNAL';
```

`AdminUsersApiErrorCode` (domain + guard codes) already derives from it, so no further change.

`InvalidRoleTransitionException` (in `users/errors/admin-users.exception.ts`, alongside `UserNotFoundException`) extends `AdminUsersException` with code `'INVALID_ROLE_TRANSITION'`, status `409`, and `details: { currentRole, attempted }` — the `{ code, status, details? }` shape `handleException`'s `isDomainShaped()` routes.

### 4.6 API contract summary

Base `/api/admin/users` — `@UseGuards(FirebaseSessionGuard, AdminRoleGuard)`, `@UseFilters(AdminUsersExceptionFilter)`.

| Method & path | Behaviour | Returns | Errors |
|---|---|---|---|
| `POST /:uid/promote` | `STUDENT → INSTRUCTOR` via shared promote effect (claim + `users/{uid}.role` + resolve PENDING app). | `AdminUserRoleResponse` | `USER_NOT_FOUND`→404; `INVALID_ROLE_TRANSITION`→409; guard codes 401/403 |
| `POST /:uid/demote` | `INSTRUCTOR → STUDENT` (claim + `users/{uid}.role`) **+ `revokeRefreshTokens`**; courses untouched. | `AdminUserRoleResponse` | as above |

---

## 5. Web UI — extend the `admin/users/:uid` detail page

All changes confined to `libs/web-admin`. No new route, no list-page change, no new shared component.

### 5.1 `AdminUsersService` (web) — two new wrappers

```ts
promote(uid: string): Promise<AdminUserRoleResponse> // POST `${BASE}/${uid}/promote`
demote(uid: string):  Promise<AdminUserRoleResponse> // POST `${BASE}/${uid}/demote`
```

`BASE = '/api/admin/users'` already exists; methods return `Promise<T>` via `firstValueFrom`, types from `@learnwren/shared-data-models`. State stays in the component (house web-service pattern, see [[feedback_web_service_pattern]]).

### 5.2 `AdminUserDetailPageComponent` — mutation state + role-driven actions

Add signals alongside the existing `user` / `loading` / `notFound`:

- `busy = signal(false)`, `actionError = signal<string | undefined>(undefined)`, `actionSuccess = signal<string | undefined>(undefined)`, `confirmingDemote = signal(false)`.

**Buttons (in the header, beside the role badge):**

- `@if (user()?.role === 'STUDENT')` → **"Promote to Instructor"** — single click (low-risk, reversible).
- `@if (user()?.role === 'INSTRUCTOR')` → **"Demote to Student"** — opens an **inline confirm** (`confirmingDemote`), not a native `confirm()` (OnPush/signal-friendly and unit-testable). Warning copy mentions authored courses when `authoredCourses().length > 0` ("They will keep N authored course(s) but lose the ability to edit or create courses."). Confirm / Cancel buttons.
- `@if (user()?.role === 'ADMIN')` → **no button** (also cleanly covers an admin viewing their own page — no special self-check in the template).

**On success:** `user.update(u => u && { ...u, role: res.role })` so the buttons swap automatically; clear `confirmingDemote`; set a transient `actionSuccess` ("Promoted to Instructor." / "Demoted to Student.").

**On error (narrow on `err.error.error.code`):**

- `INVALID_ROLE_TRANSITION` → "This user's role changed elsewhere. Refresh to see the current role."
- `USER_NOT_FOUND` → "This user no longer exists."
- otherwise → "Something went wrong. Please try again."

`busy` disables the promote/demote/confirm buttons while a request is in flight. `data-testid` hooks on: promote button, demote button, the inline-confirm container + its confirm/cancel buttons, and the success/error message.

### 5.3 No nav change

The role badge already renders on this page; this slice only adds action affordances beside it. (The Slice A nav-consolidation follow-up is unaffected.)

---

## 6. Testing (TDD, mutation-conscious)

Red → green per unit. `api-profile` / `web-admin` have no Stryker config (per Slice A), so assertions are written mutation-conscious up front.

**API unit:**

- **`demoteInstructorToStudent`** — all three effects fire with the uid: `setCustomUserClaims(uid, { role: 'STUDENT' })`, `users/{uid}.role = 'STUDENT'`, **and `revokeRefreshTokens(uid)`** (the revoke is the easily-mutated-away call — assert it explicitly).
- **`AdminUserRoleService.promote`** — 404 when `getUser` null; 409 when current role is `INSTRUCTOR` **and** when `ADMIN`; on `STUDENT` calls `promoteUserToInstructor` once and returns `{ id, role: 'INSTRUCTOR' }`.
- **`AdminUserRoleService.demote`** — 404 when null; 409 when current is `STUDENT` **and** when `ADMIN`; on `INSTRUCTOR` calls `demoteInstructorToStudent` once and returns `{ id, role: 'STUDENT' }`.
- **`InvalidRoleTransitionException`** — code `INVALID_ROLE_TRANSITION`, status 409, `details: { currentRole, attempted }`.
- **`AdminUsersExceptionFilter`** — `INVALID_ROLE_TRANSITION` → 409 through `handleException` (existing `@Catch` already covers it).
- **`AdminUsersController`** — both POST routes delegate to the role service with the path uid.

**Web unit:**

- **`AdminUsersService`** — `promote`/`demote` POST the correct URLs and return the typed body.
- **`AdminUserDetailPageComponent`** — Promote shows only for `STUDENT`, Demote only for `INSTRUCTOR`, **neither for `ADMIN`**; demote opens the inline confirm, Cancel dismisses; Confirm calls `demote`, swaps role in place (Demote→Promote) + success message; `busy` disables buttons in-flight; `INVALID_ROLE_TRANSITION` → "changed elsewhere" message; the authored-courses warning appears in the confirm when `authoredCourses` is non-empty.

**`api-e2e`** (emulator-backed, extend `apps/api-e2e/src/admin-users.e2e-spec.ts`; unique random id suffixes per the shared-emulator lesson; reuse `registerAndPromoteAdmin` / `registerStudent` / `registerAndPromoteInstructor` from `_helpers/auth.ts`):

- Admin promotes a fresh student → `GET /api/admin/users/:uid` then shows `role: 'INSTRUCTOR'` (assert via the **by-uid detail** — robust to shared dataset size).
- Admin demotes a fresh instructor → detail then shows `role: 'STUDENT'`.
- Promote an existing instructor → **409**; demote a student → **409**.
- Non-admin (student session) → **403** on both endpoints.
- **Revocation behavioural check (flagged — the one timing-fragile assertion):** demote an instructor who holds a live session, then that session hitting an instructor-only authoring route should `401` (cookie revoked, `checkRevoked=true`). If the emulator's second-granularity `validSince` makes this flaky, **downgrade** to the unit-level `revokeRefreshTokens` assertion + the detail-role check and record the revoke as a manual-verify item — do not let a flaky e2e block the slice.

**`web-e2e`** (hermetic, mirror `admin-instructor-applications.spec.ts`): stub `**/api/auth/me` = ADMIN; stub the detail + promote/demote endpoints via `page.route` — **register the broad `**/api/admin/users/**` glob BEFORE the specific `:uid` routes** (Playwright matches in reverse registration order — the Slice A landmine) and make handlers **method-aware** (GET detail vs POST promote/demote). Assert: render a STUDENT → click Promote → button swaps to Demote + success; render an INSTRUCTOR → Demote → inline confirm → Confirm → swaps to Promote; a stubbed `INVALID_ROLE_TRANSITION` POST → error message.

**Build gate:** the shared-types change is additive (new `AdminUserRoleResponse` + a new `AdminUsersErrorCode` member), which can silently break `api-profile` / `api` / `web-admin` tsc while vitest stays green — so run an actual `nx build`/typecheck across affected projects (`shared-data-models`, `api-profile`, `api`, `web-admin`, `web`), not just unit tests. Build/typecheck with `NX_DAEMON=false` in the worktree (the [[feedback_worktree_dist_hazard]]).

---

## 7. Files touched (implementation map)

**New (api):** `libs/api-profile/src/lib/users/admin-user-role.service.ts`, `libs/api-profile/src/lib/users/role-mutation.ts` (+ specs).
**Edited (api):** `libs/api-profile/src/lib/users/admin-users.controller.ts` (two POST routes + inject role service), `libs/api-profile/src/lib/users/errors/admin-users.exception.ts` (add `InvalidRoleTransitionException`), `libs/api-profile/src/lib/users/admin-users.exception-filter.spec.ts` (409 case), `libs/api-profile/src/lib/profile.module.ts` (register `AdminUserRoleService`).
**Edited (shared):** `libs/shared-data-models/src/lib/admin-user.ts` (`AdminUserRoleResponse`), `libs/shared-data-models/src/lib/api-error.ts` (`INVALID_ROLE_TRANSITION`).
**Edited (web):** `libs/web-admin/src/lib/admin-users.service.ts` (promote/demote), `libs/web-admin/src/lib/admin-user-detail-page/admin-user-detail-page.component.ts` + `.html` + spec.
**Edited (e2e):** `apps/api-e2e/src/admin-users.e2e-spec.ts`, `apps/web-e2e/src/admin-users.spec.ts`.

---

## 8. Risks & mitigations

- **Demoted user retains Instructor access** until their session expires → mitigated by `revokeRefreshTokens` + the guard's existing `checkRevoked = true` verification (immediate effect on next request).
- **Emulator token-revocation timing flakiness** (second-granularity `validSince`) → the behavioural e2e is flagged optional with a unit-level fallback (§6).
- **Stale-view double-action** (two admins act on the same user) → the second action hits `INVALID_ROLE_TRANSITION` (409) and the web shows a "refresh" message; no corruption (the persisted role is the single source of truth, re-read per request).
- **Admin acting on their own / another admin's account** → impossible via these transitions (Decision 4); the `ADMIN` source role fails both checks.
- **Shared-type tsc breakage masked by vitest** → additive-only changes + an explicit build gate (§6).
- **`promoteUserToInstructor` reuse drift** → the helper is unchanged and still shared by the CLI + application-approve; this slice only adds a new caller.

---

## 9. Deferred / Follow-ups

- **Slice C** — suspend / reactivate (AC4); needs a new account-status mechanism (likely the Firebase Auth `disabled` flag) and a `User` model change (no `status` field today). **Must add an explicit self/last-admin guard** (suspend can target an `ADMIN`).
- **Slice D** — permanent delete + anonymisation (AC5); GDPR semantics across users, enrollments, applications, owned courses, storage, and the Auth record. **Must add an explicit self/last-admin guard.**
- **Role-change email** — a dedicated "you are now an instructor" / "your instructor access was removed" template (the application approve/decline templates are semantically wrong for a direct admin role change).
- **Demote ↔ instructor application doc** — demotion does not reset a stale `APPROVED` `instructorApplications/{uid}` doc; the interaction with a future re-apply flow is a deferred consideration.
- **Audit log / reason capture / bulk actions** — out of scope; a single-action, single-user surface for now.
- **Author a fully-dressed `UC-08-01` use case** (carried from Slice A — use-cases currently stop at EP-06).
- **Update `README.md`** (authoritative feature record) and the spec-drift report when this ships.
