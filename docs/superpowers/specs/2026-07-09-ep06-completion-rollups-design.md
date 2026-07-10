# EP-06 Completion Rollups — Design

> [!NOTE]
> DOCUMENT STATUS: DRAFT

**Date:** 2026-07-09
**Scope:** The remaining Acceptance Criteria of US-06-02 (Track Lesson Completion): module-level completion indicators in the course outline, and a "Course Completed" badge. Closes the last open ACs of the MVP epics (EP-01–EP-06).

## Goal

A student who finishes lessons sees that progress roll up: a module in the outline shows complete when all its lessons are complete, and finishing every lesson in the course earns a persistent "Course Completed" badge visible on the course detail page, the catalog card, the lesson player, and the student's profile page.

## Decisions (settled during brainstorming)

1. **Persisted stamp, never cleared.** `Enrollment.completedAt` is stamped when every lesson in the course has a completed progress row. If the instructor later adds a lesson, the badge stays — the student completed the course as it was. No un-stamping machinery.
2. **Lazy backfill on read.** Students who finished every lesson before this ships have nothing left to mark complete, so the stamp is also applied lazily: when a read path computes "all lessons complete" for an unstamped enrollment, it stamps then. No one-off script.
3. **All four surfaces**: course detail page, catalog cards, profile page, lesson player.
4. **"All lessons" = every lesson in the course**, regardless of video state — consistent with mark-complete, which has no video-state gate.

## Data model

`Enrollment` (in `libs/shared-data-models`) gains:

```ts
/** Set when every lesson in the course has a completed progress row.
 *  Never cleared by later course edits; preserved across WITHDRAWN → ACTIVE. */
completedAt: ISODateString | null;
```

Existing documents lack the field; reads treat `undefined` as `null` (same convention as prior additive fields).

## Stamping logic

Two paths, both in `api-courses`:

1. **On mark-complete (primary).** `LearnService.markLessonComplete` resolves the course's full lesson-ID list (it already loads modules/lessons for the outline projection; reuse that read) and passes it into the `markLessonComplete` transaction in `EnrollmentRepository`. After applying the progress row, if every lesson ID has a non-null `completedAt` and the enrollment is unstamped, the same `t.update` also sets `completedAt`. One transaction, no fan-out. A lesson added concurrently with the final mark-complete may race the stamp; acceptable (decision 1 tolerates staleness by design).
2. **Lazy on read (backfill).** The lesson-view outline projection already loads the enrollment and the full lesson list. If all lessons are complete and the enrollment is unstamped, write the stamp (timestamped now) best-effort — a stamp-write failure is logged and never fails the read. Scoped to the lesson-view path only (other reads don't load the lesson list, and adding those reads isn't worth it): a legacy completer earns the stamp the first time they open any lesson of the course.

The stamp is idempotent: re-marking an already-complete lesson is a no-op today and stays one; an already-stamped enrollment is never restamped.

## API

- **New:** `GET /api/enrollments` (session cookie required) → the caller's ACTIVE enrollments:
  ```ts
  { enrollments: Array<{ courseId: CourseId; courseTitle: string; completedAt: ISODateString | null }> }
  ```
  Course titles joined server-side; enrollments whose course was deleted are omitted. Returns `{ enrollments: [] }` when the caller has none. The route is registered **before** the existing `GET /api/enrollments/:courseId` param route so `enrollments` never binds as a `courseId`. Not added to `PUBLIC_ALLOWLIST`.
- **Unchanged:** `GET /api/enrollments/:courseId` already returns the full `Enrollment`, so it carries `completedAt` for free once the type gains the field.

## Web surfaces

- **Outline panel (`web-learn`):** each module header shows a checkmark when all its lessons have `completedAt` — a pure `computed()` over the outline data already in the `LessonView`. No API change.
- **Lesson player (`web-learn`):** when every lesson in the outline is complete, the outline header shows a "Course completed" banner.
- **Course detail (`web-catalog`/enrollment state):** a "Course Completed" badge next to the enrolled state when `enrollment.completedAt` is set (data already fetched).
- **Catalog grid (`web-catalog`):** when signed in, the catalog page also calls `GET /api/enrollments` and overlays a "Completed" badge on matching cards. Signed-out users see no change; the catalog endpoints stay public.
- **Profile (`web-profile`):** a "Completed courses" section on `/settings/profile` listing completed courses (title linking to `/catalog/:id`, completion date), filtered client-side from the same endpoint. Hidden when empty.

All web work follows the house pattern: services are Promise-returning HTTP wrappers; components own signal state.

## Error handling

Nothing new on the write path — existing enrollment guards and `NotEnrolledException` cover it. The new list endpoint sits behind the session guard and the existing enrollment feature filter. Lazy-stamp writes are best-effort: failures are logged server-side and the read succeeds regardless.

## Testing

TDD throughout (RED → GREEN → refactor), keeping the repo's mutation bar:

- **Unit (`api-courses`):** final-lesson mark stamps; non-final mark doesn't; idempotent re-mark doesn't restamp; lazy stamp fires exactly once on read for a fully-complete unstamped enrollment and not for stamped/incomplete ones; deleted-course enrollments omitted from the list endpoint.
- **Repository/transaction:** stamp written in the same transaction as the final progress row.
- **API e2e:** `GET /api/enrollments` is auth-guarded (401 anonymous), returns joined titles, empty list for a fresh user; `PUBLIC_ALLOWLIST` guard-coverage test untouched.
- **Web component tests:** module checkmark derivation, completed banner, detail-page badge, catalog overlay, profile section (empty and populated).

## Out of scope (deliberate)

- Un-stamping when the course gains lessons after completion.
- Certificates or any downloadable proof of completion.
- Badge on any public/other-user profile view (no public profile page exists).
- A separate completed-only endpoint or pagination on `GET /api/enrollments` (revisit if a user's enrollment count makes the payload matter).
