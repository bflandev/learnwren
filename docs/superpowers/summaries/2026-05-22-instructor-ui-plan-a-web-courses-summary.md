# Instructor UI Plan A: web-courses — Implementation Summary

**Date:** 2026-05-22
**Spec:** `docs/superpowers/specs/2026-05-22-instructor-ui-design.md`
**Plan:** `docs/superpowers/plans/2026-05-22-instructor-ui-plan-a-web-courses.md`

Plan A of the instructor-UI design pass. Two small `web-ui` additions (broaden `lwInput` to `<textarea>`/`<select>`, add an `ochre` `LwPillTone`), then a behaviour-preserving restyle of all 12 `libs/web-courses` instructor components into the Learn Wren dark design system. Templates and `@Component.imports` change; component class logic does not. Existing component specs are the per-task safety net. Plan B (the `web-video` restyle and the dashboard) is out of scope here and shipped in a follow-up branch.

## What shipped

### Angular (`libs/web-ui`)

- `libs/web-ui/src/lib/input/lw-input.directive.ts` — selector broadened from `input[lwInput]` to `input[lwInput], textarea[lwInput], select[lwInput]` (commit `2c32807`); host class string unchanged.
- `libs/web-ui/src/lib/input/lw-input.directive.spec.ts` — adds `TextareaHost` and `SelectHost` module-scope host components and two coverage cases asserting `bg-bg` / `border-line` on the rendered control.
- `libs/web-ui/src/lib/pill/lw-pill.component.ts` — `LwPillTone` widened to `'default' | 'ochre' | 'good' | 'warn' | 'bad'`; `toneColor` switch gains `case 'ochre': return 'var(--lw-ochre)'` (commit `fc0a356`).
- `libs/web-ui/src/lib/pill/lw-pill.component.spec.ts` — adds an `applies the ochre tone colour` case.

### Angular (`libs/web-courses`)

Every restyled component imports the relevant `@learnwren/web-ui` primitives in its `@Component.imports` array and has its `.html` template rewritten to use `<lw-card>`, `lwInput`, `lwButton`, `<lw-pill>`, `<lw-cover>`, and Tailwind design-token utility classes (`bg-bg`, `bg-bg-2`, `border-line`, `text-ink`, `text-ink-2`, `text-ink-3`, `text-bad`, `text-warn`, `text-good`, `text-ochre`). All `data-testid` attributes, `cdkDrag`/`cdkDropList`/`cdkDragHandle` wiring, `formControlName`/`[ngModel]`/`(blur)`/`(keydown.*)`/`routerLink` bindings, and pre-existing `class` hooks (`error`, `course-meta`, `module-item`, `lesson-item`, `publish-bar`, `panel`, `pill`, `banner`, `jump`, `empty`, `materials`, `hint`) are preserved verbatim.

- `courses-list-page/courses-list-page.component.{ts,html}` — responsive `LwCard` grid (1/2/3 cols), `<lw-cover>` with the first letter of the title, status `<lw-pill>` (`PUBLISHED` → `good`, otherwise `default`). Commit `fadb95d`.
- `course-create-page/course-create-page.component.{ts,html}` — centred `LwCard` form; `lwInput` on the title `<input>`, two description `<textarea>`s, and the category/difficulty `<select>`s; primary submit `lwButton`. Commit `c1dbd48`.
- `components/confirm-dialog/confirm-dialog.component.{ts,html}` — gains an `imports: [LwButtonDirective, LwCardComponent]` block (the component had no imports array before); template becomes a fixed-position `bg-black/60` backdrop centring an `<lw-card>` with cancel + primary confirm `lwButton`s. `role="dialog"`, `aria-modal="true"`, the `closed` output, and `confirm-dialog` / `confirm-cancel` / `confirm-go` testids preserved. Commit `f94c6df`.
- `components/course-meta-panel/course-meta-panel.component.{ts,html}` — `<lw-card>` titled section, `lwInput`-styled title input and description textarea (inline-commit `(focus)` / `(blur)` behaviour intact), red `text-bad` "Delete course" `lwButton`. Commit `2da646d`.
- `publish/course-publish-bar.component.{ts,html}` — `bg-bg-2` rounded bar holding the title, a status `<lw-pill>` (`PUBLISHED` → `good`, `ARCHIVED` → `default`, otherwise `ochre`), a primary action `lwButton`, an optional Archive ghost `lwButton`, and a `text-bad` banner. Commit `c022754`.
- `publish/publish-eligibility-panel.component.{ts,html}` — `bg-bg-2` panel with `text-good` ready header or `text-warn` blocked header; per-reason rows with ghost `lwButton` "Jump to lesson/module"; `text-bad` error banner with the `eligibility-error` testid. Commit `c022754`.
- `components/module-tree/module-tree.component.html` — `cdkDropList` container becomes a `space-y-3` stack; `@empty` text becomes a quiet `text-ink-3` line. No imports change (component has no native form controls). Commit `aec3096`.
- `components/module-item/module-item.component.{ts,html}` — `<lw-card>` containing the inline-editable module title (display = text button styled as a serif heading; edit = `lwInput`), a `text-bad` Delete module `lwButton`, the lesson list, and an "Add lesson" ghost `lwButton` (or `lwInput` in adding mode). Commit `aec3096`.
- `components/lesson-list/lesson-list.component.html` — template-only edit (no imports change); `cdkDropList` ul becomes a `space-y-2` list; `@empty` becomes a quiet `text-ink-3` line. Commit `a4ee6a2`.
- `components/lesson-item/lesson-item.component.{ts,html}` — recessed `bg-bg` row with the inline-editable title (button → `lwInput`), a `text-bad` ghost Delete `lwButton`, and the video area and materials section beneath. The `<lib-video-upload>`/`<lib-video-state-badge>`/`<lib-video-player>`/`<lib-materials-list>` children are rendered as-is (Plan B restyles them). Commit `a4ee6a2`.
- `materials/materials-list.component.{ts,html}` — `bg-bg-2` rounded section with heading; per-material rows with inline-rename `lwInput`, ghost Download/Remove `lwButton`s (Remove gets `text-bad`); in-flight uploads as `text-ink-3` lines; failures as `text-bad` lines; the file-picker is a styled `<label>` with an `sr-only` `<input type="file">` and a `<span class="lw-btn lw-btn-ghost">` click target. Commit `bcfa646`.
- `course-editor-page/course-editor-page.component.{ts,html}` — `max-w-4xl` container, ochre "← My Courses" back link, single-column vertical flow (publish bar → eligibility → meta → "Modules" heading + Add module `lwButton` → module tree), `text-bad` `editor-error` with `role="alert"`. Commit `5d47a79`.
- `libs/web-courses/tsconfig.lib.json` — `nx sync` added the `web-ui` project reference now that `web-courses` imports it (commit `9463c3a`).

### Tests

- `libs/web-ui` specs cover the broadened `lwInput` selector (textarea + select) and the new `ochre` pill tone.
- `libs/web-courses` — 17 spec files, 162 vitest cases, all green after the restyle. Per-task plan gate (`pnpm nx test web-courses` after each commit) held throughout; specs assert on text, `data-testid`s, and behaviour rather than CSS, which is why the template-only edits did not require spec updates.

## Plan deviations worth knowing about

- **`courses-list-page` later gained a `<lw-cover [tone]="coverToneForId(course.id)">` binding.** The plan's template binds only `[glyph]` and `[height]`; the deterministic tone-by-id binding (and the corresponding `coverToneForId` import from `@learnwren/web-ui`) was added in a follow-on commit (`a072ee4` — "share coverToneForId across all course-cover surfaces") together with the matching change on the student catalogue cards. Behaviour-only addition; everything else in the template matches the plan.
- **No other material deviations.** Tasks 1–12 landed in plan order across the 12 listed commits (`2c32807` → `9463c3a`), with the templates and imports matching the plan's exact-text blocks (modulo the cover-tone follow-up above).

## Verification outcome

- Per-task gate: `pnpm nx test web-courses` green after each of the nine restyle commits. Re-run during this summary: **17 files, 162 tests pass** with `--skip-nx-cache`.
- `web-ui` specs green for the broadened `lwInput` directive and the `ochre` pill tone.
- `nx sync` produced the expected `tsconfig.lib.json` project-reference change; committed as `9463c3a`.
- Plan Task 12 Step 3 (`pnpm nx run-many -t lint test typecheck build --projects=web-ui,web-courses,web`) was the documented sign-off gate; not re-run for this summary. The dev-server browser walk-through (Task 12 Step 4) is a manual verification — the live instructor pages render against the emulators with the dark-theme tokens and the design-system primitives now in place.
- No web-courses e2e was added by this slice; the instructor-flow e2e coverage is whatever pre-existed in `apps/web-e2e` and continues to pass against the restyled templates (testids preserved).

## Follow-ups not in scope

- **Plan B — `web-video` restyle + dashboard** (`docs/superpowers/plans/2026-05-22-instructor-ui-plan-b-web-video-and-dashboard.md`). Shipped immediately after on `feat/instructor-ui-plan-b` (commits `c38af1a`, `c046a00`, `04778d0`, `77bc608`, `d1d6b6f`, `0a5360e`, `ae173fc`, `44b2ca3`) and merged as `4d342cc`. The Plan A `lesson-item` deliberately rendered the three `web-video` components as-is to keep this plan small.
- **Light-theme status tokens and the `--lw-warn` vs `--lw-ochre` collision** are noted in the spec's Decisions table as deferred to a separate design-token review.
- **No new `web-ui` primitives beyond the two listed** — the modal backdrop, the dashed upload zone, and the player chrome are each used once and styled in place rather than abstracted into the library.
- **Student-facing screens** (catalogue, course detail, search, the student learning experience) remain a separate adoption track. Several of them have shipped since this restyle (EP-05 Slices A+B; EP-06 Slices A+B) but they were not part of this slice's surface.
