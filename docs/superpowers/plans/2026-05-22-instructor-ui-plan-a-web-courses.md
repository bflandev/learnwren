# Instructor UI — Plan A: web-ui additions + web-courses restyle

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the 12 `web-courses` instructor components into the Learn Wren dark design system, after two small enabling additions to `web-ui`.

**Architecture:** This is Plan A of the instructor-UI design (`docs/superpowers/specs/2026-05-22-instructor-ui-design.md`). First, two test-first additions to `web-ui`: broaden the `lwInput` directive to `textarea`/`select`, and add an `ochre` tone to `LwPill`. Then each `web-courses` component is restyled — template + `@Component.imports` only, component logic untouched — using the design system's surfaces (`bg-bg-2` cards), the `lwInput`/`lwButton`/`LwCard`/`LwCover`/`LwPill` primitives, and design-token text colors. Existing component specs (which assert on text, `data-testid`s, and behavior) are the safety net for each restyle task.

**Tech Stack:** Nx monorepo, Angular 21 (standalone), Tailwind CSS v3 bound to `--lw-*` design tokens, Angular CDK drag-drop, Vitest.

**Restyle rules (apply to every web-courses task):**
- Change only the `.html` template and the `@Component.imports` array. Do NOT change component class logic.
- Preserve every `data-testid`, every `cdkDrag`/`cdkDropList`/`cdkDragHandle` attribute, every binding (`formControlName`, `[ngModel]`, `(click)`, `(blur)`, `(keydown.*)`, `[disabled]`, `routerLink`, `role`), and every existing `class` hook (e.g. `class="error"`) — add design-system classes alongside the existing `class` value, never replace a `class` that a spec might query.
- After each restyle, `pnpm nx test web-courses` must stay green. If it does not, the restyle changed behavior unexpectedly — report BLOCKED, do not edit the test.

---

## File Structure

**Modified — `web-ui` (Tasks 1–2):**
- `libs/web-ui/src/lib/input/lw-input.directive.ts` — broadened selector.
- `libs/web-ui/src/lib/input/lw-input.directive.spec.ts` — textarea/select coverage.
- `libs/web-ui/src/lib/pill/lw-pill.component.ts` — `ochre` tone.
- `libs/web-ui/src/lib/pill/lw-pill.component.spec.ts` — `ochre` coverage.

**Modified — `web-courses` (Tasks 3–11), each its `.component.ts` (imports) + `.component.html` (template):**
- `courses-list-page`, `course-create-page`, `components/confirm-dialog`, `components/course-meta-panel`, `publish/course-publish-bar`, `publish/publish-eligibility-panel`, `components/module-tree`, `components/module-item`, `components/lesson-list`, `components/lesson-item`, `materials/materials-list`, `course-editor-page`.
- `libs/web-courses/tsconfig.lib.json` — via `nx sync` (Task 12), `web-courses` gains a `web-ui` dependency.

---

## Task 1: Broaden the `lwInput` directive to textarea and select

**Files:**
- Modify: `libs/web-ui/src/lib/input/lw-input.directive.ts`
- Modify: `libs/web-ui/src/lib/input/lw-input.directive.spec.ts`

- [ ] **Step 1: Add failing tests**

In `libs/web-ui/src/lib/input/lw-input.directive.spec.ts`, add two module-scope host components after the existing `WithClassHost` declaration:
```ts
@Component({
  standalone: true,
  imports: [LwInputDirective],
  template: `<textarea lwInput></textarea>`,
})
class TextareaHost {}

@Component({
  standalone: true,
  imports: [LwInputDirective],
  template: `<select lwInput></select>`,
})
class SelectHost {}
```
And add two test cases inside the `describe('LwInputDirective', ...)` block:
```ts
  it('styles a textarea with lwInput', () => {
    const fixture = TestBed.createComponent(TextareaHost);
    fixture.detectChanges();
    const el: HTMLTextAreaElement = fixture.nativeElement.querySelector('textarea');
    expect(el.classList.contains('bg-bg')).toBe(true);
    expect(el.classList.contains('border-line')).toBe(true);
  });

  it('styles a select with lwInput', () => {
    const fixture = TestBed.createComponent(SelectHost);
    fixture.detectChanges();
    const el: HTMLSelectElement = fixture.nativeElement.querySelector('select');
    expect(el.classList.contains('bg-bg')).toBe(true);
    expect(el.classList.contains('border-line')).toBe(true);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm nx test web-ui`
Expected: FAIL — the `textarea`/`select` elements do not receive the directive classes (the selector only matches `input`).

- [ ] **Step 3: Broaden the selector**

In `libs/web-ui/src/lib/input/lw-input.directive.ts`, change:
```ts
  selector: 'input[lwInput]',
```
to:
```ts
  selector: 'input[lwInput], textarea[lwInput], select[lwInput]',
```
Leave the `host` block unchanged.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm nx test web-ui`
Expected: PASS (4 tests in the input spec).

- [ ] **Step 5: Commit**

```bash
git add libs/web-ui/src/lib/input
git commit -m "feat(web-ui): extend lwInput directive to textarea and select"
```

---

## Task 2: Add an `ochre` tone to `LwPillComponent`

**Files:**
- Modify: `libs/web-ui/src/lib/pill/lw-pill.component.ts`
- Modify: `libs/web-ui/src/lib/pill/lw-pill.component.spec.ts`

- [ ] **Step 1: Add the failing test**

In `libs/web-ui/src/lib/pill/lw-pill.component.spec.ts`, add this test inside the `describe('LwPillComponent', ...)` block:
```ts
  it('applies the ochre tone colour', () => {
    const fixture = TestBed.createComponent(LwPillComponent);
    fixture.componentRef.setInput('tone', 'ochre');
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).style.color).toBe('var(--lw-ochre)');
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm nx test web-ui`
Expected: FAIL — `'ochre'` is not assignable to `LwPillTone` (compile error) / no `ochre` case.

- [ ] **Step 3: Add the `ochre` tone**

In `libs/web-ui/src/lib/pill/lw-pill.component.ts`, change the type:
```ts
export type LwPillTone = 'default' | 'good' | 'warn' | 'bad';
```
to:
```ts
export type LwPillTone = 'default' | 'ochre' | 'good' | 'warn' | 'bad';
```
And add an `ochre` case to the `toneColor` computed's `switch`, before the `good` case:
```ts
      case 'ochre':
        return 'var(--lw-ochre)';
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm nx test web-ui`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/web-ui/src/lib/pill
git commit -m "feat(web-ui): add ochre tone to LwPillComponent"
```

---

## Task 3: Restyle the courses-list page (CourseCard grid)

**Files:**
- Modify: `libs/web-courses/src/lib/courses-list-page/courses-list-page.component.ts`
- Modify: `libs/web-courses/src/lib/courses-list-page/courses-list-page.component.html`

- [ ] **Step 1: Update the component imports**

In `libs/web-courses/src/lib/courses-list-page/courses-list-page.component.ts`, add near the other imports:
```ts
import { LwCardComponent, LwCoverComponent, LwPillComponent } from '@learnwren/web-ui';
```
Change the `@Component` `imports` array from:
```ts
  imports: [RouterLink],
```
to:
```ts
  imports: [RouterLink, LwCardComponent, LwCoverComponent, LwPillComponent],
```

- [ ] **Step 2: Rewrite the template**

Replace the entire contents of `libs/web-courses/src/lib/courses-list-page/courses-list-page.component.html` with:
```html
<div class="mx-auto w-full max-w-5xl p-6">
  <header class="mb-6 flex items-center justify-between gap-4">
    <h1 class="text-2xl">My Courses</h1>
    <a
      data-testid="create-course"
      routerLink="/courses/new"
      class="lw-btn lw-btn-primary"
      >Create course</a
    >
  </header>

  @if (courses() === null) {
    <p class="text-sm text-ink-3">Loading…</p>
  } @else if (courses()!.length === 0) {
    <lw-card class="p-8 text-center">
      <p class="text-ink-2">No courses yet. Create your first course to begin.</p>
    </lw-card>
  } @else {
    <ul class="grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
      @for (course of courses(); track course.id) {
        <li>
          <a
            [routerLink]="['/courses', course.id, 'edit']"
            class="block no-underline"
          >
            <lw-card class="overflow-hidden">
              <lw-cover [glyph]="course.title.charAt(0)" [height]="96" />
              <div class="flex flex-col items-start gap-2 p-4">
                <h3 class="text-base text-ink">{{ course.title }}</h3>
                <lw-pill [tone]="course.status === 'PUBLISHED' ? 'good' : 'default'">{{
                  course.status
                }}</lw-pill>
              </div>
            </lw-card>
          </a>
        </li>
      }
    </ul>
  }
</div>
```

- [ ] **Step 3: Run the web-courses tests**

Run: `pnpm nx test web-courses`
Expected: PASS — `courses-list-page.component.spec.ts` and all other web-courses specs stay green (the `create-course` `data-testid`, the course links, and all text are preserved).

- [ ] **Step 4: Commit**

```bash
git add libs/web-courses/src/lib/courses-list-page
git commit -m "feat(web-courses): restyle the courses list as a card grid"
```

---

## Task 4: Restyle the course-create page

**Files:**
- Modify: `libs/web-courses/src/lib/course-create-page/course-create-page.component.ts`
- Modify: `libs/web-courses/src/lib/course-create-page/course-create-page.component.html`

- [ ] **Step 1: Update the component imports**

In `libs/web-courses/src/lib/course-create-page/course-create-page.component.ts`, add near the other imports:
```ts
import { LwButtonDirective, LwCardComponent, LwInputDirective } from '@learnwren/web-ui';
```
Change the `@Component` `imports` array from:
```ts
  imports: [ReactiveFormsModule, RouterLink],
```
to:
```ts
  imports: [ReactiveFormsModule, RouterLink, LwButtonDirective, LwCardComponent, LwInputDirective],
```

- [ ] **Step 2: Rewrite the template**

Replace the entire contents of `libs/web-courses/src/lib/course-create-page/course-create-page.component.html` with:
```html
<div class="mx-auto w-full max-w-2xl p-6">
  <header class="mb-6 flex items-center justify-between gap-4">
    <h1 class="text-2xl">Create course</h1>
    <a routerLink="/courses" class="lw-btn lw-btn-ghost">Cancel</a>
  </header>

  <lw-card class="p-6">
    <form [formGroup]="form" (ngSubmit)="submit()" class="space-y-4">
      <label class="block">
        <span class="text-sm font-medium text-ink-2">Title</span>
        <input
          lwInput
          data-testid="title"
          formControlName="title"
          maxlength="100"
          class="mt-1"
        />
      </label>
      @for (e of fieldErrors()['title'] ?? []; track e) {
        <p class="error text-sm text-bad">{{ e }}</p>
      }

      <label class="block">
        <span class="text-sm font-medium text-ink-2">Short description</span>
        <textarea
          lwInput
          data-testid="description"
          formControlName="description"
          maxlength="500"
          rows="3"
          class="mt-1"
        ></textarea>
      </label>
      @for (e of fieldErrors()['description'] ?? []; track e) {
        <p class="error text-sm text-bad">{{ e }}</p>
      }

      <label class="block">
        <span class="text-sm font-medium text-ink-2">Long description (optional)</span>
        <textarea
          lwInput
          formControlName="longDescription"
          maxlength="5000"
          rows="5"
          class="mt-1"
        ></textarea>
      </label>

      <label class="block">
        <span class="text-sm font-medium text-ink-2">Category (optional)</span>
        <select lwInput formControlName="category" class="mt-1">
          <option value="">—</option>
          @for (c of categories; track c) {
            <option [value]="c">{{ c }}</option>
          }
        </select>
      </label>

      <label class="block">
        <span class="text-sm font-medium text-ink-2">Difficulty (optional)</span>
        <select lwInput formControlName="difficulty" class="mt-1">
          <option value="">—</option>
          @for (d of difficulties; track d) {
            <option [value]="d">{{ d }}</option>
          }
        </select>
      </label>

      @if (genericError()) {
        <p class="error text-sm text-bad" data-testid="generic-error">{{ genericError() }}</p>
      }

      <button
        lwButton
        variant="primary"
        data-testid="submit"
        type="submit"
        class="w-full justify-center disabled:opacity-50"
        [disabled]="form.invalid || busy()"
      >
        {{ busy() ? 'Creating…' : 'Create' }}
      </button>
    </form>
  </lw-card>
</div>
```

- [ ] **Step 3: Run the web-courses tests**

Run: `pnpm nx test web-courses`
Expected: PASS — all web-courses specs stay green (`title`, `description`, `generic-error`, `submit` `data-testid`s and the `error` class hook are preserved).

- [ ] **Step 4: Commit**

```bash
git add libs/web-courses/src/lib/course-create-page
git commit -m "feat(web-courses): restyle the course-create form"
```

---

## Task 5: Restyle the confirm dialog

**Files:**
- Modify: `libs/web-courses/src/lib/components/confirm-dialog/confirm-dialog.component.ts`
- Modify: `libs/web-courses/src/lib/components/confirm-dialog/confirm-dialog.component.html`

- [ ] **Step 1: Update the component imports**

In `libs/web-courses/src/lib/components/confirm-dialog/confirm-dialog.component.ts`, add near the other imports:
```ts
import { LwButtonDirective, LwCardComponent } from '@learnwren/web-ui';
```
The component currently has no `imports` array in its `@Component` decorator. Add one:
```ts
  imports: [LwButtonDirective, LwCardComponent],
```
(Place it on the line after `standalone: true,`.)

- [ ] **Step 2: Rewrite the template**

Replace the entire contents of `libs/web-courses/src/lib/components/confirm-dialog/confirm-dialog.component.html` with:
```html
<div
  role="dialog"
  aria-modal="true"
  data-testid="confirm-dialog"
  class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
>
  <lw-card class="w-full max-w-sm p-6">
    <p class="text-ink">{{ message() }}</p>
    <div class="mt-5 flex justify-end gap-2">
      <button lwButton type="button" data-testid="confirm-cancel" (click)="closed.emit(false)">
        {{ cancelLabel() }}
      </button>
      <button
        lwButton
        variant="primary"
        type="button"
        data-testid="confirm-go"
        (click)="closed.emit(true)"
      >
        {{ confirmLabel() }}
      </button>
    </div>
  </lw-card>
</div>
```

- [ ] **Step 3: Run the web-courses tests**

Run: `pnpm nx test web-courses`
Expected: PASS — the `confirm-dialog`, `confirm-cancel`, `confirm-go` `data-testid`s, `role="dialog"`, `aria-modal`, and the `closed` emits are all preserved.

- [ ] **Step 4: Commit**

```bash
git add libs/web-courses/src/lib/components/confirm-dialog
git commit -m "feat(web-courses): restyle the confirm dialog as a modal"
```

---

## Task 6: Restyle the course-meta panel

**Files:**
- Modify: `libs/web-courses/src/lib/components/course-meta-panel/course-meta-panel.component.ts`
- Modify: `libs/web-courses/src/lib/components/course-meta-panel/course-meta-panel.component.html`

- [ ] **Step 1: Update the component imports**

In `libs/web-courses/src/lib/components/course-meta-panel/course-meta-panel.component.ts`, add near the other imports:
```ts
import { LwButtonDirective, LwCardComponent, LwInputDirective } from '@learnwren/web-ui';
```
Change the `@Component` `imports` array from:
```ts
  imports: [FormsModule],
```
to:
```ts
  imports: [FormsModule, LwButtonDirective, LwCardComponent, LwInputDirective],
```

- [ ] **Step 2: Rewrite the template**

Replace the entire contents of `libs/web-courses/src/lib/components/course-meta-panel/course-meta-panel.component.html` with:
```html
<lw-card class="course-meta p-5" data-testid="course-meta">
  <h2 class="mb-3 text-lg">Course details</h2>
  <div class="space-y-4">
    <label class="block">
      <span class="text-sm font-medium text-ink-2">Title</span>
      <input
        lwInput
        data-testid="course-title"
        type="text"
        [ngModel]="draftTitle() || course().title"
        (focus)="syncDrafts()"
        (ngModelChange)="draftTitle.set($event)"
        (blur)="commitTitle()"
        maxlength="100"
        class="mt-1"
      />
    </label>

    <label class="block">
      <span class="text-sm font-medium text-ink-2">Description</span>
      <textarea
        lwInput
        data-testid="course-description"
        [ngModel]="draftDescription() || course().description"
        (focus)="syncDrafts()"
        (ngModelChange)="draftDescription.set($event)"
        (blur)="commitDescription()"
        maxlength="500"
        rows="3"
        class="mt-1"
      ></textarea>
    </label>

    <button
      lwButton
      data-testid="delete-course"
      type="button"
      class="text-bad"
      (click)="deleteCourse.emit()"
    >
      Delete course
    </button>
  </div>
</lw-card>
```

- [ ] **Step 3: Run the web-courses tests**

Run: `pnpm nx test web-courses`
Expected: PASS — `course-meta`, `course-title`, `course-description`, `delete-course` `data-testid`s and the `course-meta` class hook are preserved.

- [ ] **Step 4: Commit**

```bash
git add libs/web-courses/src/lib/components/course-meta-panel
git commit -m "feat(web-courses): restyle the course-meta panel"
```

---

## Task 7: Restyle the publish bar and eligibility panel

**Files:**
- Modify: `libs/web-courses/src/lib/publish/course-publish-bar.component.ts`
- Modify: `libs/web-courses/src/lib/publish/course-publish-bar.component.html`
- Modify: `libs/web-courses/src/lib/publish/publish-eligibility-panel.component.ts`
- Modify: `libs/web-courses/src/lib/publish/publish-eligibility-panel.component.html`

- [ ] **Step 1: Update the publish-bar imports**

In `libs/web-courses/src/lib/publish/course-publish-bar.component.ts`, add near the other imports:
```ts
import { LwButtonDirective, LwPillComponent } from '@learnwren/web-ui';
```
Change the `@Component` `imports` array from:
```ts
  imports: [CommonModule],
```
to:
```ts
  imports: [CommonModule, LwButtonDirective, LwPillComponent],
```

- [ ] **Step 2: Rewrite the publish-bar template**

Replace the entire contents of `libs/web-courses/src/lib/publish/course-publish-bar.component.html` with:
```html
<div
  class="publish-bar flex flex-wrap items-center gap-3 rounded-lg border border-line bg-bg-2 p-4"
  data-testid="publish-bar"
>
  <span class="title text-lg text-ink">{{ course.title }}</span>
  <lw-pill
    data-testid="publish-bar-pill"
    [tone]="status() === 'PUBLISHED' ? 'good' : status() === 'ARCHIVED' ? 'default' : 'ochre'"
    >{{ status() }}</lw-pill
  >

  <span class="flex-1"></span>

  <button
    lwButton
    variant="primary"
    type="button"
    data-testid="publish-bar-primary"
    class="disabled:opacity-50"
    [disabled]="primaryDisabled()"
    (click)="onPrimary()"
    [attr.title]="
      primaryKind() === 'publish' && !primaryDisabled()
        ? null
        : primaryKind() === 'publish'
          ? 'Resolve the issues below first'
          : null
    "
  >
    {{ primaryLabel() }}
  </button>

  @if (canArchive()) {
    <button
      lwButton
      type="button"
      data-testid="publish-bar-archive"
      class="disabled:opacity-50"
      [disabled]="inFlight()"
      (click)="onArchive()"
    >
      Archive course…
    </button>
  }

  @if (genericError(); as msg) {
    <div class="banner w-full text-sm text-bad" role="alert">{{ msg }}</div>
  }
</div>
```

- [ ] **Step 3: Update the eligibility-panel imports**

In `libs/web-courses/src/lib/publish/publish-eligibility-panel.component.ts`, add near the other imports:
```ts
import { LwButtonDirective } from '@learnwren/web-ui';
```
Change the `@Component` `imports` array from:
```ts
  imports: [CommonModule],
```
to:
```ts
  imports: [CommonModule, LwButtonDirective],
```

- [ ] **Step 4: Rewrite the eligibility-panel template**

Replace the entire contents of `libs/web-courses/src/lib/publish/publish-eligibility-panel.component.html` with:
```html
@if (eligibility(); as e) {
  <div
    class="panel rounded-lg border border-line bg-bg-2 p-4"
    data-testid="eligibility-panel"
  >
    @if (e.eligible) {
      <div class="panel-header ok flex items-center gap-2 text-good">
        <span>&#x2713; Ready to publish</span>
      </div>
    } @else {
      <div class="panel-header blocked flex items-center gap-2 text-warn">
        <span
          >&#x24D8; {{ reasonCount() }} thing{{ reasonCount() === 1 ? '' : 's' }} to fix
          before publishing</span
        >
      </div>
      <ul class="reasons mt-3 space-y-2">
        @for (r of e.reasons; track $index) {
          <li class="flex flex-wrap items-center gap-2">
            <span class="reason-text text-sm text-ink-2">{{ reasonText(r) }}</span>
            @if (jumpLinkVisible(r) === 'lesson') {
              <button
                lwButton
                variant="ghost"
                type="button"
                class="jump"
                data-testid="jump-lesson"
                (click)="onJump(r)"
              >
                Jump to lesson &#x25B8;
              </button>
            }
            @if (jumpLinkVisible(r) === 'module') {
              <button
                lwButton
                variant="ghost"
                type="button"
                class="jump"
                data-testid="jump-module"
                (click)="onJump(r)"
              >
                Jump to module &#x25B8;
              </button>
            }
          </li>
        }
      </ul>
    }
    @if (lastError(); as msg) {
      <div
        class="error-banner mt-3 text-sm text-bad"
        role="alert"
        data-testid="eligibility-error"
      >
        <span>Couldn't check publish status — {{ msg }}</span>
      </div>
    }
  </div>
}
```

- [ ] **Step 5: Run the web-courses tests**

Run: `pnpm nx test web-courses`
Expected: PASS — `publish-bar`, `publish-bar-pill`, `publish-bar-primary`, `publish-bar-archive`, `eligibility-panel`, `jump-lesson`, `jump-module`, `eligibility-error` `data-testid`s and the `publish-bar` / `panel` / `pill` / `banner` / `jump` class hooks are preserved.

- [ ] **Step 6: Commit**

```bash
git add libs/web-courses/src/lib/publish
git commit -m "feat(web-courses): restyle the publish bar and eligibility panel"
```

---

## Task 8: Restyle the module tree and module item

**Files:**
- Modify: `libs/web-courses/src/lib/components/module-tree/module-tree.component.html`
- Modify: `libs/web-courses/src/lib/components/module-item/module-item.component.ts`
- Modify: `libs/web-courses/src/lib/components/module-item/module-item.component.html`

The `module-tree` component has no `<button>`/`<input>` of its own (only the `cdkDropList` and the `@empty` text), so it needs **no `imports` change** — only its template.

- [ ] **Step 1: Rewrite the module-tree template**

Replace the entire contents of `libs/web-courses/src/lib/components/module-tree/module-tree.component.html` with:
```html
<div
  cdkDropList
  (cdkDropListDropped)="onDrop($event)"
  data-testid="module-tree"
  class="space-y-3"
>
  @for (node of nodes(); track node.module.id) {
    <div cdkDrag [attr.data-module-id]="node.module.id">
      <lib-module-item
        [module]="node.module"
        [lessons]="node.lessons"
        [courseId]="courseId()"
        (renameModule)="renameModule.emit({ moduleId: node.module.id, title: $event })"
        (deleteModule)="deleteModule.emit(node.module.id)"
        (addLesson)="addLesson.emit({ moduleId: node.module.id, title: $event })"
        (renameLesson)="renameLesson.emit({ moduleId: node.module.id, lessonId: $event.lessonId, title: $event.title })"
        (deleteLesson)="deleteLesson.emit({ moduleId: node.module.id, lessonId: $event })"
        (reorderLessons)="reorderLessons.emit({ moduleId: node.module.id, lessonIds: $event })"
        (videoChanged)="videoChanged.emit()"
        (videoStateChanged)="videoStateChanged.emit($event)"
      ></lib-module-item>
    </div>
  } @empty {
    <p class="empty text-sm text-ink-3">No modules yet. Click "Add module" to begin.</p>
  }
</div>
```

- [ ] **Step 2: Update the module-item imports**

In `libs/web-courses/src/lib/components/module-item/module-item.component.ts`, add near the other imports:
```ts
import { LwButtonDirective, LwCardComponent, LwInputDirective } from '@learnwren/web-ui';
```
Change the `@Component` `imports` array from:
```ts
  imports: [FormsModule, LessonListComponent],
```
to:
```ts
  imports: [FormsModule, LessonListComponent, LwButtonDirective, LwCardComponent, LwInputDirective],
```

- [ ] **Step 3: Rewrite the module-item template**

Replace the entire contents of `libs/web-courses/src/lib/components/module-item/module-item.component.html` with:
```html
<lw-card class="module-item block p-4" data-testid="module-item">
  <header class="mb-3 flex flex-wrap items-center gap-2">
    @if (editing()) {
      <input
        lwInput
        data-testid="module-rename-input"
        type="text"
        class="flex-1"
        [ngModel]="draftTitle()"
        (ngModelChange)="draftTitle.set($event)"
        (blur)="commit()"
        (keydown.enter)="commit()"
        (keydown.escape)="cancel()"
      />
    } @else {
      <button
        type="button"
        data-testid="module-title"
        class="flex-1 text-left font-serif text-lg text-ink"
        (click)="startEdit()"
      >
        {{ module().title }}
      </button>
    }
    <button
      lwButton
      data-testid="module-delete"
      type="button"
      class="text-bad"
      (click)="deleteModule.emit()"
    >
      Delete module
    </button>
  </header>

  <lib-lesson-list
    [lessons]="lessons()"
    [courseId]="courseId()"
    (reorder)="reorderLessons.emit($event)"
    (renameLesson)="renameLesson.emit($event)"
    (deleteLesson)="deleteLesson.emit($event)"
    (videoChanged)="videoChanged.emit()"
    (videoStateChanged)="videoStateChanged.emit($event)"
  ></lib-lesson-list>

  @if (addingLesson()) {
    <input
      lwInput
      data-testid="add-lesson-input"
      type="text"
      class="mt-3"
      [ngModel]="newLessonTitle()"
      (ngModelChange)="newLessonTitle.set($event)"
      (blur)="commitAddLesson()"
      (keydown.enter)="commitAddLesson()"
      placeholder="New lesson title"
    />
  } @else {
    <button
      lwButton
      variant="ghost"
      data-testid="add-lesson"
      type="button"
      class="mt-3"
      (click)="beginAddLesson()"
    >
      Add lesson
    </button>
  }
</lw-card>
```

- [ ] **Step 4: Run the web-courses tests**

Run: `pnpm nx test web-courses`
Expected: PASS — `module-tree`, `module-item`, `module-rename-input`, `module-title`, `module-delete`, `add-lesson-input`, `add-lesson` `data-testid`s, the `cdkDrag`/`cdkDropList`/`data-module-id` wiring, and the `module-item`/`empty` class hooks are preserved.

- [ ] **Step 5: Commit**

```bash
git add libs/web-courses/src/lib/components/module-tree libs/web-courses/src/lib/components/module-item
git commit -m "feat(web-courses): restyle the module tree and module item"
```

---

## Task 9: Restyle the lesson list and lesson item

**Files:**
- Modify: `libs/web-courses/src/lib/components/lesson-list/lesson-list.component.html`
- Modify: `libs/web-courses/src/lib/components/lesson-item/lesson-item.component.ts`
- Modify: `libs/web-courses/src/lib/components/lesson-item/lesson-item.component.html`

The `lesson-list` component has no `<button>`/`<input>` of its own, so it needs **no `imports` change** — only its template.

- [ ] **Step 1: Rewrite the lesson-list template**

Replace the entire contents of `libs/web-courses/src/lib/components/lesson-list/lesson-list.component.html` with:
```html
<ul
  cdkDropList
  (cdkDropListDropped)="onDrop($event)"
  data-testid="lesson-list"
  class="m-0 list-none space-y-2 p-0"
>
  @for (lesson of lessons(); track lesson.id) {
    <li cdkDrag [attr.data-lesson-id]="lesson.id">
      <lib-lesson-item
        [lesson]="lesson"
        [courseId]="courseId()"
        (rename)="renameLesson.emit({ lessonId: lesson.id, title: $event })"
        (delete)="deleteLesson.emit(lesson.id)"
        (videoChanged)="videoChanged.emit()"
        (videoStateChanged)="videoStateChanged.emit($event)"
      ></lib-lesson-item>
    </li>
  } @empty {
    <li class="empty text-sm text-ink-3">No lessons yet.</li>
  }
</ul>
```

- [ ] **Step 2: Update the lesson-item imports**

In `libs/web-courses/src/lib/components/lesson-item/lesson-item.component.ts`, add near the other imports:
```ts
import { LwButtonDirective, LwInputDirective } from '@learnwren/web-ui';
```
Change the `@Component` `imports` array from:
```ts
  imports: [FormsModule, VideoUploadComponent, VideoStateBadgeComponent, VideoPlayerComponent, MaterialsListComponent],
```
to:
```ts
  imports: [FormsModule, VideoUploadComponent, VideoStateBadgeComponent, VideoPlayerComponent, MaterialsListComponent, LwButtonDirective, LwInputDirective],
```

- [ ] **Step 3: Rewrite the lesson-item template**

Replace the entire contents of `libs/web-courses/src/lib/components/lesson-item/lesson-item.component.html` with:
```html
<div class="lesson-item rounded border border-line bg-bg p-3" data-testid="lesson-item">
  <div class="flex flex-wrap items-center gap-2">
    @if (editing()) {
      <input
        lwInput
        data-testid="lesson-rename-input"
        type="text"
        class="flex-1"
        [ngModel]="draftTitle()"
        (ngModelChange)="draftTitle.set($event)"
        (blur)="commit()"
        (keydown.enter)="commit()"
        (keydown.escape)="cancel()"
      />
    } @else {
      <button
        type="button"
        data-testid="lesson-title"
        class="flex-1 text-left text-ink"
        (click)="startEdit()"
      >
        {{ lesson().title }}
      </button>
    }
    <button
      lwButton
      variant="ghost"
      data-testid="lesson-delete"
      type="button"
      class="text-bad"
      (click)="delete.emit()"
    >
      Delete
    </button>
  </div>

  <div class="mt-3 space-y-3">
    @if (lesson().videoId) {
      @if (video(); as v) {
        @if (v.state === 'READY') {
          <lib-video-player [videoId]="v.id" />
        } @else {
          <lib-video-state-badge [video]="v" (stateChanged)="videoStateChanged.emit($event)" />
        }
      }
    } @else {
      <lib-video-upload
        [courseId]="courseId()"
        [moduleId]="lesson().moduleId"
        [lessonId]="lesson().id"
        (uploaded)="onVideoUploaded()"
      />
    }
    <lib-materials-list
      [courseId]="courseId()"
      [moduleId]="lesson().moduleId"
      [lessonId]="lesson().id"
    />
  </div>
</div>
```

- [ ] **Step 4: Run the web-courses tests**

Run: `pnpm nx test web-courses`
Expected: PASS — `lesson-list`, `lesson-item`, `lesson-rename-input`, `lesson-title`, `lesson-delete` `data-testid`s, the `cdkDrag`/`cdkDropList`/`data-lesson-id` wiring, the child component bindings, and the `lesson-item`/`empty` class hooks are preserved.

- [ ] **Step 5: Commit**

```bash
git add libs/web-courses/src/lib/components/lesson-list libs/web-courses/src/lib/components/lesson-item
git commit -m "feat(web-courses): restyle the lesson list and lesson item"
```

---

## Task 10: Restyle the materials list

**Files:**
- Modify: `libs/web-courses/src/lib/materials/materials-list.component.ts`
- Modify: `libs/web-courses/src/lib/materials/materials-list.component.html`

- [ ] **Step 1: Update the component imports**

In `libs/web-courses/src/lib/materials/materials-list.component.ts`, add near the other imports:
```ts
import { LwButtonDirective, LwInputDirective } from '@learnwren/web-ui';
```
Change the `@Component` `imports` array from:
```ts
  imports: [FormsModule, ConfirmDialogComponent],
```
to:
```ts
  imports: [FormsModule, ConfirmDialogComponent, LwButtonDirective, LwInputDirective],
```

- [ ] **Step 2: Rewrite the template**

Replace the entire contents of `libs/web-courses/src/lib/materials/materials-list.component.html` with:
```html
<section class="materials rounded border border-line bg-bg-2 p-3" data-testid="materials-list">
  <h4 class="mb-2 text-sm font-medium text-ink-2">Lesson materials</h4>

  @if (loadError()) {
    <p data-testid="materials-load-error" class="text-sm text-bad">
      Couldn't load materials.
      <button lwButton variant="ghost" type="button" (click)="refresh()">Retry</button>
    </p>
  } @else if (materials().length === 0) {
    <p data-testid="materials-empty" class="text-sm text-ink-3">No materials yet.</p>
  }

  @if (removedNotice(); as notice) {
    <p data-testid="material-gone" class="text-sm text-warn">{{ notice }}</p>
  }

  <ul class="m-0 list-none space-y-1 p-0">
    @for (m of materials(); track m.id) {
      <li data-testid="material-row" class="flex flex-wrap items-center gap-2">
        @if (editingId() === m.id) {
          <input
            lwInput
            data-testid="material-rename-input"
            type="text"
            class="flex-1"
            [ngModel]="draftName()"
            (ngModelChange)="draftName.set($event)"
            (blur)="commitRename(m)"
            (keydown.enter)="commitRename(m)"
            (keydown.escape)="cancelRename()"
          />
        } @else {
          <button
            type="button"
            data-testid="material-name"
            class="flex-1 text-left text-sm text-ink"
            (click)="startRename(m)"
          >
            {{ m.displayName }}
          </button>
        }
        <button lwButton variant="ghost" type="button" data-testid="material-download" (click)="download(m)">
          Download
        </button>
        <button
          lwButton
          variant="ghost"
          type="button"
          data-testid="material-remove"
          class="text-bad"
          (click)="askRemove(m)"
        >
          Remove
        </button>
      </li>
    }
  </ul>

  @for (p of upload.inFlight(); track p.filename) {
    <p data-testid="material-uploading" class="text-sm text-ink-3">
      {{ p.filename }} — {{ p.percent }}%
    </p>
  }
  @for (f of upload.failures(); track f.filename) {
    <p data-testid="material-upload-error" class="text-sm text-bad">
      {{ f.filename }}: {{ f.reason }}
    </p>
  }

  <label data-testid="material-add" class="mt-2 inline-flex cursor-pointer items-center">
    <span class="lw-btn lw-btn-ghost">Add material</span>
    <input
      type="file"
      multiple
      accept=".pdf,.docx,.pptx,.xlsx,.txt,.zip"
      class="sr-only"
      (change)="onFilesSelected($event)"
    />
  </label>
  <p class="hint mt-1 text-xs text-ink-3">
    PDF, DOCX, PPTX, XLSX, TXT, or ZIP, up to 50 MB each.
  </p>

  @if (pendingRemoval(); as m) {
    <lib-confirm-dialog
      [message]="'Remove \'' + m.displayName + '\'? This cannot be undone.'"
      confirmLabel="Remove material"
      (closed)="confirmRemoval($event)"
    />
  }
</section>
```

Note: the file `<input>` is visually hidden with `sr-only` and the styled `<span class="lw-btn lw-btn-ghost">` inside the `<label>` acts as the click target — this keeps the native file picker working while giving it a design-system look.

- [ ] **Step 3: Run the web-courses tests**

Run: `pnpm nx test web-courses`
Expected: PASS — all `material-*` `data-testid`s (`materials-list`, `materials-load-error`, `materials-empty`, `material-gone`, `material-row`, `material-rename-input`, `material-name`, `material-download`, `material-remove`, `material-uploading`, `material-upload-error`, `material-add`) and the `materials`/`hint` class hooks are preserved.

- [ ] **Step 4: Commit**

```bash
git add libs/web-courses/src/lib/materials
git commit -m "feat(web-courses): restyle the lesson materials list"
```

---

## Task 11: Restyle the course-editor page

**Files:**
- Modify: `libs/web-courses/src/lib/course-editor-page/course-editor-page.component.ts`
- Modify: `libs/web-courses/src/lib/course-editor-page/course-editor-page.component.html`

- [ ] **Step 1: Update the component imports**

In `libs/web-courses/src/lib/course-editor-page/course-editor-page.component.ts`, add near the other imports:
```ts
import { LwButtonDirective } from '@learnwren/web-ui';
```
Change the `@Component` `imports` array from:
```ts
  imports: [RouterLink, CourseMetaPanelComponent, ModuleTreeComponent, ConfirmDialogComponent, CoursePublishBarComponent, PublishEligibilityPanelComponent],
```
to:
```ts
  imports: [RouterLink, CourseMetaPanelComponent, ModuleTreeComponent, ConfirmDialogComponent, CoursePublishBarComponent, PublishEligibilityPanelComponent, LwButtonDirective],
```

- [ ] **Step 2: Rewrite the template**

Replace the entire contents of `libs/web-courses/src/lib/course-editor-page/course-editor-page.component.html` with:
```html
<div class="mx-auto w-full max-w-4xl p-6">
  <header class="mb-5">
    <a routerLink="/courses" class="text-sm text-ochre hover:underline">← My Courses</a>
  </header>

  @if (tree() === null) {
    <p class="text-sm text-ink-3">Loading…</p>
  } @else {
    <div class="space-y-5">
      <lib-course-publish-bar
        [course]="tree()!.course"
        (courseUpdated)="onCourseUpdated($event)"
        (requestConfirm)="requestPublishConfirm($event)"
      />
      @if (tree()!.course.status === 'DRAFT') {
        <lib-publish-eligibility-panel
          (jumpToModule)="onJumpToModule($event)"
          (jumpToLesson)="onJumpToLesson($event)"
        />
      }

      <lib-course-meta-panel
        [course]="tree()!.course"
        (update)="onUpdateCourse($event)"
        (deleteCourse)="requestDeleteCourse()"
      ></lib-course-meta-panel>

      <div class="flex items-center justify-between gap-4">
        <h2 class="text-lg">Modules</h2>
        <button lwButton data-testid="add-module" type="button" (click)="addModule()">
          Add module
        </button>
      </div>

      <lib-module-tree
        [nodes]="nodes()"
        [courseId]="cid()"
        (reorderModules)="onReorderModules($event)"
        (renameModule)="onRenameModule($event)"
        (deleteModule)="requestDeleteModule($event)"
        (addLesson)="onAddLesson($event)"
        (renameLesson)="onRenameLesson($event)"
        (deleteLesson)="requestDeleteLesson($event)"
        (reorderLessons)="onReorderLessons($event)"
        (videoChanged)="refresh()"
        (videoStateChanged)="onVideoStateChanged($event)"
      ></lib-module-tree>
    </div>
  }

  @if (error()) {
    <p class="error mt-4 text-sm text-bad" data-testid="editor-error" role="alert">
      {{ error() }}
    </p>
  }

  @if (pendingConfirm()) {
    <lib-confirm-dialog
      [message]="confirmMessage()"
      (closed)="onConfirmClosed($event)"
    ></lib-confirm-dialog>
  }
</div>
```

- [ ] **Step 3: Run the web-courses tests**

Run: `pnpm nx test web-courses`
Expected: PASS — the `add-module` and `editor-error` `data-testid`s, the `error` class hook, all child-component bindings, and the `role="alert"` are preserved.

- [ ] **Step 4: Commit**

```bash
git add libs/web-courses/src/lib/course-editor-page
git commit -m "feat(web-courses): restyle the course-editor page"
```

---

## Task 12: Sync project references and verify

`web-courses` now imports `@learnwren/web-ui`, so its TypeScript project references must be synced.

- [ ] **Step 1: Sync TypeScript project references**

Run: `pnpm nx sync`
Expected: it updates `libs/web-courses/tsconfig.lib.json` to add a `web-ui` project reference. (If `nx sync` reports the workspace is up to date, proceed.)

- [ ] **Step 2: Commit the sync result (only if `nx sync` changed files)**

Run `git status`. If a tsconfig was modified:
```bash
git add libs/web-courses/tsconfig.lib.json
git commit -m "chore(web-courses): sync TS project references after wiring web-ui"
```
If `nx sync` changed nothing, skip this commit.

- [ ] **Step 3: Run lint, test, typecheck, and build across the affected projects**

Run: `pnpm nx run-many -t lint test typecheck build --projects=web-ui,web-courses,web`
Expected: all targets PASS — `web-ui`'s tests, all `web-courses` component specs, and the `web` build are green.

- [ ] **Step 4: Browser check**

Start the dev server: `pnpm nx serve web` (wait until it serves on `http://localhost:4200`). Confirm `web` builds and serves with no console errors. (Logging in to see the instructor pages live requires the emulators + a seeded instructor account; if that is not available, the automated `lint`/`test`/`typecheck`/`build` from Step 3 plus the per-task spec gates are the verification.) Stop the dev server when done.

- [ ] **Step 5: No commit**

This task's only commit is the optional sync commit in Step 2.

---

## Self-Review Notes

- **Spec coverage** (`2026-05-22-instructor-ui-design.md`): §1 → Tasks 1–2; §3 courses list → Task 3; §4 course-create + meta panel → Tasks 4, 6; §5 editor → Tasks 7, 11; §6 module tree → Tasks 8, 9; §7 materials → Task 10; §8 confirm dialog → Task 5. §2 (dashboard) and the §7 `web-video` components are Plan B, not this plan. The `web-video` components used inside `lesson-item` (Task 9) are left rendered as-is — they are restyled by Plan B.
- **Restyle method:** every web-courses task changes only the template + `imports`; component logic is untouched; existing specs are the safety net (run after each task).
- **Type consistency:** the only new exported symbol is the broadened `LwInputDirective` selector and the `LwPillTone` `'ochre'` value (Tasks 1–2). Imported `web-ui` symbols — `LwButtonDirective`, `LwInputDirective`, `LwCardComponent`, `LwCoverComponent`, `LwPillComponent` — all exist in `libs/web-ui/src/index.ts` from the foundation.
- **Preservation:** every `data-testid`, `cdk*` attribute, binding, and existing `class` hook is carried through unchanged; design-system classes are added alongside.
