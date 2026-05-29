> [!NOTE] DOCUMENT STATUS: DRAFT

# US-08-03 — Review Instructor Applications

**User story:** [US-08-03 — Review Instructor Applications](../../epics/08-platform-administration.md#us-08-03-review-instructor-applications)

**Date:** 2026-05-29

**Follows:** [UC-01-04 — Request Instructor Role (submission only)](./2026-05-29-uc-01-04-instructor-role-request-design.md), which shipped the student-facing submission flow and the `instructorApplications/{uid}` document, but left approval **CLI-only** (`tools/promote-to-instructor.ts`). This slice builds the **other half of that loop** — in-app admin review — and in doing so establishes the **first administrator surface** in the application.

**Scope note:** US-08-03 lives in **EP-08 (Platform Administration)**, which CLAUDE.md lists as post-MVP. The MVP (EP-01–EP-06) is complete and shipped end to end. There is no fully-dressed `UC-08-03` use-case file (the `docs/use-cases/` set stops at EP-06); this design works from the epic's acceptance criteria. Authoring a matching `UC-08-03` use case is **deferred** and noted as a follow-up.

## 1. Goal & Acceptance Criteria

> **As an** Administrator, **I want to** review and approve or decline Instructor applications **so that** I can control who is permitted to create courses.

From [EP-08](../../epics/08-platform-administration.md#us-08-03-review-instructor-applications):

- A dedicated queue in the admin panel lists all **pending** Instructor applications.
- Each application displays the applicant's **name, email, and statement of intent**.
- An Administrator can **approve or decline** the application with a single click.
- The applicant receives an **email notification** of the decision.

## 2. Scope

**In scope:**

- A new ADMIN-only page at **`/admin/instructor-applications`** listing the **pending** queue.
- Each row shows applicant **name, email, statement, expertise, submitted date**, with single-click **Approve** / **Decline**.
- **Approve** grants the INSTRUCTOR role (Firebase custom claim + `users/{uid}.role`), marks the application `APPROVED`, and emails the applicant.
- **Decline** marks the application `DECLINED` and emails the applicant.
- A **`promote-to-admin` CLI** so an ADMIN can be created (the feature is otherwise unreachable/untestable).
- The first admin-surface foundation: `AdminRoleGuard` (api), `adminRoleGuard` (web), an **Admin** nav link gated on `role === 'ADMIN'`.

**Deliberate scope cuts (YAGNI / matches ACs):**

- **Pending-only queue** — no approved/declined history view. The applicant already sees their own outcome via the existing UC-01-04 status surface (`GET /api/profile/instructor-application`).
- **No decline reason** — decline is a pure single click; the email uses generic copy. (The existing `submit()` already permits re-application once `status !== 'PENDING'`, so a declined applicant can re-apply.)
- **Only US-08-03** — the other EP-08 stories (Manage Users, Manage Categories, Monitor Platform Health) remain deferred.
- No applicant-side UI changes beyond the email; the existing status card already renders `APPROVED` / `DECLINED`.

## 3. Confirmed Design Decisions

1. **Admin bootstrap → new `promote-to-admin` CLI.** A new `tools/promote-to-admin.ts` mirrors `promote-to-instructor.ts`. No in-app admin management.
2. **Decline → pure single-click, no reason.**
3. **Code placement → new `web-admin` lib (UI) + admin controller in `api-profile`'s existing `instructor-application/` submodule (API).** The application data already lives there, so the admin controller reuses the collection without cross-lib Firestore coupling. `web-admin` is a clean UI home for future admin features.
4. **Approve requires a verified applicant email.** Mirrors the CLI, which refuses to grant an elevated role to an unverified account. Unverified → Approve fails with `APPLICANT_NOT_VERIFIED` and an inline message. Decline is always allowed.
5. **Approve/Decline are guarded by current state.** They act only when the application is still `PENDING`; an already-resolved application (another admin, or the CLI) yields `APPLICATION_NOT_PENDING` and the row drops on refresh.
6. **Extract the shared promotion helper.** The approve effect is identical to the CLI's, so the `setCustomUserClaims({ role: 'INSTRUCTOR' })` + `users/{uid}.role` update + mark-`APPROVED` logic is extracted into one reusable unit that **both** the CLI and the new admin service call, preventing drift.

## 4. Architecture & Data

### 4.1 Data model — no changes

Reuse `instructorApplications/{uid}` exactly as defined in `shared-data-models/instructor-application.ts`. The lifecycle is already modelled:

- Approve: `status` → `'APPROVED'`, set `resolvedAt`.
- Decline: `status` → `'DECLINED'`, set `resolvedAt`.

The queue joins each application with `users/{uid}` for `displayName` + `email` (both already stored on the user doc). For a small-community MVP, one extra read per pending application is acceptable.

### 4.2 Shared promotion helper

Extract the instructor-promotion effect currently inline in `tools/promote-to-instructor.ts` into a single reusable function (operating on the `AuthLike` / `FirestoreLike` handles already used by the CLI):

- `setCustomUserClaims(uid, { role: 'INSTRUCTOR' })`
- `users/{uid}.role = 'INSTRUCTOR'`
- if a `PENDING` application exists, mark it `APPROVED` + stamp `resolvedAt`

Both the CLI and the new `AdminInstructorApplicationService.approve()` call it. The applicant must sign out/in for the new claim to take effect — surfaced in the approval email.

### 4.3 Role guards (first admin surface)

- **`AdminRoleGuard`** in `api-auth` — a mirror of `InstructorRoleGuard`, throwing `InsufficientRoleException` when `req.user?.role !== 'ADMIN'`. Exported from `api-auth` and registered in `AuthModule`.
- **`adminRoleGuard`** in `web-admin` — a mirror of the web `instructorRoleGuard`, redirecting non-ADMIN users.

## 5. API Contract

New `AdminInstructorApplicationController` + `AdminInstructorApplicationService` inside `libs/api-profile/src/lib/instructor-application/`. Both endpoints are guarded by `FirebaseSessionGuard` + `AdminRoleGuard`. The existing applicant-facing controller/service are untouched.

Base path: `/api/admin/instructor-applications`

| Method & path | Behavior | Errors |
|---|---|---|
| `GET /` | List **pending** applications, each joined with `users/{uid}` → `displayName`, `email`. | — |
| `POST /:uid/approve` | Verify applicant email is verified → run shared promotion helper → return updated view. | `APPLICATION_NOT_FOUND`, `APPLICATION_NOT_PENDING`, `APPLICANT_NOT_VERIFIED` |
| `POST /:uid/decline` | Mark `DECLINED` + `resolvedAt` → email → return updated view. | `APPLICATION_NOT_FOUND`, `APPLICATION_NOT_PENDING` |

**Email verification + claim source:** Approve reads the applicant's Firebase Auth record (authoritative `emailVerified` + `email`) before granting the role. Decline emails the applicant's address.

### 5.1 shared-data-models additions

```ts
/** One row of the admin pending queue: an application joined with the user doc. */
export interface PendingInstructorApplicationView {
  uid: UserId;
  displayName: string;
  email: string;
  statement: string;
  expertise: string;
  createdAt: ISODateString;
}

/** Body of GET /api/admin/instructor-applications. */
export interface PendingInstructorApplicationsResponse {
  applications: PendingInstructorApplicationView[];
}

export const APPLICATION_NOT_FOUND = 'APPLICATION_NOT_FOUND';
export const APPLICATION_NOT_PENDING = 'APPLICATION_NOT_PENDING';
export const APPLICANT_NOT_VERIFIED = 'APPLICANT_NOT_VERIFIED';

export type AdminInstructorApplicationErrorCode =
  | typeof APPLICATION_NOT_FOUND
  | typeof APPLICATION_NOT_PENDING
  | typeof APPLICANT_NOT_VERIFIED;
```

### 5.2 Exception filter

A per-feature `AdminInstructorApplicationExceptionFilter` delegating to `handleException()` in `@learnwren/api-http-errors` (per the established per-feature-filter pattern). Domain exceptions stay `{ code, status, details? }`-shaped: `APPLICATION_NOT_FOUND` → 404, `APPLICATION_NOT_PENDING` → 409, `APPLICANT_NOT_VERIFIED` → 409. The filter must also catch the `AuthException` branch (`InsufficientRoleException` → 403) so a guard rejection renders as 403 rather than a 500 fallback.

## 6. Web UI — new `web-admin` lib

- Route `admin/instructor-applications`, protected by `adminRoleGuard`, lazy-loaded via `adminRoutes` spread into `app.routes.ts`.
- **`AdminInstructorApplicationsPageComponent`** (OnPush, signal-based state):
  - Loads the pending queue on init.
  - Empty state: "No pending applications."
  - Per row: applicant name, email, statement, expertise, submitted date, **Approve** / **Decline** buttons.
  - In-flight: buttons disabled per row while a request is pending; on success the row is removed from the signal list.
  - On `APPLICATION_NOT_PENDING` / `APPLICANT_NOT_VERIFIED`: inline error on the row.
- **`AdminInstructorApplicationsService`** — a thin Promise-returning HTTP wrapper (per the established web-service pattern: the component owns the signals, the service does not hold `RemoteData`).
- **Nav:** add an **Admin** link in `app.html`, gated on `auth.currentUser()?.role === 'ADMIN'` (mirrors the existing INSTRUCTOR gate).

## 7. Email

Two new `EmailTransport` methods, implemented in **both** `console-email-transport` and `smtp-email-transport` (mirroring the existing emails):

- `sendInstructorApplicationApprovedEmail({ to })` — congratulates; notes the applicant must sign out and back in for instructor access to take effect.
- `sendInstructorApplicationDeclinedEmail({ to })` — informs the application was not approved (generic copy; re-application is permitted).

Corresponding input interfaces added to `email-transport.ts`.

## 8. Bootstrap CLI

New `tools/promote-to-admin.ts` + `pnpm tools:promote-to-admin <email>` script, mirroring `promote-to-instructor.ts`: reuses `firebase-admin-init`, sets the custom claim `role: 'ADMIN'` and `users/{uid}.role = 'ADMIN'`, defaults to the local emulators. (ADMIN is a manual, operator-only grant — there is no in-app admin-management flow.)

## 9. Testing (TDD, mutation-conscious)

Red → green per unit:

- **`AdminInstructorApplicationService`** — `list` (join shape, pending-only filter); `approve` happy path (helper invoked, status flips, email sent); `approve` error branches (`NOT_FOUND`, `NOT_PENDING`, `NOT_VERIFIED`); `decline` happy + error branches; idempotency (already-resolved → conflict).
- **Shared promotion helper** — claim + user-doc + app-resolution; no-op when no pending app.
- **`AdminInstructorApplicationExceptionFilter`** — each code → status, including the guard `InsufficientRoleException` → 403 branch.
- **`AdminRoleGuard`** (api) and **`adminRoleGuard`** (web) — allow ADMIN, reject others.
- **`AdminInstructorApplicationsPageComponent` + service** — load, empty state, approve/decline success removes row, inline error rendering.
- **Email transports** — both new methods on console + SMTP.
- **`api-e2e`** — admin flow: applicant applies → admin approves → role granted (and the verified-gate rejection path).
- **`web-e2e`** — ADMIN sees the queue, approves a row, row disappears; non-ADMIN is redirected.

**Mutation note:** `api-profile` has no Stryker config, and `web-admin` will be new (also unconfigured). The ≥80% mutation bar is not tooled on these libs, so write mutation-conscious assertions up front rather than promising a mutation run.

## 10. Deferred / Follow-ups

- Author a fully-dressed **`UC-08-03`** use case to match repo conventions (use-cases currently stop at EP-06).
- Approved/declined **history view** in the admin queue.
- Decline **reason** capture.
- The remaining EP-08 stories: Manage Users (US-08-01), Manage Categories (US-08-02), Monitor Platform Health (US-08-04).
- Update `README.md` (authoritative feature record) and the spec-drift report when this ships.
