import { Inject, Injectable } from '@nestjs/common';
import type { firestore as adminFirestore } from 'firebase-admin';

import { FIRESTORE, type FirestoreHandle } from '@learnwren/api-firebase';
import type {
  Course,
  CourseId,
  ISODateString,
  Lesson,
  LessonId,
  Module,
  ModuleId,
  UserId,
} from '@learnwren/shared-data-models';

const COURSES = 'courses';

function nowIso(): ISODateString {
  return new Date().toISOString() as ISODateString;
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
      const order = siblings.size;
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
   * Write each module's new `order` (the array index in `orderedIds`) in one batch,
   * along with a single course `updatedAt` touch.
   */
  async writeModuleOrder(cid: CourseId, orderedIds: ModuleId[]): Promise<void> {
    const batch = this.firestore.batch();
    const now = nowIso();
    orderedIds.forEach((mid, index) => {
      const ref = this.firestore
        .collection(COURSES)
        .doc(cid)
        .collection('modules')
        .doc(mid);
      batch.update(ref, { order: index, updatedAt: now });
    });
    batch.update(this.firestore.collection(COURSES).doc(cid), { updatedAt: now });
    await batch.commit();
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
      const order = siblings.size;
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
    const batch = this.firestore.batch();
    const now = nowIso();
    orderedIds.forEach((lid, index) => {
      const ref = this.firestore
        .collection(COURSES)
        .doc(cid)
        .collection('modules')
        .doc(mid)
        .collection('lessons')
        .doc(lid);
      batch.update(ref, { order: index, updatedAt: now });
    });
    batch.update(this.firestore.collection(COURSES).doc(cid), { updatedAt: now });
    await batch.commit();
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
}
