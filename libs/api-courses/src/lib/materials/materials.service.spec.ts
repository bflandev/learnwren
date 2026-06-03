import { beforeEach, describe, expect, it } from 'vitest';

import type {
  CourseId,
  ISODateString,
  LessonId,
  Material,
  MaterialId,
  UserId,
} from '@learnwren/shared-data-models';
import { MATERIAL_MAX_SIZE_BYTES } from '@learnwren/shared-data-models';

import type { MaterialsConfig } from './materials.config';
import type { MaterialsStoragePort } from './materials-storage.adapter';
import { MaterialsService } from './materials.service';

const cfg: MaterialsConfig = {
  materialsBucket: 'b',
  storageImpl: 'fake',
  uploadUrlTtlSec: 900,
  downloadUrlTtlSec: 900,
};

/** In-memory MaterialsRepository double. */
function fakeRepo() {
  const store = new Map<string, Material>();
  let seq = 0;
  return {
    store,
    newId: <T extends string>() => `mat-${++seq}` as T,
    get: async (id: MaterialId) => store.get(id) ?? null,
    listByLesson: async (lid: LessonId) =>
      [...store.values()].filter((m) => m.lessonId === lid),
    create: async (m: Material) => void store.set(m.id, m),
    update: async (id: MaterialId, patch: Partial<Material>) => {
      store.set(id, { ...store.get(id)!, ...patch });
    },
    delete: async (id: MaterialId) => void store.delete(id),
  };
}

/** Configurable MaterialsStoragePort double. */
function fakeStorage(over: Partial<MaterialsStoragePort> = {}): {
  port: MaterialsStoragePort;
  deleted: string[];
} {
  const deleted: string[] = [];
  const port: MaterialsStoragePort = {
    signUploadUrl: async (i) => ({ uploadUrl: `up://${i.materialId}`, expiresAt: 'T' }),
    headObject: async () => ({ size: 100 }),
    signDownloadUrl: async (i) => ({ downloadUrl: `down://${i.materialId}`, expiresAt: 'T' }),
    deleteObject: async (i) => void deleted.push(i.path),
    ...over,
  };
  return { port, deleted };
}

function seedMaterial(id: string, over: Partial<Material> = {}): Material {
  return {
    id: id as MaterialId,
    ownerInstructorId: 'u1' as UserId,
    courseId: 'c1' as CourseId,
    lessonId: 'l1' as LessonId,
    displayName: 'doc.pdf',
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

describe('MaterialsService.createUploadUrl', () => {
  let repo: ReturnType<typeof fakeRepo>;

  beforeEach(() => {
    repo = fakeRepo();
  });

  it('creates a PENDING_UPLOAD doc and returns the upload URL', async () => {
    const svc = new MaterialsService(repo as never, fakeStorage().port, cfg);
    const r = await svc.createUploadUrl({
      uid: 'u1' as UserId,
      courseId: 'c1' as CourseId,
      lessonId: 'l1' as LessonId,
      filename: 'My Notes.PDF',
      sizeBytes: 2048,
    });
    const doc = repo.store.get(r.materialId)!;
    expect(doc.state).toBe('PENDING_UPLOAD');
    expect(doc.extension).toBe('pdf');
    expect(doc.contentType).toBe('application/pdf');
    expect(doc.displayName).toBe('My Notes.PDF');
    expect(doc.originalFilename).toBe('My Notes.PDF');
    expect(doc.storage.path).toBe(`materials/${r.materialId}/source.pdf`);
    expect(r.uploadUrl).toBe(`up://${r.materialId}`);
  });

  it('rejects an unsupported extension', async () => {
    const svc = new MaterialsService(repo as never, fakeStorage().port, cfg);
    await expect(
      svc.createUploadUrl({
        uid: 'u1' as UserId,
        courseId: 'c1' as CourseId,
        lessonId: 'l1' as LessonId,
        filename: 'malware.exe',
        sizeBytes: 1,
      }),
    ).rejects.toThrow(/Unsupported file type/);
    expect(repo.store.size).toBe(0);
  });

  it('rejects a filename with no extension', async () => {
    const svc = new MaterialsService(repo as never, fakeStorage().port, cfg);
    await expect(
      svc.createUploadUrl({
        uid: 'u1' as UserId,
        courseId: 'c1' as CourseId,
        lessonId: 'l1' as LessonId,
        filename: 'README',
        sizeBytes: 1,
      }),
    ).rejects.toThrow(/Unsupported file type/);
  });

  it('accepts a leading-dot filename whose extension is supported (e.g. ".pdf")', async () => {
    // ".pdf" → lastIndexOf('.') = 0 → dot >= 0 is true, ext = 'pdf' — accepted.
    // With the mutant `dot > 0` the condition is false, ext = '', rejected.
    // This distinguishes `dot >= 0` from `dot > 0`.
    const svc = new MaterialsService(repo as never, fakeStorage().port, cfg);
    const r = await svc.createUploadUrl({
      uid: 'u1' as UserId,
      courseId: 'c1' as CourseId,
      lessonId: 'l1' as LessonId,
      filename: '.pdf',
      sizeBytes: 100,
    });
    expect(repo.store.get(r.materialId)!.extension).toBe('pdf');
  });
});

describe('MaterialsService.complete', () => {
  it('flips PENDING_UPLOAD → READY and records the actual size', async () => {
    const repo = fakeRepo();
    await repo.create(seedMaterial('m1'));
    const svc = new MaterialsService(
      repo as never,
      fakeStorage({ headObject: async () => ({ size: 4096 }) }).port,
      cfg,
    );
    const r = await svc.complete('m1' as MaterialId);
    expect(r.state).toBe('READY');
    expect(r.sizeBytes).toBe(4096);
    expect(typeof r.updatedAt).toBe('string');
    expect(r.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    const persisted = repo.store.get('m1')!;
    expect(persisted.state).toBe('READY');
    expect(persisted.sizeBytes).toBe(4096);
    expect(persisted.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('throws MATERIAL_NOT_FOUND for a missing material', async () => {
    const svc = new MaterialsService(fakeRepo() as never, fakeStorage().port, cfg);
    await expect(svc.complete('nope' as MaterialId)).rejects.toThrow(/not found/i);
  });

  it('throws INVALID_MATERIAL_STATE when not PENDING_UPLOAD', async () => {
    const repo = fakeRepo();
    await repo.create(seedMaterial('m1', { state: 'READY' }));
    const svc = new MaterialsService(repo as never, fakeStorage().port, cfg);
    await expect(svc.complete('m1' as MaterialId)).rejects.toThrow(/not valid in state/i);
  });

  it('throws UPLOAD_OBJECT_MISSING when no object was uploaded', async () => {
    const repo = fakeRepo();
    await repo.create(seedMaterial('m1'));
    const svc = new MaterialsService(
      repo as never,
      fakeStorage({ headObject: async () => null }).port,
      cfg,
    );
    await expect(svc.complete('m1' as MaterialId)).rejects.toThrow(/no uploaded object/i);
  });

  it('throws UPLOAD_OBJECT_SIZE_MISMATCH and deletes the object when oversized', async () => {
    const repo = fakeRepo();
    await repo.create(seedMaterial('m1'));
    const storage = fakeStorage({
      headObject: async () => ({ size: MATERIAL_MAX_SIZE_BYTES * 2 }),
    });
    const svc = new MaterialsService(repo as never, storage.port, cfg);
    await expect(svc.complete('m1' as MaterialId)).rejects.toThrow(/exceeds/i);
    expect(storage.deleted).toContain('materials/m1/source.pdf');
  });

  it('accepts a file exactly at the tolerance boundary (size === MAX * 1.05) without throwing', async () => {
    // MATERIAL_MAX_SIZE_BYTES * UPLOAD_SIZE_TOLERANCE exactly — condition is `> tolerance`, not
    // `>=`, so exact boundary should succeed. This distinguishes `>` from `>=`.
    const repo = fakeRepo();
    await repo.create(seedMaterial('m1'));
    const exactLimit = Math.floor(MATERIAL_MAX_SIZE_BYTES * 1.05);
    const svc = new MaterialsService(
      repo as never,
      fakeStorage({ headObject: async () => ({ size: exactLimit }) }).port,
      cfg,
    );
    const r = await svc.complete('m1' as MaterialId);
    expect(r.state).toBe('READY');
    expect(r.sizeBytes).toBe(exactLimit);
  });
});

describe('MaterialsService.listForLesson', () => {
  it('returns only READY materials, sorted by createdAt ascending', async () => {
    const repo = fakeRepo();
    await repo.create(
      seedMaterial('m2', { state: 'READY', createdAt: '2026-05-21T12:00:00.000Z' as ISODateString }),
    );
    await repo.create(
      seedMaterial('m1', { state: 'READY', createdAt: '2026-05-21T11:00:00.000Z' as ISODateString }),
    );
    await repo.create(seedMaterial('m3', { state: 'PENDING_UPLOAD' }));
    const svc = new MaterialsService(repo as never, fakeStorage().port, cfg);
    const list = await svc.listForLesson('l1' as LessonId);
    expect(list.map((m) => m.id)).toEqual(['m1', 'm2']);
  });
});

describe('MaterialsService.rename', () => {
  it('updates displayName and returns the material', async () => {
    const repo = fakeRepo();
    await repo.create(seedMaterial('m1'));
    const svc = new MaterialsService(repo as never, fakeStorage().port, cfg);
    const r = await svc.rename('m1' as MaterialId, 'Final Notes');
    expect(r.displayName).toBe('Final Notes');
    expect(repo.store.get('m1')!.displayName).toBe('Final Notes');
  });

  it('throws MATERIAL_NOT_FOUND for a missing material', async () => {
    const svc = new MaterialsService(fakeRepo() as never, fakeStorage().port, cfg);
    await expect(svc.rename('nope' as MaterialId, 'X')).rejects.toThrow(/not found/i);
  });
});

describe('MaterialsService.remove', () => {
  it('deletes the storage object and the doc', async () => {
    const repo = fakeRepo();
    await repo.create(seedMaterial('m1'));
    const storage = fakeStorage();
    const svc = new MaterialsService(repo as never, storage.port, cfg);
    await svc.remove('m1' as MaterialId);
    expect(repo.store.has('m1')).toBe(false);
    expect(storage.deleted).toContain('materials/m1/source.pdf');
  });

  it('throws MATERIAL_NOT_FOUND for a missing material', async () => {
    const svc = new MaterialsService(fakeRepo() as never, fakeStorage().port, cfg);
    await expect(svc.remove('nope' as MaterialId)).rejects.toThrow(/not found/i);
  });

  it('still deletes the doc when the storage object delete fails', async () => {
    const repo = fakeRepo();
    await repo.create(seedMaterial('m1'));
    const storage = fakeStorage({ deleteObject: async () => { throw new Error('storage down'); } });
    const svc = new MaterialsService(repo as never, storage.port, cfg);
    await expect(svc.remove('m1' as MaterialId)).resolves.not.toThrow();
    expect(repo.store.has('m1')).toBe(false);
  });
});

describe('MaterialsService.buildDownloadUrl', () => {
  it('returns a signed download URL for an existing material', async () => {
    const repo = fakeRepo();
    await repo.create(seedMaterial('m1', { state: 'READY' }));
    const svc = new MaterialsService(repo as never, fakeStorage().port, cfg);
    const r = await svc.buildDownloadUrl('m1' as MaterialId);
    expect(r.downloadUrl).toBe('down://m1');
  });

  it('throws MATERIAL_NOT_FOUND for a missing material', async () => {
    const svc = new MaterialsService(fakeRepo() as never, fakeStorage().port, cfg);
    await expect(svc.buildDownloadUrl('nope' as MaterialId)).rejects.toThrow(/not found/i);
  });

  it('throws INVALID_MATERIAL_STATE for a PENDING_UPLOAD material (no signed URL minted)', async () => {
    // A caller who knows a not-yet-uploaded matId — e.g. an enrolled student
    // who races the instructor's upload — must NOT be able to harvest a
    // signed URL for the empty storage object.
    const repo = fakeRepo();
    await repo.create(seedMaterial('m1', { state: 'PENDING_UPLOAD' }));
    let signCalls = 0;
    const storage = fakeStorage({
      signDownloadUrl: async (i) => {
        signCalls += 1;
        return { downloadUrl: `down://${i.materialId}`, expiresAt: 'T' };
      },
    });
    const svc = new MaterialsService(repo as never, storage.port, cfg);
    await expect(svc.buildDownloadUrl('m1' as MaterialId)).rejects.toThrow(
      /invalid|state/i,
    );
    expect(signCalls).toBe(0);
  });
});

describe('MaterialsService.deleteForLesson', () => {
  it('removes every material attached to the lesson', async () => {
    const repo = fakeRepo();
    await repo.create(seedMaterial('m1'));
    await repo.create(seedMaterial('m2'));
    await repo.create(seedMaterial('m3', { lessonId: 'other' as LessonId }));
    const storage = fakeStorage();
    const svc = new MaterialsService(repo as never, storage.port, cfg);
    await svc.deleteForLesson('l1' as LessonId);
    expect(repo.store.has('m1')).toBe(false);
    expect(repo.store.has('m2')).toBe(false);
    expect(repo.store.has('m3')).toBe(true);
    expect(storage.deleted).toHaveLength(2);
  });

  it('is a no-op when the lesson has no materials', async () => {
    const svc = new MaterialsService(fakeRepo() as never, fakeStorage().port, cfg);
    await expect(svc.deleteForLesson('l1' as LessonId)).resolves.toBeUndefined();
  });

  it('still deletes docs when storage object deletes fail', async () => {
    const repo = fakeRepo();
    await repo.create(seedMaterial('m1'));
    await repo.create(seedMaterial('m2'));
    const storage = fakeStorage({ deleteObject: async () => { throw new Error('storage down'); } });
    const svc = new MaterialsService(repo as never, storage.port, cfg);
    await expect(svc.deleteForLesson('l1' as LessonId)).resolves.not.toThrow();
    expect(repo.store.has('m1')).toBe(false);
    expect(repo.store.has('m2')).toBe(false);
  });
});
