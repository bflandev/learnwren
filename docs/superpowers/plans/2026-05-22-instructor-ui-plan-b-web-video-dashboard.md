# Instructor UI — Plan B: web-video restyle + dashboard

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the three `web-video` components (`video-upload`, `video-player`, `video-state-badge`) into the Learn Wren dark design system, and rebuild the instructor dashboard as a welcome hero plus a course-card grid.

**Architecture:** This is Plan B of the instructor-UI design (`docs/superpowers/specs/2026-05-22-instructor-ui-design.md`), covering §7 (`web-video`) and §2 (dashboard). The three `web-video` components are restyled template-and-imports only — component logic is untouched — consuming the `web-ui` primitives (`LwButtonDirective`, `LwProgressComponent`, `LwPillComponent`) and design-token utilities. The `video-state-badge` additionally gains a presentational `tone` computed (analogous to its existing `label`/`showSpinner` computeds) so it can render through `LwPill` with status tones. The dashboard is the one deliberate behavior change: it gains a read-only load of the instructor's courses via the existing `CoursesService` to populate its grid.

**Tech Stack:** Nx monorepo, Angular 21 (standalone, signals, built-in control flow), Tailwind CSS v3 bound to `--lw-*` design tokens, Vitest.

**Restyle rules (apply to every `web-video` task — Tasks 1–3):**
- Change only the `.html` template and the `@Component` `imports`/`styleUrls`. Do NOT change `web-video` component class logic — **with one authorized exception**: Task 3 adds a `tone` computed to `video-state-badge` (a pure presentational derivation the design spec §7 requires; it adds no new data, effects, or outputs).
- Preserve every `data-testid`, every `data-*` attribute (`data-video-id`, `data-state`), every binding (`(change)`, `(click)`, `[value]`, `#playerEl`, `role`, `aria-*`), and every `(uploaded)`/`(stateChanged)` output.
- After each restyle, `pnpm nx test web-video` must stay green. Task 1 has one unavoidable, documented spec-assertion update (the test asserts on the `<progress>` *tag name*, which the design spec deliberately replaces) — that single edit is called out explicitly in Task 1, Step 4. No other spec edits are permitted; if a test fails for any other reason, the restyle changed behavior unexpectedly — report BLOCKED, do not edit the test.

**Note on `nx sync`:** Tasks 1–3 add `@learnwren/web-ui` imports to `web-video`, so `web-video` gains a `web-ui` project dependency. Vitest resolves this via the workspace path alias, so `pnpm nx test web-video` passes before the sync; the TypeScript project reference is synced once in Task 4 (needed for `typecheck`/`build`). The dashboard (Task 5) imports `@learnwren/web-ui` and `@learnwren/web-courses`, both of which `apps/web` already references (the app shell uses `web-ui`; `app.routes.ts` imports `coursesRoutes`), so no sync is needed for `apps/web`.

---

## File Structure

**Modified — `web-video` (Tasks 1–3):**
- `libs/web-video/src/lib/upload/video-upload.component.ts` — `imports` array added.
- `libs/web-video/src/lib/upload/video-upload.component.html` — restyled template.
- `libs/web-video/src/lib/upload/video-upload.component.spec.ts` — one assertion updated (`<progress>` → `<lw-progress>`).
- `libs/web-video/src/lib/player/video-player.component.ts` — `imports` swapped, `styleUrls` removed.
- `libs/web-video/src/lib/player/video-player.component.html` — restyled template.
- `libs/web-video/src/lib/player/video-player.component.css` — **deleted** (replaced by design-token utilities).
- `libs/web-video/src/lib/video-state-badge.component.ts` — `imports` array added, `tone` computed added.
- `libs/web-video/src/lib/video-state-badge.component.html` — restyled template (rendered via `LwPill`).
- `libs/web-video/src/lib/video-state-badge.component.spec.ts` — `tone` computed coverage added.
- `libs/web-video/tsconfig.lib.json` — via `nx sync` (Task 4), `web-video` gains a `web-ui` reference.

**Modified / Created — dashboard (Task 5):**
- `apps/web/src/app/dashboard/dashboard.component.ts` — rewritten: `templateUrl`, `CoursesService`, `courses` signal.
- `apps/web/src/app/dashboard/dashboard.component.html` — **created** — welcome hero + course-card grid.
- `apps/web/src/app/dashboard/dashboard.component.spec.ts` — **created** — covers the new courses load and the hero.

---

## Task 1: Restyle the video-upload component

**Files:**
- Modify: `libs/web-video/src/lib/upload/video-upload.component.ts`
- Modify: `libs/web-video/src/lib/upload/video-upload.component.html`
- Modify: `libs/web-video/src/lib/upload/video-upload.component.spec.ts`

- [ ] **Step 1: Update the component imports**

In `libs/web-video/src/lib/upload/video-upload.component.ts`, add this import near the other imports (after the `VideoUploadService` import):
```ts
import { LwButtonDirective, LwProgressComponent } from '@learnwren/web-ui';
```
The `@Component` decorator currently has no `imports` array. Add one on the line after `templateUrl`:
```ts
@Component({
  selector: 'lib-video-upload',
  standalone: true,
  templateUrl: './video-upload.component.html',
  imports: [LwButtonDirective, LwProgressComponent],
  providers: [VideoUploadService],
})
```
Leave the class body unchanged.

- [ ] **Step 2: Rewrite the template**

Replace the entire contents of `libs/web-video/src/lib/upload/video-upload.component.html` with:
```html
@let s = svc.state();
@switch (s.kind) {
  @case ('idle') {
    <label
      class="upload-zone flex cursor-pointer flex-col items-center gap-1 rounded-lg border border-dashed border-line bg-bg p-6 text-center"
      data-testid="upload-video"
    >
      <span class="text-sm text-ink-2">
        Drag a video file here, or click to choose. MP4, MOV, or MKV up to 10 GB.
      </span>
      <input
        type="file"
        accept="video/mp4,video/quicktime,video/x-matroska,.mp4,.mov,.mkv,.m4v"
        class="sr-only"
        (change)="onFile($any($event.target).files?.[0] ?? null)"
      />
    </label>
  }
  @case ('creating-session') {
    <p class="text-sm text-ink-3">Preparing upload…</p>
  }
  @case ('uploading') {
    <div class="flex items-center gap-3">
      <lw-progress class="flex-1" [value]="s.percent / 100" />
      <span class="text-sm text-ink-2">{{ s.percent }}%</span>
      <button lwButton type="button" (click)="onCancel()">Cancel</button>
    </div>
  }
  @case ('finalizing') {
    <p class="text-sm text-ink-3">Finishing up…</p>
  }
  @case ('canceling') {
    <p class="text-sm text-ink-3">Cancelling…</p>
  }
  @case ('failed') {
    <div role="alert" class="rounded-lg border border-line bg-bg-2 p-4">
      <p class="text-sm text-bad">{{ s.reason }}</p>
      <button lwButton type="button" class="mt-2" (click)="onRetry()">Try again</button>
    </div>
  }
}
```

Notes: the native `<progress>` is replaced by `<lw-progress>` per design spec §7 (`LwProgress.value` is a 0–1 fraction, hence `s.percent / 100`). The raw file `<input>` is hidden with `sr-only` so the whole `<label>` acts as the styled drop zone — the picker still opens on click and the input stays in the DOM. The `data-testid="upload-video"`, the `(change)` binding, the `accept` list, `role="alert"`, and the Cancel/Try-again buttons are all preserved.

- [ ] **Step 3: Run the tests to verify the one expected failure**

Run: `pnpm nx test web-video`
Expected: one FAIL — `VideoUploadComponent › shows progress indicator while uploading`, because that test asserts `el.querySelector('progress')` and the `<progress>` tag is now `<lw-progress>`. All other `video-upload` tests PASS (the idle `input[type="file"]`, the `42%` text, the failed-state `role="alert"` and message, the `uploaded` emit, and the Cancel-button click are all preserved).

- [ ] **Step 4: Update the one brittle assertion**

That test asserts on an implementation detail — the HTML *tag name* — that the design spec deliberately changes. The behavior it covers (a progress indicator shows while uploading) is unchanged. Update only the element selector.

In `libs/web-video/src/lib/upload/video-upload.component.spec.ts`, in the test `it('shows progress indicator while uploading', ...)`, change:
```ts
    expect(el.querySelector('progress')).toBeTruthy();
```
to:
```ts
    expect(el.querySelector('lw-progress')).toBeTruthy();
```
Leave the `expect(el.textContent).toContain('42')` assertion and every other test unchanged.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm nx test web-video`
Expected: PASS — all `video-upload` specs green.

- [ ] **Step 6: Commit**

```bash
git add libs/web-video/src/lib/upload
git commit -m "feat(web-video): restyle the video upload component"
```

---

## Task 2: Restyle the video-player component

**Files:**
- Modify: `libs/web-video/src/lib/player/video-player.component.ts`
- Modify: `libs/web-video/src/lib/player/video-player.component.html`
- Delete: `libs/web-video/src/lib/player/video-player.component.css`

- [ ] **Step 1: Update the component imports and remove the stylesheet reference**

In `libs/web-video/src/lib/player/video-player.component.ts`:

1. Remove the `CommonModule` import line:
```ts
import { CommonModule } from '@angular/common';
```
2. Add a `web-ui` import near the other imports (after the `VideoPlayerService` import):
```ts
import { LwButtonDirective } from '@learnwren/web-ui';
```
3. In the `@Component` decorator, change:
```ts
  imports: [CommonModule],
  templateUrl: './video-player.component.html',
  styleUrls: ['./video-player.component.css'],
```
to:
```ts
  imports: [LwButtonDirective],
  templateUrl: './video-player.component.html',
```
(The `styleUrls` line is deleted entirely.) Leave the class body unchanged — the template uses only the built-in `@if`, so `CommonModule` is no longer needed.

- [ ] **Step 2: Rewrite the template**

Replace the entire contents of `libs/web-video/src/lib/player/video-player.component.html` with:
```html
<div class="overflow-hidden rounded-lg bg-black">
  <video
    #playerEl
    controls
    preload="metadata"
    crossorigin="use-credentials"
    class="block w-full"
    data-testid="video-player"
  ></video>
</div>
@if (error(); as msg) {
  <div
    class="mt-2 flex items-center gap-2 text-sm text-bad"
    role="alert"
    data-testid="video-player-error"
  >
    <span>{{ msg }}</span>
    <button
      lwButton
      type="button"
      (click)="retry()"
      data-testid="video-player-retry"
    >
      Try again
    </button>
  </div>
}
```

Notes: the `#playerEl` template ref is preserved and stays unconditionally rendered (the `@ViewChild('playerEl', { static: true })` requires it to sit outside any control flow — the plain `<div>` wrapper satisfies this). `data-testid="video-player"`, `data-testid="video-player-error"`, `data-testid="video-player-retry"`, `role="alert"`, the `controls`/`preload`/`crossorigin` attributes, and the `retry()` binding are all preserved.

- [ ] **Step 3: Delete the obsolete stylesheet**

The `.css` file held hard-coded light-theme colors (`#fde7e7`, `#7a1f1f`) that are replaced by design-token utilities. Delete it:
```bash
git rm libs/web-video/src/lib/player/video-player.component.css
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm nx test web-video`
Expected: PASS — `video-player.component.spec.ts` queries only the `data-testid` hooks and `textContent`, all of which are preserved; the attach/dispose/retry behavior is untouched.

- [ ] **Step 5: Commit**

```bash
git add libs/web-video/src/lib/player/video-player.component.ts libs/web-video/src/lib/player/video-player.component.html
git commit -m "feat(web-video): restyle the video player component"
```

(The `git rm` from Step 3 already staged the deletion.)

---

## Task 3: Restyle the video-state-badge as a pill

**Files:**
- Modify: `libs/web-video/src/lib/video-state-badge.component.ts`
- Modify: `libs/web-video/src/lib/video-state-badge.component.html`
- Modify: `libs/web-video/src/lib/video-state-badge.component.spec.ts`

This task adds a `tone` computed — a pure presentational derivation the design spec §7 mandates (`READY` → `good`, processing states → `warn`, failed/stalled → `bad`). It is written test-first.

- [ ] **Step 1: Add the failing tests for the `tone` computed**

In `libs/web-video/src/lib/video-state-badge.component.spec.ts`, add these four tests inside the `describe('VideoStateBadgeComponent — slice B copy', ...)` block, after the existing `it('shows FAILED copy', ...)` test:
```ts
  it('maps READY to the good pill tone', () => {
    fixture.componentRef.setInput('video', video('READY'));
    fixture.detectChanges();
    expect(fixture.componentInstance.tone()).toBe('good');
  });

  it('maps FAILED to the bad pill tone', () => {
    fixture.componentRef.setInput('video', video('FAILED'));
    fixture.detectChanges();
    expect(fixture.componentInstance.tone()).toBe('bad');
  });

  it('maps TRANSCODING to the warn pill tone', () => {
    fixture.componentRef.setInput('video', video('TRANSCODING'));
    fixture.detectChanges();
    expect(fixture.componentInstance.tone()).toBe('warn');
  });

  it('maps a stalled TRANSCODING video to the bad pill tone', () => {
    const stale: Video = {
      ...video('TRANSCODING'),
      updatedAt: new Date(Date.now() - 31 * 60 * 1000).toISOString() as Video['updatedAt'],
    };
    fixture.componentRef.setInput('video', stale);
    fixture.detectChanges();
    expect(fixture.componentInstance.tone()).toBe('bad');
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm nx test web-video`
Expected: FAIL — the four new tests throw `TypeError: fixture.componentInstance.tone is not a function` because the `tone` computed does not exist yet. All pre-existing tests still PASS.

- [ ] **Step 3: Add the `tone` computed**

In `libs/web-video/src/lib/video-state-badge.component.ts`:

1. Add a `web-ui` import near the other imports (after the `VideoStatePollingService` import):
```ts
import { LwPillComponent, type LwPillTone } from '@learnwren/web-ui';
```
2. Add the `tone` computed inside the class, immediately after the existing `label` computed (before `canRetry`):
```ts
  readonly tone = computed<LwPillTone>(() => {
    const v = this.current();
    if (this.isStuck(v, 'PENDING_UPLOAD')) return 'bad';
    if (this.isStuck(v, 'TRANSCODING')) return 'bad';
    switch (v.state) {
      case 'PENDING_UPLOAD':
      case 'UPLOADED':
      case 'TRANSCODING':
        return 'warn';
      case 'READY':
        return 'good';
      case 'FAILED':
        return 'bad';
      default:
        return 'default';
    }
  });
```
(`computed` is already imported from `@angular/core`; `isStuck` and `current` already exist on the class.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm nx test web-video`
Expected: PASS — the four `tone` tests now pass; all pre-existing tests still pass (the template is unchanged so far).

- [ ] **Step 5: Add `LwPillComponent` to the imports and rewrite the template**

In `libs/web-video/src/lib/video-state-badge.component.ts`, the `@Component` decorator currently has no `imports` array. Add one on the line after `templateUrl`:
```ts
@Component({
  selector: 'lib-video-state-badge',
  standalone: true,
  templateUrl: './video-state-badge.component.html',
  imports: [LwPillComponent],
})
```

Then replace the entire contents of `libs/web-video/src/lib/video-state-badge.component.html` with:
```html
<lw-pill
  data-testid="video-state-badge"
  [attr.data-video-id]="video().id"
  [attr.data-state]="video().state"
  [tone]="tone()"
>
  @if (showSpinner()) {
    <span
      class="spinner mr-1 inline-block h-3 w-3 animate-spin rounded-full border-2 border-line border-t-ochre align-[-2px]"
      aria-hidden="true"
    ></span>
  }
  {{ label() }}
</lw-pill>
```

Notes: `data-testid="video-state-badge"`, `data-video-id`, `data-state`, and the `aria-hidden` spinner are all preserved. The spinner gains a real animation (`animate-spin` with a token-colored border) — previously the `spinner` class had no backing CSS.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm nx test web-video`
Expected: PASS — all `video-state-badge` specs green (the copy tests assert `textContent`, which still renders `label()`; the `tone` tests assert the computed; the polling/`stateChanged` behavior is untouched).

- [ ] **Step 7: Commit**

```bash
git add libs/web-video/src/lib/video-state-badge.component.ts libs/web-video/src/lib/video-state-badge.component.html libs/web-video/src/lib/video-state-badge.component.spec.ts
git commit -m "feat(web-video): restyle the video state badge as a pill"
```

---

## Task 4: Sync project references

`web-video` now imports `@learnwren/web-ui`, so its TypeScript project references must be synced before `typecheck`/`build`.

- [ ] **Step 1: Sync TypeScript project references**

Run: `pnpm nx sync`
Expected: it updates `libs/web-video/tsconfig.lib.json` to add a `web-ui` project reference. (If `nx sync` reports the workspace is already up to date, proceed to Task 5 — skip Step 2.)

- [ ] **Step 2: Commit the sync result (only if `nx sync` changed files)**

Run `git status`. If `libs/web-video/tsconfig.lib.json` was modified:
```bash
git add libs/web-video/tsconfig.lib.json
git commit -m "chore(web-video): sync TS project references after wiring web-ui"
```
If `nx sync` changed nothing, skip this commit.

---

## Task 5: Restyle the dashboard with an instructor course grid

**Files:**
- Create: `apps/web/src/app/dashboard/dashboard.component.spec.ts`
- Create: `apps/web/src/app/dashboard/dashboard.component.html`
- Modify: `apps/web/src/app/dashboard/dashboard.component.ts`

This is the one deliberate behavior change in the instructor-UI restyle: the dashboard gains a read-only load of the instructor's courses (via the existing `CoursesService.listCourses()` — no new endpoint) to populate a course-card grid. It is written test-first.

- [ ] **Step 1: Create the failing spec**

Create `apps/web/src/app/dashboard/dashboard.component.spec.ts` with:
```ts
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';

import { AuthService } from '@learnwren/web-auth';

import { DashboardComponent } from './dashboard.component';

describe('DashboardComponent', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            currentUser: () => ({ displayName: 'Ada', role: 'INSTRUCTOR' }),
            logout: async () => undefined,
          },
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  it('greets the signed-in user', () => {
    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();
    http.expectOne('/api/courses').flush([]);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Welcome back, Ada');
  });

  it('renders a Create a course link to /courses/new', () => {
    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();
    http.expectOne('/api/courses').flush([]);
    fixture.detectChanges();
    const link = (fixture.nativeElement as HTMLElement).querySelector<HTMLAnchorElement>(
      'a[routerLink="/courses/new"]',
    );
    expect(link).not.toBeNull();
  });

  it('loads and renders the instructor course titles', async () => {
    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();
    http.expectOne('/api/courses').flush([
      { id: 'cid-1', title: 'Course One', description: 'D', status: 'DRAFT' },
      { id: 'cid-2', title: 'Course Two', description: 'D', status: 'PUBLISHED' },
    ]);
    await fixture.whenStable();
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Course One');
    expect(text).toContain('Course Two');
  });

  it('shows the empty state when there are no courses', async () => {
    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();
    http.expectOne('/api/courses').flush([]);
    await fixture.whenStable();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('No courses yet');
  });
});
```

- [ ] **Step 2: Run the spec to verify it fails**

Run: `pnpm nx test web`
Expected: FAIL — all four `DashboardComponent` tests fail. The current dashboard makes no `/api/courses` request, so `http.expectOne('/api/courses')` throws "Expected one matching request"; the heading also reads "Welcome," not "Welcome back,".

- [ ] **Step 3: Create the template**

Create `apps/web/src/app/dashboard/dashboard.component.html` with:
```html
<div class="mx-auto w-full max-w-5xl p-6">
  <section class="mb-8 rounded-xl border border-line bg-bg-2 p-8">
    <h1 class="font-serif text-3xl text-ink">Welcome back, {{ displayName() }}</h1>
    <p class="mt-1 text-sm text-ink-3">Signed in as {{ role() }}</p>
    <div class="mt-5 flex flex-wrap gap-2">
      <a routerLink="/courses/new" class="lw-btn lw-btn-primary">Create a course</a>
      <button lwButton variant="ghost" type="button" (click)="logout()">Sign out</button>
    </div>
  </section>

  <h2 class="mb-4 text-xl text-ink">My courses</h2>

  @if (courses() === null) {
    <p class="text-sm text-ink-3">Loading…</p>
  } @else if (courses()!.length === 0) {
    <lw-card class="p-8 text-center">
      <p class="text-ink-2">No courses yet.</p>
      <a routerLink="/courses/new" class="lw-btn lw-btn-primary mt-3 inline-block">
        Create your first course
      </a>
    </lw-card>
  } @else {
    <ul class="grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
      @for (course of courses(); track course.id) {
        <li>
          <a [routerLink]="['/courses', course.id, 'edit']" class="block no-underline">
            <lw-card class="overflow-hidden">
              <lw-cover [glyph]="course.title.charAt(0)" [height]="96" />
              <div class="flex flex-col items-start gap-2 p-4">
                <h3 class="text-base text-ink">{{ course.title }}</h3>
                <lw-pill [tone]="course.status === 'PUBLISHED' ? 'good' : 'default'">
                  {{ course.status }}
                </lw-pill>
              </div>
            </lw-card>
          </a>
        </li>
      }
    </ul>
  }
</div>
```

Note: this reuses the same instructor course-card pattern as the `courses-list-page` (design spec §3) — the deliberate dashboard/`/courses` overlap accepted in the spec's "Decisions" table.

- [ ] **Step 4: Rewrite the component**

Replace the entire contents of `apps/web/src/app/dashboard/dashboard.component.ts` with:
```ts
import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import type { Course } from '@learnwren/shared-data-models';
import { AuthService } from '@learnwren/web-auth';
import { CoursesService } from '@learnwren/web-courses';
import { LwButtonDirective, LwCardComponent, LwCoverComponent, LwPillComponent } from '@learnwren/web-ui';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink, LwButtonDirective, LwCardComponent, LwCoverComponent, LwPillComponent],
  templateUrl: './dashboard.component.html',
})
export class DashboardComponent {
  private readonly auth = inject(AuthService);
  private readonly coursesService = inject(CoursesService);

  protected readonly displayName = () => this.auth.currentUser()?.displayName ?? '';
  protected readonly role = () => this.auth.currentUser()?.role ?? '';
  readonly courses = signal<Course[] | null>(null);

  constructor() {
    void this.loadCourses();
  }

  private async loadCourses(): Promise<void> {
    this.courses.set(await this.coursesService.listCourses());
  }

  async logout(): Promise<void> {
    await this.auth.logout();
    window.location.assign('/login');
  }
}
```

- [ ] **Step 5: Run the spec to verify it passes**

Run: `pnpm nx test web`
Expected: PASS — all four `DashboardComponent` tests pass, and the existing `apps/web` tests (`app.spec.ts`) stay green (the app shell does not depend on the dashboard's internals).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/dashboard
git commit -m "feat(web): restyle the dashboard with an instructor course grid"
```

---

## Task 6: Verify the full build

- [ ] **Step 1: Run lint, test, typecheck, and build across the affected projects**

Run: `pnpm nx run-many -t lint test typecheck build --projects=web-video,web`
Expected: all targets PASS — `web-video`'s component specs, the new `web` dashboard spec, the `web-video` typecheck against the synced project reference, and the `web` build (which compiles `web-video`, `web-courses`, `web-ui`, and `web-auth` transitively) are all green.

- [ ] **Step 2: Browser check**

Start the dev server: `pnpm nx serve web` (wait until it serves on `http://localhost:4200`). Confirm `web` builds and serves with no console errors.

If the Firebase emulators (`pnpm emulators`) and a seeded instructor account are available, log in and confirm in the dark theme:
- the **dashboard** shows the welcome hero and the course-card grid (or the empty state);
- a lesson with no video shows the dashed **upload zone**; a processing video shows the **state badge** as a toned pill with a spinning indicator; a `READY` video shows the **player** in a rounded black frame.

If the emulators / a seeded account are not available, the automated `lint`/`test`/`typecheck`/`build` from Step 1 plus the per-task spec gates are the verification — state that explicitly.

Stop the dev server when done.

- [ ] **Step 3: No commit**

This task has no commit.

---

## Self-Review Notes

- **Spec coverage** (`2026-05-22-instructor-ui-design.md`): §10 defines Plan B as "the §7 `web-video` components and §2 (dashboard)". §7 `video-upload` → Task 1; §7 `video-player` → Task 2; §7 `video-state-badge` → Task 3; §2 dashboard → Task 5. §7 `materials-list` was Plan A (Task 10) and is out of scope here. §1 (`web-ui` additions) and §3–§6, §8 were all Plan A and are already merged.
- **Restyle method:** Tasks 1–2 change only the template + `imports`/`styleUrls`; Task 3 additionally adds a `tone` computed — a pure presentational derivation explicitly required by design spec §7, mirroring the existing `label`/`showSpinner` computeds (no new data, effects, or outputs). Task 5 (dashboard) is the one authorized behavior change, called out in design spec §2.
- **Test edits:** the only spec assertion changed in a restyle task is Task 1 Step 4 — `querySelector('progress')` → `querySelector('lw-progress')` — because that test asserts on an HTML tag name the design spec deliberately replaces; the behavior covered is unchanged. The `video-player` and `video-state-badge` specs needed no edits (they assert `data-testid`s and `textContent` only). New tests are added test-first in Tasks 3 and 5.
- **Type consistency:** the new `tone` computed is typed `LwPillTone` (imported from `@learnwren/web-ui`); its returned values (`'good' | 'warn' | 'bad' | 'default'`) are all members of `LwPillTone`. `LwProgressComponent.value` is a 0–1 fraction — `video-upload` passes `s.percent / 100`. The dashboard's `courses` signal is `Signal<Course[] | null>`, matching the `courses-list-page` pattern; `CoursesService.listCourses()` returns `Promise<Course[]>`.
- **Project references:** `nx sync` (Task 4) is needed only for `web-video` gaining `web-ui`. `apps/web` already references `web-ui` (app shell) and `web-courses` (`coursesRoutes` in `app.routes.ts`), so the dashboard's new imports add no project reference.
- **Deliberate deviation:** design spec §2 mentions "a subtle ochre-tinted gradient" on the welcome hero. The plan uses a flat `bg-bg-2` panel instead — a Tailwind opacity modifier on a CSS-variable token color (`from-ochre/10`) does not resolve reliably, and the gradient is cosmetic. The hero still satisfies §2 (a `bg-bg-2` rounded panel, serif "Welcome back, {name}" heading, role as quiet meta text, primary "Create a course" + ghost "Sign out").
- **Placeholder scan:** no `TBD`/`TODO`/"handle edge cases"/"similar to Task N" — every step has the exact file path, full code, exact command, and expected output.
