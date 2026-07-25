import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { provideIcons } from '@ng-icons/core';
import { lucideCirclePlus, lucidePencil, lucideTrash2 } from '@ng-icons/lucide';
import { HlmIcon } from '@learnwren/web-ui';
import type { DataTableFilterRow } from '../models';
import { DataTableFilterStore } from '../state/data-table-filter-store';
import { DataTableStateService } from '../state/data-table-state.service';
import { DataTableFilterEditorComponent } from '../filter-editor/data-table-filter-editor.component';
import { comparatorLabel } from '../filter-editor/filter-field.util';

/**
 * Body of the toolbar Filters dropdown: an active-filter list (trash/pen per
 * row), Clear All, and an Add Filter affordance. Add/edit open the shared editor
 * inline inside the (wide) panel — rendering it as a nested CDK menu/overlay
 * fights the editor's own select/date overlays (they close the parent), so it
 * stays in the panel's own DOM. Reads/writes the host-scoped
 * `DataTableFilterStore`; `editing` drives whether the editor is add vs edit.
 */
@Component({
  selector: 'lw-data-table-filter-menu',
  standalone: true,
  imports: [HlmIcon, DataTableFilterEditorComponent],
  providers: [provideIcons({ lucideTrash2, lucidePencil, lucideCirclePlus })],
  templateUrl: './data-table-filter-menu.component.html',
  styleUrl: './data-table-filter-menu.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DataTableFilterMenuComponent {
  protected readonly store = inject(DataTableFilterStore);
  private readonly state = inject(DataTableStateService);

  /** Whether the inline editor section is shown. */
  protected readonly editorOpen = signal(false);
  /** Drives the editor: `null` → add mode, a filter → edit mode (field locked). */
  protected readonly editing = signal<DataTableFilterRow | null>(null);

  protected headerFor(field: string): string {
    return this.state.columns().find((c) => c.id === field)?.header ?? field;
  }
  protected readonly comparatorLabel = comparatorLabel;

  protected add(): void {
    this.editing.set(null);
    this.editorOpen.set(true);
  }
  protected edit(filter: DataTableFilterRow): void {
    this.editing.set(filter);
    this.editorOpen.set(true);
  }
  protected onEditorDone(): void {
    this.editorOpen.set(false);
    this.editing.set(null);
  }
  protected remove(field: string): void {
    this.store.removeFilter(field);
  }
  protected clearAll(): void {
    this.store.clearAll();
  }
}
