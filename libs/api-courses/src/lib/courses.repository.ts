import { Inject, Injectable } from '@nestjs/common';
import type { firestore as adminFirestore } from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

import { FIRESTORE, type FirestoreHandle } from '@learnwren/api-firebase';
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

import { CourseNotFoundException, StaleReorderException } from './errors/courses.exception';

const COURSES = 'courses';

function nowIso(): ISODateString {
  return new Date().toISOString() as ISODateString;
}

/**
 * Next free `order` value for an append: `max(existing) + 1`, or 0 when empty.
 * Using `siblings.size` is unsafe — after any deletion the count shrinks
 * but the highest surviving order does not, producing a duplicate.
 */
function nextOrder(existing: number[]): number {
  if (existing.length === 0) return 0;
  return Math.max(...existing) + 1;
}

/**
 * Verify the set of IDs being reordered still matches what's in the collection.
 * Called inside a transaction so the check and the writes commit atomically.
 */
function assertReorderSetMatches(currentIds: string[], proposedIds: string[]): void {
  if (currentIds.length !== proposedIds.length) throw new StaleReorderException();
  const current = new Set(currentIds);
  for (const id of proposedIds) {
    if (!current.has(id)) throw new StaleReorderException();
  }
}

@Injectable()
export class CoursesRepository {
  constructor(@Inject(FIRESTORE) private readonly firestore: FirestoreHandle) {}

  // ────────────────────────── Course ──────────────────────────

  async createCourse(course: Course): Promise<void> {
    await this.firestore.collection(COURSES).doc(course.id).set(course);
  }

  async getCourse(cid: CourseId): Promise<Course | null> {
    const snap = await this.firestore.collection(COURSES).doc(cid).get();
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

  /** Every course with status PUBLISHED. The catalogue's only Firestore query. */
  async listPublished(): Promise<Course[]> {
    const snap = await this.firestore
      .collection(COURSES)
      .where('status', '==', 'PUBLISHED')
      .get();
    return snap.docs.map((d) => d.data() as Course);
  }

  async updateCourse(cid: CourseId, patch: Partial<Course>): Promise<void> {
    await this.firestore
      .collection(COURSES)
      .doc(cid)
      .update({ ...patch, updatedAt: nowIso() });
  }

  async deleteCourseRecursive(cid: CourseId): Promise<void> {
    const ref = this.firestore.collection(COURSES).doc(cid);
    await this.firestore.recursiveDelete(ref);
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
    const moduleRef = this.firestore
      .collection(COURSES)
      .doc(cid)
      .collection('modules')
      .doc(seed.id);
    const siblingsRef = this.firestore.collection(COURSES).doc(cid).collection('modules');
    const courseRef = this.firestore.collection(COURSES).doc(cid);

    return this.firestore.runTransaction(async (t) => {
      const siblings = await t.get(siblingsRef);
      // Use max(order)+1 rather than siblings.size: after a deletion, .size
      // shrinks but the highest surviving order does not, so siblings.size
      // would collide with an existing module's order.
      const order = nextOrder(siblings.docs.map((d) => (d.data() as { order: number }).order));
      const now = nowIso();
      const created: Module = { ...seed, order, createdAt: now, updatedAt: now };
      t.set(moduleRef, created);
      t.update(courseRef, { updatedAt: now });
      return created;
    });
  }

  async getModule(cid: CourseId, mid: ModuleId): Promise<Module | null> {
    const snap = await this.firestore
      .collection(COURSES)
      .doc(cid)
      .collection('modules')
      .doc(mid)
      .get();
    return snap.exists ? (snap.data() as Module) : null;
  }

  async listModulesByCourse(cid: CourseId): Promise<Module[]> {
    const snap = await this.firestore
      .collection(COURSES)
      .doc(cid)
      .collection('modules')
      .orderBy('order', 'asc')
      .get();
    return snap.docs.map((d) => d.data() as Module);
  }

  async updateModule(cid: CourseId, mid: ModuleId, patch: Partial<Module>): Promise<void> {
    await this.firestore
      .collection(COURSES)
      .doc(cid)
      .collection('modules')
      .doc(mid)
      .update({ ...patch, updatedAt: nowIso() });
  }

  async deleteModuleRecursive(cid: CourseId, mid: ModuleId): Promise<void> {
    const ref = this.firestore
      .collection(COURSES)
      .doc(cid)
      .collection('modules')
      .doc(mid);
    await this.firestore.recursiveDelete(ref);
  }

  /**
   * Write each module's new `order` (its index in `orderedIds`) atomically.
   * Re-reads the modules inside the transaction and throws StaleReorderException
   * if the set has changed (e.g. another tab deleted a module between the
   * service's stale-check read and this write), so the operation either
   * commits cleanly or fails with a 409 — never a partial 500.
   */
  async writeModuleOrder(cid: CourseId, orderedIds: ModuleId[]): Promise<void> {
    const modulesRef = this.firestore.collection(COURSES).doc(cid).collection('modules');
    const courseRef = this.firestore.collection(COURSES).doc(cid);
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
      t.update(courseRef, { updatedAt: now });
    });
  }

  // ────────────────────────── Lesson ──────────────────────────

  async appendLesson(
    cid: CourseId,
    mid: ModuleId,
    seed: Omit<Lesson, 'order' | 'createdAt' | 'updatedAt'>,
  ): Promise<Lesson> {
    const lessonRef = this.firestore
      .collection(COURSES)
      .doc(cid)
      .collection('modules')
      .doc(mid)
      .collection('lessons')
      .doc(seed.id);
    const siblingsRef = this.firestore
      .collection(COURSES)
      .doc(cid)
      .collection('modules')
      .doc(mid)
      .collection('lessons');
    const courseRef = this.firestore.collection(COURSES).doc(cid);

    return this.firestore.runTransaction(async (t) => {
      const siblings = await t.get(siblingsRef);
      // Use max(order)+1 — see appendModule for why .size is unsafe after deletion.
      const order = nextOrder(siblings.docs.map((d) => (d.data() as { order: number }).order));
      const now = nowIso();
      const created: Lesson = { ...seed, order, createdAt: now, updatedAt: now };
      t.set(lessonRef, created);
      t.update(courseRef, { updatedAt: now });
      return created;
    });
  }

  async moduleExists(cid: CourseId, mid: ModuleId): Promise<boolean> {
    const snap = await this.firestore
      .collection(COURSES)
      .doc(cid)
      .collection('modules')
      .doc(mid)
      .get();
    return snap.exists;
  }

  async getLesson(cid: CourseId, mid: ModuleId, lid: LessonId): Promise<Lesson | null> {
    const snap = await this.firestore
      .collection(COURSES)
      .doc(cid)
      .collection('modules')
      .doc(mid)
      .collection('lessons')
      .doc(lid)
      .get();
    return snap.exists ? (snap.data() as Lesson) : null;
  }

  async listLessonsByModule(cid: CourseId, mid: ModuleId): Promise<Lesson[]> {
    const snap = await this.firestore
      .collection(COURSES)
      .doc(cid)
      .collection('modules')
      .doc(mid)
      .collection('lessons')
      .orderBy('order', 'asc')
      .get();
    return snap.docs.map((d) => d.data() as Lesson);
  }

  async updateLesson(
    cid: CourseId,
    mid: ModuleId,
    lid: LessonId,
    patch: Partial<Lesson>,
  ): Promise<void> {
    await this.firestore
      .collection(COURSES)
      .doc(cid)
      .collection('modules')
      .doc(mid)
      .collection('lessons')
      .doc(lid)
      .update({ ...patch, updatedAt: nowIso() });
  }

  async deleteLesson(cid: CourseId, mid: ModuleId, lid: LessonId): Promise<void> {
    await this.firestore
      .collection(COURSES)
      .doc(cid)
      .collection('modules')
      .doc(mid)
      .collection('lessons')
      .doc(lid)
      .delete();
  }

  async writeLessonOrder(
    cid: CourseId,
    mid: ModuleId,
    orderedIds: LessonId[],
  ): Promise<void> {
    const lessonsRef = this.firestore
      .collection(COURSES)
      .doc(cid)
      .collection('modules')
      .doc(mid)
      .collection('lessons');
    const courseRef = this.firestore.collection(COURSES).doc(cid);
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
      t.update(courseRef, { updatedAt: now });
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
    const ref = this.firestore.collection(COURSES).doc(cid);
    const snap = await t.get(ref);
    if (!snap.exists) {
      throw new CourseNotFoundException();
    }
    return snap.data() as Course;
  }

  async listModulesByCourseInTxn(
    t: adminFirestore.Transaction,
    cid: CourseId,
  ): Promise<Module[]> {
    const query = this.firestore
      .collection(COURSES)
      .doc(cid)
      .collection('modules')
      .orderBy('order', 'asc');
    const snap = await t.get(query);
    return snap.docs.map((d) => d.data() as Module);
  }

  async listLessonsByModuleInTxn(
    t: adminFirestore.Transaction,
    cid: CourseId,
    mid: ModuleId,
  ): Promise<Lesson[]> {
    const query = this.firestore
      .collection(COURSES)
      .doc(cid)
      .collection('modules')
      .doc(mid)
      .collection('lessons')
      .orderBy('order', 'asc');
    const snap = await t.get(query);
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
    const ref = this.firestore.collection(COURSES).doc(cid);
    const now = nowIso();
    const update: Record<string, unknown> = { status, updatedAt: now };
    if (patch.publishedAt !== undefined) update['publishedAt'] = patch.publishedAt;
    if (patch.archivedAt === null) {
      update['archivedAt'] = FieldValue.delete();
    } else if (patch.archivedAt !== undefined) {
      update['archivedAt'] = patch.archivedAt;
    }
    // THEN WRITE
    t.update(ref, update);
    // Compose post-write doc from pre-read + applied patches
    return {
      ...before,
      status,
      updatedAt: now,
      ...(patch.publishedAt !== undefined ? { publishedAt: patch.publishedAt } : {}),
      ...(patch.archivedAt === null
        ? { archivedAt: undefined }
        : patch.archivedAt !== undefined
          ? { archivedAt: patch.archivedAt }
          : {}),
    } as Course;
  }
}
