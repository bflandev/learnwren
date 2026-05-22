# Specification Drift Report

> Generated 2026-05-21. Compares the frozen Cockburn use cases in `docs/use-cases/`
> against the current implementation in `apps/` and `libs/`.

## Method

The `docs/use-cases/` files were authored in March 2026 and have not been edited
since (`git log` confirms a 2026-03-27 freeze). The implementation has evolved
well past them. This report compares each use case's Main Success Scenario and
Extensions against the code, and classifies every divergence as:

- **NOT IMPLEMENTED** — a use-case step/extension with no corresponding code.
- **CONTRADICTS** — code behaves differently from the use case (different rule, threshold, value, flow, or error).
- **BEYOND SPEC** — code does something material the use case never mentions.
- **RENAMED/RESHAPED** — endpoint, field, data model, or structural divergence.

`README.md` is treated as the authoritative record of what is actually wired up.

## Executive summary

Drift is **substantial but concentrated in the spec, not the code.** The use-case
files are an aspirational March snapshot that was never reconciled against a
deliberately scoped-down implementation. The README and the design specs under
`docs/superpowers/specs/` *did* track the scope-down; only `docs/use-cases/` is
stale.

Of **24 use cases**, roughly **half describe behavior that does not exist** — but
9 of those (all of EP-05 and EP-06) are openly deferred. Every built use case
carries at least minor drift.

| Epic | Use cases | Drift level | Headline |
|---|---|---|---|
| EP-01 — User Identity & Access | 4 | **Major** | UC-01-03 and UC-01-04 entirely unbuilt; 2 behavioral contradictions |
| EP-02 — Course Authoring | 4 | **Moderate** | CRUD core faithful; cover image absent, module-title flow inverted, publish slice over-built |
| EP-03 — Video Management & DRM | 5 | **Major (architectural)** | Specs assume commercial multi-DRM; code is a scoped-down HLS + AES-128 pipeline |
| EP-04 — Lesson Materials | 2 | **Moderate** | UC-04-01 faithful; UC-04-02 (student download) unbuilt for its actor |
| EP-05 — Course Discovery & Enrollment | 5 | **Deferred** | Entirely unbuilt; documented as deferred |
| EP-06 — Learning Experience | 4 | **Deferred** | Entirely unbuilt; documented as deferred |

### Three kinds of drift

1. **Scope drift — expected and documented.** EP-05/06 deferred, video cover-image
   deferred, enrolled-student paths stubbed (`TODO(EP-06)`). The README is honest
   about each; only the use-case files still present them as in-scope.
2. **Architectural drift — significant.** UC-03-03/04/05 specify Widevine /
   PlayReady / FairPlay, CENC/CBCS, MPEG-DASH, a license server with playback
   tokens, KMS-stored keys, cold storage, and an admin storage console. The code
   is HLS + AES-128, keys in a Firestore document, session-cookie gating, and
   hard-delete only. This is a different product decision, not stale wording.
3. **Behavioral drift — small, real, undocumented.** A handful of code behaviors
   directly contradict a use case and are not explained in any spec or the README
   (see [Undocumented behavioral drift](#undocumented-behavioral-drift)).

## Undocumented behavioral drift

These are the divergences a reader of the use cases would be genuinely surprised
by — they are not scope decisions and are not recorded anywhere:

| # | Behavior | Use case it contradicts | Code |
|---|---|---|---|
| 1 | Registration auto-authenticates the user (mints a `__session` cookie) before email verification. | UC-01-01 — account stays inactive/unauthenticated until activation. | `libs/api-auth/src/lib/auth.service.ts:161-183`, `auth.controller.ts:57-62` |
| 2 | A suspended/disabled account is reported as "invalid credentials" **and** the failed login counts toward brute-force lockout. | UC-01-02 Ext 4d — wants a distinct "account suspended" message. | `libs/api-auth/src/lib/firebase-auth-rest-client.ts:22-27,61-63`, `auth.service.ts:204-211` |
| 3 | Module creation prompts the instructor for a title and aborts if empty. | UC-02-02 step 2 — system generates a default title ("Module 1"). | `libs/web-courses/src/lib/course-editor-page/course-editor-page.component.ts:134-142`, `create-module.dto.ts:3-7` |
| 4 | Lesson deletion silently cascades to delete the lesson's video and all attached materials. | UC-02-03 Ext 1b step 4 — other content is unaffected. | `libs/api-courses/src/lib/courses.service.ts:172-178` |
| 5 | A 5% size tolerance (`SIZE_TOLERANCE = 1.05`) lets uploads exceed the stated 10 GB video / 50 MB material caps. | UC-03-01 step 4, UC-04-01 step 4 — flat caps. | `libs/api-courses/src/lib/video/video.service.ts:35,139`, `materials/materials.service.ts:33,118` |

---

## EP-01 — User Identity and Access

**Drift: Major.** Two of four use cases are entirely unbuilt; the two built use
cases each carry a high-severity behavioral contradiction.

### UC-01-01 — Register a New Account

- **CONTRADICTS** · High — Registration auto-logs the user in and mints a session
  cookie immediately; the use case says a fresh account is inactive and the guest
  stays unauthenticated until the activation link is clicked.
  `auth.service.ts:161-183`, `auth.controller.ts:57-62`.
- **NOT IMPLEMENTED** · Medium — No application-owned activation endpoint or
  expired/invalid-link handling (Extensions 8a, 8b); activation relies entirely on
  Firebase's out-of-band verification link. `auth.service.ts:151-153`.
- **BEYOND SPEC** · Medium — A display-name length cap (`DISPLAY_NAME_MAX = 80`)
  and non-empty-trimmed rule are enforced; the use case specifies no display-name
  constraint. `auth.service.ts:68,94`.

### UC-01-02 — Log In to the Platform

- **CONTRADICTS** · High — No distinct suspended-account path (Extension 4d); a
  Firebase-disabled account is folded into `INVALID_CREDENTIAL_CODES`, shows the
  generic bad-credentials message, and increments the lockout counter.
  `firebase-auth-rest-client.ts:22-27,61-63`, `auth.service.ts:204-211`.
- **CONTRADICTS** · Medium — The use case's Success End is "the user is on their
  personal dashboard"; `/dashboard` exists but is a placeholder, not a dashboard
  of enrolled courses. `apps/web` `dashboard.component.ts`.
- **BEYOND SPEC** · Low — 60-second throttling on resend-verification and
  password-reset (`TOO_MANY_REQUESTS`); never specified.
  `auth-attempts.repository.ts:11,117-148`.

### UC-01-03 — Manage User Profile

- **NOT IMPLEMENTED** · High — The entire use case is unbuilt: no profile page or
  route, no update endpoint (`/auth/me` is read-only), no profile-picture upload,
  no change-email/change-password flow. The `users/{uid}` document has no
  `biography` or `profilePicture` fields. `auth.service.ts:127-134`.

### UC-01-04 — Request Instructor Role

- **CONTRADICTS** · High — The use case specifies an apply-and-review model
  (statement of intent, pending application, admin queue, approve/decline emails).
  None of it exists; the only mechanism is `InstructorRoleGuard` checking a custom
  claim assigned out-of-band. `instructor-role.guard.ts:10`.

---

## EP-02 — Course Authoring

**Drift: Moderate.** The CRUD core (courses, modules, lessons, reorder) and the
publish state machine are faithful in spirit, but several material divergences
exist and the publish slice is over-built relative to its use case.

### UC-02-01 — Create a New Course

- **NOT IMPLEMENTED** · High — No `coverImage` field anywhere (`Course` model,
  `CreateCourseDto`, the create form); the use case lists it as an optional create
  field with its own validation extension (5c). README confirms cover image is
  deferred. `libs/shared-data-models/src/lib/course.ts:18-31`,
  `dto/create-course.dto.ts:10-31`.
- **CONTRADICTS** · Low — Extensions 5a/5b specify exact error copy ("Title must
  be 100 characters or fewer."); the API returns raw class-validator messages.
  `courses.exception-filter.ts:75-85`.

### UC-02-02 — Add and Manage Modules

- **CONTRADICTS** · Medium — `addModule()` prompts for a title via `window.prompt`
  and aborts if empty; the use case says the system creates a module with a
  default title. `course-editor-page.component.ts:134-142`, `create-module.dto.ts:3-7`.
- **BEYOND SPEC** · Low — A `STALE_REORDER` 409 conflict path for concurrent
  reorders; the use case never anticipates a reorder conflict.
  `courses.controller.ts:121-128`, `courses.service.ts:130-141`.

### UC-02-03 — Add and Manage Lessons

- **BEYOND SPEC** · Medium — Lesson deletion cascades to delete the lesson's video
  and all attached materials; the use case says other content is unaffected.
  `courses.service.ts:172-178`.
- **CONTRADICTS** · Low — Lesson description is capped at 2000 characters; the use
  case states "an optional description" with no cap. `create-lesson.dto.ts:11`.

### UC-02-04 — Publish or Unpublish a Course

- **RENAMED/RESHAPED** · Low — Publishing belongs to EP-02 per the use-case file,
  but the README and controller comments label the publish gate "EP-03 slice D".
  `README.md:7,121`, `courses.controller.ts:175`.
- **BEYOND SPEC** · Medium — A separate non-mutating `GET .../publish-eligibility`
  preview endpoint and a live eligibility panel; the use case describes only a
  single publish action. `courses.controller.ts:177-181`, `publish.service.ts:45-71`.
- **BEYOND SPEC** · Medium — An `Archived → Draft` restore transition
  (`POST .../restore`) and `publishedAt`/`archivedAt` model fields beyond the
  written flow; a `COURSE_ARCHIVED` 409 guard not in the use case.
  `publish.service.ts:99-119`, `course.ts:27-28`.
- **NOT IMPLEMENTED** · Low — "Existing enrolled students retain access" and "no
  new enrolments" (Extensions 2a/2b) are unenforceable — no enrolment model exists
  (EP-05 deferred).

---

## EP-03 — Video Management and DRM

**Drift: Major (architectural).** The use cases were written around a full
commercial multi-DRM architecture; the implementation is a deliberately
scoped-down HLS + AES-128 pipeline gated by Firebase session cookies and signed
segment URLs. README's "EP-03 slices A/B/C/D" framing accurately describes what
shipped; the use cases significantly overstate it.

### UC-03-01 — Upload a Video to a Lesson

- **CONTRADICTS** · Medium — Formats are validated by MIME type only; no H.264/H.265
  codec enforcement, and the error text drops the codec qualifier.
  `libs/shared-data-models/src/lib/video.ts:10-14`,
  `libs/web-video/src/lib/upload/video-upload.service.ts:59-61`.
- **CONTRADICTS** · Medium — Replacing an existing lesson video is blocked
  (`LessonAlreadyHasVideoException`); the use case (Ext 1a) describes a replace
  flow. `video.service.ts:91`.
- **NOT IMPLEMENTED** · High — No in-app or email notification on processing
  completion or upload failure (steps 9-10, Ext 7a); status is surfaced by client
  polling instead. `libs/api-courses/src/lib/video/` (no notification module).

### UC-03-02 — Transcode an Uploaded Video

- **CONTRADICTS** · High — Output is HLS-only (`type: 'HLS'`, `container: 'ts'`);
  the use case requires both HLS and MPEG-DASH (`.mpd`).
  `transcoder/transcoder-job.builder.ts:19,46,83-94`.
- **CONTRADICTS** · Medium — Renditions are filtered to `height <= sourceHeight`,
  so a sub-1080p source yields fewer than the four mandated resolutions.
  `transcoder/transcoder-job.builder.ts:52-58`.
- **NOT IMPLEMENTED** · Low — Source is kept in a normal bucket, not "cold
  storage"; no transcode-failure notification or backlog monitoring.
  `video.service.ts:102`.

### UC-03-03 — Encrypt Video with DRM

- **CONTRADICTS** · High — The use case specifies CENC/AES-CTR (Widevine +
  PlayReady) and CBCS (FairPlay) with `.mpd` ContentProtection/PSSH and FairPlay
  `EXT-X-KEY`. The implementation uses plain HLS AES-128 with a single 16-byte
  key — no CENC, CBCS, Widevine, PlayReady, or FairPlay.
  `transcoder/transcoder-job.builder.ts:95-100`, `video.service.ts:159`.
- **CONTRADICTS** · Medium — The key is stored base64-encoded in a Firestore
  `videoKeys/{keyId}` document, not in a key-management service.
  `libs/shared-data-models/src/lib/video.ts:53-58`, `playback/key.service.ts:14-21`.
- **RENAMED/RESHAPED** · Medium — There is no discrete encryption step; the AES
  key is generated up front and handed to the transcoder job, so transcoding and
  encryption are one combined operation. `video.service.ts:159-187`.

### UC-03-04 — Play a DRM-Protected Video

- **NOT IMPLEMENTED** · High — No short-lived playback token and no DRM license
  server; playback is authorized per-request by `EnrollmentOrOwnerGuard` using the
  session cookie. `playback/playback.controller.ts:17-24`.
- **NOT IMPLEMENTED** · High — The primary actor is a Student gated on enrolment,
  but the guard admits only the video owner; the enrolled-student branch is a
  `TODO(EP-06)`. `playback/enrollment-or-owner.guard.ts:31-37`.
- **RENAMED/RESHAPED** · Low — No Encrypted Media Extensions / CDM; the AES-128 key
  is served over a credentialed endpoint into an XHR context.
  `playback/playback.controller.ts:49-56`, `playback/manifest.rewriter.ts:67-70`.

### UC-03-05 — Manage Video Storage

- **NOT IMPLEMENTED** · High — The entire use case is unbuilt: no admin storage
  panel, no usage metrics, no soft-delete / 30-day retention / restore, no
  disk-usage alerts. `delete()` hard-deletes source and output objects
  immediately. `video.service.ts:230-249`.

---

## EP-04 — Lesson Materials

**Drift: Moderate.** UC-04-01 (attach/rename/remove) is faithful in substance.
UC-04-02 (student download) is effectively unbuilt for its stated actor.

### UC-04-01 — Attach Materials to a Lesson

- **BEYOND SPEC** · Medium — A three-call upload protocol (`upload-url` → direct
  `PUT` to signed storage URL → `complete`) the use case never mentions, which
  describes a single upload-and-validate step.
  `libs/api-courses/src/lib/materials/materials.controller.ts:50,80`.
- **RENAMED/RESHAPED** · Medium — The use case places the materials list "below
  the video player on the lesson page"; there is no student lesson page — the list
  renders only inside the course editor's `lesson-item` component.
  `libs/web-courses/src/lib/components/lesson-item/lesson-item.component.html:33`.
- **CONTRADICTS** · Low — `remove` does not check material state and silently
  swallows storage-delete failures, risking an orphaned object.
  `materials/materials.service.ts:145-152`.

### UC-04-02 — Download Lesson Materials

- **CONTRADICTS** · High — The primary actor is an enrolled student, but
  `MaterialAccessGuard` permits only the course owner; enrolled-student download is
  deferred to EP-06. The use case's happy path is unbuilt for its actor.
  `materials/material-access.guard.ts:28-39`.
- **NOT IMPLEMENTED** · High — No student-facing UI reaches this use case; the
  materials list with Download buttons exists only in the course editor.
- **CONTRADICTS** · Medium — The 15-minute signed-URL TTL is an env-configurable
  default (`LEARNWREN_MATERIALS_DOWNLOAD_URL_TTL_SEC`), not a fixed rule.
  `materials/materials.config.ts:53`.
- **NOT IMPLEMENTED** · Medium — No expired-URL detection or download retry
  (Ext 4a). `libs/web-courses/src/lib/materials/materials-list.component.ts:112-125`.

---

## EP-05 — Course Discovery and Enrollment

**Drift: Deferred — entirely unbuilt.** The README's "deferred" claim is accurate.
There is no catalogue, search, course-detail, or enrolment surface: the only
listing endpoint returns the caller's *own* courses, not a public catalogue
(`courses.controller.ts:60-63`); there are no enrolment endpoints, service, or
repository; the web app has no discovery routes.

- **BEYOND SPEC / model-ahead-of-use-case** · Medium — `Enrollment` and
  `LessonProgress` interfaces are defined in
  `libs/shared-data-models/src/lib/enrollment.ts` and re-exported from `index.ts`,
  with no repository, service, or consumer behind them. An inert contract that
  overstates readiness.

Unbuilt use cases: UC-05-01 Browse the Catalogue · UC-05-02 Search · UC-05-03 View
Course Detail · UC-05-04 Enrol · UC-05-05 Unenrol.

---

## EP-06 — Learning Experience

**Drift: Deferred — entirely unbuilt.** No progress-tracking, lesson-completion,
resume, or course-outline behavior exists. Two honest, well-commented forward
hooks exist in shipped epics:

- **Low** — `EnrollmentOrOwnerGuard` is named for "enrolment or owner" but grants
  owner-only access; the enrolled-student branch is a `TODO(EP-06)`.
  `playback/enrollment-or-owner.guard.ts:31-35`.
- **Low** — `MaterialAccessGuard` is an owner-only stub with a doc-comment stating
  "EP-06 will widen this to enrolled students". `materials/material-access.guard.ts:33-37`.

Unbuilt use cases: UC-06-01 Watch a Lesson Video · UC-06-02 Mark a Lesson Complete
· UC-06-03 Resume Learning · UC-06-04 Navigate the Course Outline.

---

## Recommendations

1. **Reconcile the DRM architecture story (highest priority).** Decide whether the
   AES-128 HLS pipeline is the intended end state or an interim step. Update
   UC-03-03/04/05 and confirm `docs/epics/TECHNICAL_ARCHITECTURE.md` reflects the
   shipped design — CLAUDE.md requires architecture changes to be spec-led.
2. **Capture the five undocumented behavioral changes** (see the table above) in
   the use cases or the design specs so the spec stops contradicting the code.
3. **Mark deferred use cases as deferred** in `docs/use-cases/` (EP-05, EP-06,
   UC-01-03, UC-01-04, UC-03-05, plus cover image in UC-02-01) so readers do not
   mistake them for current MVP behavior.
4. **Re-label the publish gate** consistently — it is UC-02-04 (EP-02), not
   "EP-03 slice D".
5. **Decide on the `Enrollment`/`LessonProgress` types** — either keep them with a
   comment that they are forward declarations, or remove them until EP-05/06 work
   begins.
