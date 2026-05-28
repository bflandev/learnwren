# Learn Wren — User Guide

Learn Wren is a self-hosted, open-source educational video platform. Any registered
user can be promoted to an instructor, build video courses organised into modules and
lessons, and publish them. All video is transcoded to HLS and encrypted with AES-128
so it cannot be casually redistributed.

This guide covers **every feature wired up so far** from two angles:

- **Part 1 — Running the platform**: get the app on your machine.
- **Part 2 — Using the features**: step-by-step walkthroughs for the people who use
  the running app (students and instructors).
- **Part 3 — Developer & API reference**: endpoints, data models, routes, roles, and
  configuration for people extending the code.

> [!NOTE]
> **STATUS: ACTIVE DEVELOPMENT.** Learn Wren is built in vertical slices. What is
> documented below is what is *actually wired end to end today*. Features that are
> specified but not yet built are listed in [What is not built yet](#what-is-not-built-yet).
> The product specs in `docs/epics/` and `docs/use-cases/` describe the full intended
> scope; this guide describes the current reality.

## Feature status at a glance

| Area | Feature | Status |
| :--- | :--- | :--- |
| Identity | Registration, email-verification gate, login, logout | Built |
| Identity | Brute-force lockout + email unlock | Built |
| Identity | Logged-out password reset | Built |
| Identity | Session cookie + protected routes | Built |
| Identity | Text profile editing (displayName + biography) | Built (2026-05-27) |
| Identity | Profile picture upload / replace / remove | Built (2026-05-28) |
| Identity | Email change, password change | Not built |
| Authoring | Instructor role promotion (CLI tool) | Built |
| Authoring | Course create / edit / delete | Built |
| Authoring | Modules & lessons, drag-and-drop reorder | Built |
| Video | Resumable upload (MP4 / MOV / MKV ≤ 10 GB) | Built |
| Video | Transcode to AES-128 HLS, status polling | Built |
| Video | Owner playback in the lesson editor (hls.js) | Built |
| Publishing | Publish eligibility gate, publish / unpublish / archive / restore | Built |
| Discovery | Course catalogue (browse, filter, search) | Built |
| Discovery | Course detail page | Built |
| Discovery | Enroll in a course, leave a course | Built |
| Discovery | Guest auto-enroll after login | Built |
| Learning | Student lesson playback (`/learn/:cid/:lid`) | Built |
| Learning | Mark lesson complete + persistent completed pill | Built |
| Learning | Resume / last-watched and course-outline panel | Built |
| Learning | Completion rollups (module / course level) | Not built |
| Materials | Lesson file attachments (PDF, DOCX, PPTX, XLSX, TXT, ZIP ≤ 50 MB) | Built |
| Cover images | Course cover image upload / replace / remove | Built |

---

# Part 1 — Running the platform

Learn Wren is not hosted anywhere yet — you run it locally. The default mode uses the
Firebase Emulator Suite, so **no cloud account or credentials are needed** to try
every feature in this guide.

## Prerequisites

| Requirement | Why | Install (macOS) |
| :--- | :--- | :--- |
| **Node.js 22** (LTS) | Pinned in `.nvmrc` | `nvm install 22 && nvm use 22` |
| **pnpm** | Package manager | `corepack enable && corepack prepare pnpm@latest --activate` |
| **Java 21+** | Required by the Firebase Emulator Suite | `brew install --cask temurin` |
| **1Password CLI ≥ 2.x** | Only needed for real-project mode | `brew install --cask 1password-cli` |

## Install and start

```bash
pnpm install
```

Open two terminals from the repo root:

```bash
# Terminal 1 — Firebase emulators (Auth, Firestore, Storage, UI)
pnpm emulators

# Terminal 2 — both apps in parallel
pnpm start
```

| Service | URL |
| :--- | :--- |
| Web app (Angular SPA) | http://localhost:4200 |
| API (NestJS) | http://localhost:3333/api |
| Firebase Emulator UI | http://127.0.0.1:4000 |

Verify the wiring:

```bash
curl http://localhost:3333/api/health          # {"status":"ok",...}
curl http://localhost:3333/api/firestore-smoke  # writes a doc via the Admin SDK
```

The **Emulator UI** at `http://127.0.0.1:4000` is your window into the system: inspect
Firestore documents, manage Auth users, click verification links, and browse Storage
buckets while the apps run.

## Running against a real Firebase project

Both apps read `LEARNWREN_FIREBASE_TARGET` at boot. Set it to `production` to point at
the real `learn-wren` project instead of the emulators. This requires the one-time
Firebase setup and a populated 1Password vault — see
[`docs/development.md`](./development.md#real-project-mode) and
[`docs/secrets.md`](./secrets.md).

```bash
LEARNWREN_FIREBASE_TARGET=production pnpm secrets:run -- pnpm start
```

Each app logs a single `[learnwren] Firebase target = production` warning at boot.
Hot-reloading the variable is not supported — restart the process to switch modes.

---

# Part 2 — Using the features

This part walks through the platform as the people who use it: a **student** (any
registered user) and an **instructor** (a student promoted to author courses).

> Today, students can browse and enroll in published courses, watch any lesson in an
> enrolled course (`/learn/:cid/:lid`), and mark lessons complete. Resume / last-watched
> tracking and the course-outline panel are shipped with EP-06 Slices C & D.

## 2.1 Creating an account

1. Visit **http://localhost:4200/register**.
2. Enter a **display name**, an **email**, and a **password**. The password policy is:
   **12+ characters, with an uppercase letter, a lowercase letter, a digit, and a
   special character** (e.g. `Aa1!aaaaaaaa`). The form validates this live before you
   can submit.
3. On submit you land on **`/register/confirm`** with a "Check your email" message and
   a **Resend** button (throttled to once per 60 seconds).

Behind the scenes registration creates a Firebase Auth user, a `users/{uid}` Firestore
document, assigns the **`STUDENT`** role, sends a verification email, and signs you in
with a session cookie.

## 2.2 Verifying your email

You **cannot log in until your email is verified** — login returns
`EMAIL_NOT_VERIFIED` until you do.

- **Emulator mode**: open the Auth emulator UI at **http://127.0.0.1:4000/auth**, find
  your user, click the inbox/envelope icon, and open the verification link.
- **Real mode**: click the link in the email you received.

After verifying, confirm in the Firestore emulator UI that a `users/{uid}` document
exists with `role: STUDENT`.

## 2.3 Signing in and the dashboard

1. Go to **http://localhost:4200/login** and enter your email and password.
2. On success you are redirected to **`/dashboard`**. The dashboard greets you by display
   name, shows your current **role**, and — for instructors — renders a course-card grid
   of your owned courses. Students see the welcome hero with a link into the catalogue.

The session is held in an `HttpOnly` cookie named `__session` (5-day lifetime). Click
**Sign out** on the dashboard to clear it and return to `/login`.

## 2.4 Account lockout and unlock

To protect against password guessing:

- **Three consecutive wrong passwords** for the same email lock the account for
  **15 minutes**. The third attempt returns HTTP `423`.
- When the account locks, an **unlock email** with a one-time link is sent.
  - In **emulator mode** the API does not send a real email — the unlock URL is
    **printed to the API server logs** (Terminal 2). Copy it into your browser.
  - The link lands on **`/auth/unlock?token=…`** and clears the lock.
- The lock also **expires on its own** after 15 minutes.

## 2.5 Resetting a forgotten password

1. On the login page click **Forgot password?** (route `/forgot-password`).
2. Enter your email and submit. A reset email is sent (throttled, and the response is
   the same whether or not the email exists, to avoid leaking account existence).
3. Open the reset link (Auth emulator inbox in emulator mode), set a new password, and
   sign in again.

## 2.6 Becoming an instructor

Course authoring requires the **`INSTRUCTOR`** role. There is no self-service "become
an instructor" button yet — promotion is done with a CLI tool by whoever operates the
deployment.

```bash
pnpm tools:promote-to-instructor <email>
```

- The target account **must already be email-verified** — the tool refuses otherwise.
- It sets the Firebase Auth custom claim `role: INSTRUCTOR` and updates
  `users/{uid}.role`.
- **The user must sign out and sign back in** for the new role to take effect (the
  role is baked into the session).

The tool targets the local emulators by default — `pnpm emulators` is the only
prerequisite. To promote against the real project instead, set
`LEARNWREN_FIREBASE_TARGET=production` together with
`LEARNWREN_API_FIREBASE_PROJECT_ID` and `FIREBASE_SERVICE_ACCOUNT_JSON_PATH`.
See the header comment in `tools/promote-to-instructor.ts`.

Once promoted and re-signed-in, the **`/courses`** area becomes accessible.

## 2.7 Editing your profile (UC-01-03 Slices A + B)

Every logged-in user can update their **display name**, **biography**, and
**profile picture** from the profile settings page.

**How to reach it:** click the **avatar chip** in the top-right corner of the header
and select **Profile settings** — or navigate directly to `/settings/profile`.

On the page you will find:

- **Display name** — the name shown on your courses and throughout the platform.
  Must be between 1 and 80 non-blank characters.
- **Biography** — a freeform text field (up to 500 characters) describing yourself
  to students or instructors.

Click **Save** to persist the changes. The header chip updates immediately to reflect
your new display name.

### Profile picture

From the same `/settings/profile` page you can manage your avatar:

- **Upload** — select a **JPEG** or **PNG** file that is **≤ 2 MB** and at least
  **256×256 pixels**. The server re-encodes the image to a canonical 512×512 JPEG so
  every avatar surface renders consistently.
- **Replace** — uploading a new file from the same control overwrites the previous
  picture.
- **Remove** — once a picture is set, a **Remove** button appears and clears it.
- **Fallback** — when no picture is set, the platform renders your initials on a
  coloured tile. The colour is derived deterministically from your user id, so your
  initials chip stays the same colour across sessions.
- **Surfaces** — the header avatar updates immediately after upload or removal; your
  avatar also appears next to your courses on the public catalogue cards and on the
  course-detail instructor card (which renders alongside your biography).

**What is not yet available:**

- **Email address change** — contact a platform admin if you need to change your
  login email.
- **Password change** — use the **Forgot password?** flow on the login page to
  reset your password.

These sub-flows (UC-01-03 extensions 3b / 3c) are deferred to later slices.

## 2.8 Creating and structuring a course

As an instructor, go to **http://localhost:4200/courses**:

- The **course list** shows every course you own, with its status badge
  (`DRAFT` / `PUBLISHED` / `ARCHIVED`).
- Click **New course** (`/courses/new`) to create one. A course has a **title** and
  **description**, plus optional **long description**, **category**, and
  **difficulty**:
  - Category: `PROGRAMMING`, `DESIGN`, `BUSINESS`, `MARKETING`,
    `PERSONAL_DEVELOPMENT`, `OTHER`.
  - Difficulty: `BEGINNER`, `INTERMEDIATE`, `ADVANCED`.

Open a course to reach the **course editor** (`/courses/:id/edit`). There you can:

- Edit the course metadata in the **meta panel**.
- Add **modules** (a course is a list of modules).
- Add **lessons** inside each module (a module is a list of lessons; a lesson has a
  title, optional description, and one video).
- **Reorder** modules and lessons by **drag and drop** — the new order is saved to the
  API immediately.
- Delete courses, modules, and lessons (a confirmation dialog guards destructive
  actions).

### Cover image

The course editor includes a **Cover Image** panel. A course starts with a
placeholder cover (a deterministic tone derived from the course ID); you can
attach a real cover at any time.

- **Upload cover** — click **Upload cover** and pick a JPEG or PNG file at
  least **1280×720 pixels** and no larger than **10 MB**. The platform
  auto-resizes the upload to a canonical **1920×1080 JPEG** before storing it,
  and the editor (and the public catalogue) reflect the new cover immediately.
- **Replace cover** — once a cover is set, the same surface offers **Replace
  cover** with the same constraints. The previous file is overwritten.
- **Remove cover** — click **Remove cover** to clear the cover; the editor
  reverts to the placeholder tone.

Uploads that fail validation (wrong file type, exceeds 10 MB, smaller than
1280×720) are rejected inline with a message; no change is persisted.

## 2.9 Adding video to a lesson

Each lesson holds at most one video. In the lesson editor:

1. Choose a video file. Supported formats and limit:
   - **MP4** (`video/mp4`), **MOV** (`video/quicktime`), **MKV**
     (`video/x-matroska`).
   - **Maximum 10 GB.**
2. The upload is **resumable** — the API hands the browser a Cloud Storage upload
   session URI and the file streams directly to storage. You can **cancel** or, if it
   fails, **retry**.
3. Once the bytes land, the platform transcodes the file. The lesson shows a **status
   badge** that you can watch (the editor polls every ~5 seconds):

   ```
   PENDING_UPLOAD → UPLOADED → TRANSCODING → READY
                                          ↘ FAILED
   ```

   - `UPLOADED` — bytes received; the transcoder validates the file with `ffprobe` and
     starts a job.
   - `TRANSCODING` — the transcoder is producing AES-128-encrypted HLS renditions.
   - `READY` — a playable HLS manifest exists in the output bucket.
   - `FAILED` — transcoding could not complete; a failure reason is recorded.
4. When the video reaches **`READY`**, the badge is replaced by an inline `<video>`
   player. It streams the encrypted HLS via **hls.js** (or native HLS on Safari/iOS).
   Because playback is owner-gated, you (the course owner) can preview your own video
   right in the editor.

## 2.10 Lesson materials

Below each lesson's video, instructors can attach supplementary files —
PDF, DOCX, PPTX, XLSX, TXT, or ZIP, up to 50 MB each. Click **Add material**
and choose one or more files; unsupported or oversized files are skipped with
an inline message while the rest upload. Each material gets its filename as a
default display name, which you can rename inline. **Download** fetches the
file through a short-lived signed link; **Remove** deletes it after a
confirmation prompt.

At the API layer, `MaterialAccessGuard` already grants `GET
/materials/:matId/download-url` to the course owner **or** any
`ACTIVE`-enrolled student. The student-facing UI to browse and download
materials from the lesson player ships with a later EP-06 slice — for now,
only the instructor course editor surfaces these files.

## 2.11 Publishing a course

A course starts as a **`DRAFT`**. Before students could ever see it, it must pass a
**publish eligibility gate**. The course editor shows a **publish bar** and an
**eligibility panel** that lists exactly what is blocking publication:

| Block reason | Meaning |
| :--- | :--- |
| `COURSE_HAS_NO_MODULES` | The course has no modules. |
| `MODULE_HAS_NO_LESSONS` | A module has no lessons (names the module). |
| `LESSON_HAS_NO_VIDEO` | A lesson has no video attached (names the lesson). |
| `LESSON_VIDEO_NOT_READY` | A lesson's video has not finished transcoding (names the lesson and its current state). |

When the panel reports the course is eligible, use the publish bar to move it through
its lifecycle:

```
        publish                    archive
DRAFT  ──────────►  PUBLISHED  ──────────►  ARCHIVED
   ▲   ◄──────────      │                      │
   │     unpublish      │ archive              │ restore
   └────────────────────┴──────────────────────┘
```

- **Publish** (`DRAFT → PUBLISHED`) — eligibility is re-checked atomically at this
  moment, so a course cannot slip through if it changed since the preview.
- **Unpublish** (`PUBLISHED → DRAFT`) — takes it back to editing.
- **Archive** (`DRAFT` or `PUBLISHED → ARCHIVED`) — retires the course.
- **Restore** (`ARCHIVED → DRAFT`) — brings an archived course back.

The first publish timestamp is kept on the course (`publishedAt`) and survives
unpublish and archive.

## 2.12 Browsing and discovering courses

Any visitor — logged in or not — can browse the catalogue at **http://localhost:4200**
(the root redirects there). The catalogue shows all `PUBLISHED` courses as cards.

- **Filter by category or difficulty** using the dropdowns in the filter bar.
- **Sort** using the sort control: **Newest**, **Alphabetical**, or **Most Popular**
  (ranked by total enrollment count, descending). Results update immediately on change.
- **Search** with a keyword in the search bar. Submitting the form runs a relevance
  search over course titles and descriptions. Clearing the query returns to the full
  catalogue.
- **Course detail page** (`/catalog/:id`) shows the full description, instructor name,
  difficulty, and the complete module/lesson structure (titles only — video content
  requires enrollment).

## 2.13 Enrolling in a course

Enrollment is open to every logged-in user (including instructors enrolling in courses
they do not own). To enroll:

1. Open a published course's detail page.
2. Click **Enroll**. The button is disabled briefly while the request is in flight
   (preventing double-submissions). On success, the page switches to the **Enrolled**
   state, showing an enrolled indicator and a **Leave Course** option.

Enrolling grants access to the course's video streams and lesson materials. The
**Most Popular** catalogue sort reflects the course's live enrollment count.

**If you own the course** (you are its instructor), the detail page shows a quiet
"You own this course" note instead of an Enroll button — instructors already have full
access and self-enrollment would distort the popularity ranking.

### Guest auto-enroll

A visitor who is not logged in can still click **Enroll** on a course detail page. They
are sent to `/login` and, after a successful login, returned to the course detail page
where the enrollment completes automatically — no second click needed. The `?enroll=1`
query param drives this round-trip; it is stripped from the URL once the enrollment
fires so that a page refresh does not re-trigger it.

## 2.14 Leaving a course

An enrolled student can leave any course they are enrolled in:

1. Open the course detail page — it shows the **Enrolled** state with a **Leave Course**
   link.
2. Click **Leave Course**. A confirmation dialog appears with the wording: *"Are you
   sure you want to leave this course? You will lose access to videos and materials
   immediately. Your progress will be saved for 90 days in case you re-enroll."*
3. Click **Confirm** to unenroll — the page returns to the **Enroll** state and access to
   videos and materials is revoked immediately. Click **Cancel** to dismiss the dialog
   with no change.

Re-enrolling within the 90-day window restores the same enrollment record (including
any progress data written by EP-06).

> **Note — what is deferred.** Module-completion and course-completion rollups,
> the "Course Completed" badge, and per-lesson progress indicators on the catalog
> detail page ship with later EP-06 slices. The **Start Learning** button, lesson
> player, **Continue Learning** resume tracking, mark-complete, and the course-outline
> panel are all live now (see 2.14–2.16 below). The 90-day hard-delete of withdrawn
> enrollment records remains deferred (soft-delete and restore on re-enroll are live;
> the scheduled purge is not). Access IS revoked when an instructor unpublishes a
> course — the lesson endpoint and the manifest endpoint both require
> `course.status === 'PUBLISHED'` for non-owner callers, so a previously enrolled
> student starts seeing 403s on the next manifest refresh after an unpublish.

## 2.15 Watching a lesson as an enrolled student (EP-06 Slice A)

Once a student has enrolled in a `PUBLISHED` course, the course detail page
(`/catalog/:cid`) shows a **Start Learning** button. The course's instructor sees the
same button on their own course — the playback guard allows owners through so they can
preview as a student would.

Clicking **Start Learning** navigates to `/learn/:cid/:lid` for the first lesson of the
first module (lowest `module.order`, then lowest `lesson.order`). The lesson page
renders the lesson title, description, and the same AES-128 HLS player used by the
owner editor (hls.js on Chrome/Firefox, native HLS on Safari/iOS).

A logged-out visitor who opens `/learn/:cid/:lid` directly is redirected to
`/login?redirect=/learn/:cid/:lid` and returned to the lesson page after sign-in.

Edge cases:

- **Lesson video still transcoding** — the page renders the title and a "This lesson's
  video is still being processed. Please check back later." panel in place of the
  player.
- **Fatal playback error** (manifest 403 from a course unpublished mid-session, key
  fetch failure) — the player swaps in its own error message with a Try again button.
- **Defensive: authenticated but not enrolled** — Start Learning only renders for
  enrolled callers, but a stale direct URL renders a "You're not enrolled" panel with a
  back-to-course link.
- **Lesson missing or in the wrong course** — the page renders a "Lesson not available"
  panel.

**Shipped in later EP-06 slices:** progress / last-watched tracking (Slice C),
the **Continue Learning** resume button (Slice C), and the collapsible course-outline
panel with completion checkmarks (Slice D).

---

## 2.16 Marking a lesson complete (EP-06 Slice B)

While watching a lesson, the student sees a **Mark as Complete** button below the
video. Clicking it:

- POSTs to `/api/learn/courses/:cid/lessons/:lid/complete`, which sets
  `completedAt = <now>` on the matching `LessonProgress` entry of the student's
  enrolment doc.
- Swaps the button for a disabled **✓ Completed on \<date\>** pill.
- The pill persists across reload — the GET endpoint exposes the caller's
  `progress.completedAt` alongside the lesson payload.

Idempotent: clicking again (or retrying after a flaky network) is safe. The API
returns the original `completedAt` and writes nothing.

If the student unenrols and later re-enrols, their prior completions are still
visible — the `progress` array is preserved across the `WITHDRAWN → ACTIVE`
round-trip by EP-05 Slice B.

Instructors previewing their own course see an **(Instructor preview — progress
not tracked)** hint instead of the button. Progress is per-student; the owner
has no enrolment row to record against, and the API rejects owner POSTs with
`403 NOT_ENROLLED_LESSON`.

If the student's enrolment is withdrawn in another tab between page load and
click, the POST returns 403 and the page surfaces an inline banner: "Your
enrolment is no longer active" with a link back to `/catalog/:cid`.

**Deferred to later EP-06 slices:** module-completion and course-completion
rollups, the "Course Completed" badge, and per-lesson progress indicators on the
catalog detail page.

---

## 2.17 Resume Learning and navigating the course (EP-06 Slice C)

When you re-open a course you are enrolled in, the course detail page shows a
**Continue Learning** button (falling back to **Start Learning** for new
enrolments). Clicking it takes you back to the last lesson you watched. The lesson
player also auto-saves your playback position every ~15 seconds — when you return
to that lesson, the video resumes from where you left off.

### Course outline

The lesson player includes a collapsible **course outline** panel that lists every
module and lesson in the course, in the order the instructor set in the course
editor. Use it to navigate between lessons without returning to the course detail
page.

**Visual indicators:**

- The **currently active lesson** is highlighted so you always know where you are.
- Lessons you've **completed** display a checkmark (✓).
- Lessons whose **video is still processing** (`UPLOADING` / `TRANSCODING`) appear
  dimmed with a `(processing)` suffix and cannot be clicked. Attempting to click
  one surfaces an inline notice.

**Navigation:**

- A **Course outline** toggle button at the top of the lesson page shows or hides
  the panel.
- On **wider screens** (≥ 1024 px) the panel appears as a **left sidebar**.
- On **narrower screens** it appears as a **drawer** that slides in from the left.
  It closes automatically when you select a lesson, on backdrop click, or when you
  press `Escape`.

---

# Part 3 — Developer & API reference

## 3.1 Architecture in one paragraph

Learn Wren is an **Nx monorepo** (pnpm). The frontend is an **Angular 21** SPA
(`apps/web`); the backend is a **NestJS 11** API (`apps/api`). They share TypeScript
types from `libs/shared-data-models`. Data lives in **Firestore**; video files live in
**Cloud Storage**; identity is **Firebase Authentication**. The web app never talks to
Firebase directly — **auth is API-mediated** (no Firebase client SDK in the bundle).
The planned production deployment is Firebase Hosting (web) + Cloud Functions (api).
See [`docs/epics/TECHNICAL_ARCHITECTURE.md`](./epics/TECHNICAL_ARCHITECTURE.md).

### Projects

| Project | Type | Role |
| :--- | :--- | :--- |
| `apps/web` | Angular app | The SPA. Proxies `/api/**` to the NestJS server in dev. |
| `apps/api` | NestJS app | The HTTP API. Global prefix `/api`. |
| `apps/web-e2e`, `apps/api-e2e` | Playwright | End-to-end suites. |
| `libs/shared-data-models` | TS library | Entity types shared by web and api. |
| `libs/api-firebase` | NestJS lib | Wraps `firebase-admin`; emulator/production switch. |
| `libs/api-auth` | NestJS lib | `AuthModule`: controller, guards, lockout, email. |
| `libs/api-courses` | NestJS lib | `CoursesModule` + `VideoModule`: authoring, video, publish, playback. |
| `libs/web-auth` | Angular lib | Auth pages, signal-based `AuthService`, guard, interceptor. |
| `libs/web-courses` | Angular lib | Course list/create/editor, module tree, publish UI. |
| `libs/web-video` | Angular lib | Upload component, state badge/polling, hls.js player. |
| `libs/web-catalog` | Angular lib | Public catalogue, search, and course detail page. |
| `libs/web-enrollment` | Angular lib | `EnrollmentService` + `CourseEnrollmentPanelComponent` (enroll/leave panel on the course detail page). |
| `libs/web-learn` | Angular lib | `LearnService` + `LessonPlayerPageComponent`; the `/learn/:cid/:lid` student playback route (EP-06 Slice A). |

## 3.2 API conventions

- **Base prefix**: every endpoint is under `/api` (set in `apps/api/src/main.ts`).
- **Authentication**: a session cookie named **`__session`**
  (`HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/`, 5-day `Max-Age`). Protected
  endpoints use `FirebaseSessionGuard`.
- **Error envelope**: errors are returned as
  `{ "error": { "code", "message", "details?" } }`.
- **Dev proxy**: the Angular dev server proxies `/api/**` to `http://127.0.0.1:3333`
  (`apps/web/proxy.conf.json`), keeping cookies first-party with no CORS layer.
- **Validation**: a global `ValidationPipe` runs with
  `whitelist + forbidNonWhitelisted + transform`, so unknown body fields are rejected.

## 3.3 Auth endpoints — `/api/auth`

| Method | Path | Body | Result |
| :--- | :--- | :--- | :--- |
| `POST` | `/auth/register` | `{ email, password, displayName }` | `201 { uid, email, role, emailVerified:false }` + `__session` cookie. Creates Auth user, `users/{uid}` doc, `STUDENT` claim, sends verification email. |
| `POST` | `/auth/login` | `{ email, password }` | `200 { uid, role, displayName, emailVerified }` + `__session` cookie. Verifies the password via Firebase's REST API. |
| `POST` | `/auth/resend-verification` | `{ email }` | `202`. Re-sends verification email; 60s throttle; enumeration-resistant. |
| `POST` | `/auth/request-password-reset` | `{ email }` | `202`. Sends Firebase reset email; 60s throttle; enumeration-resistant. |
| `POST` | `/auth/unlock` | `{ token }` | `204`. Redeems a one-time unlock token. |
| `POST` | `/auth/logout` | — | `204`. Clears the cookie and revokes refresh tokens. Idempotent. |
| `GET`  | `/auth/me` | — (cookie) | `{ uid, email, displayName, role, emailVerified }`. Guarded by `FirebaseSessionGuard`. |

**Login gates**: `403 EMAIL_NOT_VERIFIED` until the email is verified; `423` after 3
consecutive invalid-credential failures (15-minute lockout). The password policy
(12+ chars, upper, lower, digit, special) is enforced server-side on `register`.

## 3.4 Courses endpoints — `/api/courses`

All course endpoints require a valid session **and** the `INSTRUCTOR` role
(`FirebaseSessionGuard` + `InstructorRoleGuard`). Per-resource endpoints additionally
enforce `CourseOwnerGuard` — you can only touch courses you own.

| Method | Path | Purpose |
| :--- | :--- | :--- |
| `POST` | `/courses` | Create a course. |
| `GET` | `/courses` | List the calling instructor's courses. |
| `GET` | `/courses/:cid` | Get the full course tree (modules + lessons). |
| `PATCH` | `/courses/:cid` | Update course metadata. |
| `DELETE` | `/courses/:cid` | Delete the course (`204`). |
| `POST` | `/courses/:cid/modules` | Create a module. |
| `PATCH` | `/courses/:cid/modules/:mid` | Update a module. |
| `DELETE` | `/courses/:cid/modules/:mid` | Delete a module (`204`). |
| `PUT` | `/courses/:cid/modules/order` | Reorder modules — body `{ ids: [...] }`. |
| `POST` | `/courses/:cid/modules/:mid/lessons` | Create a lesson. |
| `PATCH` | `/courses/:cid/modules/:mid/lessons/:lid` | Update a lesson. |
| `DELETE` | `/courses/:cid/modules/:mid/lessons/:lid` | Delete a lesson (`204`). |
| `PUT` | `/courses/:cid/modules/:mid/lessons/order` | Reorder lessons — body `{ ids: [...] }`. |

### Publish gate

| Method | Path | Purpose |
| :--- | :--- | :--- |
| `GET` | `/courses/:cid/publish-eligibility` | Preview eligibility → `{ eligible, reasons }`. |
| `POST` | `/courses/:cid/publish` | `DRAFT → PUBLISHED` (`200`); eligibility re-checked atomically. |
| `POST` | `/courses/:cid/unpublish` | `PUBLISHED → DRAFT` (`200`). |
| `POST` | `/courses/:cid/archive` | `DRAFT`/`PUBLISHED → ARCHIVED` (`200`). |
| `POST` | `/courses/:cid/restore` | `ARCHIVED → DRAFT` (`200`). |

## 3.5 Catalogue endpoints — `/api/catalog`

All catalogue endpoints are **public** — no session cookie required.

| Method | Path | Purpose |
| :--- | :--- | :--- |
| `GET` | `/api/catalog` | Paginated list of `PUBLISHED` courses. Query params: `page`, `sort` (`NEWEST` \| `ALPHABETICAL` \| `POPULAR`), `category`, `difficulty`. |
| `GET` | `/api/catalog/search` | Relevance-ranked search over course titles and descriptions. Query params: `q`, `page`. |
| `GET` | `/api/catalog/:cid` | Public course detail (full structure + instructor name); `404` for missing or unpublished courses. |

## 3.6 Enrollment endpoints — `/api/enrollments`

All enrollment endpoints require a valid session cookie (`FirebaseSessionGuard`). Any
authenticated user may enroll — there is no additional role gate. A caller can only ever
create, read, or delete **their own** enrollment; the caller's `userId` always comes from
the session, never from the request body or path.

| Method | Path | Body | Success | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/enrollments` | `{ courseId }` | `201` `Enrollment` | Enroll, or restore a `WITHDRAWN` enrollment. Idempotent — re-enrolling when already `ACTIVE` returns the existing record unchanged. |
| `DELETE` | `/api/enrollments/:courseId` | — | `204` | Unenroll — soft-delete the caller's enrollment; progress retained for 90 days. |
| `GET` | `/api/enrollments/:courseId` | — | `200` `EnrollmentStatusView` | The caller's enrollment for that course and whether they own it; drives the course-detail page button state. |

Error codes specific to enrollment:

| Code | HTTP | Meaning |
| :--- | :--- | :--- |
| `COURSE_NOT_AVAILABLE` | `409` | Enroll attempted on a missing or non-`PUBLISHED` course. |
| `CANNOT_ENROLL_OWN_COURSE` | `409` | The course owner clicked Enroll on their own course. |
| `NOT_ENROLLED` | `404` | `DELETE` called when the caller has no `ACTIVE` enrollment for that course. |

## 3.7 Materials endpoints

Create / list / mutate endpoints require session + `INSTRUCTOR` and are gated
by `CourseOwnerGuard` or `MaterialOwnerGuard`. The download endpoint widens
access to ACTIVE-enrolled students via `MaterialAccessGuard`.

| Method | Path | Purpose |
| :--- | :--- | :--- |
| `POST` | `/api/courses/:cid/modules/:mid/lessons/:lid/materials/upload-url` | Validate type + size; create a `PENDING_UPLOAD` material; return a signed upload URL. |
| `POST` | `/api/materials/:matId/complete` | HEAD-verify the uploaded object; transition the material to `READY`. |
| `GET`  | `/api/courses/:cid/modules/:mid/lessons/:lid/materials` | List the lesson's `READY` materials. |
| `PATCH`| `/api/materials/:matId` | Rename a material's display name. |
| `DELETE` | `/api/materials/:matId` | Remove a material (storage object + metadata). |
| `GET`  | `/api/materials/:matId/download-url` | Mint a 15-minute signed download URL (owner or enrolled student). |

Supported content types: PDF, DOCX, PPTX, XLSX, TXT, ZIP. Per-file size cap:
50 MB.

## 3.8 Video endpoints

Upload/management endpoints require session + `INSTRUCTOR`; per-video endpoints add
`VideoOwnerGuard`.

| Method | Path | Purpose |
| :--- | :--- | :--- |
| `POST` | `/api/courses/:cid/modules/:mid/lessons/:lid/video/upload-session` | Start a resumable upload → `{ videoId, uploadSessionUri, expiresAt }`. |
| `GET` | `/api/videos/:vid` | Fetch the `Video` record (state, source, output). |
| `POST` | `/api/videos/:vid/upload-complete` | Signal the bytes have landed; advances state toward transcoding (`200`). |
| `PATCH` | `/api/videos/:vid` | Mark a video `FAILED` with a `failureReason`. |
| `DELETE` | `/api/videos/:vid` | Delete the video (`204`). |

### Playback endpoints — `/api/playback`

Guarded by `FirebaseSessionGuard` + `EnrollmentOrOwnerGuard` (course owner **or**
authenticated student with an `ACTIVE` enrollment). Manifests and keys are served
`no-store`.

| Method | Path | Purpose |
| :--- | :--- | :--- |
| `GET` | `/playback/manifest/:vid` | Master HLS manifest (`application/vnd.apple.mpegurl`). |
| `GET` | `/playback/manifest/:vid/rendition/:r` | A single rendition's media playlist. |
| `GET` | `/playback/keys/:vid` | The AES-128 content key bytes (`application/octet-stream`). |

### Internal / webhook endpoints

| Method | Path | Purpose |
| :--- | :--- | :--- |
| `POST` | `/api/internal/transcoder-events` | Receives transcoder job events. Guarded by `PubSubPushGuard` (verifies the Pub/Sub push token). |
| `POST` | `/api/internal/fake-transcoder/complete/:vid` | **Dev only** — synthesise a `SUCCEEDED` job event. |
| `POST` | `/api/internal/fake-transcoder/fail/:vid` | **Dev only** — synthesise a `FAILED` job event (body `{ reason? }`). |

### Misc

| Method | Path | Purpose |
| :--- | :--- | :--- |
| `GET` | `/api/health` | `{ status:"ok", version, serverTime }`. |
| `GET` | `/api/firestore-smoke` | Writes a doc via the Admin SDK to prove Firestore wiring. |

## 3.9 Web routes

| Path | Guard | Page |
| :--- | :--- | :--- |
| `/` | — | Course catalogue (public). |
| `/catalog` | — | Course catalogue — browse, filter, sort, and paginate PUBLISHED courses. |
| `/search` | — | Search results page (the catalogue search bar navigates here). |
| `/catalog/:id` | — | Public course detail page; shows the enrollment panel (state varies by auth/enrollment). |
| `/login` | — | Sign-in page. Honours a `?redirect=` query param on success (used by guest auto-enroll). |
| `/register` | — | Registration page (mirrors the password policy client-side). |
| `/register/confirm` | — | "Check your email" + Resend. |
| `/forgot-password` | — | Request a password reset. |
| `/auth/unlock` | — | Redeems an unlock token from the URL. |
| `/dashboard` | `authGuard` | Display name + role; sign-out. |
| `/courses` | `instructorRoleGuard` | Instructor's course list. |
| `/courses/new` | `instructorRoleGuard` | Create a course. |
| `/courses/:id/edit` | `instructorRoleGuard` | Course editor: modules, lessons, video, publish bar. |

## 3.10 Roles and guards

| Role | Granted | Can do |
| :--- | :--- | :--- |
| `STUDENT` | Every new account | Register, sign in, view the dashboard. |
| `INSTRUCTOR` | Via `pnpm tools:promote-to-instructor <email>` | Everything `STUDENT` can, plus full course authoring, video, and publishing. |
| `ADMIN` | Not yet granted by any tool | Reserved for platform administration (post-MVP). |

The role lives in a Firebase Auth custom claim and is baked into the session — a user
must **sign out and back in** after a role change.

| Guard | Enforces |
| :--- | :--- |
| `FirebaseSessionGuard` | A valid `__session` cookie. |
| `InstructorRoleGuard` | The caller's role is `INSTRUCTOR`. |
| `CourseOwnerGuard` | The course belongs to the caller. |
| `VideoOwnerGuard` | The video belongs to the caller. |
| `EnrollmentOrOwnerGuard` | The caller owns the course **or** has an `ACTIVE` enrollment in it. |
| `PubSubPushGuard` | The transcoder webhook request carries a valid Pub/Sub push token. |

## 3.11 Data models

Defined in `libs/shared-data-models` and shared by both apps. IDs are **branded
strings** (Firestore document IDs); timestamps are **ISO 8601 strings**; enum-like
fields are **string-literal unions** (not TypeScript enums).

- **`User`** — `id, email, displayName, role (STUDENT|INSTRUCTOR|ADMIN), createdAt, updatedAt`.
- **`Course`** — `id, title, description, longDescription?, category?, difficulty?,
  instructorId, status (DRAFT|PUBLISHED|ARCHIVED), publishedAt?, archivedAt?,
  createdAt, updatedAt`.
- **`Module`** — `id, courseId, title, order, …`. A course is an ordered list of modules.
- **`Lesson`** — `id, moduleId, title, description?, videoId?, order, …`. A module is an
  ordered list of lessons; a lesson has at most one video.
- **`Video`** — `id, ownerInstructorId, courseId, lessonId, state, source, output?,
  transcoderJobName?, keyId?, failureReason?, …`.
  - `state`: `PENDING_UPLOAD | UPLOADING | UPLOADED | TRANSCODING | READY | FAILED`.
  - Supported content types: `video/mp4`, `video/quicktime`, `video/x-matroska`.
- **`VideoKey`** — `id, videoId, key` (base64 of a 16-byte AES-128 key).
- **`PublishEligibility`** — `{ eligible: true, reasons: [] }` or
  `{ eligible: false, reasons: PublishBlockReason[] }`.
- **`Enrollment`** — `id` (composite `${userId}__${courseId}`), `userId`, `courseId`,
  `status (ACTIVE|WITHDRAWN)`, `progress: LessonProgress[]` (owned by EP-06; always `[]`
  in this slice), `withdrawnAt?`, `createdAt`, `updatedAt`. Stored in the top-level
  `enrollments` Firestore collection; direct client access is denied by security rules.
- **`EnrollmentStatusView`** — `{ enrollment: Enrollment | null, isOwner: boolean }` —
  the authenticated read-model returned by `GET /api/enrollments/:courseId`.
- **`LessonProgress`** — `lessonId`, `completedAt`, `lastWatchedSeconds` — reserved for
  the EP-06 learning experience.

## 3.12 Video pipeline configuration

The `VideoModule` reads its configuration from environment variables
(`libs/api-courses/src/lib/video/video.config.ts`):

| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `LEARNWREN_VIDEO_SOURCE_BUCKET` | *(required)* | Bucket that receives raw uploads. |
| `LEARNWREN_VIDEO_OUTPUT_BUCKET` | *(required)* | Bucket that holds transcoded HLS output. |
| `LEARNWREN_VIDEO_TRANSCODER` | `gcp` | `gcp` (GCP Transcoder API) or `fake` (dev). |
| `LEARNWREN_VIDEO_STORAGE_PLAYBACK_FAKE` | `false` | Use a fake playback storage adapter (dev). |
| `LEARNWREN_VIDEO_STUCK_THRESHOLD_MINUTES` | `30` | When a transcoding job is considered stuck. |
| `LEARNWREN_WEB_VIDEO_POLL_INTERVAL_MS` | `5000` | How often the editor polls video state. |
| `LEARNWREN_VIDEO_PLAYBACK_SIGNED_URL_TTL_SEC` | `14400` | Playback signed-URL lifetime. |
| `LEARNWREN_GCP_PROJECT_ID` | *(required if `gcp`)* | GCP project for the Transcoder API. |
| `LEARNWREN_TRANSCODER_LOCATION` | *(required if `gcp`)* | Transcoder API region. |
| `LEARNWREN_TRANSCODER_TOPIC` | *(required if `gcp`)* | Pub/Sub topic for job events. |
| `LEARNWREN_TRANSCODER_WEBHOOK_AUDIENCE` | *(required if `gcp`)* | Expected audience on the webhook token. |
| `LEARNWREN_TRANSCODER_INVOKER_SA_EMAIL` | *(required if `gcp`)* | Service account allowed to push events. |

`LEARNWREN_VIDEO_TRANSCODER=fake` and `LEARNWREN_VIDEO_STORAGE_PLAYBACK_FAKE=true` are
**rejected when `NODE_ENV=production`** — they exist only for local development.

### Testing the video pipeline locally without GCP

With `LEARNWREN_VIDEO_TRANSCODER=fake`, no real transcoder runs. Drive the state
machine by hand against a video you uploaded:

```bash
# Mark a video READY
curl -X POST http://localhost:3333/api/internal/fake-transcoder/complete/<videoId>

# Mark a video FAILED
curl -X POST http://localhost:3333/api/internal/fake-transcoder/fail/<videoId> \
  -H 'Content-Type: application/json' -d '{"reason":"synthetic failure"}'
```

The fake transcoder wraps the payload in the same Pub/Sub push envelope the real
webhook expects, so it exercises the identical `TranscoderEventsController` code path.

## 3.13 Developer commands

| Command | Description |
| :--- | :--- |
| `pnpm start` | Serve `web` (4200) and `api` (3333). |
| `pnpm emulators` | Start the Firebase Emulator Suite. |
| `pnpm build` | Build all projects to `dist/`. |
| `pnpm test` | Run all Vitest unit tests. |
| `pnpm lint` / `pnpm typecheck` | Lint / type-check all projects. |
| `pnpm e2e` | Run the Playwright E2E suites. |
| `pnpm affected` | Lint + test + build + typecheck only what the branch changed. |
| `pnpm secrets:render` | Render `.env` from `.env.tpl` via 1Password. |
| `pnpm tools:promote-to-instructor <email>` | Promote a user to `INSTRUCTOR`. |

Target a single project by invoking Nx directly, e.g. `pnpm nx test api-courses`.

---

# What is not built yet

These are specified in `docs/epics/` and `docs/use-cases/` but **not yet implemented**:

- **EP-06 module / course completion rollups & badges.** Module-completion and
  course-completion rollups, the "Course Completed" badge on the dashboard, and
  per-lesson progress indicators on the catalog detail page are deferred. Per-lesson
  playback (Slice A), mark-complete (Slice B), resume tracking (Slice C), and the
  course-outline panel (Slice D) are shipped.
- **Student-facing materials browser** — `MaterialAccessGuard` already grants enrolled
  students download access, but the lesson player does not yet surface a materials panel.
- **90-day purge of withdrawn enrollments** — soft-delete and restore-on-re-enroll are
  live, but the scheduled hard-delete of `WITHDRAWN` enrollments older than 90 days is
  not implemented.
- **Self-service instructor requests** — promotion is CLI-only; there is no in-app
  "become an instructor" flow.
- **Instructor dashboard (EP-07)** and **platform administration (EP-08)** — post-MVP.
- **Email change and password change** — text profile editing (displayName + biography) shipped 2026-05-27 (UC-01-03 Slice A) and profile picture upload/replace/remove shipped 2026-05-28 (UC-01-03 Slice B). The email-change (ext 3b) and password-change (ext 3c) sub-flows are deferred. Account deletion, social auth, and App Check are also out of scope so far.

## Further reading

- [`README.md`](../README.md) — project overview and slice history.
- [`docs/development.md`](./development.md) — local development reference.
- [`docs/secrets.md`](./secrets.md) — 1Password vault contract.
- [`docs/epics/`](./epics/) — product specs (epics & user stories).
- [`docs/use-cases/`](./use-cases/) — Cockburn-style use cases for the MVP scope.
- [`docs/epics/TECHNICAL_ARCHITECTURE.md`](./epics/TECHNICAL_ARCHITECTURE.md) — stack,
  data models, and system diagram.
