# Robin DS Port — Slice E: Courses, Video & Enrollment Sweep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate `libs/web-courses` (16 components, ~962 template LOC), `libs/web-video` (3), and `libs/web-enrollment` (1) onto hlm; replace both hand-rolled modals with `hlm-alert-dialog`; delete `LwProgressComponent` (its only two consumers live here).

**Architecture:** Same sweep pattern as slices C/D (merges 0c63a61, 3bc3557 carry the idioms). Two batches: E1 = the course-editor tree (editor, module/lesson items, materials, the shared hand-rolled `ConfirmDialogComponent`); E2 = courses pages (list, analytics, students, cover-uploader), web-video, web-enrollment, and the LwProgress deletion.

## Global Constraints

- Worktree `feat/ds-port-slice-e`; node_modules symlink; per-command cd prefix; `git add` specific paths only.
- Variant mapping as slices C/D. `.lw-btn-secondary` (dead class) → `variant="secondary"`.
- **Progress scale trap:** `lw-progress` takes `value` 0..1; `hlm-progress` takes 0..100 (default max 100). Every swap multiplies the binding by 100 (or binds percent directly if the source already has it). Verify by reading each binding's source signal.
- **Modals:** web-courses' `ConfirmDialogComponent` (hand-rolled `fixed inset-0` + role=dialog, consumed by lesson-item, materials-list, course-editor) and web-enrollment's leave-course modal → `hlm-alert-dialog` (or `ConfirmDialogService` where the flow is a plain confirm — prefer the service; it exists exactly for this). Keep the emitted outputs/testids stable where specs rely on them; where a testid sat on hand-rolled dialog internals, move it to the hlm part playing that role.
- Tables in analytics/students stay plain HTML — restyle borders/spacing onto token utilities only.
- Delete `LwProgressComponent` + its spec + barrel line ONLY after both consumers are migrated; then grep `lw-progress` across apps+libs must return only recipes.css (the decorative landing div keeps the CSS class until slice F).
- Test updates in scope: `libs/web-video/.../video-upload.component.spec.ts` (asserts `lw-progress` element) and `apps/web-e2e/src/videos.spec.ts:106` (`lib-video-upload lw-progress`) → hlm-progress equivalents.
- Gates per batch: `pnpm nx run-many -t lint test typecheck --projects=web,web-courses,web-video,web-enrollment,web-ui` + `lint:tokens`. Slice end e2e: `courses.spec.ts videos.spec.ts materials.spec.ts publish-gate.spec.ts enrollment.spec.ts course-cover.spec.ts` then full suite, shifted ports, isolate-rerun flakes.

## Tasks

- [ ] **Task 1 (E1):** course-editor tree — course-editor, module-item/lesson-item (or equivalents), materials-list, publish checklist, ConfirmDialogComponent replacement (delete the hand-rolled component when its last consumer switches). Buttons/inputs/cards/alerts per idiom. Commit per coherent chunk (2-3 commits fine).
- [ ] **Task 2 (E2):** course list page, analytics, students, cover-uploader (progress swap ×100), web-video (upload progress swap, state pill, failure alert), web-enrollment (leave-course modal → ConfirmDialogService, buttons), LwProgress deletion, video spec + videos e2e locator updates. Commits per area.
- [ ] **Task 3 (coordinator):** slice gates, e2e, browser pass, merge.
