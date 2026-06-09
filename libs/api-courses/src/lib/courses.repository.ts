import { Inject, Injectable } from '@nestjs/common';
import type { firestore as adminFirestore } from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

import { FIRESTORE, type FirestoreHandle } from '@learnwren/api-firebase';
import { nowIso } from '@learnwren/shared-data-models';
import type {
  Course,
  CourseId,
  CourseStatus,
  ISODateString,
  Lesson,
  LessonId,
  Module,
  ModuleId,
  UserId,
} from '@learnwren/shared-data-models';

import {
  CourseNotFoundException,
  ModuleAlreadyNotifiedException,
  ModuleNotFoundException,
} from './errors/courses.exception';
import { assertReorderSetMatches } from './reorder.util';

const COURSES = 'courses';

/**
 * Hard cap on the unauthenticated catalogue scan. Bounds DoS amplification
 * of `/api/catalog*` until cursor pagination + server-side filters are wired
 * in. 500 is generous for current scale and well below Firestore's per-query
 * read budget.
 */
const MAX_CATALOG_SCAN = 500;

/**
 * Next free `order` value for an append: `max(existing) + 1`, or 0 when empty.
 * Using `siblings.size` is unsafe — after any deletion the count shrinks
 * but the highest surviving order does not, producing a duplicate.
 */
function nextOrder(existing: number[]): number {
  if (existing.length === 0) return 0;
  return Math.max(...existing) + 1;
}

@Injectable()
export class CoursesRepository {
  constructor(@Inject(FIRESTORE) private readonly firestore: FirestoreHandle) {}

  // ────────────────────────── Path helpers ──────────────────────────
  // The Firestore SDK has no concept of "a path string"; you build refs by
  // chaining .collection().doc() calls. These tiny helpers centralise the
  // chain so the rest of the file reads as intent (modules/lessons/etc.)
  // rather than five-call ref construction.

  private courseRef(cid: CourseId) {
    return this.firestore.collection(COURSES).doc(cid);
  }
  private modulesCol(cid: CourseId) {
    return this.courseRef(cid).collection('modules');
  }
  private moduleRef(cid: CourseId, mid: ModuleId) {
    return this.modulesCol(cid).doc(mid);
  }
  private lessonsCol(cid: CourseId, mid: ModuleId) {
    return this.moduleRef(cid, mid).collection('lessons');
  }
  private lessonRef(cid: CourseId, mid: ModuleId, lid: LessonId) {
    return this.lessonsCol(cid, mid).doc(lid);
  }

  // ────────────────────────── Course ──────────────────────────

  async createCourse(course: Course): Promise<void> {
    await this.firestore.collection(COURSES).doc(course.id).set(course);
  }

  async getCourse(cid: CourseId): Promise<Course | null> {
    const snap = await this.courseRef(cid).get();
    return snap.exists ? (snap.data() as Course) : null;
  }

  async listCoursesByInstructor(uid: UserId): Promise<Course[]> {
    const snap = await this.firestore
      .collection(COURSES)
      .where('instructorId', '==', uid)
      .orderBy('updatedAt', 'desc')
      .get();
    return snap.docs.map((d) => d.data() as Course);
  }

  /**
   * Every course with status PUBLISHED, capped at MAX_CATALOG_SCAN. The cap
   * bounds the cost of catalogue/search endpoints (both currently filter in
   * memory). When the catalogue grows past the cap, replace this with a
   * cursor-paginated query that pushes filters into Firestore.
   */
  async listPublished(): Promise<Course[]> {
    const snap = await this.firestore
      .collection(COURSES)
      .where('status', '==', 'PUBLISHED')
      .orderBy('publishedAt', 'desc')
      .limit(MAX_CATALOG_SCAN)
      .get();
    return snap.docs.map((d) => d.data() as Course);
  }

  async updateCourse(cid: CourseId, patch: Partial<Course>): Promise<void> {
    await this.courseRef(cid).update({ ...patch, updatedAt: nowIso() });
  }

  /**
   * Remove the coverImageUrl field from a course document.
   *
   * Firebase Admin's `.update({ coverImageUrl: undefined })` silently strips
   * `undefined` keys, leaving the existing field in place — so a plain
   * `updateCourse(cid, { coverImageUrl: undefined })` is a no-op against
   * Firestore. We must call `FieldValue.delete()` explicitly to remove it.
   */
  async clearCoverImageUrl(cid: CourseId): Promise<void> {
    await this.courseRef(cid).update({
      coverImageUrl: FieldValue.delete(),
      updatedAt: nowIso(),
    });
  }

  async deleteCourseRecursive(cid: CourseId): Promise<void> {
    await this.firestore.recursiveDelete(this.courseRef(cid));
  }

  // ────────────────────────── Module ──────────────────────────

  /**
   * Append a new module at the end of the course in a transaction so two
   * concurrent appends do not collide on `order`.
   */
  async appendModule(
    cid: CourseId,
    seed: Omit<Module, 'order' | 'createdAt' | 'updatedAt'>,
  ): Promise<Module> {
    return this.firestore.runTransaction(async (t) => {
      const siblings = await t.get(this.modulesCol(cid));
      // Use max(order)+1 rather than siblings.size: after a deletion, .size
      // shrinks but the highest surviving order does not, so siblings.size
      // would collide with an existing module's order.
      const order = nextOrder(siblings.docs.map((d) => (d.data() as { order: number }).order));
      const now = nowIso();
      const created: Module = { ...seed, order, createdAt: now, updatedAt: now };
      t.set(this.moduleRef(cid, seed.id), created);
      t.update(this.courseRef(cid), { updatedAt: now });
      return created;
    });
  }

  async getModule(cid: CourseId, mid: ModuleId): Promise<Module | null> {
    const snap = await this.moduleRef(cid, mid).get();
    return snap.exists ? (snap.data() as Module) : null;
  }

  async listModulesByCourse(cid: CourseId): Promise<Module[]> {
    const snap = await this.modulesCol(cid).orderBy('order', 'asc').get();
    return snap.docs.map((d) => d.data() as Module);
  }

  async updateModule(cid: CourseId, mid: ModuleId, patch: Partial<Module>): Promise<void> {
    await this.moduleRef(cid, mid).update({ ...patch, updatedAt: nowIso() });
  }

  async deleteModuleRecursive(cid: CourseId, mid: ModuleId): Promise<void> {
    await this.firestore.recursiveDelete(this.moduleRef(cid, mid));
  }

  /**
   * Write each module's new `order` (its index in `orderedIds`) atomically.
   * Re-reads the modules inside the transaction and throws StaleReorderException
   * if the set has changed (e.g. another tab deleted a module between the
   * service's stale-check read and this write), so the operation either
   * commits cleanly or fails with a 409 — never a partial 500.
   */
  async writeModuleOrder(cid: CourseId, orderedIds: ModuleId[]): Promise<void> {
    const modulesRef = this.modulesCol(cid);
    await this.firestore.runTransaction(async (t) => {
      const snap = await t.get(modulesRef);
      assertReorderSetMatches(
        snap.docs.map((d) => d.id),
        orderedIds,
      );
      const now = nowIso();
      orderedIds.forEach((mid, index) => {
        t.update(modulesRef.doc(mid), { order: index, updatedAt: now });
      });
      t.update(this.courseRef(cid), { updatedAt: now });
    });
  }

  // ────────────────────────── Lesson ──────────────────────────

  async appendLesson(
    cid: CourseId,
    mid: ModuleId,
    seed: Omit<Lesson, 'order' | 'createdAt' | 'updatedAt'>,
  ): Promise<Lesson> {
    return this.firestore.runTransaction(async (t) => {
      const siblings = await t.get(this.lessonsCol(cid, mid));
      // Use max(order)+1 — see appendModule for why .size is unsafe after deletion.
      const order = nextOrder(siblings.docs.map((d) => (d.data() as { order: number }).order));
      const now = nowIso();
      const created: Lesson = { ...seed, order, createdAt: now, updatedAt: now };
      t.set(this.lessonRef(cid, mid, seed.id), created);
      t.update(this.courseRef(cid), { updatedAt: now });
      return created;
    });
  }

  async moduleExists(cid: CourseId, mid: ModuleId): Promise<boolean> {
    const snap = await this.moduleRef(cid, mid).get();
    return snap.exists;
  }

  async getLesson(cid: CourseId, mid: ModuleId, lid: LessonId): Promise<Lesson | null> {
    const snap = await this.lessonRef(cid, mid, lid).get();
    return snap.exists ? (snap.data() as Lesson) : null;
  }

  async listLessonsByModule(cid: CourseId, mid: ModuleId): Promise<Lesson[]> {
    const snap = await this.lessonsCol(cid, mid).orderBy('order', 'asc').get();
    return snap.docs.map((d) => d.data() as Lesson);
  }

  async updateLesson(
    cid: CourseId,
    mid: ModuleId,
    lid: LessonId,
    patch: Partial<Lesson>,
  ): Promise<void> {
    await this.lessonRef(cid, mid, lid).update({ ...patch, updatedAt: nowIso() });
  }

  async deleteLesson(cid: CourseId, mid: ModuleId, lid: LessonId): Promise<void> {
    await this.lessonRef(cid, mid, lid).delete();
  }

  async writeLessonOrder(
    cid: CourseId,
    mid: ModuleId,
    orderedIds: LessonId[],
  ): Promise<void> {
    const lessonsRef = this.lessonsCol(cid, mid);
    await this.firestore.runTransaction(async (t) => {
      const snap = await t.get(lessonsRef);
      assertReorderSetMatches(
        snap.docs.map((d) => d.id),
        orderedIds,
      );
      const now = nowIso();
      orderedIds.forEach((lid, index) => {
        t.update(lessonsRef.doc(lid), { order: index, updatedAt: now });
      });
      t.update(this.courseRef(cid), { updatedAt: now });
    });
  }

  /**
   * Atomically claim the one-shot notification stamp for a module.
   *
   * Runs a Firestore transaction: re-reads the module doc, throws
   * ModuleAlreadyNotifiedException if studentsNotifiedAt is already set, else
   * writes it inside the transaction. Callers must send emails ONLY after this
   * resolves — stamp-before-send is deliberate: duplicate mass-email is worse
   * than a lost retry on email failure, and sends are already best-effort.
   */
  async claimModuleNotification(
    cid: CourseId,
    mid: ModuleId,
    notifiedAt: ISODateString,
  ): Promise<void> {
    await this.firestore.runTransaction(async (t) => {
      const snap = await t.get(this.moduleRef(cid, mid));
      if (!snap.exists) throw new ModuleNotFoundException();
      const doc = snap.data() as Module;
      if (doc.studentsNotifiedAt) throw new ModuleAlreadyNotifiedException();
      t.update(this.moduleRef(cid, mid), { studentsNotifiedAt: notifiedAt, updatedAt: notifiedAt });
    });
  }

  /**
   * Generate a new branded ID. Uses Firestore's auto-id generator
   * (collection path is irrelevant — we just need the random ID).
   */
  newId<T extends string>(): T {
    return this.firestore.collection('_ids').doc().id as T;
  }

  /** @internal — exposed for service-level helpers that need the raw handle. */
  get rawFirestore(): FirestoreHandle {
    return this.firestore;
  }

  // ────────────────────────── Slice D (publish gate) ──────────────────────────

  async getCourseInTxn(
    t: adminFirestore.Transaction,
    cid: CourseId,
  ): Promise<Course> {
    const snap = await t.get(this.courseRef(cid));
    if (!snap.exists) {
      throw new CourseNotFoundException();
    }
    return snap.data() as Course;
  }

  async listModulesByCourseInTxn(
    t: adminFirestore.Transaction,
    cid: CourseId,
  ): Promise<Module[]> {
    const snap = await t.get(this.modulesCol(cid).orderBy('order', 'asc'));
    return snap.docs.map((d) => d.data() as Module);
  }

  async listLessonsByModuleInTxn(
    t: adminFirestore.Transaction,
    cid: CourseId,
    mid: ModuleId,
  ): Promise<Lesson[]> {
    const snap = await t.get(this.lessonsCol(cid, mid).orderBy('order', 'asc'));
    return snap.docs.map((d) => d.data() as Lesson);
  }

  /**
   * Write a status transition inside a transaction. Sets updatedAt; merges any
   * additional patch (publishedAt, archivedAt). Pass `archivedAt: null` to clear.
   * The repository does NOT enforce state-machine rules; the caller does.
   */
  async updateStatusInTxn(
    t: adminFirestore.Transaction,
    cid: CourseId,
    status: CourseStatus,
    patch: { publishedAt?: ISODateString; archivedAt?: ISODateString | null } = {},
  ): Promise<Course> {
    // READ FIRST — Firestore txns require reads before writes
    const before = await this.getCourseInTxn(t, cid);
    const now = nowIso();
    const update = this.buildStatusUpdate(status, now, patch);
    // THEN WRITE
    t.update(this.courseRef(cid), update);
    return this.composeUpdatedCourse(before, status, now, patch);
  }

  /** Build the Firestore update payload, translating `archivedAt: null` to FieldValue.delete(). */
  private buildStatusUpdate(
    status: CourseStatus,
    now: ISODateString,
    patch: { publishedAt?: ISODateString; archivedAt?: ISODateString | null },
  ): Record<string, unknown> {
    const update: Record<string, unknown> = { status, updatedAt: now };
    if (patch.publishedAt !== undefined) update['publishedAt'] = patch.publishedAt;
    if (patch.archivedAt === null) {
      update['archivedAt'] = FieldValue.delete();
    } else if (patch.archivedAt !== undefined) {
      update['archivedAt'] = patch.archivedAt;
    }
    return update;
  }

  /** Compose the post-write Course from the pre-read snapshot plus the applied patch. */
  private composeUpdatedCourse(
    before: Course,
    status: CourseStatus,
    now: ISODateString,
    patch: { publishedAt?: ISODateString; archivedAt?: ISODateString | null },
  ): Course {
    const composed: Course = { ...before, status, updatedAt: now };
    if (patch.publishedAt !== undefined) composed.publishedAt = patch.publishedAt;
    if (patch.archivedAt === null) {
      composed.archivedAt = undefined;
    } else if (patch.archivedAt !== undefined) {
      composed.archivedAt = patch.archivedAt;
    }
    return composed;
  }
}
