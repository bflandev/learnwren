import { Inject, Injectable } from '@nestjs/common';

import type {
  CourseId,
  ISODateString,
  LessonId,
  Material,
  MaterialId,
  SupportedMaterialExtension,
  UserId,
} from '@learnwren/shared-data-models';
import {
  MATERIAL_CONTENT_TYPE_BY_EXTENSION,
  MATERIAL_MAX_SIZE_BYTES,
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

/** Actual-vs-limit tolerance at upload-complete (covers minor storage overhead). */
const SIZE_TOLERANCE = 1.05;

function nowIso(): ISODateString {
  return new Date().toISOString() as ISODateString;
}

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

export interface CreateUploadUrlResult {
  materialId: MaterialId;
  uploadUrl: string;
  expiresAt: string;
}

export interface DownloadUrlResult {
  downloadUrl: string;
  expiresAt: string;
}

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
    const m = await this.repo.get(matId);
    if (!m) throw new MaterialNotFoundException();
    if (m.state !== 'PENDING_UPLOAD') throw new InvalidMaterialStateException(m.state);

    const head = await this.storage.headObject({
      bucket: m.storage.bucket,
      path: m.storage.path,
    });
    if (!head) throw new UploadObjectMissingException();
    if (head.size > MATERIAL_MAX_SIZE_BYTES * SIZE_TOLERANCE) {
      await this.storage
        .deleteObject({ bucket: m.storage.bucket, path: m.storage.path })
        .catch(() => undefined);
      throw new UploadObjectSizeMismatchException();
    }

    const updatedAt = nowIso();
    await this.repo.update(matId, { state: 'READY', sizeBytes: head.size, updatedAt });
    return { ...m, state: 'READY', sizeBytes: head.size, updatedAt };
  }

  async listForLesson(lessonId: LessonId): Promise<Material[]> {
    const all = await this.repo.listByLesson(lessonId);
    return all
      .filter((m) => m.state === 'READY')
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async rename(matId: MaterialId, displayName: string): Promise<Material> {
    const m = await this.repo.get(matId);
    if (!m) throw new MaterialNotFoundException();
    const updatedAt = nowIso();
    await this.repo.update(matId, { displayName, updatedAt });
    return { ...m, displayName, updatedAt };
  }

  async remove(matId: MaterialId): Promise<void> {
    const m = await this.repo.get(matId);
    if (!m) throw new MaterialNotFoundException();
    await this.storage
      .deleteObject({ bucket: m.storage.bucket, path: m.storage.path })
      .catch(() => undefined);
    await this.repo.delete(m.id);
  }

  async buildDownloadUrl(matId: MaterialId): Promise<DownloadUrlResult> {
    const m = await this.repo.get(matId);
    if (!m) throw new MaterialNotFoundException();
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
      await this.storage
        .deleteObject({ bucket: m.storage.bucket, path: m.storage.path })
        .catch(() => undefined);
      await this.repo.delete(m.id);
    }
  }
}
