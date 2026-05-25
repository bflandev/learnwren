# Instructor UI Plan B: web-video + Dashboard — Implementation Summary

**Date:** 2026-05-22
**Spec:** `docs/superpowers/specs/2026-05-22-instructor-ui-design.md`
**Plan:** `docs/superpowers/plans/2026-05-22-instructor-ui-plan-b-web-video-dashboard.md`

Restyles the three `web-video` components into the Learn Wren dark design system and rebuilds the instructor dashboard as a welcome hero plus a course-card grid. Per the design spec (§2, §7, §10), the `web-video` work is template-and-imports only — the sole authorized logic change is a presentational `tone` computed on `video-state-badge` so it can render through `LwPill`. The dashboard is the one deliberate behavior change: it gains a read-only load of the instructor's courses via the existing `CoursesService.listCourses()`.

## What shipped

### Angular (`libs/web-video`)

- `libs/web-video/src/lib/upload/video-upload.component.ts` — adds an `imports` array with `LwButtonDirective`, `LwProgressComponent`; class body untouched.
- `libs/web-video/src/lib/upload/video-upload.component.html` — rewritten as a `border-dashed` drop-zone label (with the file `<input>` hidden via `sr-only`), `<lw-progress>` replacing the native `<progress>`, and `lwButton` Cancel / Try-again buttons. `data-testid="upload-video"`, the `(change)` binding, the `accept` list, and `role="alert"` are preserved.
- `libs/web-video/src/lib/upload/video-upload.component.spec.ts` — single assertion updated from `querySelector('progress')` to `querySelector('lw-progress')` (the one brittle tag-name selector the design spec deliberately replaces); every other test untouched.
- `libs/web-video/src/lib/player/video-player.component.ts` — drops `CommonModule` and the `styleUrls` reference; adds `LwButtonDirective` to `imports`.
- `libs/web-video/src/lib/player/video-player.component.html` — rewritten as a `rounded-lg bg-black` frame around `<video #playerEl>` with an `lwButton` retry. `#playerEl` stays unconditionally rendered for the `@ViewChild({ static: true })`; `data-testid="video-player"`, `video-player-error`, `video-player-retry`, `role="alert"`, the `controls`/`preload`/`crossorigin` attributes, and `retry()` are preserved.
- `libs/web-video/src/lib/player/video-player.component.css` — deleted (its hard-coded light-theme `#fde7e7` / `#7a1f1f` colors are replaced by design-token utilities).
- `libs/web-video/src/lib/video-state-badge.component.ts` — adds `LwPillComponent` and `LwPillTone` imports, an `imports: [LwPillComponent]` entry, and a `readonly tone = computed<LwPillTone>(...)` mirroring the existing `label`/`showSpinner` computeds: `READY → 'good'`, processing states → `'warn'`, `FAILED` and stuck-`PENDING_UPLOAD` / stuck-`TRANSCODING` → `'bad'`.
- `libs/web-video/src/lib/video-state-badge.component.html` — rewritten as `<lw-pill [tone]="tone()">` with the `data-testid`, `data-video-id`, `data-state`, and `aria-hidden` spinner preserved; the spinner gains a real `animate-spin` token-colored border.
- `libs/web-video/src/lib/video-state-badge.component.spec.ts` — adds four `tone()` tests (READY/FAILED/TRANSCODING/stalled), later extended in `ae3a53f` with PENDING_UPLOAD coverage.
- `libs/web-video/tsconfig.lib.json` — `nx sync` added the `web-ui` project reference.

### Angular (`apps/web` dashboard)

- `apps/web/src/app/dashboard/dashboard.component.ts` — rewritten as a standalone component injecting `AuthService` and `CoursesService`, exposing `displayName()`, `role()`, `isInstructor()`, and a `courses` signal (`Course[] | null`). On construction, instructors trigger `loadCourses()`; students skip the fetch entirely.
- `apps/web/src/app/dashboard/dashboard.component.html` (new) — welcome hero (`bg-bg-2` rounded panel, serif "Welcome back, {name}" heading, role meta), conditional "Create a course" CTA (instructor-only), and a `My courses` section with three states: Loading…, the empty-state `lw-card`, and the responsive course-card grid (`lw-card` + `lw-cover` + status `lw-pill`).
- `apps/web/src/app/dashboard/dashboard.component.spec.ts` (new) — five vitest specs: greets the signed-in user, renders the instructor `data-testid="create-course"` link, loads and renders course titles, shows the empty state, and the student-role case (welcome hero only, no `/api/courses` request, no "My courses" section).
- `apps/web/tsconfig.app.json` — `nx sync` added the `shared-data-models` project reference for the new `Course` type import.

## Plan deviations worth knowing about

- **Dashboard gates the courses fetch and the "My courses" section on `isInstructor()`** (`ae547a1`, landed immediately after the merge). The plan unconditionally called `CoursesService.listCourses()` in the constructor, but `GET /api/courses` is instructor-only — for a student it 403'd and the section sat on "Loading…" forever. The component now exposes `isInstructor()`, the constructor skips the fetch for non-instructors, and the template wraps the create-course CTA and the entire My-courses block in `@if (isInstructor())`. The student-only spec case was added at the same time.
- **The dashboard cover uses `coverToneForId(course.id)`** rather than the plan's plain `<lw-cover [glyph]="...">`, matching the deterministic cover-tone pattern shipped earlier on the catalog course-card (`a072ee4`, `1e03e19`).
- **The "Create a course" link gained `data-testid="create-course"`** (`44b2ca3`) so the spec could target it without depending on the `routerLink="/courses/new"` attribute string (Angular renders `routerLink` differently across change-detection cycles).
- **Two related fixes shipped alongside Plan B** (not in the plan, surfaced by the new role-gated dashboard): `b8491be` redirects non-instructors hitting `/courses` to `/dashboard` instead of `/` (which bounces to `/login`); `e2984fb` hides the "My Courses" nav link from non-instructor users in the app shell. Both close the same UX hole — students should not see instructor-only routes — and ship with their own spec updates.
- **The deliberate plan-acknowledged deviation:** the welcome hero is a flat `bg-bg-2` panel rather than the design spec's "subtle ochre-tinted gradient." A Tailwind opacity modifier on a CSS-variable token color (`from-ochre/10`) does not resolve reliably, and the gradient is cosmetic. The hero still satisfies §2.

## Verification outcome

- `web-video` unit tests stayed green at every restyle gate (plan Task 1 Step 5, Task 2 Step 4, Task 3 Step 6). The one allowed spec edit was the `<progress>` → `<lw-progress>` tag-name swap called out in Task 1 Step 4; the player and badge specs needed no edits (they assert `data-testid` hooks and `textContent` only).
- The four new `video-state-badge` `tone()` specs were written test-first (red → green) per Task 3 Steps 1–4. A follow-up commit (`ae3a53f`) added PENDING_UPLOAD tone coverage.
- The five new `dashboard.component.spec.ts` cases all pass against the rewritten component, including the post-merge student-only case added in `ae547a1`.
- `nx sync` ran twice: once to add `web-ui` to `libs/web-video/tsconfig.lib.json` (`d1d6b6f`), once to add `shared-data-models` to `apps/web/tsconfig.app.json` (`0a4b1bb`).
- Plan Task 6 (full `lint test typecheck build` on `web-video,web`) is documented in the plan but not explicitly recorded in a follow-up commit; the merge landed cleanly and downstream slices (`docs(ep06): plan EP-06 Slice B`, EP-06 Slice B implementation) continued against this base.

### Manual / live operations not yet executed

- The browser walk-through (plan Task 6 Step 2) against the Firebase emulators with a seeded instructor account — verifying the dark-theme hero, course-card grid, upload zone, state-badge pill animation, and rounded video frame end to end — is not captured as a commit. The automated `lint`/`test`/`typecheck`/`build` plus the per-task spec gates are the recorded verification, as the plan permits when emulators / a seeded account are unavailable.

## Follow-ups not in scope

Per the spec's Non-Goals and Decisions table:

- **Status-token review.** The `tokens.css` light-theme status tokens and the `--lw-warn` vs `--lw-ochre` collision are noted but deferred — they belong to a separate design-token review.
- **Dashboard / `/courses` differentiation.** The accepted overlap (both render the instructor course-card grid sharing one card pattern) is intentional; differentiation is a future call.
- **Welcome-hero ochre gradient.** Deferred for the reason in the deviations section above; can return when a token-aware gradient utility lands.
- **EP-07 instructor dashboard** (engagement metrics, enrolled-student views, real instructor "home") — this slice is the design-system restyle of the existing dashboard stub, not EP-07. README continues to list the instructor dashboard as unbuilt.
- **Student-facing screens** — catalog, course detail, search, and the student learning experience remain in their own slices (EP-05 / EP-06); Plan B does not touch them.
