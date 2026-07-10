import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import type { CategoryId, CourseCategoryDoc } from '@learnwren/shared-data-models';

import { AdminCategoriesService } from '../admin-categories.service';

/**
 * Admin course-category management (US-08-02): create, rename, and delete with
 * course reassignment. Deleting always asks for a reassignment target — the
 * backend only applies it when courses actually reference the category.
 */
@Component({
  selector: 'lib-admin-categories-page',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './admin-categories-page.component.html',
})
export class AdminCategoriesPageComponent implements OnInit {
  private readonly svc = inject(AdminCategoriesService);

  readonly categories = signal<CourseCategoryDoc[]>([]);
  readonly loading = signal(true);
  readonly loadError = signal(false);
  readonly busy = signal(false);

  // Create form.
  newName = '';
  readonly createError = signal<string | null>(null);

  // At most one row is in rename or delete mode at a time.
  readonly renamingId = signal<CategoryId | null>(null);
  renameName = '';
  readonly deletingId = signal<CategoryId | null>(null);
  reassignTo = '';
  readonly rowError = signal<string | null>(null);

  /** Reassignment options: every category except the one being deleted. */
  readonly reassignOptions = computed(() =>
    this.categories().filter((c) => c.id !== this.deletingId()),
  );

  async ngOnInit(): Promise<void> {
    await this.reload();
  }

  retry(): Promise<void> {
    return this.reload();
  }

  private async reload(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(false);
    try {
      this.categories.set(await this.svc.list());
    } catch {
      this.loadError.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  async create(): Promise<void> {
    const name = this.newName.trim();
    if (!name || this.busy()) return;
    this.busy.set(true);
    this.createError.set(null);
    try {
      await this.svc.create(name);
      this.newName = '';
      await this.reload();
    } catch (err) {
      this.createError.set(this.messageFor(err));
    } finally {
      this.busy.set(false);
    }
  }

  startRename(cat: CourseCategoryDoc): void {
    this.renamingId.set(cat.id);
    this.renameName = cat.name;
    this.deletingId.set(null);
    this.rowError.set(null);
  }

  async confirmRename(id: CategoryId): Promise<void> {
    const name = this.renameName.trim();
    if (!name || this.busy()) return;
    this.busy.set(true);
    this.rowError.set(null);
    try {
      await this.svc.rename(id, name);
      this.renamingId.set(null);
      await this.reload();
    } catch (err) {
      this.rowError.set(this.messageFor(err));
    } finally {
      this.busy.set(false);
    }
  }

  startDelete(cat: CourseCategoryDoc): void {
    this.deletingId.set(cat.id);
    this.reassignTo = this.categories().find((c) => c.id !== cat.id)?.id ?? '';
    this.renamingId.set(null);
    this.rowError.set(null);
  }

  async confirmDelete(id: CategoryId): Promise<void> {
    if (!this.reassignTo || this.busy()) return;
    this.busy.set(true);
    this.rowError.set(null);
    try {
      await this.svc.delete(id, this.reassignTo as CategoryId);
      this.deletingId.set(null);
      await this.reload();
    } catch (err) {
      this.rowError.set(this.messageFor(err));
    } finally {
      this.busy.set(false);
    }
  }

  cancelRowAction(): void {
    this.renamingId.set(null);
    this.deletingId.set(null);
    this.rowError.set(null);
  }

  private messageFor(err: unknown): string {
    // Stryker disable next-line OptionalChaining: the first ?. only differs from . when err is null/undefined, and a rejection value is always an Error or HttpErrorResponse here — equivalent in practice.
    const code = (err as { error?: { error?: { code?: string; message?: string } } })?.error
      ?.error;
    switch (code?.code) {
      case 'CATEGORY_EXISTS':
        return 'A category with this name already exists.';
      case 'VALIDATION_FAILED':
        return code.message ?? 'That name is not valid.';
      case 'LAST_CATEGORY':
        return 'The last remaining category cannot be deleted.';
      case 'CATEGORY_NOT_FOUND':
        return 'This category no longer exists. Refresh to update the list.';
      default:
        return 'Something went wrong. Please try again.';
    }
  }
}
