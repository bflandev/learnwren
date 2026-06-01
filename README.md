# Learn Wren: Open-Source Educational Video Platform

Learn Wren is a self-hosted, open-source educational platform as a platform for creators. It enables any registered user to create and publish video-based courses organised into modules and lessons. Courses are consumed by enrolled students who can stream protected video content and download supplementary lesson materials. The platform is designed for small communities — such as a group of friends, a company, or a non-profit — and can be deployed on commodity hardware or a cloud server. All video content is protected by industry-standard Digital Rights Management (DRM) to prevent unauthorised redistribution.

> [!NOTE]
> **PROJECT STATUS: ACTIVE DEVELOPMENT**
> Built in vertical slices. What is wired up today, end to end:
>
> - **EP-01 Identity & access** — register, email-verification gate, login, logout, brute-force lockout + email unlock, logged-out password reset, session cookie, protected routes. **Text profile editing** (displayName + biography) via `/settings/profile` shipped 2026-05-28 (UC-01-03 Slice A). **Profile picture upload** (JPEG/PNG, ≤ 2 MB, auto-cropped to 512×512) shipped 2026-05-28 (UC-01-03 Slice B); the avatar surfaces in the header chip, on course cards, and on the course-detail instructor card (which also renders the instructor's biography). **Email address change** shipped 2026-05-28 (UC-01-03 Slice C, ext 3b): `POST /api/profile/email` re-authenticates with the current password, then sends a verification link to the NEW address; `POST /api/profile/email/confirm` (called from the unguarded `/settings/profile/email-changed` landing page after the link is clicked) syncs the Firestore mirror, revokes refresh tokens, and clears the session — the user signs in with the new address. **Password change** shipped 2026-05-29 (UC-01-03 Slice D, ext 3c): `POST /api/profile/password` re-authenticates with the current password, validates the new password against the same complexity policy as registration (12+ chars, upper, lower, digit, special), updates the credential, sends a password-changed notification email, and revokes refresh tokens — the user is signed out of all devices and signs back in with the new password. **UC-01-03 is now fully implemented.** **Instructor role request (submission) shipped 2026-05-29 (UC-01-04 submission slice)**: a Student on `/settings/profile` sees a "Become an Instructor" section; submitting a statement of intent and areas of expertise (free-text, ≤ 2000 chars) persists a `PENDING` document in `instructorApplications/{uid}` and swaps the form for an "under review" card that persists across reload. Re-submission is blocked (`INSTRUCTOR_APPLICATION_EXISTS`); the `pnpm tools:promote-to-instructor <email>` CLI now resolves the pending application to `APPROVED` (with `resolvedAt`) after flipping the role. **Admin review of instructor applications shipped 2026-05-29 (US-08-03)**: this is the first administrator surface. An ADMIN navigates to `/admin/instructor-applications` via the **Admin** nav link (visible only to ADMINs) and sees the pending queue — applicant name, email, statement, expertise, and submission date. Clicking **Approve** grants the `INSTRUCTOR` role (Firebase custom claim + `users` doc update) and resolves the application to `APPROVED`; clicking **Decline** marks it `DECLINED` so the applicant may re-apply. Approval requires the applicant's email to be verified (returns `APPLICANT_NOT_VERIFIED` otherwise); both actions send the applicant a best-effort decision email. The applicant must sign out and back in for a role change to take effect. Scope cuts: pending-only queue (no approved/declined history view), no decline reason. ADMINs are provisioned via `pnpm tools:promote-to-admin <email>`. Approval also remains available via `pnpm tools:promote-to-instructor <email>`.
> - **EP-02 Course authoring** — instructor role promotion (CLI), REST course CRUD, modules and lessons, drag-and-drop reorder.
> - **EP-03 Video & DRM** — resumable upload (MP4 / MOV / MKV ≤ 10 GB), GCP Transcoder → AES-128 HLS, owner playback in the lesson editor (hls.js, native HLS on Safari/iOS), publish / unpublish / archive / restore gate with structured eligibility feedback. **Lesson captions (WebVTT) shipped 2026-05-30**: instructors upload a WebVTT caption file (≤ 256 KB) per lesson video; students enable captions via the player's native CC button (off by default). One English track per lesson this release; multi-language is deferred. Advances EP-09 US-09-03 (accessibility).
> - **EP-04 Lesson materials** — attach / rename / remove supplementary files (PDF, DOCX, PPTX, XLSX, TXT, ZIP ≤ 50 MB each); owners **and enrolled students on PUBLISHED courses** download via short-lived signed URL; the learn page surfaces a materials list with per-row Download buttons.
> - **EP-05 Course discovery & enrollment** — public catalogue with category/difficulty filters, Newest / Alphabetical / Most Popular sort, pagination, keyword search; public course-detail page; logged-in students enroll and leave; guests who click Enroll are auto-enrolled after login.
> - **EP-06 Slice A: Student lesson playback** — enrolled students (and the course owner) navigate from the course detail page via **Start Learning** to `/learn/:cid/:lid` and watch the lesson video in the existing hls.js player.
> - **EP-06 Slice B: Mark a lesson complete** — enrolled students click **Mark as Complete** on the lesson page; the API persists `completedAt` on their per-lesson progress; the button swaps to a "✓ Completed" pill that persists across reload and across a `WITHDRAWN → ACTIVE` re-enrolment. Per-lesson only; module / course rollups and the course-outline panel are deferred.
> - **EP-06 Slice C: Resume Learning** — opening a lesson is tracked per-enrolment; the course-detail page surfaces **Continue Learning** (falling back to **Start Learning** for new enrolments and owners); the lesson player auto-saves position every ~15 s, flushes on pause / `pagehide` / tab hidden via `navigator.sendBeacon`, and resumes within 5 s on revisit. Position writes are idempotent and monotonic (out-of-order beacons cannot rewind progress).
> - **EP-06 Slice D: Course Outline Panel** — the lesson player renders a collapsible left sidebar (desktop) or drawer (mobile) listing every module and lesson in the course; the active lesson is highlighted; completed lessons carry a checkmark; lessons whose video is still processing surface an inline notice; clicking a different lesson navigates and flushes any in-flight playback position.
> - **EP-07 Slice A: Enrolled students roster (US-07-01)** — a course owner opens **Students** from the course editor to reach `/courses/:cid/students`, a table of the course's ACTIVE enrollees showing display name, email, enrollment date, and progress (completed ÷ total lessons). Sortable by enrollment date and progress; exportable as an RFC-4180 CSV generated in-browser. Owner-only (`GET /api/courses/:cid/students`, `CourseOwnerGuard`). Analytics (US-07-02) and new-module notifications (US-07-03) are deferred to later EP-07 slices.
>
> - **Course cover image upload** — instructors can upload a cover from the course editor (JPEG or PNG, ≥1280×720, ≤10 MB); uploads are auto-resized to a canonical 1920×1080 JPEG. Replace or remove from the same panel.
>
> Not built yet: module / course completion rollups (rest of EP-06), the rest of the instructor dashboard (EP-07 Slices B–C: analytics, new-module notifications), remaining EP-08 admin stories (Manage Users, Manage Categories, Monitor Platform Health). US-08-03 (admin instructor-application review) is shipped. `docs/USER_GUIDE.md` is the authoritative end-to-end feature matrix.

---

## Monorepo Layout

This is an [Nx](https://nx.dev) workspace using pnpm. It contains an Angular SPA, a NestJS API, their Playwright E2E suites, and a shared TypeScript library.

```
learnwren/
├── apps/
│   ├── web/            # Angular SPA — root `/` redirects to `/catalog`
│   ├── web-e2e/        # Playwright E2E tests for web
│   ├── api/            # NestJS API — exposes GET /api/health
│   └── api-e2e/        # Playwright E2E tests for api
├── libs/
│   ├── shared-data-models/  # TS types shared between web and api
│   ├── api-firebase/        # NestJS module wrapping firebase-admin (env-driven)
│   ├── api-auth/            # NestJS auth module (register, login, lockout, verify, reset, unlock, guard)
│   ├── api-courses/         # NestJS course/module/lesson, video pipeline, publish gate, materials, catalog, enrollment
│   ├── web-auth/            # Angular auth lib (signal-based service, guard, pages)
│   ├── web-courses/         # Angular instructor course editor (drag-and-drop modules/lessons, materials)
│   ├── web-video/           # Angular video upload + hls.js owner playback
│   ├── web-catalog/         # Angular standalone components for public course discovery (catalogue, search, course detail)
│   ├── web-enrollment/      # Angular enroll/leave panel for the course detail page
│   ├── web-learn/           # Angular standalone student lesson player page at /learn/:cid/:lid
│   ├── web-admin/           # Angular admin surface: /admin/instructor-applications queue (US-08-03)
│   └── web-ui/              # Shared Angular UI primitives (cover tones, buttons, etc.)
├── tools/
│   ├── promote-to-instructor.ts                    # CLI: promote a STUDENT to INSTRUCTOR via custom claim
│   ├── promote-to-admin.ts                         # CLI: promote a STUDENT or INSTRUCTOR to ADMIN via custom claim
│   ├── firebase-admin-init.ts                      # Shared admin-SDK bootstrap for CLI tools
│   ├── migrate-auth-2026-05-cleanup-unverified.ts  # Pre-deploy script: prune unverified accounts
│   ├── crap/                                       # CRAP score reporter (consumes Vitest coverage)
│   └── mutation/                                   # Stryker mutation-test report aggregator
└── docs/
    ├── epics/          # Product specs (epics & user stories)
    ├── use-cases/      # Cockburn-style use cases for MVP scope (EP-01..06)
    ├── superpowers/    # Design specs, plans, and post-implementation summaries
    ├── USER_GUIDE.md   # End-user / developer feature walkthrough
    ├── development.md  # Local development reference
    └── secrets.md      # 1Password vault contract and workflow
```

| Project | Type | Stack |
| :--- | :--- | :--- |
| `web` | Application | Angular 21, Tailwind, SCSS (no Firebase client SDK — auth is API-mediated) |
| `api` | Application | NestJS 11, firebase-admin, Nodemailer, Webpack |
| `shared-data-models` | Library | TypeScript types (consumed by `web` and `api`) |
| `api-firebase` | Library | NestJS module providing the firebase-admin handle + Web API key (emulator/production mode-switching) |
| `api-auth` | Library | `AuthModule`: controller, service, `FirebaseSessionGuard`, DTOs, error envelope, `AuthAttemptsRepository`, `FirebaseAuthRestClient`, `EmailTransport` |
| `api-courses` | Library | `CoursesModule`: course/module/lesson CRUD, video upload + Transcoder pipeline + HLS playback, publish-eligibility gate, lesson materials, public catalog, enrollment |
| `web-auth` | Library | Angular standalone components (`Login`, `Register`, `RegisterConfirm`, `ForgotPassword`, `Unlock`), signal-based `AuthService`, `authGuard`, interceptor |
| `web-courses` | Library | Angular instructor course editor (course list/detail, drag-and-drop modules and lessons, materials panel, publish controls) |
| `web-video` | Library | Angular resumable video upload + hls.js (or native HLS) owner playback widget |
| `web-catalog` | Library | Angular standalone components for public course discovery (catalogue, search, course detail) |
| `web-enrollment` | Library | Angular standalone `EnrollmentService` + `CourseEnrollmentPanelComponent` |
| `web-learn` | Library | Angular standalone `LearnService` + `LessonPlayerPageComponent`; the `/learn/:cid/:lid` student playback route |
| `web-admin` | Library | Angular standalone `AdminInstructorApplicationsPageComponent`; the `/admin/instructor-applications` review queue (US-08-03) |
| `web-ui` | Library | Shared Angular UI primitives (deterministic course-cover tones, etc.) consumed by `web-catalog` and `web-courses` |
| `web-e2e`, `api-e2e` | E2E suite | Playwright (api-e2e covers `/auth/**` end-to-end including lockout + Firestore rules) |

The planned production deployment targets are Firebase Hosting (web) and Firebase Cloud Functions (api), backed by Firestore, Cloud Storage, and Firebase Authentication. See [`docs/epics/TECHNICAL_ARCHITECTURE.md`](./docs/epics/TECHNICAL_ARCHITECTURE.md).

---

## Getting Started

### Prerequisites

- **Node.js 22** (LTS) — pinned in `.nvmrc`. Install with `nvm install 22 && nvm use 22` or Volta.
- **pnpm** — activate via Corepack: `corepack enable && corepack prepare pnpm@latest --activate`.
- **Java 21+** — required by the Firebase Emulator Suite. macOS: `brew install --cask temurin` (or `brew install openjdk@21`).
- **1Password CLI ≥ 2.x** — used by the secrets pipeline. macOS: `brew install --cask 1password-cli`, then `op signin` to an account with access to the `learnwren` vault. See [`docs/secrets.md`](./docs/secrets.md).

### Install

```bash
pnpm install
```

### Run (default: emulator mode)

Boot the Firebase Emulator Suite in one terminal:

```bash
pnpm emulators
```

Run both apps in parallel (Angular on `:4200`, NestJS on `:3333`) in another:

```bash
pnpm start
```

Or run them individually:

```bash
pnpm start:web   # Angular SPA on http://localhost:4200
pnpm start:api   # NestJS API on http://localhost:3333/api
```

Verify the wiring end-to-end:

```bash
curl http://localhost:3333/api/health
```

`/api/health` returns `{ status: 'ok', version, serverTime }`. No real Firebase credentials are needed for local development — both apps target the reserved `demo-learnwren` project ID against the local emulator suite.

### Try the auth flow (emulator mode)

With both `pnpm emulators` and `pnpm start` running:

1. Visit `http://localhost:4200/register`. Submit a display name, an email, and a password meeting the policy (12+ chars, upper, lower, digit, special — e.g. `Aa1!aaaaaaaa`).
2. You'll land on `/register/confirm?email=…` with a "Check your email" message and a Resend button.
3. Open the Auth emulator UI at `http://127.0.0.1:4000/auth`, find the user, and click the verification link in the inbox icon. Confirm the `users/{uid}` doc shows up in the Firestore emulator UI.
4. Visit `/login` and sign in with the same credentials → redirect to `/dashboard` showing your display name and `STUDENT` role. (Logging in before verification returns `EMAIL_NOT_VERIFIED` with a Resend affordance.)
5. To exercise the lockout: enter the right email + a wrong password three times. The third attempt returns `423` with the lockout time. Find the unlock URL in the API server logs (`ConsoleEmailTransport` prints it), open it, then sign in.
6. Click **Sign out** → redirect to `/login`. Click **Forgot password?** → submit your email → click the reset link in the Auth emulator inbox → set a new password → sign back in.

The API endpoints exposed by this slice:

| Method | Path | Purpose |
| :--- | :--- | :--- |
| `POST` | `/api/auth/register` | Creates Auth user + `users/{uid}` doc + custom claim, sends verification email, mints session cookie. |
| `POST` | `/api/auth/login` | Verifies password via Firebase REST, runs lockout + verification gate, mints `__session` cookie. |
| `POST` | `/api/auth/resend-verification` | Re-sends the verification email (60s throttle, enumeration-resistant). |
| `POST` | `/api/auth/request-password-reset` | Sends Firebase password-reset email (60s throttle, enumeration-resistant). |
| `POST` | `/api/auth/unlock` | Redeems an unlock token sent to the user when their account locks. |
| `POST` | `/api/auth/logout` | Clears the cookie and revokes refresh tokens. Always 204. |
| `GET` | `/api/auth/me` | Reads the cookie, returns `{uid, email, displayName, role, emailVerified}`. |

The API endpoints exposed by UC-01-03/UC-01-04 (profile management — session cookie required):

| Method | Path | Purpose |
| :--- | :--- | :--- |
| `PATCH` | `/api/profile` | Update `displayName` and/or `biography`. |
| `PUT` | `/api/profile/picture` | Upload or replace the profile picture (JPEG/PNG ≤ 2 MB; auto-cropped to 512×512). |
| `DELETE` | `/api/profile/picture` | Remove the profile picture. |
| `POST` | `/api/profile/email` | Re-authenticate with current password; send a verification link to the new address. |
| `POST` | `/api/profile/email/confirm` | Sync Firestore email mirror, revoke refresh tokens, clear session (called from the `/settings/profile/email-changed` landing page). |
| `POST` | `/api/profile/password` | Re-authenticate, validate new password against registration policy, update credential, send notification email, revoke refresh tokens. |
| `GET` | `/api/profile/instructor-application` | Return the caller's application status: `{ status: 'NONE' \| 'PENDING' \| 'APPROVED' \| 'DECLINED', statement?, expertise?, createdAt? }`. |
| `POST` | `/api/profile/instructor-application` | Submit `{ statement, expertise }` (both non-empty, ≤ 2000 chars); persists `PENDING` in `instructorApplications/{uid}`; blocked for existing applicants (`INSTRUCTOR_APPLICATION_EXISTS`) and for instructors/admins (`ALREADY_INSTRUCTOR`). |

The API endpoints exposed by US-08-03 (admin instructor-application review — session cookie + ADMIN role required):

| Method | Path | Purpose |
| :--- | :--- | :--- |
| `GET` | `/api/admin/instructor-applications` | List all `PENDING` instructor applications (applicant uid, name, email, statement, expertise, submitted date). |
| `POST` | `/api/admin/instructor-applications/:uid/approve` | Approve the application: grant `INSTRUCTOR` role; requires applicant's email to be verified. |
| `POST` | `/api/admin/instructor-applications/:uid/decline` | Decline the application; the applicant may re-apply. |

The API endpoints exposed by slice D (course publish gate):

| Method | Path | Purpose |
| :--- | :--- | :--- |
| `GET`  | `/api/courses/:cid/publish-eligibility` | Preview publish eligibility; returns `{ eligible, reasons }`. |
| `POST` | `/api/courses/:cid/publish`             | Transition DRAFT → PUBLISHED (atomic eligibility revalidation). |
| `POST` | `/api/courses/:cid/unpublish`           | Transition PUBLISHED → DRAFT. |
| `POST` | `/api/courses/:cid/archive`             | Transition DRAFT or PUBLISHED → ARCHIVED. |
| `POST` | `/api/courses/:cid/restore`             | Transition ARCHIVED → DRAFT. |

The API endpoints exposed by EP-04 (lesson materials):

| Method | Path | Purpose |
| :--- | :--- | :--- |
| `POST` | `/api/courses/:cid/modules/:mid/lessons/:lid/materials/upload-url` | Validate type + size; create a `PENDING_UPLOAD` material; return a signed upload URL. |
| `POST` | `/api/materials/:matId/complete` | HEAD-verify the uploaded object; transition the material to `READY`. |
| `GET`  | `/api/courses/:cid/modules/:mid/lessons/:lid/materials` | List the lesson's `READY` materials. |
| `PATCH`| `/api/materials/:matId` | Rename a material's display name. |
| `DELETE` | `/api/materials/:matId` | Remove a material (storage object + metadata). |
| `GET`  | `/api/materials/:matId/download-url` | Mint a 15-minute signed download URL. Owner OR active enrollee on a PUBLISHED course. |

The API endpoints exposed by EP-05 Slice A (course discovery — all public, no session cookie):

| Method | Path | Purpose |
| :--- | :--- | :--- |
| `GET` | `/api/catalog` | Paginated list of PUBLISHED courses; `page`, `sort`, `category`, `difficulty` query params. `sort=POPULAR` ranks by enrollment count. |
| `GET` | `/api/catalog/search` | Relevance-ranked search of PUBLISHED courses by title/description; `q`, `page` query params. |
| `GET` | `/api/catalog/:cid` | Public course detail (structure + instructor name); 404 for missing/unpublished. |

The API endpoints exposed by EP-05 Slice B (course enrollment — session cookie required):

| Method | Path | Purpose |
| :--- | :--- | :--- |
| `POST` | `/api/enrollments` | Enroll the caller in the body-supplied course (restores a withdrawn enrollment). |
| `DELETE` | `/api/enrollments/:courseId` | Unenroll the caller (soft-delete; progress retained 90 days). |
| `GET` | `/api/enrollments/:courseId` | The caller's enrollment status for that course, plus whether they own it. |

The API endpoints exposed by lesson captions (session cookie required; caption management requires `INSTRUCTOR` + `VideoOwnerGuard`; caption streaming is gated by `EnrollmentOrOwnerGuard`):

| Method | Path | Purpose |
| :--- | :--- | :--- |
| `PUT` | `/api/videos/:vid/captions` | Upload or replace the WebVTT caption track for a video (multipart `file`, ≤ 256 KB). Returns `{ language, label, updatedAt }`. |
| `DELETE` | `/api/videos/:vid/captions` | Remove the caption track (`204`). |
| `GET` | `/api/videos/:vid/captions` | Read caption metadata `{ language, label, updatedAt } \| null`. |
| `GET` | `/api/playback/captions/:vid` | Stream the `.vtt` file (`text/vtt`); `EnrollmentOrOwnerGuard` (owner or ACTIVE enrollee on a PUBLISHED course); video must be READY; `404 CAPTIONS_NOT_FOUND` when no track is uploaded. |

The API endpoints exposed by EP-06 Slices A & B (student lesson playback + mark-complete — session cookie required):

| Method | Path | Purpose |
| :--- | :--- | :--- |
| `GET` | `/api/learn/courses/:cid/lessons/:lid` | The caller's lesson view (course + lesson + video state + per-lesson progress + course outline + lesson materials); 403 unless owner or active enrollee on a PUBLISHED course; 404 if the lesson does not belong to the course. |
| `POST` | `/api/learn/courses/:cid/lessons/:lid/complete` | Mark the lesson complete for the caller. Idempotent (returns 200 with the same `completedAt` on repeat calls). 403 `NOT_ENROLLED_LESSON` for owners and for non-active enrolments. |

The API endpoints exposed by EP-07 Slice A (instructor roster — session cookie + course owner required):

| Method | Path | Purpose |
| :--- | :--- | :--- |
| `GET` | `/api/courses/:cid/students` | The course owner's roster of ACTIVE enrollees: display name, email, enrollment date, completed/total lessons, progress %. `403` for non-owners, `404` for a missing course. |

For the full auth dev workflow, the deferred items, and error-code → prose mappings, see [`docs/development.md`](./docs/development.md#auth-dev-workflow) and the design specs at [`docs/superpowers/specs/2026-05-04-auth-registration-and-login-design.md`](./docs/superpowers/specs/2026-05-04-auth-registration-and-login-design.md) and [`docs/superpowers/specs/2026-05-06-auth-hardening-design.md`](./docs/superpowers/specs/2026-05-06-auth-hardening-design.md).

#### Auth hardening (2026-05-06)

After the auth slice (registration + login), this slice adds:

- **Strict email-verification gate.** `/auth/login` returns `403 EMAIL_NOT_VERIFIED` until the user clicks the link in their verification email.
- **Brute-force lockout.** Three consecutive `INVALID_CREDENTIALS` failures lock the account for 15 minutes; the user gets an unlock email with a one-time link, or the lock auto-expires.
- **Logged-out password reset.** "Forgot password?" link on the login page; Firebase sends the templated reset email.
- **API-mediated login.** The Firebase Auth client SDK is no longer in the web bundle. `POST /auth/login` accepts `{ email, password }` and the server verifies credentials via Firebase's REST API.

The unlock email is the only one we send ourselves (via Nodemailer). Configure with `LEARNWREN_EMAIL_TRANSPORT=console|smtp` and the `SMTP_*` env vars when `smtp`.

### Run against the real Firebase project

`apps/web` and `apps/api` read `LEARNWREN_FIREBASE_TARGET` at startup; setting it to `production` flips both apps to the real `learn-wren` project. This requires the one-time prerequisites in [`docs/development.md`](./docs/development.md#real-project-mode) (1Password vault populated, service-account JSON path exported, etc.).

```bash
LEARNWREN_FIREBASE_TARGET=production pnpm secrets:run -- pnpm start
```

A single `[learnwren] Firebase target = production` warning logs at boot in each app. Hot-reloading the env var is not supported — restart the process.

### Scripts

All scripts run from the repo root and delegate to Nx.

| Command | Description |
| :--- | :--- |
| `pnpm start` | Serve `web` and `api` in parallel. |
| `pnpm start:web` | Serve the Angular SPA only. |
| `pnpm start:api` | Serve the NestJS API only. |
| `pnpm emulators` | Start the Firebase Emulator Suite (Auth, Firestore, Storage, UI). |
| `pnpm build` | Build all buildable projects to `dist/`. |
| `pnpm test` | Run all Vitest unit tests. |
| `pnpm lint` | Run ESLint across all projects. |
| `pnpm typecheck` | Type-check all projects. |
| `pnpm e2e` | Run the Playwright E2E suites (sequential). |
| `pnpm affected` | Run lint + test + build + typecheck only for projects affected by the current branch. |
| `pnpm crap` | Run coverage on the backend + selected libs and emit the CRAP-score report (`pnpm crap:coverage`, `pnpm crap:report` are split steps). |
| `pnpm mutate` | Run Stryker mutation tests for the aggregate set (`api-auth`, `api-courses`, `web-catalog`, `web-enrollment`, `web-ui`) and write the consolidated report (`pnpm mutate:<lib>` and `pnpm mutate:report` are split steps). All 15 libraries have a scoped config — run any single one with `pnpm exec stryker run stryker.<lib>.config.mjs`. |
| `pnpm tools:promote-to-instructor <email>` | Promote an email-verified STUDENT to INSTRUCTOR (custom claim + `users/{uid}` doc). Required to access the course editor; the user must sign out and back in after. |
| `pnpm tools:promote-to-admin <email>` | Promote an email-verified user to ADMIN (custom claim + `users/{uid}` doc). Required to access `/admin/**`; the user must sign out and back in after. |
| `pnpm secrets:render` | Render `.env` from `.env.tpl` via 1Password. |
| `pnpm secrets:run -- <cmd>` | Run a command with secrets injected in-memory (no `.env` written). |

To target a single project, invoke Nx directly — e.g. `pnpm nx test web`, `pnpm nx build api`, `pnpm nx lint shared-data-models`.

**Mutation testing.** All 15 libraries are under [Stryker](https://stryker-mutator.io/) mutation testing, each with a scoped `stryker.<lib>.config.mjs`, and all currently sit at or above an **80% adjusted** (equivalent-mutant-excluded) score — the bar for auth/admin code is higher (`api-auth` ~97%, `web-admin` ~92%). Per-library reports are written to [`docs/quality/`](./docs/quality/) (`mutation-report-<lib>.md`) and the consolidated report to `docs/quality/mutation-report.md`; `node tools/mutation/report.mjs <lib>` re-summarises a lib's existing run and prints a parseable `SCORE=` line. The sweep cadence and per-lib history live in `tools/mutation/state.json`.

For more detail on local development and ports, see [`docs/development.md`](./docs/development.md).

---

## Product Specifications

The product requirements are defined using the original Agile methodology, broken down into Epics and User Stories with detailed Acceptance Criteria. EP-01 through EP-06 form the MVP scope; EP-07 through EP-09 are post-MVP.

| Spec ID | Title | Description |
| :--- | :--- | :--- |
| `00` | [Product Vision](./docs/epics/00-vision-and-epics.md) | High-level vision, actors, and epic overview. |
| `01` | [User Identity and Access](./docs/epics/01-user-identity-and-access.md) | Registration, login, profiles, and role-based access control. |
| `02` | [Course Authoring](./docs/epics/02-course-authoring.md) | Creating, structuring, and publishing courses with modules and lessons. |
| `03` | [Video Management and DRM](./docs/epics/03-video-management-and-drm.md) | Uploading, transcoding, storing, and securely delivering video content. |
| `04` | [Lesson Materials](./docs/epics/04-lesson-materials.md) | Attaching, managing, and downloading supplementary course materials. |
| `05` | [Course Discovery and Enrollment](./docs/epics/05-course-discovery-and-enrollment.md) | Browsing, searching, and enrolling in courses. |
| `06` | [Learning Experience](./docs/epics/06-learning-experience.md) | Consuming course content, tracking progress, and resuming sessions. |
| `07` | [Instructor Dashboard](./docs/epics/07-instructor-dashboard.md) | Managing courses, viewing enrolled students, and monitoring engagement. |
| `08` | [Platform Administration](./docs/epics/08-platform-administration.md) | User management, content moderation, and system configuration. |
| `09` | [Non-Functional Requirements](./docs/epics/09-non-functional-requirements.md) | Performance, security, accessibility, and open-source compliance. |

Detailed Cockburn-style use cases for the MVP epics live in [`docs/use-cases/`](./docs/use-cases/).

---

## Implementation Summaries

Each shipped slice has a post-implementation summary in [`docs/superpowers/summaries/`](./docs/superpowers/summaries/) recording what was built, where it diverged from the plan, how it was verified, and what was deferred. Summaries are paired with their corresponding spec in [`docs/superpowers/specs/`](./docs/superpowers/specs/) and plan in [`docs/superpowers/plans/`](./docs/superpowers/plans/).

### Foundation

- [Initial Nx Monorepo](./docs/superpowers/summaries/2026-04-29-initial-nx-monorepo-summary.md) — 2026-04-29
- [Firebase Wiring and Secrets](./docs/superpowers/summaries/2026-04-29-firebase-wiring-and-secrets-summary.md) — 2026-04-29
- [Firebase Project Connection](./docs/superpowers/summaries/2026-04-30-firebase-project-connection-summary.md) — 2026-04-30

### EP-01 — User Identity and Access

- [Auth: Registration and Login](./docs/superpowers/summaries/2026-05-04-auth-registration-and-login-summary.md) — 2026-05-04
- [Auth Hardening](./docs/superpowers/summaries/2026-05-06-auth-hardening-summary.md) — 2026-05-06
- [UC-01-04: Instructor Role Request (submission)](./docs/superpowers/summaries/2026-05-29-uc-01-04-instructor-role-request-summary.md) — 2026-05-29

### EP-02 — Course Authoring

- [Course Authoring](./docs/superpowers/summaries/2026-05-12-course-authoring-summary.md) — 2026-05-12

### EP-03 — Video Management and DRM

- [Video: Upload (Slice A)](./docs/superpowers/summaries/2026-05-13-video-upload-slice-a-summary.md) — 2026-05-13
- [Video: Transcoding (Slice B)](./docs/superpowers/summaries/2026-05-13-video-transcoding-slice-b-summary.md) — 2026-05-13
- [Video: Playback (Slice C)](./docs/superpowers/summaries/2026-05-14-video-playback-slice-c-summary.md) — 2026-05-14
- [Merge api-video into api-courses](./docs/superpowers/summaries/2026-05-20-merge-api-video-into-api-courses-summary.md) — 2026-05-20 (refactor)
- [Publish Gate (Slice D)](./docs/superpowers/summaries/2026-05-20-publish-gate-slice-d-summary.md) — 2026-05-20
- [Lesson Captions (WebVTT)](./docs/superpowers/summaries/2026-05-30-lesson-captions-summary.md) — 2026-05-30

### EP-04 — Lesson Materials

- [Lesson Materials](./docs/superpowers/summaries/2026-05-21-lesson-materials-summary.md) — 2026-05-21
- [UC-04-02: Student Material Download](./docs/superpowers/summaries/2026-05-26-lesson-materials-student-download-summary.md) — 2026-05-26

### EP-05 — Course Discovery and Enrollment

- [Course Discovery (Slice A)](./docs/superpowers/summaries/2026-05-22-course-discovery-slice-a-summary.md) — 2026-05-22
- [Slice B: Course Enrolment](./docs/superpowers/summaries/2026-05-22-ep05-slice-b-enrolment-summary.md) — 2026-05-22

### EP-06 — Learning Experience

- [Slice A: Student Lesson Playback](./docs/superpowers/summaries/2026-05-25-ep06-slice-a-student-playback-summary.md) — 2026-05-25
- [Slice B: Mark Lesson Complete](./docs/superpowers/summaries/2026-05-25-ep06-slice-b-mark-complete-summary.md) — 2026-05-25

### Design system & Instructor UI

- [Design System Foundation](./docs/superpowers/summaries/2026-05-22-design-system-foundation-summary.md) — 2026-05-22
- [Auth Pages Restyle](./docs/superpowers/summaries/2026-05-22-auth-pages-restyle-summary.md) — 2026-05-22
- [Instructor UI Plan A: web-courses](./docs/superpowers/summaries/2026-05-22-instructor-ui-plan-a-web-courses-summary.md) — 2026-05-22
- [Instructor UI Plan B: web-video + Dashboard](./docs/superpowers/summaries/2026-05-22-instructor-ui-plan-b-web-video-dashboard-summary.md) — 2026-05-22

---

## Technical Architecture

A detailed breakdown of the recommended technical architecture, including the technology stack, data models, and system diagrams, can be found in the [**Technical Architecture**](./docs/epics/TECHNICAL_ARCHITECTURE.md) document.

---

## Contributing

This project is in its early stages. Contributions are welcome. Please start by reviewing the product specifications and technical architecture. If you have suggestions or would like to contribute to the development, please open an issue to start a discussion.

---

## License

Copyright © Learn Wren contributors.

Learn Wren is free software licensed under the **GNU Affero General Public License v3.0 or later** (AGPL-3.0-or-later). You may use, modify, and redistribute it under those terms. Notably, if you run a modified version to provide a network service, the AGPL requires you to make the corresponding source available to that service's users. See [`LICENSE`](./LICENSE) for the full text.
