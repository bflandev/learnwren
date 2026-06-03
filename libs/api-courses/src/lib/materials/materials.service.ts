import { Inject, Injectable } from '@nestjs/common';

import type {
  CourseId,
  LessonId,
  Material,
  MaterialId,
  SupportedMaterialExtension,
  UserId,
} from '@learnwren/shared-data-models';
import {
  MATERIAL_CONTENT_TYPE_BY_EXTENSION,
  MATERIAL_MAX_SIZE_BYTES,
  nowIso,
  SUPPORTED_MATERIAL_EXTENSIONS,
} from '@learnwren/shared-data-models';

import { MATERIALS_CONFIG, type MaterialsConfig } from './materials.config';
import {
  InvalidMaterialStateException,
  MaterialNotFoundException,
  UnsupportedMaterialTypeException,
  UploadObjectMissingException,
  UploadObjectSizeMismatchException,
} from './errors/material.exception';
import { MaterialsRepository } from './materials.repository';
import {
  MaterialsStorageAdapter,
  type MaterialsStoragePort,
} from './materials-storage.adapter';
import { UPLOAD_SIZE_TOLERANCE } from '../upload-tolerance';

/** Parse + validate the file extension from a filename. The browser-reported
 *  MIME type is unreliable for Office formats, so the extension is authoritative. */
function parseExtension(filename: string): SupportedMaterialExtension {
  const dot = filename.lastIndexOf('.');
  const ext = dot >= 0 ? filename.slice(dot + 1).toLowerCase() : '';
  if (!(SUPPORTED_MATERIAL_EXTENSIONS as readonly string[]).includes(ext)) {
    throw new UnsupportedMaterialTypeException();
  }
  return ext as SupportedMaterialExtension;
}

export interface CreateUploadUrlInput {
  uid: UserId;
  courseId: CourseId;
  lessonId: LessonId;
  filename: string;
  sizeBytes: number;
}

// CreateUploadUrlResult and DownloadUrlResult use the shared wire contracts so
// the api emits exactly the shape the web client expects, with ISO-branded
// timestamps. The aliases keep the historical names callable inside this lib.
import type {
  CreateMaterialUploadResponse,
  MaterialDownloadUrlResponse,
} from '@learnwren/shared-data-models';
export type CreateUploadUrlResult = CreateMaterialUploadResponse;
export type DownloadUrlResult = MaterialDownloadUrlResponse;

@Injectable()
export class MaterialsService {
  constructor(
    private readonly repo: MaterialsRepository,
    @Inject(MaterialsStorageAdapter) private readonly storage: MaterialsStoragePort,
    @Inject(MATERIALS_CONFIG) private readonly cfg: MaterialsConfig,
  ) {}

  async createUploadUrl(input: CreateUploadUrlInput): Promise<CreateUploadUrlResult> {
    const extension = parseExtension(input.filename);
    const contentType = MATERIAL_CONTENT_TYPE_BY_EXTENSION[extension];
    const materialId = this.repo.newId<MaterialId>();
    const path = `materials/${materialId}/source.${extension}`;
    const now = nowIso();
    const material: Material = {
      id: materialId,
      ownerInstructorId: input.uid,
      courseId: input.courseId,
      lessonId: input.lessonId,
      displayName: input.filename,
      originalFilename: input.filename,
      extension,
      contentType,
      sizeBytes: input.sizeBytes,
      state: 'PENDING_UPLOAD',
      storage: { bucket: this.cfg.materialsBucket, path },
      createdAt: now,
      updatedAt: now,
    };
    await this.repo.create(material);
    const signed = await this.storage.signUploadUrl({
      bucket: this.cfg.materialsBucket,
      path,
      contentType,
      materialId,
    });
    return { materialId, uploadUrl: signed.uploadUrl, expiresAt: signed.expiresAt };
  }

  async complete(matId: MaterialId): Promise<Material> {
    const m = await this.loadMaterialOrThrow(matId);
    if (m.state !== 'PENDING_UPLOAD') throw new InvalidMaterialStateException(m.state);

    const actualSize = await this.verifyUploadedObject(m);

    const updatedAt = nowIso();
    await this.repo.update(matId, { state: 'READY', sizeBytes: actualSize, updatedAt });
    return { ...m, state: 'READY', sizeBytes: actualSize, updatedAt };
  }

  async listForLesson(lessonId: LessonId): Promise<Material[]> {
    const all = await this.repo.listByLesson(lessonId);
    return all
      .filter((m) => m.state === 'READY')
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async rename(matId: MaterialId, displayName: string): Promise<Material> {
    const m = await this.loadMaterialOrThrow(matId);
    const updatedAt = nowIso();
    await this.repo.update(matId, { displayName, updatedAt });
    return { ...m, displayName, updatedAt };
  }

  async remove(matId: MaterialId): Promise<void> {
    const m = await this.loadMaterialOrThrow(matId);
    await this.purgeStoredMaterial(m);
  }

  async buildDownloadUrl(matId: MaterialId): Promise<DownloadUrlResult> {
    const m = await this.loadMaterialOrThrow(matId);
    // PENDING_UPLOAD materials have no object behind the storage path (or only
    // a partial one). Issuing a signed URL for that state lets a caller
    // exfiltrate a capability against an incomplete object — an enrolled
    // student who happens to know a not-yet-uploaded matId would get a working
    // signature for an empty path. Block the URL until the object has been
    // HEAD-verified by `complete`.
    if (m.state !== 'READY') throw new InvalidMaterialStateException(m.state);
    return this.storage.signDownloadUrl({
      bucket: m.storage.bucket,
      path: m.storage.path,
      filename: m.originalFilename,
      contentType: m.contentType,
      materialId: m.id,
      ttlSec: this.cfg.downloadUrlTtlSec,
    });
  }

  /** Cascade entry point — called by CoursesService.deleteLesson before the
   *  lesson doc is removed. Best-effort object delete, then doc delete. */
  async deleteForLesson(lessonId: LessonId): Promise<void> {
    const materials = await this.repo.listByLesson(lessonId);
    for (const m of materials) {
      await this.purgeStoredMaterial(m);
    }
  }

  private async loadMaterialOrThrow(matId: MaterialId): Promise<Material> {
    const m = await this.repo.get(matId);
    if (!m) throw new MaterialNotFoundException();
    return m;
  }

  /**
   * HEAD the uploaded object and confirm its size is within tolerance of the
   * max-per-material cap. If the object is grossly larger, best-effort delete
   * it before throwing — otherwise a caller could pin a giant blob in storage
   * by uploading then skipping `complete`. Returns the actual size for the
   * caller to record on the Material doc.
   */
  private async verifyUploadedObject(m: Material): Promise<number> {
    const head = await this.storage.headObject({
      bucket: m.storage.bucket,
      path: m.storage.path,
    });
    if (!head) throw new UploadObjectMissingException();
    if (head.size > MATERIAL_MAX_SIZE_BYTES * UPLOAD_SIZE_TOLERANCE) {
      await this.bestEffortDeleteStoredObject(m);
      throw new UploadObjectSizeMismatchException();
    }
    return head.size;
  }

  /** Delete the storage object, swallowing any error. Used both during upload
   *  validation (oversize cleanup) and as the storage half of full purge. */
  private async bestEffortDeleteStoredObject(m: Material): Promise<void> {
    await this.storage
      .deleteObject({ bucket: m.storage.bucket, path: m.storage.path })
      .catch(() => undefined);
  }

  /** Remove a material end-to-end: storage object (best-effort), then Firestore doc. */
  private async purgeStoredMaterial(m: Material): Promise<void> {
    await this.bestEffortDeleteStoredObject(m);
    await this.repo.delete(m.id);
  }
}
