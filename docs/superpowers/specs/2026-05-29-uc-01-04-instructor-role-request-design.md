> [!NOTE] DOCUMENT STATUS: DRAFT

# UC-01-04 — Request Instructor Role (submission only)

**Use case:** [UC-01-04 — Request Instructor Role](../../use-cases/01-user-identity-and-access.md#uc-01-04--request-instructor-role)

**Date:** 2026-05-29

**Follows:** UC-01-03 Slices A–D, which built and closed the `/settings/profile` surface and the `libs/api-profile` + `libs/web-profile` libraries. This slice adds a fifth profile-adjacent concern. It is the **last unbuilt self-service use case in the MVP (EP-01–EP-06)** — every other student/instructor flow is wired end to end; the only remaining gaps are administrator-actor flows that live behind the post-MVP EP-08 admin panel.

## 1. Scope

This slice ships the **student-facing submission flow** of UC-01-04: a Student applies to become an Instructor by submitting a statement of intent and areas of expertise. The application is persisted as `PENDING` and queued for review.

The flow (UC-01-04 main success scenario, steps 1–8):

1. A Student on `/settings/profile` sees a **"Become an Instructor"** option.
2. They open a form with two free-text fields — **statement of intent** and **areas of expertise**.
3. On submit, the server validates both are non-empty, then writes a `PENDING` application and returns confirmation.
4. The page swaps the form for an **"under review"** status card.

### The MVP/post-MVP split

UC-01-04's asynchronous **post-condition** — an administrator approves or declines, the role flips, and a decision email is sent — depends on the EP-08 admin panel (US-08-03), which is **post-MVP and unbuilt**. Today, promotion happens out-of-band via `pnpm tools:promote-to-instructor <email>`. This slice therefore builds submission only and stops at step 8. This is the same MVP boundary the rest of the codebase already follows.

Three product decisions, settled during brainstorming, shape this slice:

- **Submission only.** No admin review UI, no approve/decline buttons, no decision emails. Promotion stays on the existing CLI.
- **Areas of expertise is free text.** A single text field, not a tag list or category picker. Course categories (US-08-02) are post-MVP and unbuilt, so a structured picker would pull unbuilt scope forward. This also makes step-6 validation ("both fields required and non-empty") map exactly.
- **The promote CLI resolves the application.** When `promote-to-instructor` flips a Student to `INSTRUCTOR`, it also marks any `PENDING` application for that uid as `APPROVED` (with `resolvedAt`). This keeps application data consistent and gives the future EP-08 admin panel clean history. It is the only write this slice makes to the approval side of the flow.

### In scope

- New shared-model file `libs/shared-data-models/src/lib/instructor-application.ts` with the entity, the `GET`/`POST` wire types, and the error-code constants.
- New `instructor-application/` submodule under `libs/api-profile` (mirrors the `email/` and `password/` submodule layout): `InstructorApplicationController`, `InstructorApplicationService`, `instructor-application.exception-filter.ts`, `errors/instructor-application.exception.ts` + `errors/instructor-application-error.codes.ts`, `dto/submit-instructor-application.dto.ts`.
- `GET /api/profile/instructor-application` (status) and `POST /api/profile/instructor-application` (submit), both guarded by `FirebaseSessionGuard`.
- A new Firestore collection `instructorApplications`, document id = `uid`.
- `tools/promote-to-instructor.ts`: resolve a `PENDING` application to `APPROVED` after the role flip.
- Web: a new `instructor-application/` submodule under `libs/web-profile` — an `InstructorApplicationService` (HTTP wrapper) and a standalone `InstructorApplicationComponent` embedded as a new `<section>` on the profile page.

### Out of scope (deferred — EP-08 / post-MVP)

- The admin review queue UI, approve/decline actions, and the approval/decline **decision emails** (US-08-03).
- The user-facing **DECLINED** flow (re-application, decline reason display). The `DECLINED` status and `resolvedAt` field exist in the model for forward-compatibility only.
- Notifying the applicant by email that their submission was received (step 8 is an on-screen confirmation only; the UC does not require a receipt email).
- Throttling the submission endpoint — the one-pending-per-user guard already bounds it.

## 2. Architecture

Following the Slice A–D precedent, **`libs/api-profile` owns the feature**, importing identity primitives from `api-auth`, and the endpoints live under the existing `/api/profile` namespace. No new libraries are created on either side; both `api-profile` and `web-profile` gain a submodule.

### 2.1 Storage model

A new top-level Firestore collection **`instructorApplications`**, with **document id = `uid`**. Keying on the uid is the enforcement mechanism for the "one application per user" precondition and extension 2b — there is structurally at most one application document per user, so the existence check is a single `get()`.

```ts
// libs/shared-data-models/src/lib/instructor-application.ts
import type { ISODateString, UserId } from './common';

export type InstructorApplicationStatus = 'PENDING' | 'APPROVED' | 'DECLINED';

/** Firestore doc in `instructorApplications`, id === uid. */
export interface InstructorApplication {
  uid: UserId;
  statement: string;   // statement of intent
  expertise: string;   // areas of expertise (free text)
  status: InstructorApplicationStatus;
  createdAt: ISODateString;
  resolvedAt?: ISODateString;   // set when promote CLI / future admin resolves it
}

/** Body of `GET /api/profile/instructor-application`. */
export interface InstructorApplicationView {
  status: 'NONE' | InstructorApplicationStatus;
  statement?: string;
  expertise?: string;
  createdAt?: ISODateString;
}

/** Body of `POST /api/profile/instructor-application`. */
export interface SubmitInstructorApplicationRequest {
  statement: string;
  expertise: string;
}

/** Wire error codes. */
export const INSTRUCTOR_APPLICATION_INVALID = 'INSTRUCTOR_APPLICATION_INVALID'; // 400
export const INSTRUCTOR_APPLICATION_EXISTS = 'INSTRUCTOR_APPLICATION_EXISTS';   // 409
export const ALREADY_INSTRUCTOR = 'ALREADY_INSTRUCTOR';                         // 409

export type InstructorApplicationErrorCode =
  | typeof INSTRUCTOR_APPLICATION_INVALID
  | typeof INSTRUCTOR_APPLICATION_EXISTS
  | typeof ALREADY_INSTRUCTOR;

/** Body of a non-2xx from the instructor-application endpoints. */
export interface InstructorApplicationErrorBody {
  error: {
    code: InstructorApplicationErrorCode;
    message: string;
    details?: { field?: 'statement' | 'expertise' };
  };
}
```

### 2.2 No new `api-auth` exports

This slice needs no identity primitive beyond what `api-profile` already injects. The applicant's **role** is read authoritatively from the session cookie claim (`req.user.role`, already populated by `FirebaseSessionGuard`), and Firestore is reached through the existing `FIRESTORE` / `FirestoreHandle` provider from `@learnwren/api-firebase`. No password re-authentication, no email transport, no Firebase Admin Auth call.

## 3. API

### 3.1 Controller

`InstructorApplicationController` is added to `ProfileModule.controllers`. It is guarded by `FirebaseSessionGuard` and scoped to `/profile/instructor-application`.

```
GET  /api/profile/instructor-application   ->  InstructorApplicationView   (200)
POST /api/profile/instructor-application   ->  InstructorApplicationView   (201)
```

`GET` returns `{ status: 'NONE' }` when no document exists, otherwise the stored status plus the submitted fields. `POST` returns the freshly-created `PENDING` view.

### 3.2 Service and validation

`InstructorApplicationService` injects `FIRESTORE`. It exposes `getApplication(uid)` and `submit(uid, role, input)`.

`submit` enforces, in order:

1. **Role guard** — if `role` is `INSTRUCTOR` or `ADMIN`, throw `AlreadyInstructorException` (`ALREADY_INSTRUCTOR`, 409). Backs extension 2a defensively on the server even though the UI hides the option.
2. **Field validation** — `statement.trim()` and `expertise.trim()` must each be non-empty; otherwise `InstructorApplicationInvalidException('statement' | 'expertise')` (`INSTRUCTOR_APPLICATION_INVALID`, 400). A max length (e.g. 2 000 chars each) is also enforced here. Validation is **server-authoritative**: the DTO carries no length decorators, so the global `ValidationPipe` cannot short-circuit the typed code into a generic `BAD_REQUEST` (per the established Nest ValidationPipe lesson).
3. **Existence guard** — if a document already exists for the uid with status `PENDING`, throw `InstructorApplicationExistsException` (`INSTRUCTOR_APPLICATION_EXISTS`, 409). Backs extension 2b.

On success it `set()`s `{ uid, statement, expertise, status: 'PENDING', createdAt }` at `instructorApplications/{uid}` and returns the view. Because the existence guard blocks only `PENDING`, a `set()` cleanly overwrites a stale `DECLINED` document (forward-compat re-application), while an `APPROVED`/promoted user is already stopped by the role guard.

### 3.3 Errors

Following the `email/` and `password/` submodule shape: an `InstructorApplicationException` base carrying `{ code, status, details? }`, with one subclass per code, and an `INSTRUCTOR_APPLICATION_ERROR_CODES` tuple. A dedicated `InstructorApplicationExceptionFilter` (`@Catch(InstructorApplicationException, HttpException)`) delegates rendering to `handleException()` from `@learnwren/api-http-errors` — no hand-rolled status/validation mapping. The filter is registered on the controller via `@UseFilters` and added to `ProfileModule.providers`.

## 4. CLI — `tools/promote-to-instructor.ts`

After the existing `setCustomUserClaims` + `users/{uid}.role` update, add: read `instructorApplications/{uid}`; if it exists with status `PENDING`, `update({ status: 'APPROVED', resolvedAt: <ISO> })`. Absence of an application is not an error (admins can promote users who never applied) — the resolution step is best-effort and logged. The `promoteToInstructor` function already takes injected `auth` and `firestore` handles, so this is covered by the tool's existing fake-Firestore tests.

## 5. Web

### 5.1 Service

`InstructorApplicationService` (in `libs/web-profile/src/lib/instructor-application/`) is a thin, Promise-returning HTTP wrapper matching the established web service pattern — the component owns the signal state:

```ts
getApplication(): Promise<InstructorApplicationView>
submit(input: SubmitInstructorApplicationRequest): Promise<InstructorApplicationView>
```

### 5.2 Component

`InstructorApplicationComponent` — standalone, `OnPush` — is embedded as a new `<section>` at the bottom of `profile-page.component.html`, styled to match the existing collapsible sections (`border-t border-line pt-6`). To avoid growing the already-busy `ProfilePageComponent`, the entire concern lives in this child component (precedent: `ProfilePictureUploaderComponent`).

Behaviour:

- **Role gate (ext 2a).** The parent passes the current role (it already holds it in its `readonly` signal). The section renders **only when `role === 'STUDENT'`** — Instructors and Admins never see it.
- **On init**, it calls `getApplication()`.
  - `status === 'PENDING'` (ext 2b) → render the **"Your application has been submitted and is under review."** status card; no form.
  - otherwise → render a **"Become an Instructor"** toggle that opens the form.
- **Form**: two fields (statement, expertise), `Validators.required` for fast client feedback but **server-authoritative**; on submit, on success swap to the status card (step 8); on `INSTRUCTOR_APPLICATION_INVALID` set the offending field's error from `details.field`; on `ALREADY_INSTRUCTOR` / `INSTRUCTOR_APPLICATION_EXISTS` (race) show a form-level banner and re-fetch status.

## 6. Testing (TDD)

| Layer | Coverage |
|-------|----------|
| `shared-data-models` | type/shape spec for the new entity and wire types. |
| `api-profile` service | role guard (INSTRUCTOR/ADMIN → `ALREADY_INSTRUCTOR`), empty/whitespace field validation per field, max-length, one-pending guard, happy-path write + returned view, `getApplication` NONE vs PENDING. |
| `api-profile` controller | delegates GET/POST to the service. |
| `api-profile` exceptions + filter | each exception → its `{ code, status, details }`; filter renders via `handleException`. |
| `promote-to-instructor` | PENDING → APPROVED resolution; no-application is a no-op; non-pending left untouched. |
| `web-profile` service | GET/POST URL + payload. |
| `web-profile` component | role gating (renders only for STUDENT), PENDING → status card, form validation error mapping, submit-success swap, exists/already-instructor banner. |
| `web-e2e` | one happy-path: student opens the section, submits, sees the under-review card; persists across reload. |

All new units target the workspace's ≥ 80 % adjusted-mutation bar.

## 7. Documentation touch-ups (at merge)

- `README.md` — add UC-01-04 to the EP-01 "what is wired up" entry and to the `/api/profile` endpoint list.
- `docs/use-cases/01-user-identity-and-access.md` status banner — mark UC-01-04 submission flow implemented, approval still CLI-mediated.
- `docs/quality/spec-drift-report.md` — record the submission-only scope and the deferred admin-review post-condition.
- A slice summary under `docs/superpowers/summaries/`.
