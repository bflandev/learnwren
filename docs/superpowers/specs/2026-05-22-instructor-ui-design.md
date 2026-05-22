# Instructor UI Design Spec

**Status:** Draft
**Scope:** Apply the Learn Wren design system to the instructor-facing surface — the dashboard, the course-authoring pages (`libs/web-courses`, 12 components), and the video components (`libs/web-video`, 3 components). This is Slices 4–5 of the design-system adoption (`docs/superpowers/specs/2026-05-22-design-system-adoption-design.md` §4), now given its own design pass.

## Goal

The instructor UI is currently unstyled — the `web-courses` pages are bare semantic HTML, the `web-video` components use class-name hooks with no backing CSS, and the dashboard is a white card with text that is now illegible on the dark theme. This spec defines how the design system (dark earth-tone tokens, `web-ui` primitives, the app shell) is applied across the instructor surface so it becomes a cohesive, legible, professional authoring tool.

The design artifact (`docs/design/`) mocked only student screens; the instructor screens are designed here by extrapolating the same studio language.

## Non-Goals

- **No behavior or feature changes.** Restyle only: component templates and `@Component.imports` change; component class logic does not — with **one deliberate exception**, the dashboard (§2), which gains a read-only call to load the instructor's courses for its card grid. Existing specs are the safety net.
- **No information-architecture changes.** Page structures, routes, and the component tree (course editor = publish bar → eligibility → meta → modules) are kept; only their presentation changes.
- **Student-facing screens** (catalogue, course detail, search, the student learning experience) remain unbuilt and out of scope.
- **No new `web-ui` primitives beyond two small additions** (§1). The modal, upload zone, and player chrome are each used once and are styled in place rather than abstracted.
- **No drag-and-drop behavior changes** — the `cdkDrag`/`cdkDropList` wiring in the module tree is preserved; only the drag handles and rows are restyled.

## Decisions Made During Brainstorming

| Decision | Choice | Rationale |
| :--- | :--- | :--- |
| Design depth | Pragmatic mix | The course list and dashboard adopt the artifact's `CourseCard` grid pattern; the editor, forms, dialogs, and video components get a clean, consistent design-system treatment. Instructor tooling favors efficiency over marketing flourish. |
| New primitives | Broaden `lwInput` to `textarea`/`select`; add an `ochre` tone to `LwPill` | Minimal. The modal, upload zone, and player chrome are used once each and styled in place. |
| Restyle method | Templates + `@Component.imports` only; component logic untouched; existing specs stay green | The proven approach from the auth-pages restyle (Slice 3). |
| Implementation | One spec → two plans: (A) `web-ui` additions + `web-courses`; (B) `web-video` + dashboard | `web-courses` and `web-video` are separate libraries/subsystems; each plan produces working, testable software on its own. |
| Dashboard vs. `/courses` | Both render the instructor course-card grid, sharing one card component | Accepted overlap: the dashboard is the instructor "home", `/courses` is the dedicated list. Can be differentiated later. |
| Status colors | `tokens.css` light-theme status tokens and the `--lw-warn` vs `--lw-ochre` collision are **noted but deferred** | Those are design-token decisions on the verbatim design artifact; they belong to a separate token review and do not block this work. |

## 1. `web-ui` Additions

Two small additions to the design-system library, done first because the instructor screens depend on them:

1. **Broaden `LwInputDirective`** — change its selector from `input[lwInput]` to `input[lwInput], textarea[lwInput], select[lwInput]`. The host class string (border, `bg-bg`, padding, `text-ink`, focus ring) applies to all three. The course-create form and course-meta panel have `<textarea>` and `<select>` controls that need consistent styling.
2. **Add an `ochre` tone to `LwPillComponent`** — extend `LwPillTone` to `'default' | 'ochre' | 'good' | 'warn' | 'bad'` and add the `case 'ochre': return 'var(--lw-ochre)'` branch to `toneColor`. Used by the video state badge and for pill consistency.

Both are test-first changes to `libs/web-ui`.

## 2. Dashboard

`apps/web/src/app/dashboard/dashboard.component.ts` (currently a white card: "Welcome, {name}", role, Sign out).

- A **welcome hero**: a `bg-bg-2` rounded panel with a subtle ochre-tinted gradient and a serif "Welcome back, {name}" heading; the user's role shown as quiet meta text.
- A primary **"Create a course"** action (`lwButton variant="primary"`, routes to `/courses/new`) and a **Sign out** ghost `lwButton`.
- Below the hero, the instructor's courses as the **CourseCard grid** (§3) — making the dashboard a useful landing page.
- The dashboard is the single component that gains a small logic change: a read-only load of the instructor's courses via the existing `CoursesService` (no new endpoint), to populate the grid. Its component spec is updated accordingly. This is the one carve-out from the "restyle only" rule.

## 3. "My Courses" List (`/courses`)

`libs/web-courses/src/lib/courses-list-page`.

- A **page header**: a serif title ("My Courses") and a primary **"Create course"** `lwButton` aligned to the right.
- The course list becomes a **responsive CourseCard grid** (1 column on narrow viewports, 2–3 columns wider). Each card is an `LwCard` containing: a compact `LwCover` (tone + glyph derived from the course — e.g. first letter of the title), the serif course title, and a status `LwPill` — `DRAFT` → default tone, `PUBLISHED` → `good`, `ARCHIVED` → muted/`default`. The whole card links to `/courses/:id/edit`.
- **Loading** state: a quiet "Loading…" in `text-ink-3`. **Empty** state: a centered message in an `LwCard` with the "Create course" call to action.

The instructor course card is simpler than the design artifact's student `CourseCard` (no students/duration/rating) — it is a distinct, lighter card.

## 4. Course Create Page & Course Meta Panel

`libs/web-courses/src/lib/course-create-page` and `components/course-meta-panel`.

- **Course create**: a page header ("Create course" + a "Cancel" ghost link) and a centered `LwCard` form panel. `lwInput` on the title `<input>`, the description/long-description `<textarea>`s, and the category/difficulty `<select>`s. Submit is `lwButton variant="primary"`. Per-field validation errors render in `text-bad`; the generic error keeps its `data-testid` and renders in `text-bad`.
- **Course meta panel** (inside the editor): an `LwCard` titled section with `lwInput`-styled title input and description textarea (inline-commit behavior preserved), and a destructive "Delete course" `lwButton` in a `bad` tone.

## 5. Course Editor

`libs/web-courses/src/lib/course-editor-page` plus the publish components.

- A **back-link header** ("← My Courses") styled as a ghost/`text-ochre` link, with the course title shown prominently (serif).
- The page is a single-column vertical flow with generous spacing between sections — the existing order is kept: publish bar → eligibility panel (when `DRAFT`) → meta panel → "Add module" → module tree.
- **Publish bar** (`publish/course-publish-bar`): a `bg-bg-2` bar holding the course title, a status `LwPill`, the primary action `lwButton` (Publish / etc.), an "Archive course…" ghost `lwButton` when applicable, and a `bad`-toned error banner. The bespoke `pill pill-{status}` / `primary` / `secondary` / `banner` class hooks are replaced.
- **Publish eligibility panel** (`publish/publish-eligibility-panel`): an `LwCard`. The "ready to publish" header uses a `good` tone; the "N things to fix" header uses a `warn`/`bad` tone; the reasons list is clean rows, each with a ghost `lwButton` "Jump to lesson/module" where applicable. The error banner uses a `bad` tone.
- **"Add module"** becomes an `lwButton`.

## 6. Module Tree

`libs/web-courses/src/lib/components/module-tree`, `module-item`, `lesson-list`, `lesson-item`.

- **Module tree**: the `cdkDropList` container is restyled as a vertically-spaced stack; the `@empty` "No modules yet" message is a quiet `text-ink-3` line in an `LwCard`.
- **Module item**: an `LwCard` with a header row — the inline-editable module title (display mode = a text button styled to read as a heading; edit mode = `lwInput`), a drag-handle affordance, and a "Delete module" ghost/`bad` `lwButton`. Contains the lesson list and the "Add lesson" `lwButton` (or `lwInput` when adding).
- **Lesson list / lesson item**: each lesson is a sub-row within the module card (a recessed `bg-bg` row), with the inline-editable lesson title, a "Delete" ghost/`bad` `lwButton`, and — beneath it — the lesson's video area (§7) and materials (§7). The `@empty` "No lessons yet" is quiet meta text.
- `cdkDrag` / `cdkDropList` wiring and all `data-testid`/`data-*` attributes are preserved exactly; only classes and the drag-handle presentation change.

## 7. Lesson Video & Materials

`libs/web-video` (`video-upload`, `video-player`, `video-state-badge`) and `libs/web-courses/src/lib/materials/materials-list`.

- **Video upload**: the idle drop area becomes a dashed-border `bg-bg` zone with the instruction text in `text-ink-2`. Upload progress renders with `LwProgress` plus the percentage and a Cancel `lwButton`. The `creating-session`/`finalizing`/`canceling` states are quiet status lines; the `failed` state uses a `bad`-toned alert with a "Try again" `lwButton`.
- **Video player**: the `<video>` element sits in a rounded, near-black (`bg-ink` / dark) container; the error block uses `text-bad` with a "Try again" `lwButton`.
- **Video state badge**: rendered via `LwPill` — `READY`/"Ready to publish" → `good`; `UPLOADED`/`TRANSCODING`/"processing" → `warn`; `FAILED` → `bad`; the stalled-retry states → `bad`. The existing spinner is kept and restyled.
- **Materials list**: an `LwCard`-style section with a heading; each material is a row with the name (an inline-rename `lwInput` in edit mode, a text button otherwise), and "Download"/"Remove" ghost `lwButton`s. In-flight uploads and upload errors render as quiet/`bad`-toned lines. The file-add control is a styled `lwButton`-like label; the format hint is `text-ink-3`.

## 8. Confirm Dialog

`libs/web-courses/src/lib/components/confirm-dialog`.

A real modal: a fixed full-viewport backdrop (`bg-black/60`) centering an `LwCard` that holds the message and the Cancel / Confirm `lwButton`s. The destructive confirm uses a `bad`-toned button. The existing `role="dialog"`, `aria-modal`, the `closed` output, and all `data-testid`s are preserved.

## 9. Testing & Verification

- The two `web-ui` additions (§1) are test-first, extending the existing `lw-input`/`lw-pill` specs.
- Each instructor component restyle changes only its template and `imports`; the existing component specs (which assert on text, `data-testid`s, and behavior — not CSS classes) must stay green and are the per-task safety net.
- Per plan: `nx sync` (the libs gain a `web-ui` dependency), then `nx run-many -t lint test typecheck build` for the affected projects must pass.
- A browser walk-through of the dashboard, course list, course create, and course editor (with a module/lesson) in the dark theme confirms legibility and that the design system is applied — and that the previously-faint pages are now readable.

## 10. Implementation Decomposition

This spec is implemented as **two plans**, each independently shippable:

- **Plan A — `web-ui` additions + `web-courses` restyle:** §1 (broaden `lwInput`, `LwPill` ochre tone), then §3–§6, §8 (the 12 `web-courses` components) and the materials list from §7. Concludes with `nx sync` + verification.
- **Plan B — `web-video` restyle + dashboard:** the §7 `web-video` components (`video-upload`, `video-player`, `video-state-badge`) and §2 (dashboard). Concludes with `nx sync` + verification.

Plan A is written and executed first (Plan B's video components are embedded in Plan A's lesson-item, but `web-video`'s own restyle and the dashboard are separable follow-on work).
