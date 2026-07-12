import { Inject, Injectable } from '@nestjs/common';

import { FIRESTORE, type FirestoreHandle } from '@learnwren/api-firebase';
import type { LessonId, Material, MaterialId } from '@learnwren/shared-data-models';

import { MaterialNotFoundException } from './errors/material.exception';

// Canonical gRPC status code for NOT_FOUND (see google.rpc.Code).
const GRPC_NOT_FOUND = 5;

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
    try {
      await this.db.collection('materials').doc(matId).update(patch);
    } catch (err) {
      // The service pre-checks existence, but the doc can vanish between that
      // read and this update (race with a concurrent delete). Map the raw
      // Firestore NOT_FOUND to the typed 404 instead of an unenveloped 500.
      if ((err as { code?: unknown }).code === GRPC_NOT_FOUND) {
        throw new MaterialNotFoundException();
      }
      throw err;
    }
  }

  async delete(matId: MaterialId): Promise<void> {
    await this.db.collection('materials').doc(matId).delete();
  }
}
