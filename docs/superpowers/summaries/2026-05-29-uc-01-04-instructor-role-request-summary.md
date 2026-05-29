# UC-01-04: Instructor Role Request (Submission Slice) — Implementation Summary

**Date:** 2026-05-29
**Spec:** `docs/superpowers/specs/2026-05-29-uc-01-04-instructor-role-request-design.md`
**Plan:** `docs/superpowers/plans/2026-05-29-uc-01-04-instructor-role-request.md`

Ships the UC-01-04 submission slice. A Student on `/settings/profile` sees a "Become an Instructor" section; filling in a statement of intent and areas of expertise (free-text, ≤ 2000 chars each) and submitting persists a `PENDING` document in a new Firestore collection `instructorApplications` (doc id = uid) and swaps the form for an "under review" card that persists across reload and across a subsequent sign-out/sign-in round-trip. The `pnpm tools:promote-to-instructor <email>` CLI now resolves the pending application to `APPROVED` (with `resolvedAt`) after flipping the Firebase custom claim. Commits range from `b6f40f7` (shared wire types) through `910b280` (web-e2e happy path) on `feat/uc-01-04-instructor-role-request`.

## What shipped

### Shared (`libs/shared-data-models`)

- `lib/instructor-application.ts` — wire types: `InstructorApplicationStatus` string-literal union (`NONE | PENDING | APPROVED | DECLINED`), `InstructorApplicationView` response shape (`{ status, statement?, expertise?, createdAt? }`), `SubmitInstructorApplicationBody` request shape, and the error-code string-literal union (`ALREADY_INSTRUCTOR | INSTRUCTOR_APPLICATION_EXISTS | INSTRUCTOR_APPLICATION_INVALID`). Commit `b6f40f7`.

### NestJS (`libs/api-profile/src/lib/instructor-application/`)

- `errors/instructor-application.exception.ts` — domain exceptions: `AlreadyInstructorException` (409), `InstructorApplicationExistsException` (409), `InstructorApplicationInvalidException` (400, with field-accurate details list). Commit `5863b1d`; field messages corrected in `e0af335`.
- `instructor-application.exception-filter.ts` — per-feature `ExceptionFilter` delegating rendering to `handleException()` in `@learnwren/api-http-errors`. Commit `98c96e2`.
- `dto/submit-instructor-application.dto.ts` — plain-class DTO (type guards only; no class-validator decorators, per the workspace convention that length/content validation lives in the service to avoid NestJS `ValidationPipe` short-circuiting with raw messages). Commit `1ed76c8`.
- `instructor-application.service.ts` — role guards (`INSTRUCTOR` or `ADMIN` → `AlreadyInstructorException`), field validation (both fields non-empty after trim + ≤ 2000 chars → `InstructorApplicationInvalidException`), existence guard (doc already present → `InstructorApplicationExistsException`), and Firestore write to `instructorApplications/{uid}`. GET reads the doc and maps `NONE` for missing docs. Commit `76632c2`; specs extended in `577e02f`.
- `instructor-application.controller.ts` — `GET /api/profile/instructor-application` and `POST /api/profile/instructor-application`, both guarded by `FirebaseSessionGuard` and decorated with the per-feature filter. Commit `af6d945`.
- Registered in `ProfileModule` alongside the existing password and email sub-modules. Commit `dc0716e`.

### CLI (`tools/promote-to-instructor.ts`)

Extended to resolve a pending `instructorApplications/{uid}` document to `APPROVED` (setting `status: 'APPROVED'` + `resolvedAt: <ISO>`) after writing the custom claim and the `users/{uid}` role field. If no application document exists the CLI proceeds without error (backward-compat for pre-submission-flow promotions). Commit `43b9b22`.

### Angular (`libs/web-profile/src/lib/instructor-application/`)

- `instructor-application.service.ts` — Promise-returning HTTP wrapper: `getApplication(): Promise<InstructorApplicationView>` and `submitApplication(body): Promise<InstructorApplicationView>`. Commit `11bb3d8`.
- `instructor-application.component.ts` / `.html` — OnPush component with signal state (`status`, `busy`, `error`, `fieldErrors`). Renders three mutually exclusive branches: the submission form (for `NONE` status, STUDENT role only), the "under review" card (`PENDING`), and a no-op for `APPROVED`/`DECLINED` (not exposed in this slice). `data-testid` anchors on all interactive elements and state branches. Commits `65752bc`, `1e4b83b`.
- Embedded in `ProfilePageComponent` via the `instructorApplicationSection` signal; the section is rendered only when `role === 'STUDENT'`. Commit `b20d762`.

### Tests

- `libs/api-profile` — unit specs for the exception filter, exceptions, service (covering role guard, field validation, existence guard, GET mapping, happy-path write), and controller GET/POST; a `nowIso` helper extracted for deterministic timestamps. Commits `76632c2`, `577e02f`.
- `libs/web-profile` — component spec covering success reset/close, invalid early-return, idle-status render. Commit `1e4b83b`.
- `apps/web-e2e/src/profile.spec.ts` — end-to-end happy-path test: student visits `/settings/profile`, the "Become an Instructor" section appears, form is submitted, the "under review" card replaces the form, a reload confirms persistence. Commit `910b280`.

## Key design decisions

- **Submission-only scope.** The UC-01-04 main success scenario and extensions 2a/2b/6a are fully implemented. The async post-condition (admin reviews, approves or declines, sends decision email) is deliberately deferred to EP-08 (Platform Administration). The `DECLINED` status and `resolvedAt` field exist in the model for forward-compat only and are never set by this slice.
- **Doc id = uid enforcement.** Firestore stores one document per user at `instructorApplications/{uid}`. A missing document is `NONE`; a present document contains the status. This makes the existence guard a single doc read with no query, and keeps re-submit prevention trivially O(1).
- **Free-text expertise.** The spec's original `areas of expertise` field is a plain textarea (not a tag/multi-select). No taxonomy is imposed; the admin reviewer sees the raw text. This is the simplest form that satisfies the use case and defers the taxonomy design to EP-08.
- **CLI promotion resolves the application.** Rather than leaving the `instructorApplications/{uid}` doc in `PENDING` forever for CLI-promoted users, the tool now sets `status: 'APPROVED'` and `resolvedAt` so that the "Become an Instructor" section correctly disappears after promotion and the GET endpoint returns the resolved state.
- **Service-layer validation, not DTO decorators.** Following the established workspace convention (`MEMORY.md` — "Nest ValidationPipe DTO short-circuit"), field length and non-empty rules are enforced in `InstructorApplicationService` rather than in the DTO, yielding typed `INSTRUCTOR_APPLICATION_INVALID` responses with a `details` list instead of raw class-validator messages.

## What is deferred (EP-08)

- **Admin review queue UI** — no `/admin/applications` page or API endpoint yet.
- **Approve/decline actions** — no `POST /admin/applications/:uid/approve` or `/decline`.
- **Decision emails** — no "Congratulations, you are now an instructor" or "Your application was not approved" email.
- **User-facing DECLINED flow** — the `DECLINED` status is stored but the web surface does not yet render a "declined" state or a re-apply affordance.

## Commit range (`feat/uc-01-04-instructor-role-request`, main..HEAD)

```
910b280 test(web-e2e): instructor application submission happy path (UC-01-04)
b20d762 feat(web-profile): embed instructor-application section on profile page (UC-01-04)
1e4b83b test(web-profile): cover success reset/close, invalid early-return, status idle (UC-01-04)
65752bc feat(web-profile): instructor-application component (student-only) (UC-01-04)
11bb3d8 feat(web-profile): instructor-application HTTP service (UC-01-04)
43b9b22 feat(tools): promote-to-instructor resolves pending application to APPROVED (UC-01-04)
dc0716e feat(profile): register instructor-application in ProfileModule (UC-01-04)
af6d945 feat(profile): instructor-application controller GET/POST (UC-01-04)
577e02f test(profile): cover over-long expertise + ADMIN no-touch; extract nowIso helper (UC-01-04)
76632c2 feat(profile): instructor-application service with role/field/exists guards (UC-01-04)
1ed76c8 feat(profile): instructor-application submit DTO (UC-01-04)
98c96e2 feat(profile): instructor-application exception filter (UC-01-04)
e0af335 fix(profile): field-accurate INSTRUCTOR_APPLICATION_INVALID messages (UC-01-04)
5863b1d feat(profile): instructor-application domain exceptions (UC-01-04)
b6f40f7 feat(shared): instructor-application wire types + error codes (UC-01-04)
```

## Verification outcome

- **Unit tests:** all affected libs green (`pnpm nx run-many --target=test --projects=api-profile,web-profile,shared-data-models`).
- **Lint / typecheck / build:** green before merge.
- **web-e2e:** `profile.spec.ts` happy-path submission scenario added and confirmed passing against the emulator.
- **Manual (emulator mode):** student registers → visits `/settings/profile` → "Become an Instructor" section renders → submits form → "under review" card appears → reload confirms persistence → `pnpm tools:promote-to-instructor <email>` marks the application `APPROVED` and flips the role.

## Follow-ups not in scope

Per spec §"Non-Goals" and the EP-08 deferral:

- Admin review queue, approve/decline endpoints, and decision emails — EP-08.
- User-facing DECLINED state and re-apply affordance — EP-08.
- Instructor application list/search for admins — EP-08.
- Notification to the applicant that their application was received (beyond the in-UI "under review" card) — post-MVP.
