import { Injectable, InjectionToken, inject, signal, type Signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { CourseId, LessonId, ModuleId } from '@learnwren/shared-data-models';
import {
  MATERIAL_CONTENT_TYPE_BY_EXTENSION,
  MATERIAL_MAX_SIZE_BYTES,
  SUPPORTED_MATERIAL_EXTENSIONS,
  type SupportedMaterialExtension,
} from '@learnwren/shared-data-models';

import { MaterialsService } from './materials.service';

export const MATERIAL_XHR_FACTORY = new InjectionToken<() => XMLHttpRequest>(
  'MATERIAL_XHR_FACTORY',
  { providedIn: 'root', factory: () => () => new XMLHttpRequest() },
);

const SUPPORTED = new Set<string>(SUPPORTED_MATERIAL_EXTENSIONS);

export interface MaterialUploadContext {
  courseId: CourseId;
  moduleId: ModuleId;
  lessonId: LessonId;
}

export interface MaterialUploadProgress {
  filename: string;
  percent: number;
}

export interface MaterialUploadFailure {
  filename: string;
  reason: string;
}

type FileCheck =
  | { ok: true; extension: SupportedMaterialExtension }
  | { ok: false; reason: string };

function checkFile(file: File): FileCheck {
  const dot = file.name.lastIndexOf('.');
  const ext = dot >= 0 ? file.name.slice(dot + 1).toLowerCase() : '';
  if (!SUPPORTED.has(ext)) {
    return {
      ok: false,
      reason: 'Unsupported file type. Supported formats: PDF, DOCX, PPTX, XLSX, TXT, ZIP.',
    };
  }
  if (file.size > MATERIAL_MAX_SIZE_BYTES) {
    return { ok: false, reason: 'File exceeds the 50 MB limit.' };
  }
  return { ok: true, extension: ext as SupportedMaterialExtension };
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Upload failed.';
}

@Injectable()
export class MaterialUploadService {
  private readonly api = inject(MaterialsService);
  private readonly xhrFactory = inject(MATERIAL_XHR_FACTORY);

  private readonly _inFlight = signal<MaterialUploadProgress[]>([]);
  private readonly _failures = signal<MaterialUploadFailure[]>([]);

  readonly inFlight: Signal<MaterialUploadProgress[]> = this._inFlight.asReadonly();
  readonly failures: Signal<MaterialUploadFailure[]> = this._failures.asReadonly();

  /** Upload a batch of files sequentially. Returns the count that succeeded. */
  async uploadFiles(ctx: MaterialUploadContext, files: File[]): Promise<number> {
    this._failures.set([]);
    let completed = 0;
    for (const file of files) {
      const check = checkFile(file);
      if (!check.ok) {
        this.addFailure(file.name, check.reason);
        continue;
      }
      try {
        await this.uploadOne(ctx, file, check.extension);
        completed++;
      } catch (err) {
        this.addFailure(file.name, errorMessage(err));
      }
    }
    return completed;
  }

  private async uploadOne(
    ctx: MaterialUploadContext,
    file: File,
    extension: SupportedMaterialExtension,
  ): Promise<void> {
    this.setProgress(file.name, 0);
    try {
      const created = await firstValueFrom(
        this.api.createUploadUrl(ctx.courseId, ctx.moduleId, ctx.lessonId, {
          filename: file.name,
          sizeBytes: file.size,
        }),
      );
      const contentType = MATERIAL_CONTENT_TYPE_BY_EXTENSION[extension];
      const status = await this.put(created.uploadUrl, file, contentType, (pct) =>
        this.setProgress(file.name, pct),
      );
      if (status < 200 || status >= 300) {
        throw new Error(`Upload failed with status ${status}.`);
      }
      await firstValueFrom(this.api.complete(created.materialId));
    } finally {
      this.clearProgress(file.name);
    }
  }

  private put(
    url: string,
    file: File,
    contentType: string,
    onProgress: (pct: number) => void,
  ): Promise<number> {
    return new Promise((resolve) => {
      const xhr = this.xhrFactory();
      xhr.open('PUT', url, true);
      xhr.setRequestHeader('Content-Type', contentType);
      xhr.upload.onprogress = (e: ProgressEvent) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => resolve(xhr.status);
      xhr.onerror = () => resolve(0);
      xhr.send(file);
    });
  }

  private setProgress(filename: string, percent: number): void {
    this._inFlight.update((list) => [
      ...list.filter((p) => p.filename !== filename),
      { filename, percent },
    ]);
  }

  private clearProgress(filename: string): void {
    this._inFlight.update((list) => list.filter((p) => p.filename !== filename));
  }

  private addFailure(filename: string, reason: string): void {
    this._failures.update((list) => [...list, { filename, reason }]);
  }
}
