# Specification Drift Report

> Generated 2026-05-21; incrementally reconciled as slices shipped (last update
> 2026-05-29). Compares the frozen Cockburn use cases in `docs/use-cases/` against
> the current implementation in `apps/` and `libs/`.

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
| EP-01 — User Identity & Access | 4 | **Partial (2026-05-29)** | UC-01-01/02 built; UC-01-03 fully implemented — Slices A–D shipped (text profile 2026-05-27, picture 2026-05-28, email change 2026-05-28, password change 2026-05-29); UC-01-04 submission flow shipped 2026-05-29 (admin approve/decline review shipped via US-08-03, 2026-05-29); 2 minor behavioral divergences on shipped UCs |
| EP-02 — Course Authoring | 5 | **Reconciled (2026-05-26)** | UC-02-01..05 all built; UC-02-05 (cover image) added; divergences are documented design choices |
| EP-03 — Video Management & DRM | 5 | **Reconciled (2026-05-26)** | UC-03-01..04 built as scoped-down HLS + AES-128 (intentional); UC-03-05 unbuilt (admin scope → EP-08) |
| EP-04 — Lesson Materials | 2 | **Reconciled (2026-05-26)** | UC-04-01/02 both built; UC-04-02 student download landed in `af5a928` |
| EP-05 — Course Discovery & Enrollment | 5 | **Reconciled (2026-05-22)** | UC-05-01..05 all built across Slice A (discovery) and Slice B (enrolment) |
| EP-06 — Learning Experience | 4 | **Reconciled (2026-05-26)** | UC-06-01..04 all built across Slices A–D; module/course rollups deferred post-MVP |
| EP-08 — Platform Administration | — | **Reconciled (2026-07-17)** | US-08-01 (Manage Users, 2026-06-09), US-08-02 (Manage Categories, 2026-07-10), US-08-03 (Review Instructor Applications, 2026-05-29), and US-08-04 (Monitor Platform Health, 2026-07-17) all shipped — EP-08 fully built |

### Three kinds of drift

1. **Scope drift — expected and documented.** EP-05/06 deferred,
   enrolled-student paths stubbed (`TODO(EP-06)`). The README is honest
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

**Drift: Moderate (reconciled 2026-05-29).** UC-01-03 is now fully built across
Slices A–D (text profile, picture, email change, password change). UC-01-04
is fully implemented — submission flow shipped 2026-05-29 and the admin
approve/decline review queue shipped via US-08-03, 2026-05-29. UC-01-01 and
UC-01-02 are built but each carries a high-severity behavioral contradiction
(below).

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

- **PARTIAL — Slice A shipped 2026-05-27.** The main success scenario (steps 1–6)
  is implemented for **text fields** (displayName + biography). The
  `/settings/profile` page is live; `PATCH /api/auth/profile` persists both fields;
  `GET /api/auth/me` now returns `biography`. See
  `docs/superpowers/specs/2026-05-27-uc-01-03-slice-a-text-profile-design.md`.
- **IMPLEMENTED — Slice B shipped 2026-05-28.** Extension 3a (profile picture
  upload/replace/remove) is wired up: JPEG/PNG ≤ 2 MB, minimum 256×256, auto-cropped
  and re-encoded to a canonical 512×512 JPEG. `users/{uid}.profilePicture` holds the
  storage URL; the avatar surfaces in the header chip, on course cards, and on the
  course-detail instructor card (which also renders biography). See
  `docs/superpowers/specs/2026-05-28-uc-01-03-slice-b-profile-picture-design.md`.
- **IMPLEMENTED — Slice C shipped 2026-05-28.** Extension 3b (email-address change
  with re-verification flow) is wired up: `POST /api/profile/email` requires the
  current password (re-auth), validates the new address, and sends a Firebase
  `generateVerifyAndChangeEmailLink` to the new address; `POST /api/profile/email/confirm`
  (invoked from the unguarded `/settings/profile/email-changed` landing page) syncs
  the Firestore email mirror, revokes refresh tokens, and clears the session — the
  user signs in with the new address. Typed errors: `EMAIL_INVALID`, `EMAIL_UNCHANGED`,
  `CURRENT_PASSWORD_INVALID` (400), `EMAIL_CHANGE_FAILED` (500). See
  `docs/superpowers/specs/2026-05-28-uc-01-03-slice-c-email-change-design.md`.
  **Deliberate divergence:** unlike registration (which uses an enumeration-resistant
  generic error), the email-change endpoint returns a specific `EMAIL_ALREADY_IN_USE`
  (409) — standard, expected UX for an authenticated self-service email change where
  exposing whether an address is taken is not a privacy risk.
- **IMPLEMENTED — Slice D shipped 2026-05-29.** Extensions 3c / 3c-3a / 3c-4a
  (password change with current-password re-authentication) are now wired up:
  `POST /api/profile/password` requires the current password (re-auth via
  Firebase REST API), validates the new password against the registration
  complexity policy (12+ chars, upper, lower, digit, special), calls
  `updateUser({ password })`, sends a password-changed notification email, and
  revokes all refresh tokens — force re-login on all devices. Typed errors:
  `CURRENT_PASSWORD_INVALID` (400), `NEW_PASSWORD_WEAK` (400, with unmet
  requirements list), `PASSWORD_CHANGE_FAILED` (500). See
  `docs/superpowers/specs/2026-05-29-uc-01-03-slice-d-password-change-design.md`.
  **Deliberate addition beyond UC text:** `PASSWORD_UNCHANGED` (400) — the new
  password must differ from the current one; this guard is not specified in the
  UC but is standard, expected UX for a self-service credential change (mirrors
  the reasoning for `EMAIL_UNCHANGED` in Slice C / `EMAIL_ALREADY_IN_USE`
  being surfaced specifically rather than a generic error).

### UC-01-04 — Request Instructor Role

- **PARTIAL — Submission flow shipped 2026-05-29.** The Student-only "Become an
  Instructor" section on `/settings/profile` (main success scenario steps 1–8 +
  extensions 2a / 2b / 6a) is wired end to end. Submitting persists a `PENDING`
  document in the new `instructorApplications/{uid}` Firestore collection; the
  form swaps to an "under review" card that persists across reload. Typed errors:
  `ALREADY_INSTRUCTOR` (409), `INSTRUCTOR_APPLICATION_EXISTS` (409),
  `INSTRUCTOR_APPLICATION_INVALID` (400). See
  `docs/superpowers/specs/2026-05-29-uc-01-04-instructor-role-request-design.md`.
- **IMPLEMENTED — US-08-03 shipped 2026-05-29.** The asynchronous post-condition of
  UC-01-04 (admin review queue, approve/decline actions, decision emails) is now built.
  An ADMIN visits `/admin/instructor-applications` and sees the pending queue;
  **Approve** grants the `INSTRUCTOR` role (requires verified email) and resolves the
  application to `APPROVED`; **Decline** marks it `DECLINED` and allows re-application.
  Both actions send a best-effort decision email. Scope cuts: pending-only queue (no
  history view), no decline reason. ADMINs are provisioned via
  `pnpm tools:promote-to-admin <email>`. CLI promotion via
  `pnpm tools:promote-to-instructor <email>` also resolves the application. See
  `docs/superpowers/specs/2026-05-29-us-08-03-review-instructor-applications-design.md`
  and `docs/superpowers/plans/2026-05-29-us-08-03-review-instructor-applications.md`.
- **BEYOND SPEC** · Low — `INSTRUCTOR_APPLICATION_EXISTS` blocks a re-submit when
  a pending application is already on record; the use case does not specify this
  guard explicitly (it is implied by the review model). `instructor-application.service.ts`.

---

## EP-02 — Course Authoring

**Drift: Moderate.** The CRUD core (courses, modules, lessons, reorder) and the
publish state machine are faithful in spirit, but several material divergences
exist and the publish slice is over-built relative to its use case.

### UC-02-01 — Create a New Course

- **RECONCILED** · 2026-05-26 — UC-02-01 cover-image bullet removed from create-form; new UC-02-05 documents the editor-only upload/replace/remove flow. `Course.coverImageUrl` is set via `PUT /api/courses/:cid/cover` (`libs/api-courses/src/lib/cover/`).
- **CONTRADICTS** · Low — Extensions 5a/5b specify exact error copy ("Title must
  be 100 characters or fewer."); the API returns raw class-validator messages.
  Validation rendering now lives in the shared `respondValidation` /
  `VALIDATION_FAILED` path in `libs/api-http-errors/src/lib/exception-response.ts`
  (the per-feature filters delegate to it as of 2026-05-29).

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

**Drift: Reconciled (2026-05-26).** UC-04-01 (attach/rename/remove) is faithful in
substance. UC-04-02 (student download) is now implemented — see
`docs/superpowers/specs/2026-05-26-lesson-materials-student-download-design.md`.
`MaterialAccessGuard` was widened to `owner OR active enrolment on a PUBLISHED
course`, and the learn page now renders a materials list with per-row Download
buttons. Ext 4a (auto-retry on expired URL) and ext 4b (auto-removal of stale
rows) are deliberate scope cuts; per-row error copy + a manual Retry handle those
cases. The previously listed UC-04-02 drifts below are stale and resolved.

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

**Drift: Reconciled (2026-05-22).** All five UCs are now built across two slices.
Slice A shipped UC-05-01..03 (browse, search, course-detail) — see
`docs/superpowers/specs/2026-05-22-course-discovery-slice-a-design.md`.
Slice B shipped UC-05-04..05 (enrol, unenrol with 90-day progress retention) — see
`2026-05-22-ep05-slice-b-enrolment-design.md`. The previously listed forward-hook
drifts (inert `Enrollment` / `LessonProgress` types, missing endpoints) are now
stale and resolved.

---

## EP-06 — Learning Experience

**Drift: Reconciled (2026-05-26).** All four UCs ship across four vertical slices on
2026-05-25.

- **UC-06-01 — Watch a Lesson Video (Slice A).** Enrolled students (and the course
  owner) land on `/learn/:cid/:lid` via the **Start Learning** button on the course
  detail page and watch the lesson video in the existing hls.js player. See
  `docs/superpowers/specs/2026-05-25-ep06-slice-a-student-playback-design.md`. A new
  course-scoped `LessonEnrollmentOrOwnerGuard` gates the new
  `/api/learn/courses/:cid/lessons/:lid` endpoint.
- **UC-06-02 — Mark a Lesson Complete (Slice B).** Enrolled students click
  **Mark as Complete**; the API writes `completedAt` on their per-lesson progress
  (idempotent, transactional). The page swaps the button for a "✓ Completed" pill that
  persists across reload and across a `WITHDRAWN → ACTIVE` re-enrolment. See
  `2026-05-25-ep06-slice-b-mark-complete-design.md`. Module/course completion
  rollups and the "Course Completed" badge (UC-06-02 extensions 3a/3b) are deliberate
  scope cuts.
- **UC-06-03 — Resume Learning (Slice C).** Opening a lesson is tracked per-enrolment;
  the course-detail page surfaces **Continue Learning** (falling back to **Start
  Learning** for new enrolments and owners); the player auto-saves every ~15s and
  flushes on pause / `pagehide` / tab-hidden via `navigator.sendBeacon`. Position
  writes are idempotent and monotonic. See
  `2026-05-25-ep06-slice-c-resume-learning-design.md`.
- **UC-06-04 — Navigate the Course Outline (Slice D).** The lesson player renders a
  collapsible left sidebar (desktop) or drawer (mobile) listing every module and
  lesson; the active row is highlighted; completed rows carry a checkmark;
  non-`READY` rows surface an inline notice. Clicking a different lesson flushes any
  in-flight playback position and navigates. See
  `2026-05-25-ep06-slice-d-course-outline-design.md`. Post-MVP follow-up on
  2026-05-26 fixed an Angular route-reuse bug (`bf7ea20`): the page now subscribes to
  `ActivatedRoute.paramMap` instead of reading the snapshot, so outline-driven nav
  re-fetches the LessonView correctly.

The previously listed forward-hook drifts (TODO(EP-06) guards, deferred UCs) are now
stale and resolved.

---

## EP-08 — Platform Administration

**Drift: Reconciled (2026-07-17).** All four EP-08 user stories are now implemented:
US-08-03 (Review Instructor Applications, 2026-05-29), US-08-01 (Manage Users,
2026-06-09), US-08-02 (Manage Categories, 2026-07-10), and US-08-04 (Monitor
Platform Health, 2026-07-17).

### US-08-03 — Review Instructor Applications

- **IMPLEMENTED — shipped 2026-05-29.** An ADMIN visits `/admin/instructor-applications`
  (reached via the **Admin** nav link, which is visible only to ADMINs) and sees the
  pending instructor-application queue. Each row shows the applicant's display name,
  email, statement of intent, areas of expertise, and submission date. The ADMIN clicks
  **Approve** or **Decline**:
  - **Approve** — grants the `INSTRUCTOR` Firebase custom claim, updates
    `users/{uid}.role`, resolves the `instructorApplications/{uid}` document to
    `APPROVED` (with `resolvedAt`), and sends a best-effort approval email. Requires the
    applicant's email to be verified; returns `APPLICANT_NOT_VERIFIED` otherwise.
  - **Decline** — marks the application `DECLINED`; the applicant may re-apply.
    A best-effort decline email is sent.
  - The applicant must sign out and back in for a role grant to take effect.
  - `pnpm tools:promote-to-admin <email>` provisions new ADMINs.
  - `pnpm tools:promote-to-instructor <email>` also resolves a pending application to
    `APPROVED` (unchanged from before this feature).
- **Deliberate scope cuts** — the queue shows only `PENDING` applications (no
  approved/declined history view); no decline-reason field.
- Design spec: `docs/superpowers/specs/2026-05-29-us-08-03-review-instructor-applications-design.md`
- Implementation plan: `docs/superpowers/plans/2026-05-29-us-08-03-review-instructor-applications.md`

### Other EP-08 user stories

- **US-08-01 Manage Users** — **IMPLEMENTED — shipped 2026-06-09.**
- **US-08-02 Manage Categories** — **IMPLEMENTED — shipped 2026-07-10.**
- **US-08-04 Monitor Platform Health** — **IMPLEMENTED — shipped 2026-07-17.** An ADMIN
  opens `/admin/health` (via the **Health** nav link) and sees four live service rows
  (web server/API, database, transcoding queue, object storage), three stats (storage
  used, registered users, published courses), and up to two alerts
  (`TRANSCODE_BACKLOG` when pending jobs exceed 10; `STORAGE_QUOTA` when usage exceeds
  80% of the optional `LEARNWREN_STORAGE_QUOTA_GB` quota). The transcoding-queue row's
  status is derived from whether the pending-count query succeeds, not a separate
  adapter reachability check. Design spec:
  `docs/superpowers/specs/2026-07-17-us-08-04-platform-health-design.md`. This closes
  EP-08 (Platform Administration) and the entire written spec.

---

## Recommendations

1. **Reconcile the DRM architecture story.** ✅ Addressed 2026-05-26 — the EP-03
   DRIFT note in `docs/use-cases/03-video-management-and-drm.md` and the EP-03
   section above now declare the scoped-down HLS + AES-128 + session-cookie pipeline
   the intended end state for the self-hosted small-community MVP. `docs/epics/
   TECHNICAL_ARCHITECTURE.md` should still be cross-checked against the shipped
   design.
2. **Capture the undocumented behavioral changes** in the use cases or the design
   specs so the spec stops contradicting the code. Partially addressed 2026-05-26:
   the EP-01 and EP-02 DRIFT notes now call out the divergences (registration auto-
   auths pre-verification; suspended-account error code; module-title prompt; lesson-
   delete cascade; publish-gate eligibility-preview + restore). The 5% upload-size
   tolerance (`SIZE_TOLERANCE = 1.05`) is still undocumented in the UCs.
3. **Mark unbuilt use cases.** ✅ Addressed 2026-05-26; updated 2026-05-29 —
   **UC-01-03 (Manage Profile) is now fully built** across Slices A–D (text fields
   2026-05-27, profile picture 2026-05-28, email change 2026-05-28, password change
   2026-05-29 — the ext 3c sub-flow that was previously deferred). **UC-01-04
   (Request Instructor Role) is now fully built**: submission flow shipped 2026-05-29
   and the admin approve/decline review (US-08-03) shipped 2026-05-29. The only use
   case that remains entirely unbuilt is **UC-03-05 (Manage Video Storage)**, called
   out in the EP-03 DRIFT note. EP-05 and EP-06 are fully built.
4. **Re-label the publish gate** consistently — it is UC-02-04 (EP-02), not
   "EP-03 slice D". Two references remain in this report (above); historical plan
   docs under `docs/superpowers/plans/` are post-implementation summaries and need
   not be rewritten.
5. **Decide on the `Enrollment`/`LessonProgress` types.** ✅ Resolved by EP-05
   Slice B — `Enrollment` and `LessonProgress` are now load-bearing with a real
   repository, service, and HTTP surface.
