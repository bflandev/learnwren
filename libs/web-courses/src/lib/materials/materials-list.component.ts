import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, input, signal } from '@angular/core';
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

import { ConfirmDialogService, HlmButton, HlmInput } from '@learnwren/web-ui';

import { MaterialUploadService } from './material-upload.service';
import { MaterialsService } from './materials.service';

@Component({
  selector: 'lib-materials-list',
  standalone: true,
  imports: [FormsModule, HlmButton, HlmInput],
  templateUrl: './materials-list.component.html',
  providers: [MaterialUploadService],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MaterialsListComponent {
  private readonly api = inject(MaterialsService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly confirmDialog = inject(ConfirmDialogService);
  readonly upload = inject(MaterialUploadService);

  readonly courseId = input.required<CourseId>();
  readonly moduleId = input.required<ModuleId>();
  readonly lessonId = input.required<LessonId>();

  // Stryker disable next-line ArrayDeclaration: equivalent — the constructor effect subscribes to listMaterials synchronously and overwrites materials before any observer reads the initial value.
  readonly materials = signal<Material[]>([]);
  // Stryker disable next-line BooleanLiteral: equivalent — the constructor effect sets loadError (false on success / true on error) synchronously before any observer reads the initial value.
  readonly loadError = signal(false);
  readonly editingId = signal<MaterialId | null>(null);
  readonly draftName = signal('');
  readonly pendingRemoval = signal<Material | null>(null);
  readonly removedNotice = signal<string | null>(null);
  /** Rename/remove failure message — cleared at the start of each new action. */
  readonly actionError = signal<string | null>(null);

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
    this.actionError.set(null);
    try {
      const updated = await firstValueFrom(this.api.rename(m.id, next));
      this.materials.update((list) => list.map((x) => (x.id === m.id ? updated : x)));
    } catch {
      // The row keeps its previous name — tell the instructor the rename did not stick.
      this.actionError.set(`Couldn't rename "${m.displayName}" — please retry.`);
    }
  }

  /**
   * Record the material awaiting removal, then route the shared confirm
   * dialog's outcome into confirmRemoval. pendingRemoval is consumed exactly
   * once there, so a stale resolution no-ops.
   */
  askRemove(m: Material): void {
    this.pendingRemoval.set(m);
    void this.confirmDialog
      .confirm({
        header: 'Remove material',
        message: `Remove '${m.displayName}'? This cannot be undone.`,
        acceptLabel: 'Remove material',
        variant: 'destructive',
      })
      .then((confirmed) => this.confirmRemoval(confirmed));
  }

  async confirmRemoval(confirmed: boolean): Promise<void> {
    const m = this.pendingRemoval();
    this.pendingRemoval.set(null);
    if (!confirmed || !m) return;
    this.actionError.set(null);
    try {
      await firstValueFrom(this.api.remove(m.id));
      this.materials.update((list) => list.filter((x) => x.id !== m.id));
    } catch {
      // The row stays in the list — tell the instructor the removal did not happen.
      this.actionError.set(`Couldn't remove "${m.displayName}" — please retry.`);
    }
  }

  async download(m: Material): Promise<void> {
    try {
      const { downloadUrl } = await firstValueFrom(this.api.getDownloadUrl(m.id));
      this.openDownload(downloadUrl);
    } catch (err) {
      const status = (err as { status?: number })?.status;
      if (status === 404) {
        // The material was removed since the page loaded — drop it from the list and notify.
        this.materials.update((list) => list.filter((x) => x.id !== m.id));
        this.removedNotice.set('This material is no longer available.');
      }
      // For non-404 errors (e.g. 500), leave the row in place and surface no notice.
    }
  }

  /** Extracted so component tests can spy on it without touching the DOM. */
  protected openDownload(url: string): void {
    const a = document.createElement('a');
    a.href = url;
    a.download = '';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
}
