import { Inject, Injectable } from '@nestjs/common';
import type { firestore as adminFirestore } from 'firebase-admin';

import { FIRESTORE, type FirestoreHandle, runTransactionWithRetry } from '@learnwren/api-firebase';
import { nowIso } from '@learnwren/shared-data-models';
import type { CategoryId, Course, CourseCategoryDoc } from '@learnwren/shared-data-models';

import {
  CategoryExistsException,
  CategoryInUseException,
  CategoryNotFoundException,
  LastCategoryException,
} from './categories.exception';
import { DEFAULT_COURSE_CATEGORIES } from './categories.seed';

const CATEGORIES = 'courseCategories';
const COURSES = 'courses';

/** Case-insensitive display-name equality — the uniqueness rule for category names. */
function sameName(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

@Injectable()
export class CategoriesRepository {
  constructor(@Inject(FIRESTORE) private readonly firestore: FirestoreHandle) {}

  private col() {
    return this.firestore.collection(CATEGORIES);
  }

  /**
   * All categories, seeding DEFAULT_COURSE_CATEGORIES first when the collection
   * is empty. The lazy seed makes fresh deployments (and the emulator) behave
   * identically without a migration step; the batch of `set`s is idempotent
   * under a seed race.
   */
  async listAll(): Promise<CourseCategoryDoc[]> {
    const snap = await this.col().get();
    if (!snap.empty) return snap.docs.map((d) => d.data() as CourseCategoryDoc);
    return this.seedDefaults();
  }

  private async seedDefaults(): Promise<CourseCategoryDoc[]> {
    const now = nowIso();
    const docs: CourseCategoryDoc[] = DEFAULT_COURSE_CATEGORIES.map(({ id, name }) => ({
      id,
      name,
      createdAt: now,
      updatedAt: now,
    }));
    const batch = this.firestore.batch();
    for (const doc of docs) batch.set(this.col().doc(doc.id), doc);
    await batch.commit();
    return docs;
  }

  async get(id: CategoryId): Promise<CourseCategoryDoc | null> {
    // One tiny-collection read (with lazy seed) — a doc-get fast path isn't
    // worth a second code path at this scale.
    const all = await this.listAll();
    return all.find((c) => c.id === id) ?? null;
  }

  /**
   * Direct doc read inside a caller's transaction — puts the category in the
   * transaction's conflict set, so a course write referencing it conflicts
   * with a concurrent category delete instead of committing a dangling id.
   * No lazy seed here: callers run `get` (which seeds) as their pre-check.
   */
  async getInTxn(
    t: adminFirestore.Transaction,
    id: CategoryId,
  ): Promise<CourseCategoryDoc | null> {
    const snap = await t.get(this.col().doc(id));
    return snap.exists ? (snap.data() as CourseCategoryDoc) : null;
  }

  async create(id: CategoryId, name: string): Promise<CourseCategoryDoc> {
    await this.listAll(); // ensure defaults exist before the first admin write
    return runTransactionWithRetry(this.firestore, async (t) => {
      const snap = await t.get(this.col());
      const existing = snap.docs.map((d) => d.data() as CourseCategoryDoc);
      if (existing.some((c) => c.id === id || sameName(c.name, name))) {
        throw new CategoryExistsException();
      }
      const now = nowIso();
      const doc: CourseCategoryDoc = { id, name, createdAt: now, updatedAt: now };
      t.set(this.col().doc(id), doc);
      return doc;
    });
  }

  async rename(id: CategoryId, name: string): Promise<CourseCategoryDoc> {
    return runTransactionWithRetry(this.firestore, async (t) => {
      const snap = await t.get(this.col());
      const existing = snap.docs.map((d) => d.data() as CourseCategoryDoc);
      const target = existing.find((c) => c.id === id);
      if (!target) throw new CategoryNotFoundException();
      if (existing.some((c) => c.id !== id && sameName(c.name, name))) {
        throw new CategoryExistsException();
      }
      const now = nowIso();
      t.update(this.col().doc(id), { name, updatedAt: now });
      return { ...target, name, updatedAt: now };
    });
  }

  /**
   * Delete a category, atomically moving every referencing course (any status)
   * to `reassignTo`. All reads and writes run in one transaction, so the
   * operation commits fully or not at all. Firestore caps a transaction at
   * 500 writes — far above the current catalogue scale; if the platform ever
   * exceeds it, chunk the reassignment into batches before deleting.
   */
  async deleteWithReassign(
    id: CategoryId,
    reassignTo: CategoryId | undefined,
  ): Promise<{ reassignedCourses: number }> {
    return runTransactionWithRetry(this.firestore, async (t) => {
      const catsSnap = await t.get(this.col());
      const cats = catsSnap.docs.map((d) => d.data() as CourseCategoryDoc);
      if (!cats.some((c) => c.id === id)) throw new CategoryNotFoundException();
      if (cats.length <= 1) throw new LastCategoryException();

      const coursesSnap = await t.get(
        this.firestore.collection(COURSES).where('category', '==', id),
      );
      const affected = coursesSnap.docs;

      if (affected.length > 0) {
        if (!reassignTo) throw new CategoryInUseException(affected.length);
        if (!cats.some((c) => c.id === reassignTo)) throw new CategoryNotFoundException();
        const now = nowIso();
        for (const courseDoc of affected) {
          t.update(courseDoc.ref, { category: reassignTo, updatedAt: now } as Partial<Course>);
        }
      }

      t.delete(this.col().doc(id));
      return { reassignedCourses: affected.length };
    });
  }
}
