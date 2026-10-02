# Learn Wren: Open-Source Educational Video Platform

[![Release](https://img.shields.io/github/v/release/bflandev/learnwren?sort=semver&label=release)](https://github.com/bflandev/learnwren/releases/latest)
[![CI](https://github.com/bflandev/learnwren/actions/workflows/ci.yml/badge.svg)](https://github.com/bflandev/learnwren/actions/workflows/ci.yml)
[![License: AGPL-3.0](https://img.shields.io/github/license/bflandev/learnwren)](./LICENSE)
[![Live](https://img.shields.io/badge/live-learnwren.com-brightgreen)](https://learnwren.com)

Learn Wren is a self-hosted, open-source educational platform as a platform for creators. It enables any registered user to create and publish video-based courses organised into modules and lessons. Courses are consumed by enrolled students who can stream protected video content and download supplementary lesson materials. The platform is designed for small communities — such as a group of friends, a company, or a non-profit — and can be deployed on commodity hardware or a cloud server. All video content is protected by industry-standard Digital Rights Management (DRM) to prevent unauthorised redistribution.

> [!NOTE]
> **PROJECT STATUS: v1.0.0 RELEASED · LIVE AT [learnwren.com](https://learnwren.com)**
> Built in vertical slices; the MVP (EP-01–EP-06), the full Instructor Dashboard (EP-07), and the administration surfaces shipped to date were cut as [**v1.0.0**](https://github.com/bflandev/learnwren/releases/tag/v1.0.0) on 2026-06-19 and deployed to production. What is wired up today, end to end:
>
> - **EP-01 Identity & access** — register, email-verification gate, login, logout, brute-force lockout + email unlock, logged-out password reset, session cookie, protected routes. **Text profile editing** (displayName + biography) via `/settings/profile` shipped 2026-05-28 (UC-01-03 Slice A). **Profile picture upload** (JPEG/PNG, ≤ 2 MB, auto-cropped to 512×512) shipped 2026-05-28 (UC-01-03 Slice B); the avatar surfaces in the header chip, on course cards, and on the course-detail instructor card (which also renders the instructor's biography). **Email address change** shipped 2026-05-28 (UC-01-03 Slice C, ext 3b): `POST /api/profile/email` re-authenticates with the current password, then sends a verification link to the NEW address; `POST /api/profile/email/confirm` (called from the unguarded `/settings/profile/email-changed` landing page after the link is clicked) syncs the Firestore mirror, revokes refresh tokens, and clears the session — the user signs in with the new address. **Password change** shipped 2026-05-29 (UC-01-03 Slice D, ext 3c): `POST /api/profile/password` re-authenticates with the current password, validates the new password against the same complexity policy as registration (12+ chars, upper, lower, digit, special), updates the credential, sends a password-changed notification email, and revokes refresh tokens — the user is signed out of all devices and signs back in with the new password. **UC-01-03 is now fully implemented.** **Instructor role request (submission) shipped 2026-05-29 (UC-01-04 submission slice)**: a Student on `/settings/profile` sees a "Become an Instructor" section; submitting a statement of intent and areas of expertise (free-text, ≤ 2000 chars) persists a `PENDING` document in `instructorApplications/{uid}` and swaps the form for an "under review" card that persists across reload. Re-submission is blocked (`INSTRUCTOR_APPLICATION_EXISTS`); the `pnpm tools:promote-to-instructor <email>` CLI now resolves the pending application to `APPROVED` (with `resolvedAt`) after flipping the role. **Admin review of instructor applications shipped 2026-05-29 (US-08-03)**: this is the first administrator surface. An ADMIN navigates to `/admin/instructor-applications` via the **Admin** nav link (visible only to ADMINs) and sees the pending queue — applicant name, email, statement, expertise, and submission date. Clicking **Approve** grants the `INSTRUCTOR` role (Firebase custom claim + `users` doc update) and resolves the application to `APPROVED`; clicking **Decline** marks it `DECLINED` so the applicant may re-apply. Approval requires the applicant's email to be verified (returns `APPLICANT_NOT_VERIFIED` otherwise); both actions send the applicant a best-effort decision email. The applicant must sign out and back in for a role change to take effect. Scope cuts: pending-only queue (no approved/declined history view), no decline reason. ADMINs are provisioned via `pnpm tools:promote-to-admin <email>`. Approval also remains available via `pnpm tools:promote-to-instructor <email>`. **Admin user directory (read-only) shipped 2026-06-03 (US-08-01 Slice A)**: an ADMIN navigates to `/admin/users` via the **Users** nav link and sees a searchable (case-insensitive substring on name/email), paginated list of all registered users; clicking a row opens `/admin/users/:uid` showing the user's profile, role, registration date, full enrollment history (ACTIVE + WITHDRAWN, with a `(course deleted)` fallback for orphaned enrollments) and, for instructors, the courses they authored. The list scan is capped at 5000 users (a `capped` banner surfaces when exceeded; substring search is in-memory, not a search index). **Admin role management shipped 2026-06-03 (US-08-01 Slice B)**: from the user detail page an ADMIN can **promote** a Student to Instructor (`POST /api/admin/users/:uid/promote`) or **demote** an Instructor to Student (`POST /api/admin/users/:uid/demote`, behind an inline confirm). Demotion revokes the user's refresh tokens so Instructor access is cut on their next request, and leaves any authored courses untouched (reversible by re-promoting). The role swaps in place on the page; an invalid transition — including any attempt against an ADMIN account, which protects the acting admin and every other admin without a separate self-guard — returns `INVALID_ROLE_TRANSITION` (409). **Admin suspend / delete shipped 2026-06-09 (US-08-01 Slices C+D)**: from the user detail page an ADMIN can **suspend** an account (sets `User.status`, revokes refresh tokens, blocks sign-in) and reverse it, or **permanently delete + anonymise** a user (removes the auth record and scrubs PII while preserving referential integrity). Both run inside transactions with an explicit self / last-admin guard. **US-08-01 (Manage Users) is now complete.**
> - **EP-02 Course authoring** — instructor role promotion (CLI), REST course CRUD, modules and lessons, drag-and-drop reorder.
> - **EP-03 Video & DRM** — resumable upload (MP4 / MOV / MKV ≤ 10 GB), GCP Transcoder → AES-128 HLS, owner playback in the lesson editor (hls.js, native HLS on Safari/iOS), publish / unpublish / archive / restore gate with structured eligibility feedback. **Lesson captions (WebVTT) shipped 2026-05-30**: instructors upload a WebVTT caption file (≤ 256 KB) per lesson video; students enable captions via the player's native CC button (off by default). One English track per lesson this release; multi-language is deferred. Advances EP-09 US-09-03 (accessibility).
> - **EP-04 Lesson materials** — attach / rename / remove supplementary files (PDF, DOCX, PPTX, XLSX, TXT, ZIP ≤ 50 MB each); owners **and enrolled students on PUBLISHED courses** download via short-lived signed URL; the learn page surfaces a materials list with per-row Download buttons.
> - **EP-05 Course discovery & enrollment** — public catalogue with category/difficulty filters, Newest / Alphabetical / Most Popular sort, pagination, keyword search; public course-detail page; logged-in students enroll and leave; guests who click Enroll are auto-enrolled after login.
> - **EP-06 Slice A: Student lesson playback** — enrolled students (and the course owner) navigate from the course detail page via **Start Learning** to `/learn/:cid/:lid` and watch the lesson video in the existing hls.js player.
> - **EP-06 Slice B: Mark a lesson complete** — enrolled students click **Mark as Complete** on the lesson page; the API persists `completedAt` on their per-lesson progress; the button swaps to a "✓ Completed" pill that persists across reload and across a `WITHDRAWN → ACTIVE` re-enrolment. Per-lesson only; module / course rollups and the course-outline panel are deferred.
> - **EP-06 Slice C: Resume Learning** — opening a lesson is tracked per-enrolment; the course-detail page surfaces **Continue Learning** (falling back to **Start Learning** for new enrolments and owners); the lesson player auto-saves position every ~15 s, flushes on pause / `pagehide` / tab hidden via `navigator.sendBeacon`, and resumes within 5 s on revisit. Position writes are idempotent and monotonic (out-of-order beacons cannot rewind progress).
> - **EP-06 Slice D: Course Outline Panel** — the lesson player renders a collapsible left sidebar (desktop) or drawer (mobile) listing every module and lesson in the course; the active lesson is highlighted; completed lessons carry a checkmark; lessons whose video is still processing surface an inline notice; clicking a different lesson navigates and flushes any in-flight playback position.
> - **EP-06 completion rollups (US-06-02 complete)** — a module in the outline panel shows a checkmark once every one of its lessons is complete, and the panel banners "Course completed" once every lesson in the course is; `Enrollment.completedAt` is stamped transactionally alongside the final lesson's completion, and lazily backfilled the first time a legacy completer opens any lesson of the course. The stamp is never cleared, even if the instructor adds lessons afterward. The badge surfaces on the course-detail enrollment panel, on the student's catalog cards (signed-in only — search results are unaffected), and in a "Completed courses" section on `/settings/profile`. No un-stamping and no certificates.
> - **EP-07 Slice A: Enrolled students roster (US-07-01)** — a course owner opens **Students** from the course editor to reach `/courses/:cid/students`, a table of the course's ACTIVE enrollees showing display name, email, enrollment date, and progress (completed ÷ total lessons). Sortable by enrollment date and progress; exportable as an RFC-4180 CSV generated in-browser. Owner-only (`GET /api/courses/:cid/students`, `CourseOwnerGuard`). Analytics (US-07-02) and new-module notifications (US-07-03) are deferred to later EP-07 slices.
> - **EP-07 Slice B: Course analytics (US-07-02)** — a course owner opens **Analytics** from the course editor to reach `/courses/:cid/analytics`: enrolled total, average per-student completion %, new enrollments in the last 7/30/90 days, and a per-lesson breakdown (completion rate + average progress into the lesson vs. the video's duration). Computed live on each request (the ≤24h freshness AC is met by construction). "Average watch time" is approximated by the furthest-watched position, since cumulative watch time is not recorded. Owner-only (`GET /api/courses/:cid/analytics`, `CourseOwnerGuard`). New-module notification (US-07-03) shipped in Slice C.
> - **EP-07 Slice C: New-module notification (US-07-03)** — a course owner clicks **Notify students** on a module in the course editor to email every active enrollee that a new module is available, with a link to the course (`/catalog/:id`). Owner-only, one-shot per module (`POST /api/courses/:cid/modules/:mid/notify`, `CourseOwnerGuard`), gated to a published course with at least one lesson; the module is stamped `studentsNotifiedAt` so the action cannot repeat. Best-effort email through the shared `EmailTransport` seam (console in dev, SMTP in prod). No in-app notifications, no student opt-out, no retries/queue (deferred). **EP-07 (Instructor Dashboard) is complete with this slice.**
> - **EP-09 US-09-03 Accessibility** — every UI surface is swept by axe-core for WCAG 2.1 AA violations on each CI run, gated at zero with no allowlist; four keyboard-only journey specs (sign in, discover-and-enrol, lesson navigation, module and lesson reorder) verify the "navigable by keyboard alone" criterion. The suite is hermetic (`nx run web-e2e:a11y`) — it stubs `/api` via `page.route` and needs neither the emulators nor the api. Honest scope: this is automated conformance plus targeted manual verification, not a certified audit — automated tooling catches roughly a third to a half of WCAG issues. No screen-reader pass; performance (US-09-01) is now partly gated — see below.
>
> - **EP-09 US-09-05 Mobile responsiveness** — the app header collapses to a hamburger + slide-out sheet below `md` (768 px), carrying the nav links and the search bar; the theme toggle and avatar stay in the bar at every width (the display-name chip hides below `md`). The four ADMIN-only links (Admin, Users, Categories, Health) group behind an `hlm-menu` dropdown in the inline desktop nav — the admin header needed ~1117px to fit those links flat, which would have overflowed the 768px boundary — while inside the mobile sheet they render flat, one tap each. The inline search bar shows only at `xl` (1280 px) and up; between `md` and `xl` a magnifier icon opens it in a popover; below `md` it lives in the sheet — exactly one search affordance at every width. Every route is swept for horizontal overflow at 320 / 768 / 1280 / 2560 px on each CI run (`nx run web-e2e:responsive`, 103 tests: 23 routes × 4 widths plus header specs with a 767/768 boundary pair), gated at zero with no allowlist, sharing the route inventory with the accessibility sweep. The sweep caught four real layout defects, now fixed: the learn page's course outline was hidden below 1024px on first paint, leaving students with no course navigation on a phone; a fixed-width cover-image thumbnail on the course editor forced its sibling column past 320px; a non-wrapping row on the admin user directory; and the roster and analytics tables scrolled the page body instead of themselves. Honest scope: the gate proves no horizontal scrolling, which is not the same as "renders correctly" — touch-target sizing and visual sanity were verified manually at 320 px and are not gated (`docs/superpowers/plans/2026-08-07-us-09-05-manual-verification.md`, which records 154 real sub-44 px touch targets — WCAG 2.5.5 is Level AAA and deliberately outside this project's AA gate, so they are recorded rather than fixed). The swipe-to-seek / pinch-to-zoom criterion is met by the native player's own touch affordances rather than custom gesture handlers (the epic AC is amended to say so); a custom gesture layer would have put the WCAG 2.1 AA gate at risk. US-09-04 (self-hosting) shipped in Slices A–D (2026-09-25 to 2026-10-02), see below; US-09-01 (performance) is now partly gated, see below.
>
> - **EP-09 US-09-01 Performance** — `nx run web-e2e:perf` gates Largest Contentful Paint (LCP) on four routes (landing, catalogue, course detail, learn page) and click-to-first-frame on a real HLS fixture, on every CI run: 5 tests total. The catalogue's 2000 ms LCP budget and video's 3000 ms click-to-first-frame budget come straight from the acceptance criteria; the other three budgets are derived from measured medians × 1.4, recorded in `docs/superpowers/specs/2026-08-08-us-09-01-performance-design.md` §5. **That headroom is not 40% across the board, and the difference matters.** Each route has one budget number, shared by both metrics, and it is derived from whichever metric measured higher — which for course detail and the learn page is time-to-content (1984 ms / 1973 ms medians → 2800 ms), not LCP (1556 ms / 1576 ms). Against those LCP medians, 2800 ms is roughly **80%** headroom: on the two routes students spend the most time on, an LCP regression of up to ~80% would pass the gate silently. Only landing's 1900 ms is a ~40% margin over the metric it gates (LCP 1336 ms). This is the first suite in the repo to serve the **production build** rather than the dev server — dev-server bundles run several times larger and with unoptimised change detection, so an LCP measured against them would describe the dev server, not the product. It is also the first CI coverage to decode a video frame at all. A second metric, time-to-content (wall-clock time to the route's real content appearing), exists because LCP alone is blind to the catalogue's actual failure mode: the catalogue's LCP candidate is its static `<h1>` heading, which paints before `/api/catalog` responds, so LCP stays flat even if the data load stalls. **Finding: the catalogue does not meet its "loads within 2 seconds" criterion.** Its time-to-content median on CI hardware is 1989 ms against the 2000 ms budget — 11 ms of margin, indistinguishable from runner noise — and the same ~1980 ms figure shows up on every content route regardless of payload, meaning the cost is cold production-bundle download plus Angular bootstrap, not a catalogue-specific regression this gate could usefully catch. Time-to-content is measured and logged on every route every run, and it is **gated on course detail and the learn page** (against those routes' shared 2800 ms budget, the metric that budget was derived from). It is deliberately not gated on the catalogue, for the reason above — only the catalogue's LCP (1424 ms, real margin) is — nor on landing, which has no stubbed data whose arrival would mark "loaded". This is recorded as an unmet acceptance criterion in `docs/epics/09-non-functional-requirements.md`, not silently narrowed here. Honest scope: the gate measures client render cost under a modelled 10 Mbps / 40 ms link with stubbed APIs at a fixed 150 ms delay. It proves nothing about real API latency, CDN behaviour, cold starts, or concurrency. US-09-01's TTFB-at-p95 and 100-concurrent-user criteria remain deferred — both need a load harness against the deployed production API, which a hermetic CI gate cannot provide.
> - **EP-09 US-09-04 Self-hosting, Slice A (2026-09-25)** — `docker compose up -d` builds and runs the whole platform on one machine with no cloud account: an nginx container serving the production web build and proxying `/api`, the NestJS api in listen mode, and the Firebase Emulator Suite (Auth, Firestore, Storage, UI) with its data persisted to a named volume via `--export-on-exit`. The api shares the emulators container's network namespace, which is what lets the browser reach the resumable video-upload URLs the api mints. `.env.example` documents every setting (all defaulted), `docs/self-hosting.md` is the deployment guide, and `docker/smoke.sh` is the runnable check. Four of the story's five acceptance criteria are now met (licence, single-command Compose, guide, `.env.example`). **The fifth — no proprietary services — is only partially met, and the epic's criterion is amended to say so:** this is the platform's emulator mode packaged, so it runs with zero credentials but the transcoder and playback storage are the in-memory fakes (uploads succeed; a video stays *Transcoding* until the dev completion endpoint is called, and playback serves a stub manifest), and the Emulator Suite is a development tool, not a production data store. Unauthenticated emulator ports bind to loopback by default. No CI job builds the images (deferred; packaging only, no application code changed). Slice B is the real self-hosted adapters (ffmpeg HLS transcoder, S3-compatible storage, auth/data-store decision) behind the existing ports, with a `TECHNICAL_ARCHITECTURE.md` update first.
> - **EP-09 US-09-04 Self-hosting, Slice B (2026-09-25): real video with ffmpeg** — `LEARNWREN_VIDEO_TRANSCODER=ffmpeg` (set by the Compose stack) adds a third transcoder behind the existing `VideoTranscoder` port: the api downloads the source, encodes one H.264/AAC AES-128 HLS rendition per ladder step that fits the source height (same skip-upscale rule and the same flat `hls_<r>.m3u8` / `hls_<r>NNNNNNNNNN.ts` layout as the GCP job, via the shared `hls-naming.ts` contract), writes the master playlist, and uploads to the output bucket. The ffmpeg and ffprobe binaries come from `@ffmpeg-installer/ffmpeg` and the existing `@ffprobe-installer/ffprobe`, so no system install is needed anywhere. Completion has no push channel, so the adapter delivers its own event to `VideoService.handleTranscoderEvent` (wired post-init by a bridge provider) and mimics Pub/Sub redelivery — retrying on `JOB_NAME_MISMATCH` / `WRONG_STATE` for about a minute — because an in-process encode of a short clip can finish before the upload-finalize transaction commits the job name. Playback in this mode is **proxied**: the manifest rewriter mints same-origin `GET /api/playback/segment/:vid/:name` URLs instead of GCS signed URLs (the Storage emulator cannot sign), and that route sits under the same session + enrolment guards as the manifest, validates the name with the rewriter's flat-segment regex, HEADs the object so a miss renders the normal 404 envelope, then streams `video/mp2t` with a private immutable cache header. The source probe likewise runs ffprobe on a downloaded copy. The dev-only fake-transcoder endpoints are not registered in this mode. Verified by a real-ffmpeg integration test that generates a 360p test pattern, transcodes it, and has ffprobe decrypt the output with the key on disk, and by an end-to-end upload → READY → playback in the Compose stack. **Ceilings, on the record:** renditions encode sequentially inside the api process; an api restart loses in-flight jobs and leaves the video in Transcoding (no reconciler); every segment request re-runs the enrolment guard (a Firestore read per ~6 s per viewer); sources below 360 px are refused, as with GCP. Auth, Firestore and Storage still run on the emulators, so the "no proprietary services" criterion stays partially met; the remaining gap is the data and auth layer, not video.
> - **EP-09 US-09-04 Self-hosting, Slice C (2026-09-26): S3-compatible object storage** — a new `api-object-storage` lib defines one `ObjectStorage` port with two backends, GCS (Cloud Storage for Firebase and its emulator, unchanged behaviour) and S3 (`@aws-sdk/client-s3`, path-style; RustFS in the Compose stack, any S3-compatible store works), selected by `LEARNWREN_OBJECT_STORAGE=gcs|s3` (default `gcs`). Every place that stored or served a file now injects the port: cover images, profile pictures, lesson materials, video source/HLS output, and the admin health probe. **In S3 mode the api is the only door**: the store is never published; the browser's chunked video client (8 MB `Content-Range` PUTs expecting 308 until the last chunk) talks to `PUT /api/internal/uploads/videos/:vid`, which maps chunks onto S3 multipart parts and answers the same protocol; materials upload and download through `/api/internal/{uploads,downloads}/materials/:matId` (the former fake-only passthrough, generalised and streaming); segments were already proxied; covers and pictures are anonymous reads at `GET /api/media/:bucket/:key`, allowed only for the buckets named in `LEARNWREN_PUBLIC_BUCKETS` (so no vendor-specific bucket policy is needed), and each adapter creates its bucket on boot. The web app is unchanged. MinIO was the intended store, but its public images were withdrawn during the slice, which is why the port matters: the stack switched to RustFS without touching application code. Verified end to end on the stack: cover via `/api/media`, material round-trip, a ~15 MB two-chunk upload (308 then 200), ffmpeg to READY, encrypted playback in Chrome, and the store with no host port. **Ceilings, on record:** uploads stream through the api process; chunk-upload state lives in api memory (a restart fails the in-flight upload and the instructor re-uploads); chunks must arrive in order. Only Firebase Auth and Firestore remain on the emulators; the "no proprietary services" criterion stays partially met with that as the last gap.
> - **EP-09 US-09-04 Self-hosting, Slice D1 (2026-10-01): DocumentStore port** — the first code slice of the auth-and-data programme (design: `docs/superpowers/specs/2026-10-01-us-09-04-slice-d-auth-and-data-design.md`; `TECHNICAL_ARCHITECTURE.md` now describes the two deployment backends). A new `api-document-store` lib defines one `DocumentStore` port — exactly the Firestore subset the api uses (`==`/`in` filters, `orderBy`, `limit`, `count`, batches, transactions, `recursiveDelete`, one `collectionGroup`; `DELETE_FIELD` and `DOCUMENT_ID` sentinels; `DocumentNotFoundError` / `TransactionConflictError`) — with a Firestore adapter and an in-memory adapter (which replaces the old `fake-firestore` test double), held together by a shared contract suite that runs against the in-memory adapter in unit tests and against the Firestore emulator in CI. Every Firestore call in `api-auth`, `api-courses` and `api-profile` now injects `DOCUMENT_STORE` instead of `FIRESTORE`; `runTransactionWithRetry` and the user-profile reader moved into the new lib; a workspace lint rule forbids importing Firestore outside the port's own lib and `api-firebase`. **No behaviour change**: production still runs on Firestore, and there is no `LEARNWREN_DATA_STORE` selector yet. Verified by the unchanged unit, api-e2e and web-e2e suites, the contract on both adapters, and Stryker at 100% on the new lib. **Next:** D2 adds the PostgreSQL adapter behind the same port and contract; D3 adds built-in identity and switches the Compose stack off the emulators. Until then Firebase Auth and Firestore remain the last gap.
> - **EP-09 US-09-04 Self-hosting, Slice D2 (2026-10-01): PostgreSQL data store** — `LEARNWREN_DATA_STORE=postgres` (with `LEARNWREN_POSTGRES_URL`; default stays `firestore`) runs the api on PostgreSQL through the same `DocumentStore` port. Every collection lives in one `documents` table (path primary key, `COLLATE "C"` so prefix deletes use the index; `parent`, `collection` and `id` columns for collection, collection-group and document-id queries; the body as `jsonb`), created on boot under an advisory lock. Queries compile to parameterised SQL (exact `jsonb` equality, documents lacking an `orderBy` field excluded, numbers ordered numerically and text bytewise, path as the final tie-break, as Firestore orders); transactions run `SERIALIZABLE` and retry internally on serialization failures and deadlocks; batches are one atomic transaction; the pool has a 10 s connect timeout and closes on shutdown (listen mode now enables Nest shutdown hooks). The shared contract (28 cases) passes on the in-memory adapter, the Firestore emulator and a real PostgreSQL 17; CI runs the Postgres contract in the e2e and mutation jobs (service container); Stryker 100% on the lib. Verified by a boot smoke: the api on Postgres serves `GET /api/catalog`. **Scope cuts, on record:** the Docker Compose stack still runs Firestore on the emulators until D3, because Firebase Auth remains and the e2e and operator-tool seeding writes to Firestore directly — so no api-e2e run against Postgres yet; no migration from existing data; no indexes on `data` fields yet (expression indexes when a collection grows); strings containing U+0000 lose that character (jsonb cannot store it); one api process.
> - **EP-09 US-09-04 Self-hosting, Slice D3a (2026-10-01): IdentityProvider port** — every Firebase Authentication call in `api-auth` and `api-profile` now goes through one `IdentityProvider` port (`IDENTITY_PROVIDER`, in `libs/api-auth/src/lib/identity/`): create/get/update/delete users, set a role, verify a password (returning an opaque proof), create/verify/end sessions, revoke all of a user's sessions, and mint email action links. `FirebaseIdentityProvider` is the only code that talks to Firebase Auth (lint-enforced) and absorbs the Firebase-only plumbing: minting session cookies from an ID token, the whole-second revocation retry, `auth/*` error codes, and Firebase-hosted action links. A shared contract (19 cases: case-insensitive email matching, one generic rejection for wrong/unknown/disabled credentials, proofs only from the same provider, idempotent delete, revocation) runs against a test-only in-memory adapter (`@learnwren/api-auth/testing`, which replaced about 14 hand-rolled Auth mocks) and against the Firebase Auth emulator in CI. **One deliberate behaviour change:** admin suspend and delete now revoke sessions the same way password change and demote do (in production, a second revoke past the next second boundary, closing the same-second gap; unchanged in the emulator). Everything else — error codes, statuses, emails, cookies, lockout — is unchanged; api-e2e and web-e2e pass unchanged; Stryker 100% on `api-auth` and on the `api-profile` files that changed. **Scope cuts, on record:** the Auth emulator ignores session revocation, so the revocation contract cases run only on the in-memory adapter until D3b's local adapter; the e2e helpers, operator tools and `firestore.rules` still use Firebase directly (D3c). **Next:** D3b adds the self-hosted local adapter, `LEARNWREN_IDENTITY`, and the `/auth/action` page; D3c switches Compose off the emulators.
> - **EP-09 US-09-04 Self-hosting, Slice D3b (2026-10-01): local identity** — `LEARNWREN_IDENTITY=local` (default `firebase`) runs sign-up, login, sessions and email links without Firebase Auth. It requires `LEARNWREN_DATA_STORE=postgres` and refuses to boot otherwise; the Firebase adapter and REST client are still constructed in local mode but never called (no network; the emulator-mode web API key default suffices), so combining local with `LEARNWREN_FIREBASE_TARGET=production` is unsupported. `LocalIdentityProvider` stores everything through the `DocumentStore` port: passwords as scrypt hashes (N=32768, r=8, p=1, 16-byte salt, constant-time compare, a dummy hash for unknown emails so timing does not reveal accounts), an email index keyed by a hash of the lower-cased email, and sessions and email-action tokens as 256-bit random tokens whose documents are keyed by their SHA-256 — no raw token is stored. Sessions last 5 days and are checked against the live user (deleted or disabled ends them; role changes apply at once). Email links last 24 h (verify) or 1 h (reset, change email), are single-use and point at the new web page **`/auth/action?mode=verify-email|reset-password|change-email&token=…`**, which redeems them through the new public **`POST /api/auth/email-action`** (`{ mode, token, newPassword? }` → `204`; `400 TOKEN_INVALID_OR_EXPIRED`, `WEAK_PASSWORD`, `PASSWORD_TOO_LONG`; `409 EMAIL_ALREADY_EXISTS`). Reset enforces the password policy; change email re-checks uniqueness inside the transaction and swaps the index. Both end every session of the account and cancel its other pending reset and change-email links, and so does a password change (closing a hijack path where a change-email link started with a stolen password outlives the owner's reset). A junk token is rejected before any scrypt work. **By design:** in local mode logout ends only the current browser's session (Firebase ends all; reset, email change, suspend and delete still end all). Expired rows are cleaned per user, with no scheduler: a login removes that user's expired sessions, issuing a link removes their expired links, and deleting an account removes all its links (rows of users who never return stay until the account is deleted). Firebase mode answers the endpoint with `TOKEN_INVALID_OR_EXPIRED` and keeps its hosted action pages. The identity contract (24 cases) now runs on the local adapter over in-memory and Postgres stores; a curl smoke of register → verify → login → reset → logout on Postgres passed; Stryker 100% on `api-auth` and `web-auth`. A security review found no Critical issues; its High (change email kept old sessions alive) and Medium (pending links survived a password reset) are fixed with tests. Accepted Low: an unknown email skips one database read at login, a gap scrypt's cost masks. **Scope cuts, on record:** Docker Compose still runs the emulators (D3c); local identity needs Postgres; the e2e helpers and operator tools still use Firebase directly (D3c). **Next:** D3c — e2e and tools through the port, api-e2e on postgres + local in CI, Compose drops the emulators, first-admin flow.
> - **EP-09 US-09-04 Self-hosting, Slice D3c (2026-10-02): Compose on Postgres + local identity** — `docker compose up -d` now runs web, api, `postgres` (17, unpublished) and the RustFS object store, with `LEARNWREN_DATA_STORE=postgres` and `LEARNWREN_IDENTITY=local` pinned and **no Firebase emulators** (the `emulators` service, `emulator-data` volume, `network_mode`, `docker/firebase.json`, `docker/emulators-entrypoint.sh` and `LEARNWREN_ADMIN_BIND` are gone; nginx proxies to `api:3333`). New `LEARNWREN_POSTGRES_PASSWORD` (letters, digits, `-`, `_` only). **First admin:** set `LEARNWREN_BOOTSTRAP_ADMIN_EMAIL`; on login the account whose email matches (exact, case-insensitive) and is verified is promoted to ADMIN (promote-only, logged once). Clear it afterwards. `docker/smoke.sh` now drives register → verify (link from `docker compose logs api`) → reset → admin login → promote an instructor → course → upload → ffmpeg → encrypted playback; run it only on a fresh stack because it creates real accounts including an ADMIN. **api-e2e runs twice in CI**: on the Firebase emulators, and on Postgres + local identity with a RustFS service (the second run needs an S3 object store because nothing serves the Storage emulator port); 178 pass / 46 skip there (the 44 `firestore-rules` tests are skipped on Postgres). The one intended difference: under local identity, redeeming a change-email link ends every session, so the old cookie gets 401 at `/profile/email/confirm` and the users-doc email syncs on the next login. **Operator tools work on either backend** (`tools/backend-init.ts`; `pnpm tools:promote-to-admin` and `tools:promote-to-instructor` take the same selectors as the api; the Firebase path keeps its emulator default and `LEARNWREN_FIREBASE_TARGET=production` opt-in; an unknown email now reads "No account for <email>" on both). A test-only `/api/_test` seam (an email outbox) exists only when `LEARNWREN_TEST_OUTBOX_ENABLED=1` and is refused in production. **With D3c the epic's "no proprietary services" criterion is met** (amended 2026-10-02). **Scope cuts, on record:** web-e2e still runs on the Firebase emulators; no migration from the old emulator volume to Postgres (start fresh or stay on the previous version; use `docker compose up -d --remove-orphans` once to stop the old emulators container); the bootstrap variable never demotes, so demoting that admin sticks only until the variable is cleared (the next login re-promotes), and in Firebase mode the role shows from the login after the promotion; the Firebase adapter and REST client are still constructed (never called) in local mode; expired sessions and links are swept per user only, with no scheduler.
>
> - **Course cover image upload** — instructors can upload a cover from the course editor (JPEG or PNG, ≥1280×720, ≤10 MB); uploads are auto-resized to a canonical 1920×1080 JPEG. Replace or remove from the same panel.
> - **Admin course-category management shipped 2026-07-10 (US-08-02)**: categories are no longer a hardcoded union — they live in the admin-managed `courseCategories` Firestore collection (doc id = stable slug referenced by `Course.category`; the six historical values seed lazily on first read, so existing course docs need no migration). An ADMIN navigates to `/admin/categories` via the **Categories** nav link to **create** (name → slugged id, `CATEGORY_EXISTS` on collision), **rename** (display name only — course docs are never rewritten), and **delete** a category; deleting always prompts for a reassignment target, and the API moves every referencing course (any status) in one transaction before removing the category doc. The last remaining category cannot be deleted (`LAST_CATEGORY`). The course creation form and the catalogue filter fetch the live list from public `GET /api/categories` (alphabetical by name); course create/update validates the referenced category server-side (`CATEGORY_NOT_FOUND`, 404).
>
> - **Admin platform health dashboard shipped 2026-07-17 (US-08-04)**: an ADMIN opens `/admin/health` via the **Health** nav link and sees, computed live on each load, four service rows (web server/API, database, transcoding queue, object storage — the transcoding-queue row reflects whether the pending-count query itself succeeded, not a separate adapter reachability ping; both it and the object-storage row surface a `fake` detail in local dev), three stat tiles (storage used, registered users, published courses), and up to two alerts: `TRANSCODE_BACKLOG` when more than 10 jobs are pending, and `STORAGE_QUOTA` when usage exceeds 80% of the optional `LEARNWREN_STORAGE_QUOTA_GB` quota (unset by default — no quota bar or alert without it). A manual **Refresh** button re-runs the probes. **US-08-04 is now shipped, closing EP-08 (Platform Administration) — every story across EP-01 through EP-08 is now implemented end to end.** EP-09 (non-functional requirements) is partly done — see the accessibility, mobile-responsiveness, and performance slices above; performance's catalogue-load criterion is measured but not met, its TTFB and concurrency criteria are deferred, and self-hosting (US-09-04) has its Docker Compose stack, real ffmpeg video pipeline and S3-compatible object storage shipped, with the emulator-backed auth/data layer as the remaining gap. `docs/USER_GUIDE.md` is the authoritative end-to-end feature matrix.

---

## Monorepo Layout

This is an [Nx](https://nx.dev) workspace using pnpm. It contains an Angular SPA, a NestJS API, their Playwright E2E suites, and a shared TypeScript library.

```
learnwren/
├── apps/
│   ├── web/            # Angular SPA — root `/` is the public landing page (signed-in users → `/dashboard`)
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
│   ├── web-admin/           # Angular admin surface: /admin/instructor-applications queue (US-08-03), /admin/users directory + promote/demote/suspend/delete (US-08-01 A–D), /admin/categories management (US-08-02)
│   └── web-ui/              # Shared Angular UI primitives (cover tones, buttons, etc.)
├── tools/
│   ├── promote-to-instructor.ts                    # CLI: promote a STUDENT to INSTRUCTOR via custom claim
│   ├── promote-to-admin.ts                         # CLI: promote a STUDENT or INSTRUCTOR to ADMIN (either backend)
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
    ├── deployment.md   # Production deploy runbook (Hosting + gen2 Functions)
    ├── releasing.md    # Release process (nx release → versioned GitHub releases)
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
| `web-admin` | Library | Angular standalone admin surface: the `/admin/instructor-applications` review queue (US-08-03) + the `/admin/users` user directory (`AdminUsersPageComponent` + `AdminUserDetailPageComponent`, US-08-01 Slice A) with promote/demote (Slice B) and suspend/delete + anonymise (Slices C+D) actions on the detail page + the `/admin/categories` management page (`AdminCategoriesPageComponent`, US-08-02) |
| `web-ui` | Library | Shared Angular UI primitives (deterministic course-cover tones, etc.) consumed by `web-catalog` and `web-courses` |
| `web-e2e`, `api-e2e` | E2E suite | Playwright (api-e2e covers `/auth/**` end-to-end including lockout + Firestore rules) |

Learn Wren is deployed to production at **[learnwren.com](https://learnwren.com)** on Firebase Hosting (web) and gen2 Firebase Cloud Functions (api), backed by Firestore, Cloud Storage, and Firebase Authentication. See [`docs/deployment.md`](./docs/deployment.md) for the deploy runbook and [`docs/epics/TECHNICAL_ARCHITECTURE.md`](./docs/epics/TECHNICAL_ARCHITECTURE.md) for the architecture.

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

The API endpoints exposed by US-08-01 Slices A–B (admin user directory + role management — session cookie + ADMIN role required):

| Method | Path | Purpose |
| :--- | :--- | :--- |
| `GET` | `/api/admin/users?search=&page=&pageSize=` | Searchable (case-insensitive substring on name/email), paginated list of all users. Capped at a 5000-user scan; `capped: true` flags truncation. |
| `GET` | `/api/admin/users/:uid` | One user's detail: profile, role, registration date, enrollment history (any status), and authored courses. `USER_NOT_FOUND` → 404. |
| `POST` | `/api/admin/users/:uid/promote` | Promote a Student to Instructor. `INVALID_ROLE_TRANSITION` → 409 if the user is not a Student; `USER_NOT_FOUND` → 404. |
| `POST` | `/api/admin/users/:uid/demote` | Demote an Instructor to Student and revoke their session (immediate effect); authored courses untouched. `INVALID_ROLE_TRANSITION` → 409 if the user is not an Instructor; `USER_NOT_FOUND` → 404. |

The API endpoints exposed by US-08-02 (course-category management):

| Method | Path | Purpose |
| :--- | :--- | :--- |
| `GET` | `/api/categories` | **Public.** All categories, alphabetical by display name. Lazily seeds the six defaults on first read. |
| `POST` | `/api/admin/categories` | ADMIN. Create `{ name }` (≤ 60 chars); id = slugified name. `CATEGORY_EXISTS` → 409 on id or case-insensitive name collision. |
| `PATCH` | `/api/admin/categories/:id` | ADMIN. Rename `{ name }` — display name only, course docs are never rewritten. `CATEGORY_NOT_FOUND` → 404; `CATEGORY_EXISTS` → 409. |
| `DELETE` | `/api/admin/categories/:id?reassignTo=` | ADMIN. Delete; when courses reference the category, `reassignTo` is required (`CATEGORY_IN_USE` → 409 with `courseCount`) and every referencing course is moved in one transaction. `LAST_CATEGORY` → 409 for the final category. Returns `{ reassignedCourses }`. |

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
| `GET` | `/api/enrollments` | The caller's ACTIVE enrollments, joined to course title, with `completedAt` (US-06-02 rollup). Enrollments whose course was deleted are omitted; `{ enrollments: [] }` for a caller with none. |
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

The API endpoints exposed by EP-07 Slice B (course analytics — session cookie + course owner required):

| Method | Path | Purpose |
| :--- | :--- | :--- |
| `GET` | `/api/courses/:cid/analytics` | The course owner's live analytics: enrolled total, average completion %, new enrollments (7/30/90d), and per-lesson completion rate + average watched position vs. duration. `403` non-owner, `404` missing course. |

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
| `pnpm tools:promote-to-admin <email>` | Promote an email-verified user to ADMIN (role on the identity + `users/{uid}` doc), on Firebase or on Postgres + local identity (same selectors as the api). Required to access `/admin/**`; the user must sign out and back in after. |
| `pnpm secrets:render` | Render `.env` from `.env.tpl` via 1Password. |
| `pnpm secrets:run -- <cmd>` | Run a command with secrets injected in-memory (no `.env` written). |
| `pnpm release:dry` | Preview the next version, changelog, tag, and GitHub release without making any changes. Always run this first. |
| `pnpm release` | Cut a release: bump the workspace version from conventional commits, update `CHANGELOG.md`, commit, tag `v{version}`, push, and create the GitHub release. See [`docs/releasing.md`](./docs/releasing.md). |

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
