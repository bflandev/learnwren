import { Inject, Injectable } from '@nestjs/common';

import { FIRESTORE, type FirestoreHandle } from '@learnwren/api-firebase';
import type { LessonId, Material, MaterialId } from '@learnwren/shared-data-models';

@Injectable()
export class MaterialsRepository {
  constructor(@Inject(FIRESTORE) private readonly db: FirestoreHandle) {}

  newId<T extends string>(): T {
    return this.db.collection('_ids').doc().id as T;
  }

  async get(matId: MaterialId): Promise<Material | null> {
    const snap = await this.db.collection('materials').doc(matId).get();
    return snap.exists ? (snap.data() as Material) : null;
  }

  async listByLesson(lessonId: LessonId): Promise<Material[]> {
    const q = await this.db
      .collection('materials')
      .where('lessonId', '==', lessonId)
      .get();
    return q.docs.map((d) => d.data() as Material);
  }

  async create(material: Material): Promise<void> {
    await this.db.collection('materials').doc(material.id).set(material);
  }

  async update(matId: MaterialId, patch: Partial<Material>): Promise<void> {
    await this.db.collection('materials').doc(matId).update(patch);
  }

  async delete(matId: MaterialId): Promise<void> {
    await this.db.collection('materials').doc(matId).delete();
  }
}
