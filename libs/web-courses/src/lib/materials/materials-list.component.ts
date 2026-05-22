import { Component, DestroyRef, effect, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';

import type {
  CourseId,
  LessonId,
  Material,
  MaterialId,
  ModuleId,
} from '@learnwren/shared-data-models';

import { ConfirmDialogComponent } from '../components/confirm-dialog/confirm-dialog.component';
import { MaterialUploadService } from './material-upload.service';
import { MaterialsService } from './materials.service';

@Component({
  selector: 'lib-materials-list',
  standalone: true,
  imports: [FormsModule, ConfirmDialogComponent],
  templateUrl: './materials-list.component.html',
  providers: [MaterialUploadService],
})
export class MaterialsListComponent {
  private readonly api = inject(MaterialsService);
  private readonly destroyRef = inject(DestroyRef);
  readonly upload = inject(MaterialUploadService);

  readonly courseId = input.required<CourseId>();
  readonly moduleId = input.required<ModuleId>();
  readonly lessonId = input.required<LessonId>();

  readonly materials = signal<Material[]>([]);
  readonly loadError = signal(false);
  readonly editingId = signal<MaterialId | null>(null);
  readonly draftName = signal('');
  readonly pendingRemoval = signal<Material | null>(null);

  constructor() {
    effect(() => {
      const cid = this.courseId();
      const mid = this.moduleId();
      const lid = this.lessonId();
      this.api
        .listMaterials(cid, mid, lid)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (m) => {
            this.materials.set(m);
            this.loadError.set(false);
          },
          error: () => this.loadError.set(true),
        });
    });
  }

  async refresh(): Promise<void> {
    try {
      const m = await firstValueFrom(
        this.api.listMaterials(this.courseId(), this.moduleId(), this.lessonId()),
      );
      this.materials.set(m);
      this.loadError.set(false);
    } catch {
      this.loadError.set(true);
    }
  }

  async onFilesSelected(event: Event): Promise<void> {
    const el = event.target as HTMLInputElement;
    const files = el.files ? Array.from(el.files) : [];
    el.value = '';
    if (files.length === 0) return;
    await this.upload.uploadFiles(
      { courseId: this.courseId(), moduleId: this.moduleId(), lessonId: this.lessonId() },
      files,
    );
    await this.refresh();
  }

  startRename(m: Material): void {
    this.editingId.set(m.id);
    this.draftName.set(m.displayName);
  }

  cancelRename(): void {
    this.editingId.set(null);
  }

  async commitRename(m: Material): Promise<void> {
    const next = this.draftName().trim();
    this.editingId.set(null);
    if (next.length === 0 || next === m.displayName) return;
    const updated = await firstValueFrom(this.api.rename(m.id, next));
    this.materials.update((list) => list.map((x) => (x.id === m.id ? updated : x)));
  }

  askRemove(m: Material): void {
    this.pendingRemoval.set(m);
  }

  async confirmRemoval(confirmed: boolean): Promise<void> {
    const m = this.pendingRemoval();
    this.pendingRemoval.set(null);
    if (!confirmed || !m) return;
    await firstValueFrom(this.api.remove(m.id));
    this.materials.update((list) => list.filter((x) => x.id !== m.id));
  }

  async download(m: Material): Promise<void> {
    try {
      const { downloadUrl } = await firstValueFrom(this.api.getDownloadUrl(m.id));
      this.openDownload(downloadUrl);
    } catch {
      // The material was removed since the page loaded — drop it from the list.
      this.materials.update((list) => list.filter((x) => x.id !== m.id));
    }
  }

  /** Extracted so component tests can spy on it without touching the DOM. */
  protected openDownload(url: string): void {
    const a = document.createElement('a');
    a.href = url;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
}
