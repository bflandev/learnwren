import { describe, expect, it } from 'vitest';

import type {
  CourseId,
  ISODateString,
  LessonId,
  Material,
  MaterialId,
  UserId,
} from '@learnwren/shared-data-models';

import { createFakeFirestore } from '../testing/fake-firestore';
import { MaterialsRepository } from './materials.repository';

function material(id: string, lessonId: string, over: Partial<Material> = {}): Material {
  return {
    id: id as MaterialId,
    ownerInstructorId: 'u1' as UserId,
    courseId: 'c1' as CourseId,
    lessonId: lessonId as LessonId,
    displayName: 'Doc',
    originalFilename: 'doc.pdf',
    extension: 'pdf',
    contentType: 'application/pdf',
    sizeBytes: 10,
    state: 'PENDING_UPLOAD',
    storage: { bucket: 'b', path: `materials/${id}/source.pdf` },
    createdAt: '2026-05-21T10:00:00.000Z' as ISODateString,
    updatedAt: '2026-05-21T10:00:00.000Z' as ISODateString,
    ...over,
  };
}

describe('MaterialsRepository', () => {
  it('newId returns a non-empty string', () => {
    const repo = new MaterialsRepository(createFakeFirestore() as never);
    expect(repo.newId<MaterialId>().length).toBeGreaterThan(0);
  });

  it('create then get round-trips a material', async () => {
    const db = createFakeFirestore();
    const repo = new MaterialsRepository(db as never);
    await repo.create(material('m1', 'l1'));
    const got = await repo.get('m1' as MaterialId);
    expect(got?.id).toBe('m1');
  });

  it('get returns null for a missing material', async () => {
    const repo = new MaterialsRepository(createFakeFirestore() as never);
    expect(await repo.get('nope' as MaterialId)).toBeNull();
  });

  it('listByLesson returns only that lesson’s materials', async () => {
    const repo = new MaterialsRepository(createFakeFirestore() as never);
    await repo.create(material('m1', 'l1'));
    await repo.create(material('m2', 'l1'));
    await repo.create(material('m3', 'l2'));
    const got = await repo.listByLesson('l1' as LessonId);
    expect(got.map((m) => m.id).sort()).toEqual(['m1', 'm2']);
  });

  it('update patches fields', async () => {
    const repo = new MaterialsRepository(createFakeFirestore() as never);
    await repo.create(material('m1', 'l1'));
    await repo.update('m1' as MaterialId, { state: 'READY', sizeBytes: 99 });
    const got = await repo.get('m1' as MaterialId);
    expect(got?.state).toBe('READY');
    expect(got?.sizeBytes).toBe(99);
  });

  it('delete removes the document', async () => {
    const repo = new MaterialsRepository(createFakeFirestore() as never);
    await repo.create(material('m1', 'l1'));
    await repo.delete('m1' as MaterialId);
    expect(await repo.get('m1' as MaterialId)).toBeNull();
  });
});
